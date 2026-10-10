"""
Collect Kroger prices and save them to Supabase.

For the stores nearest ZIP_CODE, searches each term in SEARCH_TERMS and saves:
  - each store            -> locations   (added once, refreshed on later runs)
  - each product listing  -> store_items (added once, refreshed on later runs)
  - each price we see     -> prices      (a NEW row every run, never overwritten)

Run it with:  python collect_prices.py
"""

import re
from datetime import datetime, timezone

from dotenv import load_dotenv

import db
import kroger_api

ZIP_CODE = "77002"
NUM_STORES = 3
# Each term costs 1 Kroger API call per store (3 stores x 12 terms = 36 calls per run).
SEARCH_TERMS = [
    "milk", "eggs", "bread", "butter", "cheese", "bananas",
    "apples", "chicken breast", "ground beef", "rice", "pasta", "coffee",
]
ITEMS_PER_SEARCH = 10


def parse_size(size_text):
    """Split a size like '1/2 gal' or '64 fl oz' into (0.5, 'gal') or (64, 'fl oz')."""
    if not size_text:
        return None, None
    size_text = size_text.split(" / ")[0]    # '12 ct / 24 oz' -> '12 ct'
    match = re.match(r"^\s*(\d+)\s*/\s*(\d+)\s+(.+)$", size_text)   # fraction, e.g. 1/2 gal
    if match:
        return int(match.group(1)) / int(match.group(2)), match.group(3).strip().lower()
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*(.+)$", size_text)      # number, e.g. 64 fl oz
    if match:
        return float(match.group(1)), match.group(2).strip().lower()
    return None, None


def location_row(store):
    """Convert a Kroger store into a row for the locations table."""
    addr = store.get("address", {})
    geo = store.get("geolocation", {})
    return {
        "source": "kroger",
        "external_id": store["locationId"],
        "kind": "grocery",
        "name": store.get("name"),
        "chain": store.get("chain"),
        "address_line1": addr.get("addressLine1"),
        "city": addr.get("city"),
        "state": addr.get("state"),
        "zip_code": addr.get("zipCode"),
        "latitude": geo.get("latitude"),
        "longitude": geo.get("longitude"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def store_item_row(product, item):
    """Convert a Kroger product + item into a row for the store_items table."""
    size_value, size_unit = parse_size(item.get("size"))
    return {
        "source": "kroger",
        "external_id": item.get("itemId") or product["productId"],
        "upc": product.get("upc"),
        "description": product.get("description"),
        "brand": product.get("brand"),
        "size": item.get("size"),
        "size_value": size_value,
        "size_unit": size_unit,
        "sold_by": item.get("soldBy"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def price_row(item, store_item_id, location_id, search_term, fetched_at):
    """Convert a Kroger item's price info into a row for the prices table."""
    price = item.get("price") or {}
    regular = price.get("regular") or None
    promo = price.get("promo") or None
    if promo and regular and promo >= regular:
        promo = None  # Kroger sometimes repeats the regular price as the "promo"
    return {
        "store_item_id": store_item_id,
        "location_id": location_id,
        "regular_price": regular,
        "promo_price": promo,
        "regular_per_unit": price.get("regularPerUnitEstimate") or None,
        "promo_per_unit": price.get("promoPerUnitEstimate") or None,
        "stock_level": (item.get("inventory") or {}).get("stockLevel"),
        "source": "kroger_api",
        "search_term": search_term,
        "fetched_at": fetched_at,
    }


def main():
    load_dotenv()
    client = db.get_client()
    token = kroger_api.get_token()

    stores = kroger_api.find_nearest_stores(token, ZIP_CODE, NUM_STORES)
    total_prices = 0

    for store in stores:
        location_id = db.upsert_location(client, location_row(store))
        print(f"{store['name']} ({store['locationId']})")

        for term in SEARCH_TERMS:
            products = kroger_api.search_products(token, store["locationId"], term, ITEMS_PER_SEARCH)
            fetched_at = datetime.now(timezone.utc).isoformat()

            # Pair each listing with its price, skipping listings with no price at this store.
            found = []
            for product in products:
                for item in product.get("items", []):
                    if (item.get("price") or {}).get("regular"):
                        found.append((store_item_row(product, item), item))

            ids = db.upsert_store_items(client, [listing for listing, _ in found])
            rows = [
                price_row(item, ids[listing["external_id"]], location_id, term, fetched_at)
                for listing, item in found
            ]

            db.insert_prices(client, rows)
            total_prices += len(rows)
            print(f"  '{term}': saved {len(rows)} prices")

    print(f"\nDone. Saved {total_prices} prices. Kroger API calls this run: {kroger_api.api_calls}")


if __name__ == "__main__":
    main()
