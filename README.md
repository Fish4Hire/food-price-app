# Cheaper Eats

**Live site: [getcheapereats.com](https://getcheapereats.com)**

Cheaper Eats tracks what everyday groceries actually cost. Every morning it checks the prices of 21 grocery staples at stores in 7 U.S. cities and saves them to a database. The website then lets people compare cities and stores, spot sales, and see how local prices stack up against the official U.S. average. It also tracks restaurant menu prices.

## How it works

```
Kroger API ──┐
Restaurant   ├──> Python collectors ──> Supabase (Postgres) ──> Next.js site on Vercel
menus        │    (GitHub Actions,
BLS averages ┘     on a schedule)
```

| Job | Script | Schedule |
|---|---|---|
| Grocery prices | `collect_prices.py` | Daily (GitHub Actions) |
| Restaurant menu prices | `collect_menus.py` | Weekly, Sundays (GitHub Actions) |
| U.S. average prices (Bureau of Labor Statistics) | `collect_benchmarks.py` | Weekly, Mondays (GitHub Actions) |

## Engineering notes

- **Kroger API client** (`kroger_api.py`): OAuth2 client-credentials flow with token caching and refresh. Every script counts its API calls to stay well under Kroger's daily rate limits.
- **Append-only price history**: a new row is written only when a price changes. While it stays the same, that row's `checked_through` date moves forward. Old prices are never edited or deleted, and the database itself only allows `checked_through` to move forward.
- **Comparable prices**: canonical `products` (e.g. "milk, 2%, 1 gal") are kept separate from each store's own `store_items` listing, and sizes and units are stored so price-per-unit comparisons work across stores.
- **Locations**: stores and restaurants are mapped with OpenStreetMap data, with latitude and longitude kept for future features such as gas and travel costs.
- **Every price records where it came from and when it was fetched.**
- **Secrets** live in `.env` locally and in encrypted GitHub Actions secrets. None are committed.
- **Web app** (`web/`): Next.js and TypeScript with Supabase auth, user accounts with role groups (owner, admin, trusted, paid, free), saved menus and an activity log.

## Stack

Python · Supabase (PostgreSQL) · GitHub Actions · Next.js · TypeScript · Tailwind CSS · Vercel

## Run it locally

```bash
pip install -r requirements.txt
# create a .env file with KROGER_CLIENT_ID, KROGER_CLIENT_SECRET, SUPABASE_URL, SUPABASE_KEY, SUPABASE_DB_URL
python run_sql.py      # apply schema.sql
python collect_prices.py

cd web && npm install && npm run dev
```

Built by [Halen Jolley](https://halenjolley.com).
