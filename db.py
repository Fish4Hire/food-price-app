"""
Shared code for talking to our Supabase database.

Run it directly to test your connection:  python db.py
"""

import os
import sys

from dotenv import load_dotenv
from supabase import create_client

TABLES = ["locations", "products", "store_items", "prices"]


def get_client():
    """Connect to Supabase using the URL and secret key from .env."""
    load_dotenv()
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if not url or not key:
        sys.exit("Missing SUPABASE_URL or SUPABASE_KEY in your .env file.")
    return create_client(url, key)


def user_home_zips(client):
    """Every distinct home ZIP users have saved (needs the secret key; profiles are private)."""
    zips, start = set(), 0
    while True:
        page = (
            client.table("profiles")
            .select("home_zip")
            .not_.is_("home_zip", "null")
            .order("id")
            .range(start, start + 999)
            .execute()
            .data
        )
        zips.update(row["home_zip"] for row in page)
        if len(page) < 1000:
            return sorted(zips)
        start += 1000


def list_products_by_zip(client):
    """
    The specific products on users' shopping lists, grouped by the owner's home ZIP:
    {zip: {productId, ...}}. Needs the secret key (lists and profiles are private).
    """
    zips, start = {}, 0
    while True:
        page = (
            client.table("profiles").select("id, home_zip")
            .not_.is_("home_zip", "null").order("id").range(start, start + 999).execute().data
        )
        zips.update({row["id"]: row["home_zip"] for row in page})
        if len(page) < 1000:
            break
        start += 1000

    by_zip, start = {}, 0
    while True:
        page = (
            client.table("list_items")
            .select("kroger_product_id, shopping_lists!inner(user_id)")
            .not_.is_("kroger_product_id", "null")
            .order("id")
            .range(start, start + 999)
            .execute()
            .data
        )
        for row in page:
            zip_code = zips.get(row["shopping_lists"]["user_id"])
            if zip_code:
                by_zip.setdefault(zip_code, set()).add(row["kroger_product_id"])
        if len(page) < 1000:
            return by_zip
        start += 1000


def restaurants_with_menus(client):
    """Restaurants we read menus for: id, name and menu_url."""
    return (
        client.table("locations").select("id, name, menu_url")
        .eq("kind", "restaurant").not_.is_("menu_url", "null").order("id").execute().data
    )


def upsert_menu_items(client, rows):
    """Add dishes or refresh ones we have. Returns {(section, name): id}."""
    if not rows:
        return {}
    unique_rows = list({(r["section"], r["name"]): r for r in rows}.values())
    result = (
        client.table("menu_items")
        .upsert(unique_rows, on_conflict="location_id,section,name")
        .execute()
    )
    return {(r["section"], r["name"]): r["id"] for r in result.data}


def insert_menu_prices(client, rows):
    """Add dish prices. Always new rows; never changes old ones."""
    if rows:
        client.table("menu_prices").insert(rows).execute()


def upsert_location(client, row):
    """Insert a store, or update it if we already have it. Returns its database id."""
    result = (
        client.table("locations")
        .upsert(row, on_conflict="source,external_id")
        .execute()
    )
    return result.data[0]["id"]


def upsert_store_items(client, rows):
    """
    Insert product listings, or update ones we already have, in one request.
    Returns a dict mapping each listing's external_id to its database id.
    """
    if not rows:
        return {}
    # The database rejects the same listing twice in one request, so drop repeats.
    unique_rows = list({row["external_id"]: row for row in rows}.values())
    result = (
        client.table("store_items")
        .upsert(unique_rows, on_conflict="source,external_id")
        .execute()
    )
    return {row["external_id"]: row["id"] for row in result.data}


def upsert_products(client, rows):
    """Insert or update basket products. Returns a dict mapping slug to database id."""
    result = client.table("products").upsert(rows, on_conflict="slug").execute()
    return {row["slug"]: row["id"] for row in result.data}


def deactivate_products_except(client, slugs):
    """Mark products no longer in the basket as inactive (kept, because prices point to them)."""
    (
        client.table("products")
        .update({"active": False})
        .not_.in_("slug", slugs)
        .execute()
    )


def all_store_items(client):
    """Fetch every Kroger listing, 1,000 at a time (Supabase's page size)."""
    rows, start = [], 0
    while True:
        page = (
            client.table("store_items")
            .select("id, description, size, size_value, size_unit, base_qty, base_unit, product_id")
            .eq("source", "kroger")  # hand-checked items are linked by hand; never re-match them
            .order("id")
            .range(start, start + 999)
            .execute()
            .data
        )
        rows += page
        if len(page) < 1000:
            return rows
        start += 1000


def update_store_item(client, store_item_id, fields):
    """Change fields on one saved listing (listings can be updated; prices cannot)."""
    client.table("store_items").update(fields).eq("id", store_item_id).execute()


def basket_products(client):
    """Every product's id, slug and comparison unit."""
    return client.table("products").select("id, slug, unit_label").execute().data


def upsert_benchmarks(client, rows):
    """Save benchmark averages, replacing any month we already have (the BLS revises)."""
    if rows:
        client.table("benchmark_prices").upsert(rows, on_conflict="series_id,period").execute()


def record_prices(client, rows):
    """
    Record price checks. A price that changed gets a new row; an unchanged price just
    has its existing row's checked_through moved forward (see record_prices in schema.sql).
    Returns (added, confirmed).
    """
    added = confirmed = 0
    for start in range(0, len(rows), 500):
        result = client.rpc("record_prices", {"p_rows": rows[start:start + 500]}).execute().data
        counts = result[0] if isinstance(result, list) else result
        added += counts["added"]
        confirmed += counts["confirmed"]
    return added, confirmed


def check_connection():
    """Print how many rows each table has. Fails with a clear message if setup is wrong."""
    client = get_client()
    for table in TABLES:
        try:
            result = client.table(table).select("id", count="exact").limit(1).execute()
        except Exception as error:
            sys.exit(
                f"Could not read table '{table}': {error}\n"
                "Did you run schema.sql in the Supabase SQL Editor?"
            )
        print(f"  {table:<12} {result.count} rows")
    print("Connected to Supabase.")


if __name__ == "__main__":
    check_connection()
