-- Food Price App database tables.
-- Paste this whole file into Supabase: SQL Editor -> New query -> Run.
-- Safe to run more than once (it skips anything that already exists).

-- ---------------------------------------------------------------------------
-- locations: every store (later: restaurants, gas stations) with its address
-- and map coordinates.
-- ---------------------------------------------------------------------------
create table if not exists locations (
    id            bigint generated always as identity primary key,
    source        text not null,              -- where we got it, e.g. 'kroger'
    external_id   text not null,              -- the source's own ID (Kroger locationId)
    kind          text not null default 'grocery',
    name          text not null,
    chain         text,
    address_line1 text,
    city          text,
    state         text,
    zip_code      text,
    latitude      double precision,
    longitude     double precision,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    unique (source, external_id)
);

-- ---------------------------------------------------------------------------
-- products: canonical, store-independent items, e.g. "Milk, 2%, 1 gal".
-- Filled in later when we start matching store listings to each other.
-- ---------------------------------------------------------------------------
create table if not exists products (
    id          bigint generated always as identity primary key,
    name        text not null unique,
    category    text,
    size_value  numeric,                      -- e.g. 1
    size_unit   text,                         -- e.g. 'gal'
    created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- store_items: a specific listing from a source (one Kroger product / UPC).
-- ---------------------------------------------------------------------------
create table if not exists store_items (
    id           bigint generated always as identity primary key,
    source       text not null,               -- 'kroger'
    external_id  text not null,               -- Kroger productId
    upc          text,
    product_id   bigint references products(id),   -- link to canonical item (optional for now)
    description  text not null,
    brand        text,
    size         text,                        -- as written by the store, e.g. '1/2 gal'
    size_value   numeric,                     -- parsed number, e.g. 0.5
    size_unit    text,                        -- parsed unit, e.g. 'gal'
    sold_by      text,                        -- 'unit' or 'weight'
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now(),
    unique (source, external_id)
);

-- ---------------------------------------------------------------------------
-- prices: append-only history. Every price check is a new row.
-- ---------------------------------------------------------------------------
create table if not exists prices (
    id                 bigint generated always as identity primary key,
    store_item_id      bigint not null references store_items(id),
    location_id        bigint not null references locations(id),
    regular_price      numeric,
    promo_price        numeric,
    regular_per_unit   numeric,               -- Kroger's regularPerUnitEstimate
    promo_per_unit     numeric,               -- Kroger's promoPerUnitEstimate
    stock_level        text,
    source             text not null,         -- 'kroger_api'
    search_term        text,                  -- what we searched for to find it
    fetched_at         timestamptz not null    -- when we asked the API
);

create index if not exists prices_item_location_time
    on prices (store_item_id, location_id, fetched_at desc);

-- Enforce "never overwrite": block UPDATE and DELETE on prices.
-- Price history is stored as changes (decided 2026-10-12 to save space): a new
-- row when a price changes; while it stays the same, the row's checked_through
-- moves forward. So each row means "this price from fetched_at through
-- checked_through". Old prices themselves can never be edited or deleted.
alter table prices add column if not exists checked_through timestamptz;

create or replace function prices_block_changes() returns trigger
language plpgsql as $$
begin
    -- The only allowed edit: moving checked_through forward (the price was seen again).
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'checked_through') = (to_jsonb(old) - 'checked_through')
       and new.checked_through >= coalesce(old.checked_through, old.fetched_at) then
        return new;
    end if;
    raise exception '% is append-only: insert a new row instead', tg_table_name;
end;
$$;

drop trigger if exists prices_append_only on prices;
create trigger prices_append_only
    before update or delete on prices
    for each row execute function prices_block_changes();

-- Rows saved before this change were each seen once.
update prices set checked_through = fetched_at where checked_through is null;

-- Record a batch of price checks (JSON list of price rows, as the collector builds
-- them). For each listing at each store: if the latest saved price is the same,
-- extend its checked_through; otherwise add a new row. Returns counts.
create or replace function record_prices(p_rows jsonb)
returns table (added integer, confirmed integer)
language plpgsql security definer set search_path = public
as $$
declare
    r jsonb;
    last_id bigint;
    last_regular numeric;
    last_promo numeric;
    seen_at timestamptz;
