"""
The shopping basket: the canonical items we track, and the rules for deciding
which store listings count as each item.

Each basket item has:
  slug     - permanent ID (never change it once prices are saved)
  name     - display name
  search   - what we type into the Kroger search box
  require  - words that must ALL appear in the listing's description
             (a [list] inside means "any one of these")
  exclude  - words that must NOT appear
  unit     - the unit we compare prices in: "gal", "lb", "dozen", "oz" or "fl oz"
  size     - (min, max) package size allowed, in that unit
  qty      - how much of it a typical weekly basket buys, in that unit
             (defaults to the size when min and max are equal)

Run it directly to copy the basket into the database and re-link listings
we've already saved:  python basket.py
"""

import re

# How each comparison unit is measured: (base unit, how many base units in one).
COMPARE_UNITS = {
    "gal":   ("fl oz", 128),
    "fl oz": ("fl oz", 1),
    "lb":    ("oz", 16),
    "oz":    ("oz", 1),
    "dozen": ("ct", 12),
}

# Units Kroger uses in package sizes, converted to a base unit.
SIZE_UNITS = {
    "gal": ("fl oz", 128), "gallon": ("fl oz", 128),
    "qt": ("fl oz", 32), "pt": ("fl oz", 16),
    "fl oz": ("fl oz", 1), "fl. oz": ("fl oz", 1), "fl oz.": ("fl oz", 1),
    "l": ("fl oz", 33.814), "ltr": ("fl oz", 33.814), "ml": ("fl oz", 0.033814),
    "oz": ("oz", 1), "lb": ("oz", 16), "lbs": ("oz", 16),
    "g": ("oz", 0.035274), "kg": ("oz", 35.274),
    "ct": ("ct", 1), "count": ("ct", 1), "ea": ("ct", 1), "each": ("ct", 1),
    "dozen": ("ct", 12), "dz": ("ct", 12),
}

