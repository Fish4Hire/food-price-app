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
-- Security: turn on Row Level Security. Our Python scripts use the secret key,
-- which bypasses these rules. The public key (used later by the website) may
-- only READ.
-- ---------------------------------------------------------------------------
alter table locations   enable row level security;
alter table products    enable row level security;
alter table store_items enable row level security;
alter table prices      enable row level security;

drop policy if exists "public read" on locations;
drop policy if exists "public read" on products;
drop policy if exists "public read" on store_items;
drop policy if exists "public read" on prices;
create policy "public read" on locations   for select using (true);
create policy "public read" on products    for select using (true);
create policy "public read" on store_items for select using (true);
create policy "public read" on prices      for select using (true);