begin
    added := 0;
    confirmed := 0;
    for r in select * from jsonb_array_elements(p_rows) loop
        seen_at := (r->>'fetched_at')::timestamptz;
        select id, regular_price, promo_price into last_id, last_regular, last_promo
        from prices
        where store_item_id = (r->>'store_item_id')::bigint and location_id = (r->>'location_id')::bigint
        order by fetched_at desc
        limit 1;
        if last_id is not null
           and last_regular is not distinct from (r->>'regular_price')::numeric
           and last_promo is not distinct from (r->>'promo_price')::numeric then
            update prices set checked_through = greatest(checked_through, seen_at) where id = last_id;
            confirmed := confirmed + 1;
        else
            insert into prices (store_item_id, location_id, regular_price, promo_price, regular_per_unit,
                                promo_per_unit, stock_level, source, search_term, fetched_at, checked_through)
            values ((r->>'store_item_id')::bigint, (r->>'location_id')::bigint,
                    (r->>'regular_price')::numeric, (r->>'promo_price')::numeric,
                    (r->>'regular_per_unit')::numeric, (r->>'promo_per_unit')::numeric,
                    r->>'stock_level', r->>'source', r->>'search_term', seen_at, seen_at);
            added := added + 1;
        end if;
    end loop;
    return next;
end;
$$;
revoke all on function record_prices(jsonb) from public, anon, authenticated;
grant execute on function record_prices(jsonb) to service_role;

-- Prices checked by hand (added 2026-10-12) for stores with no API (H-E-B, Walmart,
-- Target, Costco, Sprouts ...). Only price checkers (see account_access) may save them.
-- p_entries: [{slug, price, regular?, size, size_value, size_unit, base_qty, base_unit, description?}]
-- price = what the shelf charges now; regular = the normal price if it's on sale.
create or replace function record_manual_prices(p_location_id bigint, p_entries jsonb)
returns table (added integer, confirmed integer)
language plpgsql security definer set search_path = public
as $$
declare
    e jsonb;
    store_chain text;
    item_id bigint;
    rows jsonb := '[]'::jsonb;
    now_ts timestamptz := now();
    shelf numeric;
    normal numeric;
    n_added integer;
    n_confirmed integer;
begin
    if not can_enter_prices() then
        raise exception 'only Cheaper Eats price checkers can save prices';
    end if;
    select coalesce(chain, name) into store_chain from locations
    where id = p_location_id and kind = 'grocery' and source <> 'kroger';
    if store_chain is null then
        raise exception 'not a hand-checked store';
    end if;

    for e in select * from jsonb_array_elements(p_entries) loop
        shelf := (e->>'price')::numeric;
        normal := coalesce((e->>'regular')::numeric, shelf);
        if shelf is null or shelf <= 0 or shelf > 1000 or normal < shelf then
            continue;
        end if;
        insert into store_items (source, external_id, product_id, description, size, size_value, size_unit,
                                 base_qty, base_unit, updated_at)
        select 'manual', store_chain || ':' || p.slug, p.id,
               coalesce(nullif(e->>'description', ''), store_chain || ' ' || p.name),
               e->>'size', (e->>'size_value')::numeric, e->>'size_unit',
               (e->>'base_qty')::numeric, e->>'base_unit', now_ts
        from products p where p.slug = e->>'slug'
        on conflict (source, external_id) do update
            set description = excluded.description, size = excluded.size, size_value = excluded.size_value,
                size_unit = excluded.size_unit, base_qty = excluded.base_qty, base_unit = excluded.base_unit,
                updated_at = excluded.updated_at
        returning id into item_id;
        if item_id is null then
            continue;  -- unknown product slug
        end if;
        rows := rows || jsonb_build_object(
            'store_item_id', item_id, 'location_id', p_location_id,
            'regular_price', normal, 'promo_price', case when shelf < normal then shelf end,
            'source', 'manual', 'search_term', 'manual', 'fetched_at', now_ts);
        item_id := null;
    end loop;
    select r.added, r.confirmed into n_added, n_confirmed from record_prices(rows) r;
    perform log_activity('prices_saved', null, jsonb_build_object(
        'location_id', p_location_id,
        'store', (select name from locations where id = p_location_id),
        'prices', jsonb_array_length(rows), 'changed', n_added));
    return query select n_added, n_confirmed;
