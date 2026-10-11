"""
A polite menu reader for restaurant websites.

  - Checks each site's robots.txt and skips anything it disallows.
  - Identifies itself (user agent with our site and email) and waits between
    requests to the same site.
  - Reads ordinary web-page menus: dish names with prices like "$12.99" or
    "12.99". PDFs and image menus are skipped (they'd need AI to read).

Used by pick_restaurants.py (one-time selection) and collect_menus.py (weekly runs).
"""

import re
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = "CheaperEatsBot/1.0 (+https://getcheapereats.com; hello@getcheapereats.com)"
DELAY_SECONDS = 3      # minimum wait between requests to the same website
TIMEOUT_SECONDS = 15

# A price: "$12.99", "$ 12.99", "12.99", or "$12". Bare whole numbers aren't prices (could be "2 tacos").
PRICE = re.compile(r"(?<![\w.$])\$\s?(\d{1,3}(?:\.\d{2})?)(?![\d.])|(?<![\w.$])(\d{1,3}\.\d{2})(?![\d.%])")
LEADERS = re.compile(r"[.…_\-–—·\s]{2,}$")  # dots/dashes between a name and its price
NOT_DISHES = re.compile(r"\b(tax|tip|delivery|fee|gratuity|gift card|catering minimum|add(?:-on)?s?)\b", re.I)
# Marketing and layout text that sits next to prices but isn't a dish.
NOT_NAMES = re.compile(
    r"^(menu|favorites|specials?|starting at|from|only|all items|try our|new!?|serves \d|each|"
    r"\d+\s*(for|pc|pcs|piece|pieces)\b|(small|medium|large|mild|hot|regular)$)|"
    r"carousel|for sharing|menu$|happy hour|established|now hiring|most ordered|after party|out of stock|sold out|use code|save \$|^price$|^reg\.?$|best seller|all day deal|side orders|^(sun|mon|tues|wednes|thurs|fri|satur)day$|^(sun|mon|tue|wed|thu|fri|sat)$|^(lunch|dinner|breakfast|brunch|kids?)$|\bonly \$|click|order now|learn more|download|promotions?\b|both sides",
    re.I,
)


def sentence_like(text):
    """Looks like a description rather than a dish name."""
    words = text.split()
    return len(words) >= 9 or (len(words) >= 4 and text.rstrip().endswith((".", "!")))


def description_like(text):
    """A description line: a sentence, ends with a period, or starts lowercase."""
    first_letter = re.search(r"[A-Za-z]", text)
    return sentence_like(text) or text.rstrip().endswith(".") or bool(first_letter and first_letter.group().islower())


def name_like(text, headings=()):
    """Short, has letters, isn't a sentence, a heading, or marketing text."""
    first_letter = re.search(r"[A-Za-z]", text)
    return (
        2 <= len(text) <= 60
        and re.search(r"[A-Za-z]{3}", text) is not None
        and first_letter is not None and not first_letter.group().islower()  # "with fries..." is a description
        and not sentence_like(text)
        and not NOT_NAMES.search(text.strip())
        and text not in headings
    )


