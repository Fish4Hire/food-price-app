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
    "each":  ("ct", 1),
    # Only used to convert official averages (BLS) that are priced in these units:
    "half gal": ("fl oz", 64),
    "12 oz": ("oz", 12),
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

    # --- Added 2026-10-12: more everyday groceries ---
    # Dairy & eggs
    {"slug": "greek-yogurt-32oz", "name": "Greek yogurt, plain, 32 oz", "category": "Dairy & eggs",
     "search": "plain greek yogurt 32 oz", "require": ["greek", "yogurt", "plain"],
     "exclude": ["cups", "pouch", "drink", "dairy free", "almond", "coconut", "frozen", "bites"],
     "unit": "oz", "size": (32, 32)},
    {"slug": "sour-cream-16oz", "name": "Sour cream, 16 oz", "category": "Dairy & eggs",
     "search": "sour cream 16 oz", "require": ["sour cream"],
     "exclude": ["dip", "onion", "chips", "dairy free", "plant", "squeeze", "fat free", "light"],
     "unit": "oz", "size": (16, 16)},
    {"slug": "cream-cheese-8oz", "name": "Cream cheese, 8 oz", "category": "Dairy & eggs",
     "search": "cream cheese 8 oz brick", "require": ["cream cheese"],
     "exclude": ["whipped", "spread", "strawberry", "chive", "garden", "honey", "salmon", "jalapeno",
                 "dairy free", "plant", "frosting", "dip"],
     "unit": "oz", "size": (8, 8)},
    {"slug": "mozzarella-shredded-8oz", "name": "Mozzarella, shredded, 8 oz", "category": "Dairy & eggs",
     "search": "shredded mozzarella cheese 8 oz", "require": ["mozzarella", "shredded"],
     "exclude": ["blend", "italian", "dairy free", "vegan", "provolone", "parmesan"],
     "unit": "oz", "size": (8, 8)},
    {"slug": "half-and-half-qt", "name": "Half & half, 1 qt", "category": "Dairy & eggs",
     "search": "half & half", "require": [["half & half", "half and half"]],
     "exclude": ["fat free", "creamer", "flavored", "organic", "lactose", "non dairy", "almond", "oat", "plant"],
     "unit": "fl oz", "size": (32, 32), "liquid": True},

    # Bread & grains
    {"slug": "tortillas-flour", "name": "Flour tortillas, per dozen", "category": "Bread & grains",
     "search": "flour tortillas", "require": ["flour", "tortilla"],
     "exclude": ["low carb", "keto", "whole wheat", "chips", "spinach", "tomato basil", "gluten", "carb balance"],
     "unit": "dozen", "size": (0.6, 3), "qty": 1},
    {"slug": "tortillas-corn", "name": "Corn tortillas, per dozen", "category": "Bread & grains",
     "search": "corn tortillas", "require": ["corn", "tortilla"],
     "exclude": ["chips", "tostada", "strips", "taco shells", "flour"],
     "unit": "dozen", "size": (0.6, 6), "qty": 2},
    {"slug": "oats-old-fashioned", "name": "Old-fashioned oats, per oz", "category": "Bread & grains",
     "search": "old fashioned oats", "require": ["oats", ["old fashioned", "rolled"]],
     "exclude": ["instant", "quick", "steel cut", "packets", "cups", "bar", "overnight", "flavored", "organic"],
     "unit": "oz", "size": (16, 42), "qty": 42},
    {"slug": "corn-flakes", "name": "Corn flakes cereal, per oz", "category": "Bread & grains",
     "search": "corn flakes cereal", "require": ["corn flakes"],
     "exclude": ["frosted", "crumbs", "honey", "almonds", "chicken"],
     "unit": "oz", "size": (10, 24), "qty": 18},
    {"slug": "mac-and-cheese-box", "name": "Macaroni & cheese, box", "category": "Bread & grains",
     "search": "macaroni cheese dinner", "require": ["macaroni", "cheese"],
     "exclude": ["cups", "cup", "frozen", "microwav", "bowl", "deluxe", "shells", "easy mac", "family size", "bites"],
     "unit": "oz", "size": (5.5, 7.25), "qty": 7.25},
    {"slug": "bread-wheat", "name": "Whole wheat bread", "category": "Bread & grains",
     "search": "whole wheat bread", "require": ["whole wheat", "bread"],
     "exclude": ["crumbs", "flour", "mix", "keto", "gluten", "buns", "rolls", "english muffin", "tortilla"],
     "unit": "oz", "size": (16, 24), "qty": 20},

    # Produce
    {"slug": "avocados-each", "name": "Avocados, each", "category": "Produce",
     "search": "hass avocado", "require": ["avocado"],
     "exclude": ["guacamole", "oil", "dip", "salsa", "dressing", "mayo", "chips", "organic", "spread"],
     "unit": "each", "size": (1, 6), "qty": 4},
    {"slug": "tomatoes-roma-lb", "name": "Roma tomatoes, per lb", "category": "Produce",
     "search": "roma tomatoes", "require": ["roma", "tomato"],
     "exclude": ["sauce", "canned", "diced", "paste", "sun dried", "organic", "crushed"],
     "unit": "lb", "size": (0.5, 3), "qty": 2},
    {"slug": "limes-each", "name": "Limes, each", "category": "Produce",
     "search": "fresh limes", "require": ["lime"],
     "exclude": ["juice", "key lime", "chips", "seltzer", "soda", "water", "pie", "cilantro", "salt", "flavored", "organic"],
     "unit": "each", "size": (1, 1), "qty": 4},
    {"slug": "lemons-each", "name": "Lemons, each", "category": "Produce",
     "search": "fresh lemons", "require": ["lemon"],
     "exclude": ["juice", "lemonade", "pepper", "seltzer", "soda", "water", "pie", "tea", "cake", "flavored", "organic"],
     "unit": "each", "size": (1, 1), "qty": 2},
    {"slug": "lettuce-iceberg", "name": "Iceberg lettuce, head", "category": "Produce",
     "search": "iceberg lettuce head", "require": ["iceberg"],
     "exclude": ["shredded", "salad", "bag", "kit", "chopped"],
     "unit": "each", "size": (1, 3), "qty": 1},
    {"slug": "broccoli-lb", "name": "Broccoli, per lb", "category": "Produce",
     "search": "fresh broccoli crowns", "require": ["broccoli"],
     "exclude": ["frozen", "slaw", "rice", "soup", "cheese", "salad", "kit", "steam", "organic", "rabe"],
     "unit": "lb", "size": (0.5, 3), "qty": 1},
    {"slug": "strawberries-1lb", "name": "Strawberries, per lb", "category": "Produce",
     "search": "fresh strawberries 1 lb", "require": ["strawberries"],
     "exclude": ["frozen", "dried", "yogurt", "jam", "preserves", "dipped", "chocolate", "cereal", "organic", "freeze"],
     "unit": "lb", "size": (1, 2), "qty": 1},
    {"slug": "grapes-lb", "name": "Grapes, per lb", "category": "Produce",
     "search": "seedless grapes", "require": ["grapes"],
     "exclude": ["juice", "jelly", "tomatoes", "organic", "frozen", "dried"],
     "unit": "lb", "size": (1, 4), "qty": 2},
    {"slug": "oranges-navel-lb", "name": "Navel oranges, per lb", "category": "Produce",
     "search": "navel oranges", "require": ["navel"],
     "exclude": ["juice", "organic", "mandarin"],
     "unit": "lb", "size": (0.5, 8), "qty": 3},
    {"slug": "cucumbers-each", "name": "Cucumbers, each", "category": "Produce",
     "search": "fresh cucumber", "require": ["cucumber"],
     "exclude": ["pickle", "mini", "snack", "salad", "english", "organic", "water", "dip", "lime"],
     "unit": "each", "size": (1, 1), "qty": 2},
    {"slug": "bell-pepper-green", "name": "Green bell pepper, each", "category": "Produce",
     "search": "green bell pepper", "require": ["green", "bell pepper"],
     "exclude": ["organic", "diced", "frozen", "stuffed", "mini", "chopped"],
     "unit": "each", "size": (1, 1), "qty": 2},

    # Meat & seafood
    {"slug": "bacon-1lb", "name": "Bacon, 1 lb", "category": "Meat",
     "search": "bacon 16 oz", "require": ["bacon"],
     "exclude": ["turkey", "bits", "fully cooked", "precooked", "microwave", "jerky", "ranch", "dressing",
                 "wrapped", "chips", "seasoning", "jam", "plant", "beans", "cheesy", "potato"],
     "unit": "lb", "size": (1, 1), "qty": 1},
    {"slug": "pork-chops-lb", "name": "Pork chops, per lb", "category": "Meat",
     "search": "pork chops", "require": ["pork", "chop"],
     "exclude": ["seasoned", "marinated", "breaded", "frozen", "stuffed", "smoked", "cooked"],
     "unit": "lb", "size": (0.5, 6), "qty": 2},
    {"slug": "whole-chicken-lb", "name": "Whole chicken, per lb", "category": "Meat",
     "search": "whole fryer chicken", "require": ["whole", "chicken"],
     "exclude": ["rotisserie", "cooked", "seasoned", "organic", "wings", "breast", "legs", "thighs", "broth", "free range"],
     "unit": "lb", "size": (1, 8), "qty": 5},
    {"slug": "chicken-thighs-lb", "name": "Chicken thighs, per lb", "category": "Meat",
     "search": "chicken thighs", "require": ["chicken", "thigh"],
     "exclude": ["seasoned", "marinated", "organic", "cooked", "frozen", "breaded", "grilled", "teriyaki"],
     "unit": "lb", "size": (0.5, 6), "qty": 2},
    {"slug": "hot-dogs", "name": "Hot dogs, per oz", "category": "Meat",
     "search": "beef hot dogs franks", "require": [["hot dog", "franks", "wieners"]],
     "exclude": ["buns", "chili", "plant", "veggie", "turkey", "chicken", "corn dog", "mini", "cocktail"],
     "unit": "oz", "size": (12, 16), "qty": 15},
    {"slug": "tuna-canned-5oz", "name": "Canned tuna, 5 oz", "category": "Meat",
     "search": "chunk light tuna in water", "require": ["tuna", "chunk light"],
     "exclude": ["salad", "kit", "creations", "flavored", "lemon pepper"],
     "unit": "oz", "size": (5, 5), "qty": 5},

    # Pantry
    {"slug": "pasta-sauce-24oz", "name": "Pasta sauce, 24 oz", "category": "Pantry",
     "search": "pasta sauce 24 oz", "require": [["pasta sauce", "marinara", "spaghetti sauce"]],
     "exclude": ["alfredo", "pesto", "organic", "vodka", "pizza", "low sodium", "keto"],
     "unit": "oz", "size": (23, 26), "qty": 24, "liquid": True},
    {"slug": "diced-tomatoes-can", "name": "Diced tomatoes, canned, 14.5 oz", "category": "Pantry",
     "search": "canned diced tomatoes", "require": ["diced tomatoes"],
     "exclude": ["green chil", "rotel", "organic", "basil", "garlic", "fire roasted", "no salt"],
     "unit": "oz", "size": (14, 15), "qty": 14.5},
    {"slug": "chicken-broth-32oz", "name": "Chicken broth, 32 oz", "category": "Pantry",
     "search": "chicken broth", "require": ["chicken broth"],
     "exclude": ["bone broth", "low sodium", "reduced sodium", "unsalted", "organic", "bouillon", "cubes", "base", "no salt"],
     "unit": "fl oz", "size": (32, 32), "qty": 32, "liquid": True},
    {"slug": "mayonnaise-30oz", "name": "Mayonnaise, 30 oz", "category": "Pantry",
     "search": "mayonnaise 30 oz", "require": [["mayonnaise", "mayo"]],
     "exclude": ["light", "olive oil", "avocado", "vegan", "chipotle", "spicy", "reduced", "dressing", "miracle whip", "plant"],
     "unit": "oz", "size": (28, 32), "qty": 30, "liquid": True},
    {"slug": "ketchup-20oz", "name": "Ketchup, per oz", "category": "Pantry",
     "search": "tomato ketchup", "require": ["ketchup"],
     "exclude": ["no sugar", "organic", "spicy", "sriracha", "packets", "simply", "reduced"],
     "unit": "oz", "size": (19, 40), "qty": 20, "liquid": True},
    {"slug": "refried-beans-16oz", "name": "Refried beans, 16 oz", "category": "Pantry",
     "search": "refried beans can", "require": ["refried beans"],
     "exclude": ["organic", "fat free", "vegetarian", "black", "spicy", "green chile", "cups"],
     "unit": "oz", "size": (15, 16.5), "qty": 16},
    {"slug": "pinto-beans-dry", "name": "Pinto beans, dry, per lb", "category": "Pantry",
     "search": "dry pinto beans", "require": ["pinto beans"],
     "exclude": ["canned", "refried", "seasoned", "ranch style", "organic", "cooked", "low sodium"],
     "unit": "lb", "size": (1, 4), "qty": 2},
    {"slug": "corn-canned", "name": "Whole kernel corn, canned", "category": "Pantry",
     "search": "whole kernel corn can", "require": ["whole kernel"],
     "exclude": ["cream style", "frozen", "organic", "no salt", "mexican", "white"],
     "unit": "oz", "size": (14.5, 15.5), "qty": 15.25},

    # Frozen & drinks
    {"slug": "frozen-mixed-veg", "name": "Frozen mixed vegetables, per oz", "category": "Frozen & drinks",
     "search": "frozen mixed vegetables", "require": ["mixed vegetables"],
     "exclude": ["sauce", "organic", "rice", "canned"],
     "unit": "oz", "size": (10, 32), "qty": 16},
    {"slug": "ice-cream-48oz", "name": "Ice cream, 1.5 qt", "category": "Frozen & drinks",
     "search": "vanilla ice cream 48 oz", "require": ["ice cream"],
     "exclude": ["sandwich", "bars", "cone", "cups", "pint", "non dairy", "dairy free", "light", "keto", "mix", "cake"],
     "unit": "fl oz", "size": (40, 48), "qty": 48, "liquid": True},
    {"slug": "orange-juice-52oz", "name": "Orange juice, 52 fl oz", "category": "Frozen & drinks",
     "search": "orange juice 52 oz", "require": ["orange juice"],
     "exclude": ["frozen", "concentrate", "light", "drink", "cocktail", "organic", "mango", "pineapple", "calcium"],
     "unit": "fl oz", "size": (52, 59), "qty": 52, "liquid": True},
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
        # Liquids are labeled "oz" or "fl oz" interchangeably (32 oz broth = 32 fl oz).
        same_unit = base_unit == item_base_unit or (
            item.get("liquid") and {base_unit, item_base_unit} <= {"oz", "fl oz"})
        if not same_unit or base_qty is None:
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
