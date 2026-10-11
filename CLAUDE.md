# Food Price App

## Goal
Build a database of grocery (and later restaurant) prices, plus a webpage with cost filters.
Start with the Kroger public API. Later: other stores, restaurants, gas, transportation.

## Stack
- Python for data collection scripts
- Supabase (PostgreSQL) for the database
- Next.js website, hosted on Vercel (later step)
- Secrets live in `.env` (never commit it; keep it in `.gitignore`)

## .env keys
```
KROGER_CLIENT_ID=
KROGER_CLIENT_SECRET=
SUPABASE_URL=
SUPABASE_KEY=
SUPABASE_DB_URL=   # Session pooler connection string; used by run_sql.py to apply schema.sql
```

## Kroger API (specs in /docs: products.json, location.json, authorization.json)
- Base URL: https://api.kroger.com
- Auth: POST /v1/connect/oauth2/token, grant_type=client_credentials,
  header `Authorization: Basic base64(client_id:client_secret)`, scope `product.compact`.
  Tokens last 1800 seconds; cache and refresh them.
- Locations: GET /v1/locations?filter.zipCode.near=...&filter.radiusInMiles=...&filter.limit=...
  (max 200 results, max 100 miles). Returns locationId (8 digits), address, geolocation, chain.
- Products: GET /v1/products?filter.term=...&filter.locationId=...&filter.limit=50&filter.start=...
  Price, stock and aisle data only come back when locationId is included.
  Max 50 per page; filter.start max 250. Term search is fuzzy and result order can change.
- Price fields per item: price.regular, price.promo, regularPerUnitEstimate, promoPerUnitEstimate,
  plus size (e.g. "1 gal") and soldBy ("unit" or "weight").
- Rate limits: Products 10,000 calls/day; Locations 1,600 calls/day per endpoint.
  Every script must count calls and stay well under these limits.

## Database design principles
- `locations` table: every store/restaurant with lat/long and address (gas, transit and trips build on this later)
- `products` (canonical items, e.g. "milk, 2%, 1 gal") separate from `store_items` (a store's specific listing/UPC)
- `prices` table: append-only history; every check is a new row with a timestamp. Never overwrite.
- Store size + unit so price-per-unit comparisons work
- Track the source and fetch time of every price

## Working style
- Build in small steps; get each step running before moving on
- Explain what each new file does in plain language (the owner is new to coding)