class PoliteFetcher:
    """Fetches pages while respecting robots.txt and pausing between requests to a site."""

    def __init__(self):
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.robots = {}       # site -> RobotFileParser (or None if robots.txt couldn't be read)
        self.last_visit = {}   # site -> time of last request

    def _site(self, url):
        parts = urlparse(url)
        return f"{parts.scheme}://{parts.netloc}"

    def allowed(self, url):
        site = self._site(url)
        if site not in self.robots:
            parser = urllib.robotparser.RobotFileParser()
            try:
                response = self._get(f"{site}/robots.txt")
                if response is not None and response.status_code == 200:
                    parser.parse(response.text.splitlines())
                else:
                    parser.allow_all = True  # no robots.txt means no restrictions
            except requests.RequestException:
                parser.allow_all = True
            self.robots[site] = parser
        return self.robots[site].can_fetch(USER_AGENT, url)

    def _get(self, url):
        site = self._site(url)
        wait = DELAY_SECONDS - (time.time() - self.last_visit.get(site, 0))
        if wait > 0:
            time.sleep(wait)
        self.last_visit[site] = time.time()
        return self.session.get(url, timeout=TIMEOUT_SECONDS, allow_redirects=True)

    def fetch_html(self, url):
        """The page's HTML, or None if robots.txt disallows it, it fails, or it isn't a web page."""
        if not self.allowed(url):
            return None
        try:
            response = self._get(url)
        except requests.RequestException:
            return None
        if response.status_code != 200 or "html" not in response.headers.get("content-type", ""):
            return None
        if "charset" not in response.headers.get("content-type", "").lower():
            response.encoding = response.apparent_encoding  # sites without a charset are usually UTF-8
        return response.text


def find_menu_links(base_url, html, limit=3):
    """Links on a page that look like they lead to the menu, on the same website first."""
    soup = BeautifulSoup(html, "html.parser")
    site = urlparse(base_url).netloc.removeprefix("www.")
    found = []
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"]).split("#")[0]
        label = f"{a.get_text(' ', strip=True)} {a['href']}".lower()
        if "menu" not in label or href.lower().endswith((".pdf", ".jpg", ".png")) or href in found:
            continue
        if urlparse(href).scheme not in ("http", "https"):
            continue
        same_site = urlparse(href).netloc.removeprefix("www.") == site
        found.append((0 if same_site else 1, href))
    return [href for _, href in sorted(found)][:limit]


def extract_menu_items(html):
    """
    Dishes and prices from a menu page: [{"section", "name", "description", "price"}, ...].
    Handles "Name ..... $9.99" on one line, and a name line followed (within a couple
    of lines) by its price.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header", "form", "svg"]):
        tag.decompose()
    headings = {h.get_text(" ", strip=True) for h in soup.find_all(["h1", "h2", "h3", "h4"])}
    lines = [re.sub(r"\s+", " ", line).strip() for line in soup.get_text("\n").splitlines()]
    lines = [line for line in lines if line]

    items, seen = [], set()
    section = previous_section = None
    heading_name = None  # a heading that may turn out to be a dish name (some sites style dishes as headings)
    pending = []  # recent text lines since the last price (possible name + description)

    for line in lines:
        match = PRICE.search(line)
        if not match:
            if line in headings and len(line) <= 60:
                previous_section, section, heading_name, pending = section, line, line, []
            else:
                pending = (pending + [line])[-3:]
            continue

        price = float(match.group(1) or match.group(2))
        before = LEADERS.sub("", line[: match.start()]).strip(" :|-–—​")
        names = [p for p in pending if name_like(p, headings)]
        if name_like(before, headings):
            name, description = before, None              # "Carne Asada Plate ..... 12.99"
        elif heading_name and pending and all(description_like(p) for p in pending) and name_like(heading_name):
            # The "section" heading was really this dish's name: heading, description, price.
            name, section = heading_name, previous_section
            description = " ".join(pending + ([before] if before else []))[:300] or None
        elif names:
            name = names[0]                               # name, then description, then price
            rest = pending[pending.index(name) + 1:] + ([before] if before else [])
            description = " ".join(rest)[:300] or None
        else:
            pending, heading_name = [], None
            continue
        pending, heading_name = [], None

        if not 0.5 <= price <= 200 or NOT_DISHES.search(name):
            continue
        key = ((section or "").lower(), name.lower())
        if key in seen:
            continue
        seen.add(key)
        items.append({"section": section, "name": name[:120], "description": description, "price": price})
    return items


def read_menu(fetcher, url):
    """Fetch one menu page and return (items, html_found)."""
    html = fetcher.fetch_html(url)
    return (extract_menu_items(html), True) if html else ([], False)
