"""
Download official U.S. average grocery prices from the Bureau of Labor Statistics
(BLS) and save them to Supabase, so the website can compare our prices to them.

The BLS publishes one average price per item per month, about two weeks after
the month ends. This script fetches the last two years each time it runs and
updates any numbers the BLS has revised. It needs no API key: the free public
API allows 25 requests a day and this uses 2.

Run it with:  python collect_benchmarks.py
"""

import sys
from datetime import date, datetime, timezone

import requests
from dotenv import load_dotenv

import basket
import db

BLS_URL = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
SERIES_PER_REQUEST = 10   # BLS limit for keyless requests
YEARS_BACK = 2

# Basket item -> (BLS series, the unit BLS prices it in).
# Series are "Average Price Data", U.S. city average (APU0000...).
# Items with no current BLS series (2% milk, peanut butter, ...) are left out.
BLS_SERIES = {
    "eggs-large-12":       ("APU0000708111", "dozen"),  # Eggs, grade A, large
    "milk-whole-gal":      ("APU0000709112", "gal"),    # Milk, fresh, whole, fortified
    "bread-white":         ("APU0000702111", "lb"),     # Bread, white, pan
    "ground-beef-80-lb":   ("APU0000703112", "lb"),     # Ground beef, 100% beef (all fat levels)
    "chicken-breast-lb":   ("APU0000FF1101", "lb"),     # Chicken breast, boneless
    "bananas-lb":          ("APU0000711211", "lb"),     # Bananas
    "potatoes-russet-bag": ("APU0000712112", "lb"),     # Potatoes, white
    "rice-white-2lb":      ("APU0000701312", "lb"),     # Rice, white, long grain, uncooked
    "spaghetti-16oz":      ("APU0000701322", "lb"),     # Spaghetti and macaroni
    "flour-ap-5lb":        ("APU0000701111", "lb"),     # Flour, white, all purpose
    "sugar-4lb":           ("APU0000715211", "lb"),     # Sugar, white
    "cheddar-8oz":         ("APU0000710212", "lb"),     # Cheddar cheese, natural
    "butter-1lb":          ("APU0000FS1101", "lb"),     # Butter, stick
    "coffee-ground":       ("APU0000717311", "lb"),     # Coffee, 100%, ground roast
}


def convert(price, source_unit, target_unit):
    """Convert a price per source_unit to a price per target_unit, e.g. $/lb -> $/oz."""
    source_base, source_qty = basket.COMPARE_UNITS[source_unit]
    target_base, target_qty = basket.COMPARE_UNITS[target_unit]
    if source_base != target_base:
        raise ValueError(f"Can't convert {source_unit} to {target_unit}")
    return price * target_qty / source_qty


def fetch_series(series_ids):
    """Ask the BLS for monthly values of up to 10 series. Returns {series_id: [rows]}."""
    this_year = date.today().year
    response = requests.post(
        BLS_URL,
        json={
            "seriesid": series_ids,
            "startyear": str(this_year - YEARS_BACK),
            "endyear": str(this_year),
        },
        timeout=60,
    )
    response.raise_for_status()
    body = response.json()
    if body.get("status") != "REQUEST_SUCCEEDED":
        sys.exit(f"BLS request failed: {body.get('message')}")
    return {series["seriesID"]: series["data"] for series in body["Results"]["series"]}


def main():
    load_dotenv()
    client = db.get_client()
    products = {row["slug"]: row for row in db.basket_products(client)}

    series_ids = [series for series, _ in BLS_SERIES.values()]
    data = {}
    for start in range(0, len(series_ids), SERIES_PER_REQUEST):
        data.update(fetch_series(series_ids[start:start + SERIES_PER_REQUEST]))

    fetched_at = datetime.now(timezone.utc).isoformat()
    rows = []
    for slug, (series_id, source_unit) in BLS_SERIES.items():
        product = products.get(slug)
        if not product:
            print(f"  skipping {slug}: not in the products table (run basket.py)")
            continue
        for point in data.get(series_id, []):
            # Monthly periods are 'M01'..'M12'; 'M13' would be an annual average.
            if not point["period"].startswith("M") or point["period"] == "M13":
                continue
            try:
                price = float(point["value"])
            except ValueError:
                continue  # BLS uses '-' when a month has no data
            rows.append({
                "product_id": product["id"],
                "source": "bls",
                "series_id": series_id,
                "area": "U.S. city average",
                "period": f"{point['year']}-{point['period'][1:]}-01",
                "price": price,
                "source_unit": source_unit,
                "price_per_unit": round(convert(price, source_unit, product["unit_label"]), 4),
                "fetched_at": fetched_at,
            })

    db.upsert_benchmarks(client, rows)
    latest = max((row["period"] for row in rows), default="none")
    print(f"Saved {len(rows)} monthly BLS averages for {len(BLS_SERIES)} items (latest month: {latest}).")


if __name__ == "__main__":
    main()