end;
$$;
revoke all on function record_manual_prices(bigint, jsonb) from public, anon;
grant execute on function record_manual_prices(bigint, jsonb) to authenticated;

-- The last hand-checked price for each item at each store (for the entry screen).
drop view if exists manual_last_prices;
create view manual_last_prices with (security_invoker = true) as
select distinct on (p.location_id, si.product_id)
    p.location_id, si.product_id, pr.slug, si.description, si.size, si.size_value,
    p.regular_price, p.promo_price, coalesce(p.checked_through, p.fetched_at) as checked_at
from prices p
join store_items si on si.id = p.store_item_id
join products pr on pr.id = si.product_id
where si.source = 'manual'
order by p.location_id, si.product_id, p.fetched_at desc;
grant select on manual_last_prices to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Basket (added 2026-10-10): canonical products, normalized sizes, and a view
-- with today's cheapest price for each basket item at each store.
-- ---------------------------------------------------------------------------
alter table products add column if not exists slug          text unique;  -- permanent ID from basket.py
alter table products add column if not exists unit_label    text;         -- compare prices per this unit: 'gal', 'lb', 'dozen', 'oz', 'fl oz'
alter table products add column if not exists unit_base_qty numeric;      -- base units in one unit_label (gal = 128 fl oz)
alter table products add column if not exists active        boolean not null default true;
alter table products add column if not exists basket_qty    numeric;      -- how much a weekly basket buys, in unit_label

alter table store_items add column if not exists base_qty  numeric;       -- package size in base units, e.g. 64
alter table store_items add column if not exists base_unit text;          -- 'fl oz', 'oz' or 'ct'

create index if not exists store_items_product on store_items (product_id);

-- Views used by the website. Dropped and re-created so this file can be re-run.
drop view if exists latest_basket_prices;
drop view if exists latest_listing_prices;
drop view if exists basket_price_history;

-- Every basket listing at every store, with its latest price from the last
-- 3 days. price = sale price if there is one; price_per_unit is in unit_label.
create view latest_listing_prices with (security_invoker = true) as
with recent as (
    select distinct on (p.location_id, p.store_item_id)
        p.location_id, p.store_item_id, p.regular_price, p.promo_price,
        coalesce(p.promo_price, p.regular_price) as price,
        coalesce(p.checked_through, p.fetched_at) as fetched_at  -- when it was last confirmed
    from prices p
    -- still being seen: daily API prices within 3 days; weekly hand-checked prices within 10
    where coalesce(p.checked_through, p.fetched_at) > now() - case when p.source = 'manual' then interval '10 days' else interval '3 days' end
    order by p.location_id, p.store_item_id, p.fetched_at desc
)
select pr.id as product_id, pr.slug, pr.name as product, pr.category, pr.unit_label,
       pr.basket_qty, r.location_id, l.name as store,
       si.id as store_item_id, si.description, si.brand, si.size, si.sold_by,
       r.regular_price, r.promo_price, r.price,
       round(r.price / (si.base_qty / pr.unit_base_qty), 4) as price_per_unit,
       r.fetched_at
from recent r
join store_items si on si.id = r.store_item_id
join products pr on pr.id = si.product_id
join locations l on l.id = r.location_id
where pr.active and si.base_qty > 0;

-- The cheapest listing (per unit) for each basket item at each store.
create view latest_basket_prices with (security_invoker = true) as
select distinct on (product_id, location_id) *
from latest_listing_prices
order by product_id, location_id, price_per_unit, price;

