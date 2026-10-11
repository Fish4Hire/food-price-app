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
