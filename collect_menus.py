"""
Read restaurant menus and save dish prices to Supabase (weekly).

For every restaurant in the locations table that has a menu_url, reads the menu
page politely (see menus.py) and saves:
  - each dish  -> menu_items  (added once; last_seen refreshed each run)
  - its price  -> menu_prices (a NEW row every run, never overwritten)

First-time setup: add restaurants from pick_restaurants.py's output:
  python collect_menus.py --import picks.json
Weekly run:
  python collect_menus.py
"""

import json
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

import db
import menus

METRO = "San Antonio, TX"


def import_picks(client, path):
    """Add (or refresh) restaurants chosen by pick_restaurants.py."""
    picks = json.load(open(path, encoding="utf-8"))
    for pick in picks:
        db.upsert_location(client, {
            "source": "osm",
            "external_id": pick["osm_id"],
            "kind": "restaurant",
            "tracking": "restaurant",
            "metro": METRO,
            "name": pick["name"],
            "address_line1": pick.get("address"),
            "city": pick.get("city"),
            "state": "TX",
            "zip_code": pick.get("zip"),
            "latitude": pick.get("lat"),
            "longitude": pick.get("lon"),
            "website": pick.get("website"),
            "cuisine": pick.get("cuisine"),
            "menu_url": pick["menu_url"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
    print(f"Imported {len(picks)} restaurants.")


def main():
    load_dotenv()
    client = db.get_client()
    if len(sys.argv) == 3 and sys.argv[1] == "--import":
        import_picks(client, sys.argv[2])

    restaurants = db.restaurants_with_menus(client)
    fetcher = menus.PoliteFetcher()
    total = 0
    for restaurant in restaurants:
        items, found = menus.read_menu(fetcher, restaurant["menu_url"])
        if not items:
            print(f"  {restaurant['name'][:40]:<40} {'no menu found' if not found else 'no prices found'}")
            continue
        now = datetime.now(timezone.utc).isoformat()
        ids = db.upsert_menu_items(client, [
            {
                "location_id": restaurant["id"],
                "section": item["section"] or "",
                "name": item["name"],
                "description": item["description"],
                "last_seen": now,
            }
            for item in items
        ])
        db.insert_menu_prices(client, [
            {
                "menu_item_id": ids[(item["section"] or "", item["name"])],
                "price": item["price"],
                "source": "restaurant_site",
                "source_url": restaurant["menu_url"],
                "fetched_at": now,
            }
            for item in items
        ])
        total += len(items)
        print(f"  {restaurant['name'][:40]:<40} {len(items):>3} dishes")
    print(f"\nDone. Saved {total} dish prices from {len(restaurants)} restaurants.")


if __name__ == "__main__":
    main()
