"""
Add grocery stores whose prices are checked by hand (stores with no price API,
like H-E-B, Walmart, Target, Costco and Sprouts) to the locations table.

Takes a JSON file of OpenStreetMap places (saved from the Overpass API) and the
OSM ids of the stores to add. Each store gets its address and map location, and
shows up on the price entry screen (/enter) and, once it has prices, on the site.

Run it with:
  python add_stores.py osm_grocers.json way/638830202 way/314947381 ...
  python add_stores.py spokane_grocers_osm.json --metro "Spokane, WA" way/123 ...
(the city defaults to San Antonio, TX)
"""

import json
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv

import db

DEFAULT_METRO = "San Antonio, TX"


def store_row(place, metro=DEFAULT_METRO):
    tags = place["tags"]
    center = place.get("center") or place
    chain = tags.get("brand") or tags.get("name")
    street = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")]))
    # "H-E-B West Avenue": the chain plus the street name, so stores are easy to tell apart.
    street_name = (tags.get("addr:street") or "").replace("Avenue", "Ave").replace("Road", "Rd")
    name = f"{chain} {street_name}".strip() if street_name else chain
    return {
        "source": "osm",
        "external_id": f"{place['type']}/{place['id']}",
        "kind": "grocery",
        "tracking": "featured",
        "metro": metro,
        "name": name,
        "chain": chain,
        "address_line1": street or None,
        "city": tags.get("addr:city") or metro.split(",")[0].strip(),
        "state": tags.get("addr:state") or metro.split(",")[1].strip(),
        "zip_code": (tags.get("addr:postcode") or "")[:5] or None,
        "latitude": center.get("lat"),
        "longitude": center.get("lon"),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


def main(osm_path, osm_ids, metro=DEFAULT_METRO):
    load_dotenv()
    client = db.get_client()
    places = {f"{p['type']}/{p['id']}": p for p in json.load(open(osm_path, encoding="utf-8"))}
    for osm_id in osm_ids:
        place = places.get(osm_id)
        if not place:
            print(f"  {osm_id}: not in {osm_path}")
            continue
        row = store_row(place, metro)
        db.upsert_location(client, row)
        print(f"  added {row['name']} ({row['address_line1']}, {row['zip_code']})")


if __name__ == "__main__":
    args = sys.argv[2:]
    metro = DEFAULT_METRO
    if args[:1] == ["--metro"]:
        metro, args = args[1], args[2:]
    main(sys.argv[1], args, metro)