-- Daily cheapest price per unit for each basket item at each store, for charts.
-- Days are in Houston time (America/Chicago).
create view basket_price_history with (security_invoker = true) as
select si.product_id, pr.slug, p.location_id,
       d.day::date as day,
       round(min(coalesce(p.promo_price, p.regular_price) / (si.base_qty / pr.unit_base_qty)), 4)
           as price_per_unit
from prices p
join store_items si on si.id = p.store_item_id
join products pr on pr.id = si.product_id
-- one row per day the price was in effect (from first seen through last confirmed)
cross join lateral generate_series(
    (p.fetched_at at time zone 'America/Chicago')::date,
    (coalesce(p.checked_through, p.fetched_at) at time zone 'America/Chicago')::date,
    interval '1 day') as d(day)
where pr.active and si.base_qty > 0
group by si.product_id, pr.slug, p.location_id, d.day;

grant select on latest_listing_prices, latest_basket_prices, basket_price_history
    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Cities (added 2026-10-10): which metro area each store belongs to, so the
-- website can compare cities. Set by collect_prices.py (e.g. 'Houston, TX').
-- ---------------------------------------------------------------------------
alter table locations add column if not exists metro text;

-- Why we collect a store (added 2026-10-11):
--   'featured' = one of the fixed cities shown to everyone on the home page
--   'user'     = added because a user saved a home ZIP near it; shown only to that user
alter table locations add column if not exists tracking text not null default 'featured';

-- ---------------------------------------------------------------------------
-- Profiles (added 2026-10-11): one private row per signed-in user.
-- Users are created by Supabase Auth (auth.users); deleting a user deletes this row.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    home_zip    text check (home_zip ~ '^[0-9]{5}$'),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Optional home address (added 2026-10-12), for distances to restaurants and stores.
-- Private like home_zip: only the user can read it (rules below).
alter table profiles add column if not exists home_address text;
alter table profiles add column if not exists home_lat double precision;
alter table profiles add column if not exists home_lon double precision;

alter table profiles enable row level security;

-- Each person can see, create and change only their own profile. Visitors get nothing.
drop policy if exists "own profile: read" on profiles;
drop policy if exists "own profile: insert" on profiles;
drop policy if exists "own profile: update" on profiles;
create policy "own profile: read"   on profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: insert" on profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile: update" on profiles for update to authenticated
    using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

revoke all on profiles from anon;
grant select, insert, update on profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Account deletion (added 2026-10-11): a signed-in user can delete their own
-- account. Deleting the auth user also deletes their profile, lists and list
-- items (all "on delete cascade"). Runs with owner rights so the website never
-- needs the secret key, but it only ever deletes the caller's own account.
-- ---------------------------------------------------------------------------
create or replace function delete_my_account() returns void
language plpgsql security definer set search_path = ''
as $$
declare
    me uuid := auth.uid();
