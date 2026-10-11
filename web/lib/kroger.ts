// Talks to the Kroger API from the website (server side only).
// Results are cached, so repeat lookups don't use up Kroger's daily call limits
// (Locations: 1,600 calls a day).

import { cacheLife } from "next/cache";

const BASE_URL = "https://api.kroger.com";
const SEARCH_RADIUS_MILES = 25;

export type NearbyStore = {
  locationId: string;
  name: string;
  chain: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

/** A Kroger access token. Tokens last 30 minutes; this reuses one for 25. */
async function getToken(): Promise<string> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 1500, expire: 1500 });

  const id = process.env.KROGER_CLIENT_ID;
  const secret = process.env.KROGER_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing KROGER_CLIENT_ID or KROGER_CLIENT_SECRET");

  const response = await fetch(`${BASE_URL}/v1/connect/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" }),
  });
  if (!response.ok) throw new Error(`Kroger token request failed: ${response.status}`);
  return (await response.json()).access_token;
}

type KrogerLocation = {
  locationId: string;
  name: string;
  chain: string;
  address: { addressLine1: string; city: string; state: string; zipCode: string };
};

/**
 * The Kroger-family stores closest to a ZIP code (within 25 miles), nearest first.
 * Placeholder locations Kroger sometimes returns are filtered out. Cached for a day per ZIP.
 */
export async function getNearbyStores(zip: string, limit = 5): Promise<NearbyStore[]> {
  "use cache";
  cacheLife("days");

  const params = new URLSearchParams({
    "filter.zipCode.near": zip,
    "filter.radiusInMiles": String(SEARCH_RADIUS_MILES),
    "filter.limit": String(limit + 5), // extra, in case some are placeholders
  });
  const response = await fetch(`${BASE_URL}/v1/locations?${params}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!response.ok) throw new Error(`Kroger locations request failed: ${response.status}`);

  const { data } = (await response.json()) as { data: KrogerLocation[] };
  return data
    .filter((s) => /^\d{8}$/.test(s.locationId) && !/spoke|forecast|unused/i.test(s.name))
    .slice(0, limit)
    .map((s) => ({
      locationId: s.locationId,
      name: s.name,
      chain: s.chain,
      address: s.address.addressLine1,
      city: s.address.city,
      state: s.address.state,
      zip: s.address.zipCode,
    }));
}
