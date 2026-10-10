"""
Find the 3 Kroger-family stores nearest a ZIP code and print milk prices at each.
Prints only; does not save anything. (collect_prices.py saves to the database.)

Run it with:  python kroger_milk.py
"""

import sys

from dotenv import load_dotenv

import kroger_api

ZIP_CODE = "77002"
NUM_STORES = 3
SEARCH_TERM = "milk"
ITEMS_PER_STORE = 5


def format_price(item):
    """Turn an item's price info into readable text, e.g. '$3.49 (sale $2.99)'."""
    price = item.get("price")
    if not price or not price.get("regular"):
        return "no price listed"
    text = f"${price['regular']:.2f}"
    promo = price.get("promo")
    if promo and promo < price["regular"]:
        text += f" (sale ${promo:.2f})"
    return text


def main():
    load_dotenv()
    token = kroger_api.get_token()

    stores = kroger_api.find_nearest_stores(token, ZIP_CODE, NUM_STORES)
    if not stores:
        sys.exit(f"No stores found near {ZIP_CODE}.")

    for store in stores:
        addr = store["address"]
        print("=" * 70)
        print(f"{store['name']}  (locationId {store['locationId']}, chain {store['chain']})")
        print(f"{addr['addressLine1']}, {addr['city']}, {addr['state']} {addr['zipCode']}")
        print("-" * 70)

        products = kroger_api.search_products(token, store["locationId"], SEARCH_TERM, ITEMS_PER_STORE)
        if not products:
            print(f"  No results for '{SEARCH_TERM}'.")
        for product in products:
            # A product can have several items (sizes); show each one.
            for item in product.get("items", []):
                size = item.get("size", "?")
                print(f"  {format_price(item):<22} {size:<10} {product['description']}")
        print()

    print(f"Done. Kroger API calls this run: {kroger_api.api_calls}")


if __name__ == "__main__":
    main()