begin
    if me is null then
        raise exception 'not signed in';
    end if;
    -- Their group goes too (except the owner's), and their email is removed from
    -- the activity log, so nothing about them is left.
    delete from public.account_access
    where email = lower(auth.jwt() ->> 'email') and tier <> 'owner';
    update public.activity_log set actor_email = '(deleted account)'
    where actor_email = lower(auth.jwt() ->> 'email');
    update public.activity_log set target_email = '(deleted account)'
    where target_email = lower(auth.jwt() ->> 'email');
    delete from auth.users where id = me;
end;
$$;

revoke all on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Shopping lists (added 2026-10-11): private, one row per list and per item.
-- An item is either a staple (a basket product: cheapest brand wins) or a
-- specific Kroger product (exact item, by Kroger productId).
-- ---------------------------------------------------------------------------
create table if not exists shopping_lists (
    id          bigint generated always as identity primary key,
    user_id     uuid not null references auth.users(id) on delete cascade,
    name        text not null default 'My list',
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists shopping_lists_user on shopping_lists (user_id);

create table if not exists list_items (
    id                 bigint generated always as identity primary key,
    list_id            bigint not null references shopping_lists(id) on delete cascade,
    product_id         bigint references products(id),   -- a staple, any brand
    kroger_product_id  text,                              -- or one specific product
    description        text not null,                     -- what to show, saved when added
    brand              text,
    size               text,
    image_url          text,
    quantity           integer not null default 1 check (quantity between 1 and 99),
    added_at           timestamptz not null default now(),
    check ((product_id is null) <> (kroger_product_id is null)),
    unique (list_id, product_id),
    unique (list_id, kroger_product_id)
);
create index if not exists list_items_list on list_items (list_id);

alter table shopping_lists enable row level security;
alter table list_items     enable row level security;

-- People can only see and change their own lists, and the items on them.
drop policy if exists "own lists" on shopping_lists;
create policy "own lists" on shopping_lists for all to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own list items" on list_items;
create policy "own list items" on list_items for all to authenticated
    using (exists (select 1 from shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())))
    with check (exists (select 1 from shopping_lists l where l.id = list_id and l.user_id = (select auth.uid())));

revoke all on shopping_lists, list_items from anon;
grant select, insert, update, delete on shopping_lists, list_items to authenticated;

-- ---------------------------------------------------------------------------
-- Restaurants and menus (added 2026-10-12). Restaurants are rows in locations
-- with kind = 'restaurant' (and tracking = 'restaurant', so grocery pages never
-- show them). Menus are public (Eat out tab).
-- ---------------------------------------------------------------------------
alter table locations add column if not exists website  text;
alter table locations add column if not exists cuisine  text;
alter table locations add column if not exists menu_url text;   -- the page we read the menu from

-- ---------------------------------------------------------------------------
-- Account groups (added 2026-10-13). Everyone who signs up is a free user.
-- Others are listed here by email, so the owner can add someone before they
-- sign up and it applies the moment they log in:
--   owner    the owner (set here in schema.sql, never from the website)
--   admin    can do everything the owner can on the website, except change the
--            owner account or make anyone an owner; always enters prices
--   trusted  people the owner gives the full service for free
--   paid     paying subscribers (set by billing once it exists, or by hand)
--   free     only stored when the person is a price checker
-- enters_prices is separate: anyone the owner picks can enter shelf prices.
-- Hidden from everyone; read through the functions below.
-- ---------------------------------------------------------------------------
create table if not exists account_access (
    email          text primary key check (email = lower(email)),
    tier           text not null,
    enters_prices  boolean not null default false,
    note           text,                -- e.g. "my sister"; only the owner sees it
    paid_until     timestamptz,         -- paid only: access ends after this (null = no end)
    granted_at     timestamptz not null default now()
);
alter table account_access drop constraint if exists account_access_tier_check;
alter table account_access add constraint account_access_tier_check
    check (tier in ('owner', 'admin', 'trusted', 'paid', 'free'));
alter table account_access enable row level security;
revoke all on account_access from anon, authenticated;
insert into account_access (email, tier, enters_prices)
values ('halendfj@gmail.com', 'owner', true)
on conflict (email) do nothing;

-- The signed-in user's row (by their verified sign-in email), if any.
create or replace function my_access_row() returns public.account_access
language sql stable security definer set search_path = ''
as $$ select * from public.account_access where email = lower(auth.jwt() ->> 'email') $$;
revoke all on function my_access_row() from public, anon, authenticated;

-- "What group am I in?" 'owner', 'admin', 'trusted', 'paid' or 'free' (expired paid counts as free).
create or replace function my_tier() returns text
language sql stable security definer set search_path = ''
as $$
    select case
        when r.tier = 'paid' and r.paid_until is not null and r.paid_until < now() then 'free'
        else coalesce(r.tier, 'free')
    end
    from public.my_access_row() r
$$;
revoke all on function my_tier() from public, anon;
grant execute on function my_tier() to authenticated;

create or replace function is_app_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select tier = 'owner' from public.my_access_row()), false) $$;
revoke all on function is_app_owner() from public, anon;
grant execute on function is_app_owner() to authenticated;

