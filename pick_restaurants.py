"""
One-time helper: choose San Antonio restaurants whose menus we can read.

Takes the OpenStreetMap list of San Antonio restaurants (a JSON file saved from
the Overpass API), skips national chains (the same website used by several
locations), and tries local restaurants' websites until it finds enough with a
readable menu (at least MIN_ITEMS dishes with prices). Prints the picks and
saves them to a JSON file for collect_menus.py.

Run it with:  python pick_restaurants.py osm_san_antonio.json picks.json
"""

import collections
import json
import random
import sys
from urllib.parse import urlparse

import menus

WANTED = 20
MIN_ITEMS = 15
MAX_SITES_TRIED = 160
SKIP_DOMAINS = ("facebook.com", "instagram.com", "yelp.com", "doordash.com", "ubereats.com",
                "grubhub.com", "google.com", "linktr.ee", "tiktok.com", "x.com", "twitter.com")


def website_of(tags):
    url = tags.get("website") or tags.get("contact:website")
    if not url:
        return None
    return url if url.startswith("http") else f"https://{url}"


def domain(url):
    return urlparse(url).netloc.lower().removeprefix("www.")


def main(osm_path, out_path):
    places = json.load(open(osm_path, encoding="utf-8"))
    with_site = [p for p in places if website_of(p.get("tags", {}))]
    per_domain = collections.Counter(domain(website_of(p["tags"])) for p in with_site)

    # Local places: their website isn't shared by several locations (that's a chain).
    candidates = [
        p for p in with_site
        if per_domain[domain(website_of(p["tags"]))] <= 2
        and not any(d in domain(website_of(p["tags"])) for d in SKIP_DOMAINS)
        and p["tags"].get("name")
    ]
    random.Random(42).shuffle(candidates)  # a fair, repeatable mix of the city
    print(f"{len(places)} places, {len(with_site)} with websites, {len(candidates)} local candidates.\n")

    fetcher = menus.PoliteFetcher()
    picks, tried = [], 0
    for place in candidates:
        if len(picks) >= WANTED or tried >= MAX_SITES_TRIED:
            break
        tried += 1
        tags, home = place["tags"], website_of(place["tags"])
        html = fetcher.fetch_html(home)
        if not html:
            continue
        best_url, best_items = home, menus.extract_menu_items(html)
        for link in menus.find_menu_links(home, html, limit=2):
            items, _ = menus.read_menu(fetcher, link)
            if len(items) > len(best_items):
                best_url, best_items = link, items
        status = "PICK" if len(best_items) >= MIN_ITEMS else "skip"
        print(f"  [{status}] {tags['name'][:40]:<40} {len(best_items):>3} priced items  {best_url[:70]}")
        if status == "PICK":
            center = place.get("center") or place
            picks.append({
                "osm_id": f"{place['type']}/{place['id']}",
                "name": tags["name"],
                "cuisine": tags.get("cuisine"),
                "kind": tags.get("amenity"),
                "address": " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")])) or None,
                "city": tags.get("addr:city") or "San Antonio",
                "zip": tags.get("addr:postcode"),
                "lat": center.get("lat"),
                "lon": center.get("lon"),
                "website": home,
                "menu_url": best_url,
                "sample": [f"{i['name']} ${i['price']:.2f}" for i in best_items[:4]],
                "item_count": len(best_items),
            })

    json.dump(picks, open(out_path, "w", encoding="utf-8"), indent=2)
    print(f"\nTried {tried} websites; picked {len(picks)}. Saved to {out_path}.")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
