"""
Collect Kroger prices for the basket (see basket.py) and save them to Supabase.

Collects two kinds of stores:
  - featured: the stores nearest each city in METROS (shown to everyone)
  - user:     the nearest store to each user's saved home ZIP, when no store we
              already collect is nearby (shown only to users who live near it)

For each store it searches every basket item and saves only listings that match
a basket item's rules:
  - each store            -> locations   (added once, refreshed on later runs)
  - each matching listing -> store_items (added once, refreshed, linked to its product)
  - each price we see     -> prices      (a new row when the price changes; otherwise
                                             the existing row's checked_through moves forward)

Run it with:  python collect_prices.py
"""

from datetime import datetime, timezone

from dotenv import load_dotenv

import basket
import db
import kroger_api

# Cities to track. zip is a central ZIP code; chain is the Kroger-owned banner
# there; stores is how many of the nearest stores to check. Stores in one city
# have nearly identical prices, so 2 is enough for the newer cities.
METROS = [
    {"name": "Houston, TX",     "zip": "77002", "chain": "KROGER",      "stores": 3},
    {"name": "Dallas, TX",      "zip": "75201", "chain": "KROGER",      "stores": 2},
    {"name": "Atlanta, GA",     "zip": "30303", "chain": "KROGER",      "stores": 2},
    {"name": "Cincinnati, OH",  "zip": "45202", "chain": "KROGER",      "stores": 2},
    {"name": "Denver, CO",      "zip": "80202", "chain": "KINGSOOPERS", "stores": 2},
    {"name": "Los Angeles, CA", "zip": "90012", "chain": "RALPHS",      "stores": 2},
    {"name": "Seattle, WA",     "zip": "98101", "chain": "QFC",         "stores": 2},
]
# 50 is Kroger's max per search, and costs the same single API call as 10.
ITEMS_PER_SEARCH = 50

# Budget for stores added for users. Each store costs ~21 product calls a day
# (Kroger allows 10,000), and each ZIP costs 1 location lookup (Kroger allows 1,600).
MAX_STORES = 100           # featured + user stores, in total: ~2,100 product calls a day
MAX_USER_ZIPS = 500        # ZIPs looked up per run
USER_RADIUS_MILES = 25     # how far a "nearby" store can be
LIST_STORES_PER_USER = 4   # stores compared for each user's list (matches the website)
MAX_LIST_PRODUCTS = 2000   # distinct shopping-list products priced per run


def is_real_store(store):
    """
    Skip Kroger's internal placeholder locations (e.g. "Spoke Forecast", "Unused
    Spoke"), which show up in some searches. Real stores have 8-digit numeric IDs.
    """
    name = (store.get("name") or "").lower()
    return (
        store["locationId"].isdigit()
        and len(store["locationId"]) == 8
        and not any(word in name for word in ("spoke", "forecast", "unused"))
    )


def location_row(store, metro, tracking="featured"):
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
        "metro": metro,
        "tracking": tracking,
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


def collect_store(client, token, store, metro, slug_to_id, tracking="featured"):
    """Search every basket item at one store and save the matching prices."""
    location_id = db.upsert_location(client, location_row(store, metro, tracking))

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
    added, confirmed = db.record_prices(client, rows)

    matched_items = {listing["product_id"] for listing, _, _, _ in found.values()}
    print(f"  {store['name']} ({store['locationId']}): checked {len(rows)} prices "
          f"({added} changed or new, {confirmed} unchanged) covering {len(matched_items)} "
          f"of {len(basket.BASKET)} basket items")
    return location_id, set(found)  # database id, and the products already saved here


def featured_stores(token):
    """The nearest real stores to each featured city: [(store, city name), ...]."""
    picked = []
    for metro in METROS:
        # Ask for a few extra in case some are placeholders, then keep the nearest real ones.
        nearby = kroger_api.find_nearest_stores(token, metro["zip"], metro["stores"] + 3, metro["chain"])
        stores = [s for s in nearby if is_real_store(s)][: metro["stores"]]
        if not stores:
            print(f"  No {metro['chain']} stores found near {metro['zip']} ({metro['name']})")
        picked += [(store, metro["name"]) for store in stores]
    return picked


