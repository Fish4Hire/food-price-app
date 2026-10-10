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


def insert_prices(client, rows):
    """Add price rows. Always inserts new rows; never changes old ones."""
    if rows:
        client.table("prices").insert(rows).execute()


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