BASKET = [
    # --- Dairy & eggs ---
    {"slug": "milk-2pct-gal", "name": "Milk, 2%, 1 gal", "category": "Dairy & eggs",
     "search": "2% milk gallon", "require": ["milk", "2%"],
     "exclude": ["chocolate", "lactose", "goat", "almond", "oat"],
     "unit": "gal", "size": (1, 1)},
    {"slug": "milk-whole-gal", "name": "Milk, whole, 1 gal", "category": "Dairy & eggs",
     "search": "whole milk gallon", "require": ["whole milk"],
     "exclude": ["chocolate", "lactose", "goat", "buttermilk"],
     "unit": "gal", "size": (1, 1)},
    {"slug": "eggs-large-12", "name": "Eggs, large, 12 ct", "category": "Dairy & eggs",
     "search": "large eggs 12 ct", "require": ["egg", "large"],
     "exclude": ["extra large", "jumbo", "liquid", "white only", "egg whites", "hard boiled", "bites"],
     "unit": "dozen", "size": (1, 1)},
    {"slug": "butter-1lb", "name": "Butter, 1 lb", "category": "Dairy & eggs",
     "search": "butter sticks", "require": ["butter"],
     "exclude": ["peanut", "almond", "apple", "cashew", "buttermilk", "not butter", "spread",
                 "cookie", "popcorn", "plant", "garlic", "ghee", "whipped", "vegetable oil",
                 "dairy free", "vegan", "creme", "wafer"],
     "unit": "lb", "size": (1, 1)},
    {"slug": "cheddar-8oz", "name": "Cheddar cheese, 8 oz", "category": "Dairy & eggs",
     "search": "cheddar cheese 8 oz", "require": ["cheddar"],
     "exclude": ["cracker", "soup", "sauce", "dip", "snack", "popcorn", "chips", "pretzel", "slice",
                 "jack", "blend", "dairy free", "vegan", "go cheese", "pub cheese", "cubed",
                 "reduced fat", "horseradish"],
     "unit": "oz", "size": (8, 8)},

    # --- Bread & grains ---
    {"slug": "bread-white", "name": "White sandwich bread", "category": "Bread & grains",
     "search": "white sandwich bread", "require": ["white", "bread"],
     "exclude": ["crumbs", "flour", "mix", "wheat", "whole grain", "keto", "gluten", "protein",
                 "honey", "seeded"],
     "unit": "oz", "size": (16, 24), "qty": 20},
    {"slug": "rice-white-2lb", "name": "White rice, long grain, 2 lb", "category": "Bread & grains",
     "search": "long grain white rice", "require": ["rice", "white"],
     "exclude": ["brown", "ready", "cup", "microwav", "seasoned", "minute", "instant", "boil"],
     "unit": "lb", "size": (2, 2)},
    {"slug": "spaghetti-16oz", "name": "Spaghetti, 16 oz", "category": "Bread & grains",
     "search": "spaghetti pasta", "require": ["spaghetti"],
     "exclude": ["sauce", "squash", "meatball", "gluten", "whole wheat", "whole grain", "protein",
                 "chickpea"],
     "unit": "oz", "size": (16, 16)},
    {"slug": "flour-ap-5lb", "name": "All-purpose flour, 5 lb", "category": "Bread & grains",
     "search": "all purpose flour", "require": ["flour", "all purpose"],
     "exclude": ["gluten", "self rising", "almond", "organic"],
     "unit": "lb", "size": (5, 5)},
    {"slug": "sugar-4lb", "name": "Granulated sugar, 4 lb", "category": "Bread & grains",
     "search": "granulated sugar", "require": ["sugar"],
     "exclude": ["brown", "powdered", "confectioner", "free", "substitute", "cane sugar blend",
                 "organic", "cubes"],
     "unit": "lb", "size": (4, 4)},

    # --- Produce ---
    {"slug": "bananas-lb", "name": "Bananas, per lb", "category": "Produce",
     "search": "fresh bananas", "require": ["bananas"],
     "exclude": ["chips", "smoothie", "pepper", "bread", "manzano", "plantain", "baby", "dried",
                 "protein", "trail mix", "red", "burro", "organic", "cake", "frozen"],
     "unit": "lb", "size": (0.5, 5), "qty": 2},
    {"slug": "apples-gala-lb", "name": "Gala apples, per lb", "category": "Produce",
     "search": "gala apples", "require": ["gala", "apple"],
     "exclude": ["juice", "sauce", "chips", "slices", "organic", "mixed"],
     "unit": "lb", "size": (0.5, 5), "qty": 3},
    {"slug": "potatoes-russet-bag", "name": "Russet potatoes, bagged, per lb", "category": "Produce",
     "search": "russet potatoes", "require": ["russet", "potato"],
     "exclude": ["chips", "mashed", "flakes", "fries", "hash", "organic", "microwave", "tray"],
     "unit": "lb", "size": (3, 10), "qty": 5},
    {"slug": "onions-yellow-lb", "name": "Yellow onions, per lb", "category": "Produce",
     "search": "yellow onions", "require": ["yellow onion"],
     "exclude": ["rings", "powder", "soup", "diced", "chopped", "organic", "julienne", "fresh cut"],
     "unit": "lb", "size": (0.5, 5), "qty": 3},
    {"slug": "carrots-2lb", "name": "Carrots, 2 lb bag", "category": "Produce",
     "search": "carrots 2 lb", "require": ["carrot"],
     "exclude": ["baby", "shredded", "matchstick", "juice", "cake", "chips", "rainbow", "organic"],
     "unit": "lb", "size": (2, 2)},

    # --- Meat ---
    {"slug": "chicken-breast-lb", "name": "Chicken breast, boneless skinless, per lb", "category": "Meat",
     "search": "boneless skinless chicken breast", "require": ["chicken", "breast", "boneless", "skinless"],
     "exclude": ["frozen", "deli", "sliced", "rotisserie", "tender", "breaded", "thin", "cooked",
                 "grilled", "strips", "organic", "seasoned", "marinated"],
     "unit": "lb", "size": (0.5, 6), "qty": 2},
    {"slug": "ground-beef-80-lb", "name": "Ground beef, 80% lean, per lb", "category": "Meat",
     "search": "ground beef", "require": ["ground beef", ["80%", "80/20"]],
     "exclude": ["patties", "burger", "frozen", "grass fed", "organic", "pork", "turkey"],
     "unit": "lb", "size": (0.5, 6), "qty": 1},

    # --- Pantry ---
    {"slug": "peanut-butter-16oz", "name": "Peanut butter, creamy, 16 oz", "category": "Pantry",
     "search": "creamy peanut butter", "require": ["peanut butter", "creamy"],
     "exclude": ["cups", "cracker", "cookie", "powder", "pretzel", "bar", "natural", "honey", "reduced",
                 "protein", "organic", "no sugar", "no stir", "gluten free"],
     "unit": "oz", "size": (15, 18), "qty": 16},
    {"slug": "black-beans-can", "name": "Black beans, canned, 15 oz", "category": "Pantry",
     "search": "canned black beans", "require": ["black beans"],
     "exclude": ["dry", "dried", "refried", "soup", "seasoned", "low sodium", "reduced sodium",
                 "no salt", "nsa", "organic", "rice"],
     "unit": "oz", "size": (15, 16), "qty": 15},
    {"slug": "vegetable-oil-48oz", "name": "Vegetable oil, 48 fl oz", "category": "Pantry",
     "search": "vegetable oil 48 oz", "require": ["vegetable oil"],
     "exclude": ["spray", "blend"],
     "unit": "fl oz", "size": (48, 48)},
    {"slug": "coffee-ground", "name": "Ground coffee, per oz", "category": "Pantry",
     "search": "ground coffee", "require": ["ground", "coffee"],
     "exclude": ["k cup", "pods", "instant", "creamer", "decaf", "whole bean", "espresso",
                 "flavored", "cold brew", "single serve", "vanilla", "hazelnut", "caramel", "macadamia",
                 "mocha", "cinnamon", "pecan", "chocolate"],
     "unit": "oz", "size": (10, 40), "qty": 12},
]

