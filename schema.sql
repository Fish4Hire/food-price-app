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
create or replace function prices_block_changes() returns trigger
language plpgsql as $$
begin
    raise exception 'prices is append-only: insert a new row instead';
end;
$$;

drop trigger if exists prices_append_only on prices;
create trigger prices_append_only
    before update or delete on prices
    for each row execute function prices_block_changes();

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
        coalesce(p.promo_price, p.regular_price) as price, p.fetched_at
    from prices p
    where p.fetched_at > now() - interval '3 days'
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
       (p.fetched_at at time zone 'America/Chicago')::date as day,
       round(min(coalesce(p.promo_price, p.regular_price) / (si.base_qty / pr.unit_base_qty)), 4)
           as price_per_unit
from prices p
join store_items si on si.id = p.store_item_id
join products pr on pr.id = si.product_id
where pr.active and si.base_qty > 0
group by si.product_id, pr.slug, p.location_id, day;

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
-- show them). Menus are public (Eat out tab); app_owners is kept for owner-only tools.
-- ---------------------------------------------------------------------------
alter table locations add column if not exists website  text;
alter table locations add column if not exists cuisine  text;
alter table locations add column if not exists menu_url text;   -- the page we read the menu from

create table if not exists app_owners (
    user_id  uuid primary key references auth.users(id) on delete cascade
);
alter table app_owners enable row level security;
revoke all on app_owners from anon, authenticated;

-- "Is the signed-in user an owner?" Runs with owner rights so the list itself stays hidden.
create or replace function is_app_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.app_owners where user_id = auth.uid()) $$;
revoke all on function is_app_owner() from public, anon;
grant execute on function is_app_owner() to authenticated;

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
    l.latitude, l.longitude,
    p.price, p.source, p.fetched_at
from menu_prices p
join menu_items i on i.id = p.menu_item_id
join locations l on l.id = i.location_id
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