-- Owner or admin: may manage people and see the activity log.
create or replace function is_app_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select tier in ('owner', 'admin') from public.my_access_row()), false) $$;
revoke all on function is_app_admin() from public, anon;
grant execute on function is_app_admin() to authenticated;

create or replace function can_enter_prices() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce((select enters_prices or tier in ('owner', 'admin') from public.my_access_row()), false) $$;
revoke all on function can_enter_prices() from public, anon;
grant execute on function can_enter_prices() to authenticated;

-- Everything the website needs in one call: group, owner?, admin?, price checker?
drop function if exists my_access();
create or replace function my_access()
returns table (tier text, is_owner boolean, is_admin boolean, enters_prices boolean)
language sql stable security definer set search_path = ''
as $$ select public.my_tier(), public.is_app_owner(), public.is_app_admin(), public.can_enter_prices() $$;
revoke all on function my_access() from public, anon;
grant execute on function my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Activity log (added 2026-10-13): who changed whose access, and who saved
-- prices. Append-only. The only edit allowed is replacing an email with
-- '(deleted account)' when that person deletes their account.
-- ---------------------------------------------------------------------------
create table if not exists activity_log (
    id            bigint generated always as identity primary key,
    at            timestamptz not null default now(),
    actor_email   text,            -- who did it
    action        text not null,   -- 'access_changed', 'prices_saved'
    target_email  text,            -- whose access changed (access_changed only)
    details       jsonb not null default '{}'::jsonb   -- before/after, store, counts
);
create index if not exists activity_log_at on activity_log (at desc);
alter table activity_log enable row level security;
revoke all on activity_log from anon, authenticated;

create or replace function activity_log_append_only() returns trigger
language plpgsql set search_path = ''
as $$
begin
    if tg_op = 'UPDATE'
       and new.id = old.id and new.at = old.at and new.action = old.action and new.details = old.details
       and (new.actor_email is not distinct from old.actor_email or new.actor_email = '(deleted account)')
       and (new.target_email is not distinct from old.target_email or new.target_email = '(deleted account)')
    then
        return new;   -- redacting a deleted account's email
    end if;
    raise exception 'the activity log can''t be changed';
end;
$$;
drop trigger if exists activity_log_append_only on activity_log;
create trigger activity_log_append_only
    before update or delete on activity_log
    for each row execute function activity_log_append_only();