def user_stores(client, token, covered_ids, room, zip_nearby):
    """
    Stores to add for users' home ZIPs: for each ZIP with no collected store nearby,
    its nearest store. Stores needed by more ZIPs come first; at most `room` stores.
    Returns [(store, area name), ...], and fills zip_nearby with each ZIP's nearby
    store ids (nearest first). ZIPs are private, so this never prints them.
    """
    zips = db.user_home_zips(client)[:MAX_USER_ZIPS]
    chosen = {}  # locationId -> {"store": ..., "zips": count}
    no_stores = 0
    for zip_code in zips:
        nearby = [
            s for s in kroger_api.find_nearest_stores(token, zip_code, 8, radius_miles=USER_RADIUS_MILES)
            if is_real_store(s)
        ]
        zip_nearby[zip_code] = [s["locationId"] for s in nearby]
        if not nearby:
            no_stores += 1
            continue
        already = next((s["locationId"] for s in nearby if s["locationId"] in covered_ids or s["locationId"] in chosen), None)
        if already:
            if already in chosen:
                chosen[already]["zips"] += 1
            continue
        chosen[nearby[0]["locationId"]] = {"store": nearby[0], "zips": 1}

    ranked = sorted(chosen.values(), key=lambda c: -c["zips"])
    kept = ranked[:room]
    print(f"User areas: {len(zips)} ZIPs, {len(chosen)} need a new store, {no_stores} have no stores nearby."
          + (f" Over budget: {len(ranked) - len(kept)} store(s) waiting." if len(ranked) > len(kept) else ""))
    return [(c["store"], area_name(c["store"])) for c in kept]


def area_name(store):
    """'Phoenix, AZ' style name for a user-area store, from its address."""
    addr = store.get("address", {})
    return f"{addr.get('city', '').title()}, {addr.get('state', '')}"


def collect_list_products(client, token, zip_nearby, collected):
    """
    Save today's prices for the specific products on users' shopping lists, at
    each user's nearby collected stores (the same stores the website compares).
    Products already saved at a store this run (via the basket searches) are skipped.
    """
    wanted = {}  # Kroger locationId -> set of productIds
    lists = db.list_products_by_zip(client)
    for zip_code, product_ids in lists.items():
        stores = [loc for loc in zip_nearby.get(zip_code, []) if loc in collected][:LIST_STORES_PER_USER]
        for loc in stores:
            wanted.setdefault(loc, set()).update(product_ids)

    all_products = set().union(*wanted.values()) if wanted else set()
    if len(all_products) > MAX_LIST_PRODUCTS:
        keep = set(sorted(all_products)[:MAX_LIST_PRODUCTS])
        wanted = {loc: ids & keep for loc, ids in wanted.items()}
        print(f"List products over budget: pricing {MAX_LIST_PRODUCTS} of {len(all_products)}.")

    saved = 0
    for loc, product_ids in wanted.items():
        location_id, already = collected[loc]
        todo = sorted(product_ids - already)
        if not todo:
            continue
        fetched_at = datetime.now(timezone.utc).isoformat()
        listings = []
        for start in range(0, len(todo), 50):  # Kroger allows 50 product ids per call
            for product in kroger_api.products_by_id(token, loc, todo[start:start + 50]):
                item = (product.get("items") or [{}])[0]
                if not (item.get("price") or {}).get("regular"):
                    continue  # no price at this store
                listing = store_item_row(product, item, product_id=None)
                del listing["product_id"]  # never unlink a listing that's also a basket staple
                listings.append((listing, item))
        ids = db.upsert_store_items(client, [listing for listing, _ in listings])
        rows = [price_row(item, ids[listing["external_id"]], location_id, "list", fetched_at)
                for listing, item in listings]
        added, _ = db.record_prices(client, rows)
        saved += added
    print(f"\nShopping lists: {len(lists)} ZIP(s) with list products; saved {saved} changed or new "
          f"list-product prices at {len(wanted)} store(s).")


def main():
    load_dotenv()
    client = db.get_client()
    slug_to_id = basket.sync(client)   # make sure the basket is in the database
    token = kroger_api.get_token()

    featured = featured_stores(token)
    covered = {store["locationId"] for store, _ in featured}
    zip_nearby = {}
    users = user_stores(client, token, covered, max(0, MAX_STORES - len(featured)), zip_nearby)

    collected = {}  # Kroger locationId -> (database location id, products already saved there)
    for tracking, group in (("featured", featured), ("user", users)):
        current = None
        for store, metro in group:
            if metro != current:
                print(f"\n{metro}" + (" (user area)" if tracking == "user" else ""))
                current = metro
            collected[store["locationId"]] = collect_store(client, token, store, metro, slug_to_id, tracking)

    collect_list_products(client, token, zip_nearby, collected)

    print(f"\nDone. {len(featured)} featured + {len(users)} user-area stores. "
          f"Kroger API calls this run: {kroger_api.api_calls}")


if __name__ == "__main__":
    main()
