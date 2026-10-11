"""
Shared code for talking to the Kroger API: getting a token, finding stores,
and searching products. Other scripts import from this file.

Every request goes through call_api(), which counts calls and stops the
script if a run uses more than MAX_CALLS_PER_RUN.
"""

import base64
import json
import os
import sys
import time
from pathlib import Path

import requests

RETRY_STATUSES = {429, 500, 502, 503, 504}  # busy or temporary server errors
RETRY_WAITS = [5, 20]                       # seconds to wait before each retry

BASE_URL = "https://api.kroger.com"
TOKEN_CACHE = Path(__file__).parent / ".kroger_token.json"

# Safety cap on API calls for a single run (daily limits are 10,000 / 1,600).
MAX_CALLS_PER_RUN = 3000
api_calls = 0


def call_api(method, path, **kwargs):
    """Make one Kroger API request, counting it toward our per-run limit."""
    global api_calls
    if api_calls >= MAX_CALLS_PER_RUN:
        sys.exit(f"Stopping: hit the safety limit of {MAX_CALLS_PER_RUN} API calls.")
    api_calls += 1
    response = requests.request(method, BASE_URL + path, timeout=30, **kwargs)
    # Retry a couple of times on temporary errors, so one hiccup doesn't end the run.
    for wait in RETRY_WAITS:
        if response.status_code not in RETRY_STATUSES:
            break
        time.sleep(wait)
        api_calls += 1
        response = requests.request(method, BASE_URL + path, timeout=30, **kwargs)
    if not response.ok:
        sys.exit(f"API error {response.status_code} on {path}:\n{response.text}")
    return response.json()


def get_token():
    """Return a valid access token, reusing the cached one if it hasn't expired."""
    if TOKEN_CACHE.exists():
        cached = json.loads(TOKEN_CACHE.read_text())
        # Keep a 60-second buffer so the token doesn't expire mid-run.
        if cached["expires_at"] > time.time() + 60:
            return cached["access_token"]

    client_id = os.getenv("KROGER_CLIENT_ID")
    client_secret = os.getenv("KROGER_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Missing KROGER_CLIENT_ID or KROGER_CLIENT_SECRET in your .env file.")

    credentials = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    data = call_api(
        "POST",
        "/v1/connect/oauth2/token",
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={"grant_type": "client_credentials", "scope": "product.compact"},
    )

    TOKEN_CACHE.write_text(json.dumps({
        "access_token": data["access_token"],
        "expires_at": time.time() + data["expires_in"],
    }))
    return data["access_token"]


def find_nearest_stores(token, zip_code, limit, chain=None, radius_miles=None):
    """
    Return the stores closest to a ZIP code (Kroger sorts them by distance).
    chain limits results to one banner, e.g. "KROGER", "RALPHS" or "KINGSOOPERS".
    radius_miles limits how far away they can be (Kroger allows up to 100).
    """
    params = {"filter.zipCode.near": zip_code, "filter.limit": limit}
    if chain:
        params["filter.chain"] = chain
    if radius_miles:
        params["filter.radiusInMiles"] = radius_miles
    data = call_api(
        "GET",
        "/v1/locations",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
    )
    return data["data"]


def search_products(token, location_id, term, limit):
    """Search a store's products. Prices only come back because we pass locationId."""
    data = call_api(
        "GET",
        "/v1/products",
        headers={"Authorization": f"Bearer {token}"},
        params={
            "filter.term": term,
            "filter.locationId": location_id,
            "filter.limit": limit,
        },
    )
    return data["data"]
