"""
Collect Kroger prices for the basket (see basket.py) and save them to Supabase.

For the stores nearest ZIP_CODE, searches each basket item and saves only
listings that match a basket item's rules:
  - each store            -> locations   (added once, refreshed on later runs)
  - each matching listing -> store_items (added once, refreshed, linked to its product)
  - each price we see     -> prices      (a NEW row every run, never overwritten)

Run it with:  python collect_prices.py
"""

from datetime import datetime, timezone

from dotenv import load_dotenv

import basket
import db
import kroger_api

ZIP_CODE = "77002"
NUM_STORES = 3
# 50 is Kroger's max per search, and costs the same single API call as 10.
ITEMS_PER_SEARCH = 50
# API calls per run: 1 token + 1 store lookup + (basket items x stores) = about 65.


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


def store_item_row(product, item, product_id):
    """Convert a Kroger product + item into a row for the store_items table."""
    return {
        "source": "kroger",
        "external_id": item.get("itemId") or product["productId"],
        "upc": product.get("upc"),
        "product_id": product_id,
        "description": product.get("description"),
        "brand": product.get("brand"),
        "size": item.get("size"),
        **basket.size_fields(item.get("size")),
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


def collect_store(client, token, store, slug_to_id):
    """Search every basket item at one store and save the matching prices."""
    location_id = db.upsert_location(client, location_row(store))

    # external_id -> (listing row, Kroger item, search term, fetch time).
    # Keyed so a listing found by two searches is only saved once.
    found = {}
    for entry in basket.BASKET:
        products = kroger_api.search_products(
            token, store["locationId"], entry["search"], ITEMS_PER_SEARCH)
        fetched_at = datetime.now(timezone.utc).isoformat()
        for product in products:
            for item in product.get("items", []):
                if not (item.get("price") or {}).get("regular"):
                    continue  # no price at this store
                sizes = basket.size_fields(item.get("size"))
                slug = basket.match_listing(
                    product.get("description"), sizes["base_qty"], sizes["base_unit"])
                if not slug:
                    continue  # not a basket item
                listing = store_item_row(product, item, slug_to_id[slug])
                found.setdefault(listing["external_id"], (listing, item, entry["search"], fetched_at))

    ids = db.upsert_store_items(client, [listing for listing, _, _, _ in found.values()])
    rows = [
        price_row(item, ids[listing["external_id"]], location_id, term, fetched_at)
        for listing, item, term, fetched_at in found.values()
    ]
    db.insert_prices(client, rows)

    matched_items = {listing["product_id"] for listing, _, _, _ in found.values()}
    print(f"{store['name']} ({store['locationId']}): saved {len(rows)} prices "
          f"covering {len(matched_items)} of {len(basket.BASKET)} basket items")


def main():
    load_dotenv()
    client = db.get_client()
    slug_to_id = basket.sync(client)   # make sure the basket is in the database
    token = kroger_api.get_token()

    stores = kroger_api.find_nearest_stores(token, ZIP_CODE, NUM_STORES)
    for store in stores:
        collect_store(client, token, store, slug_to_id)

    print(f"\nDone. Kroger API calls this run: {kroger_api.api_calls}")


if __name__ == "__main__":
    main()