-- Adds a log entry as the signed-in user. Only called from other functions.
create or replace function log_activity(p_action text, p_target text, p_details jsonb)
returns void
language sql security definer set search_path = ''
as $$
    insert into public.activity_log (actor_email, action, target_email, details)
    values (lower(auth.jwt() ->> 'email'), p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function log_activity(text, text, jsonb) from public, anon, authenticated;

-- Owner or admin: the latest log entries, newest first.
create or replace function admin_activity(p_limit integer default 200)
returns table (at timestamptz, actor_email text, action text, target_email text, details jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if not public.is_app_admin() then
        raise exception 'admins only';
    end if;
    return query
    select l.at, l.actor_email, l.action, l.target_email, l.details
    from public.activity_log l
    order by l.at desc, l.id desc
    limit least(greatest(p_limit, 1), 1000);
end;
$$;
revoke all on function admin_activity(integer) from public, anon;
grant execute on function admin_activity(integer) to authenticated;

-- Owner or admin: everyone who has signed up, plus people added who haven't yet.
create or replace function admin_people()
returns table (email text, user_id uuid, joined_at timestamptz, last_sign_in_at timestamptz,
               tier text, enters_prices boolean, note text, paid_until timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
    if not public.is_app_admin() then
        raise exception 'admins only';
    end if;
    return query
    select coalesce(lower(u.email), a.email)::text, u.id, u.created_at, u.last_sign_in_at,
           coalesce(a.tier, 'free'), coalesce(a.enters_prices, false), a.note, a.paid_until
    from auth.users u
    full join public.account_access a on a.email = lower(u.email)
    order by (a.tier = 'owner') desc nulls last, (a.tier = 'admin') desc nulls last, u.created_at desc nulls first;
end;
$$;
revoke all on function admin_people() from public, anon;
grant execute on function admin_people() to authenticated;

-- Owner or admin: put someone (by email) in a group. The owner row can't be
-- changed here, and no one can be made an owner from the website. Every change
-- is logged with the before and after.
create or replace function admin_set_access(p_email text, p_tier text, p_enters_prices boolean,
                                            p_note text, p_paid_until timestamptz default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
    who text := lower(trim(p_email));
    before public.account_access;
begin
    if not public.is_app_admin() then
        raise exception 'admins only';
    end if;
    if who !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'not an email address';
    end if;
    if p_tier not in ('admin', 'trusted', 'paid', 'free') then
        raise exception 'unknown group';
    end if;
    select * into before from public.account_access where email = who;
    if before.tier = 'owner' then
        raise exception 'the owner account can''t be changed here';
    end if;
    if p_tier = 'free' and not p_enters_prices then
        delete from public.account_access where email = who;   -- plain free user: no row needed
    else
        insert into public.account_access (email, tier, enters_prices, note, paid_until)
        values (who, p_tier, p_enters_prices or p_tier = 'admin', nullif(trim(p_note), ''),
                case when p_tier = 'paid' then p_paid_until end)
        on conflict (email) do update
            set tier = excluded.tier, enters_prices = excluded.enters_prices,
                note = excluded.note, paid_until = excluded.paid_until;
    end if;
    perform public.log_activity('access_changed', who, jsonb_build_object(
        'from', jsonb_build_object('tier', coalesce(before.tier, 'free'),
                                   'enters_prices', coalesce(before.enters_prices, false),
                                   'note', before.note, 'paid_until', before.paid_until),
        'to', jsonb_build_object('tier', p_tier, 'enters_prices', p_enters_prices or p_tier = 'admin',
                                 'note', nullif(trim(p_note), ''),
                                 'paid_until', case when p_tier = 'paid' then p_paid_until end)));
end;
$$;
revoke all on function admin_set_access(text, text, boolean, text, timestamptz) from public, anon;
grant execute on function admin_set_access(text, text, boolean, text, timestamptz) to authenticated;

-- Replaced by account_access (2026-10-13).
drop table if exists app_owners;

create table if not exists menu_items (
    id           bigint generated always as identity primary key,
    location_id  bigint not null references locations(id),
    section      text not null default '',               -- e.g. 'Tacos' ('' if the menu has none)
    name         text not null,
    description  text,
    first_seen   timestamptz not null default now(),
    last_seen    timestamptz not null default now(),
    unique (location_id, section, name)
);

create table if not exists menu_prices (
    id            bigint generated always as identity primary key,
    menu_item_id  bigint not null references menu_items(id),
    price         numeric not null,
    source        text not null,      -- 'restaurant_site' (later: 'delivery:doordash', ...)
    source_url    text,
    fetched_at    timestamptz not null
);
create index if not exists menu_prices_item_time on menu_prices (menu_item_id, fetched_at desc);

-- Like grocery prices: append-only.
drop trigger if exists menu_prices_append_only on menu_prices;
create trigger menu_prices_append_only
    before update or delete on menu_prices
    for each row execute function prices_block_changes();

alter table menu_items  enable row level security;
alter table menu_prices enable row level security;
-- Restaurant menus come from restaurants' own public websites and are shown to
-- everyone on the Eat out tab (changed 2026-10-12; previously owners only).
grant select on menu_items, menu_prices to anon, authenticated;
drop policy if exists "owners read" on menu_items;
drop policy if exists "owners read" on menu_prices;
drop policy if exists "public read" on menu_items;
drop policy if exists "public read" on menu_prices;
create policy "public read" on menu_items  for select using (true);
create policy "public read" on menu_prices for select using (true);

-- Each dish's most recent price, with its restaurant (public, for the Eat out tab).
drop view if exists latest_menu_prices;
create view latest_menu_prices with (security_invoker = true) as
select distinct on (p.menu_item_id)
    i.id as menu_item_id, i.name, i.section, i.description,
    l.id as location_id, l.name as restaurant, l.cuisine, l.address_line1, l.website, l.menu_url,
    l.latitude, l.longitude, l.metro,
    p.price, p.source, p.fetched_at
from menu_prices p
join menu_items i on i.id = p.menu_item_id
join locations l on l.id = i.location_id
where l.menu_url is not null  -- clearing a restaurant's menu_url hides it (its history is kept)
order by p.menu_item_id, p.fetched_at desc;
grant select on latest_menu_prices to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Saved menus (added 2026-10-12): menus a user saves from a delivery app page
-- they're viewing (DoorDash, Uber Eats, ...) with the "Save to Cheaper Eats"
-- button. Private: each user sees only their own.
-- ---------------------------------------------------------------------------
create table if not exists saved_menus (
    id               bigint generated always as identity primary key,
    user_id          uuid not null references auth.users(id) on delete cascade,
    app              text not null,          -- 'doordash', 'ubereats', 'grubhub', or the site's name
    restaurant_name  text not null,
    page_url         text,
    saved_at         timestamptz not null default now()
);
create index if not exists saved_menus_user on saved_menus (user_id);

create table if not exists saved_menu_items (
    id              bigint generated always as identity primary key,
    saved_menu_id   bigint not null references saved_menus(id) on delete cascade,
    name            text not null,
    description     text,
    price           numeric not null check (price >= 0)
);
create index if not exists saved_menu_items_menu on saved_menu_items (saved_menu_id);

alter table saved_menus      enable row level security;
alter table saved_menu_items enable row level security;
drop policy if exists "own saved menus" on saved_menus;
create policy "own saved menus" on saved_menus for all to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own saved menu items" on saved_menu_items;
create policy "own saved menu items" on saved_menu_items for all to authenticated
    using (exists (select 1 from saved_menus m where m.id = saved_menu_id and m.user_id = (select auth.uid())))
    with check (exists (select 1 from saved_menus m where m.id = saved_menu_id and m.user_id = (select auth.uid())));
revoke all on saved_menus, saved_menu_items from anon;
grant select, insert, update, delete on saved_menus, saved_menu_items to authenticated;

-- ---------------------------------------------------------------------------
-- Benchmarks (added 2026-10-10): official average prices to compare against,
-- e.g. the Bureau of Labor Statistics' monthly U.S. city average prices.
-- Unlike prices, rows are updated in place, because the BLS revises its numbers.
-- ---------------------------------------------------------------------------
create table if not exists benchmark_prices (
    id              bigint generated always as identity primary key,
    product_id      bigint not null references products(id),
    source          text not null,          -- 'bls'
    series_id       text not null,          -- e.g. 'APU0000708111' (eggs, grade A large)
    area            text not null,          -- e.g. 'U.S. city average'
    period          date not null,          -- first day of the month the average covers
    price           numeric not null,       -- as published, in source_unit
    source_unit     text not null,          -- 'lb', 'gal' or 'dozen'
    price_per_unit  numeric not null,       -- converted to the product's unit_label
    fetched_at      timestamptz not null default now(),
    unique (series_id, period)
);

-- ---------------------------------------------------------------------------
-- Security: turn on Row Level Security. Our Python scripts use the secret key,
-- which bypasses these rules. The public key (used later by the website) may
-- only READ.
-- ---------------------------------------------------------------------------
alter table locations   enable row level security;
alter table products    enable row level security;
alter table store_items enable row level security;
alter table prices      enable row level security;
alter table benchmark_prices enable row level security;

drop policy if exists "public read" on locations;
drop policy if exists "public read" on products;
drop policy if exists "public read" on store_items;
drop policy if exists "public read" on prices;
drop policy if exists "public read" on benchmark_prices;
create policy "public read" on locations   for select using (true);
create policy "public read" on products    for select using (true);
create policy "public read" on store_items for select using (true);
create policy "public read" on prices      for select using (true);
create policy "public read" on benchmark_prices for select using (true);