BASKET_BY_SLUG = {item["slug"]: item for item in BASKET}


SIZE_PATTERN = re.compile(
    r"(\d+\s*/\s*\d+|\d*\.?\d+)\s*"
    r"(fl\.?\s*oz|oz|lbs?|gallon|gal|qt|pt|ml|ltr|l|kg|g|ct|count|ea|each|dozen|dz)\b"
)
PACK_PATTERN = re.compile(r"(\d+)\s*(?:pk|pack)\b")


def parse_size(size_text):
    """
    Read a Kroger size string and return (amount, unit), e.g.
      '1/2 gal' -> (0.5, 'gal')        '4 sticks / 16 oz' -> (16, 'oz')
      '26 ounces' -> (26, 'oz')        '4 pk / 15.5 oz'   -> (62, 'oz')  (4 cans total)
    Returns (None, None) if no size can be found.
    """
    if not size_text:
        return None, None
    text = size_text.lower()
    text = re.sub(r"\bounces?\b|\bonz\b", "oz", text)
    text = re.sub(r"\blbr\b", "lb", text)

    match = SIZE_PATTERN.search(text)
    if not match:
        return None, None
    number, unit = match.groups()
    if "/" in number:
        top, bottom = number.split("/")
        value = int(top) / int(bottom)
    else:
        value = float(number)
    unit = re.sub(r"\s+", " ", unit.replace(".", ""))   # 'fl. oz' -> 'fl oz'

    # A multipack like '4 pk / 15.5 oz' is priced for all 4 together.
    pack = PACK_PATTERN.search(text)
    if pack and unit not in ("ct", "count", "ea", "each"):
        value *= int(pack.group(1))
    return round(value, 3), unit


def normalize_text(text):
    """Lowercase, drop ® and ™, and turn hyphens into spaces so 'All-Purpose' matches 'all purpose'."""
    text = (text or "").lower().replace("®", "").replace("™", "").replace("-", " ")
    return re.sub(r"\s+", " ", text)


def to_base_size(size_value, size_unit):
    """Convert a package size like (0.5, 'gal') to a base amount like (64, 'fl oz')."""
    if size_value is None or not size_unit:
        return None, None
    conversion = SIZE_UNITS.get(size_unit.strip().lower())
    if not conversion:
        return None, None
    base_unit, factor = conversion
    return round(size_value * factor, 3), base_unit


def match_listing(description, base_qty, base_unit):
    """Return the slug of the basket item this listing counts as, or None."""
    text = normalize_text(description)
    for item in BASKET:
        # A require entry can be a list of alternatives: ["80%", "80/20"] means either one.
        if not all(
            any(alt in text for alt in word) if isinstance(word, list) else word in text
            for word in item["require"]
        ):
            continue
        if any(word in text for word in item["exclude"]):
            continue
        item_base_unit, per_unit = COMPARE_UNITS[item["unit"]]
        if base_unit != item_base_unit or base_qty is None:
            continue
        low, high = item["size"]
        # Small tolerance so 127.9 fl oz still counts as 1 gal.
        if low * per_unit * 0.98 <= base_qty <= high * per_unit * 1.02:
            return item["slug"]
    return None


def product_rows():
    """The basket as rows for the products table."""
    rows = []
    for item in BASKET:
        _, per_unit = COMPARE_UNITS[item["unit"]]
        low, high = item["size"]
        rows.append({
            "slug": item["slug"],
            "name": item["name"],
            "category": item["category"],
            "size_value": low if low == high else None,
            "size_unit": item["unit"],
            "unit_label": item["unit"],
            "unit_base_qty": per_unit,
            "basket_qty": item.get("qty", low),
            "active": True,
        })
    return rows


def sync(client):
    """Copy the basket into the products table and re-link every saved listing."""
    import db

    slug_to_id = db.upsert_products(client, product_rows())
    db.deactivate_products_except(client, list(slug_to_id))

    linked = changed = 0
    listings = db.all_store_items(client)
    for listing in listings:
        fields = size_fields(listing["size"])
        slug = match_listing(listing["description"], fields["base_qty"], fields["base_unit"])
        fields["product_id"] = slug_to_id.get(slug)
        if any(listing[key] != value for key, value in fields.items()):
            db.update_store_item(client, listing["id"], fields)
            changed += 1
        if fields["product_id"]:
            linked += 1
    print(f"Basket: {len(slug_to_id)} items. Saved listings: {linked} of {len(listings)} "
          f"match a basket item ({changed} updated).")
    return slug_to_id


def size_fields(size_text):
    """Size columns for a store_items row, from Kroger's size text like '1/2 gal'."""
    size_value, size_unit = parse_size(size_text)
    base_qty, base_unit = to_base_size(size_value, size_unit)
    return {"size_value": size_value, "size_unit": size_unit,
            "base_qty": base_qty, "base_unit": base_unit}


if __name__ == "__main__":
    import db
    sync(db.get_client())
