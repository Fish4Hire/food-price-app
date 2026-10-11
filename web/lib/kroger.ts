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

export type ProductResult = {
  productId: string;
  description: string;
  brand: string | null;
  size: string | null;
  imageUrl: string | null;
  price: number | null; // at the given store, if one was given
  promo: number | null;
};

type KrogerProduct = {
  productId: string;
  description: string;
  brand?: string;
  images?: { perspective: string; featured?: boolean; sizes: { size: string; url: string }[] }[];
  items?: { size?: string; price?: { regular?: number; promo?: number } }[];
};

/**
 * Search Kroger's products. With a store's locationId, results include that
 * store's prices. Cached for a few hours per search, to save API calls.
 */
export async function searchProducts(term: string, locationId: string | null, limit = 20): Promise<ProductResult[]> {
  "use cache";
  cacheLife("hours");

  const params = new URLSearchParams({ "filter.term": term, "filter.limit": String(limit) });
  if (locationId) params.set("filter.locationId", locationId);
  const response = await fetch(`${BASE_URL}/v1/products?${params}`, {
    headers: { Authorization: `Bearer ${await getToken()}` },
  });
  if (!response.ok) throw new Error(`Kroger product search failed: ${response.status}`);

  const { data } = (await response.json()) as { data: KrogerProduct[] };
  return data.map((p) => {
    const item = p.items?.[0];
    const image = p.images?.find((i) => i.featured) ?? p.images?.[0];
    const regular = item?.price?.regular || null;
    const promo = item?.price?.promo || null;
    return {
      productId: p.productId,
      description: p.description,
      brand: p.brand ?? null,
      size: item?.size ?? null,
      imageUrl: image?.sizes.find((s) => s.size === "medium")?.url ?? image?.sizes[0]?.url ?? null,
      price: regular,
      promo: promo && regular && promo < regular ? promo : null,
    };
  });
}

export type StorePrice = { price: number; regular: number; onSale: boolean };

/**
 * Current prices for specific products at one store, keyed by productId.
 * Products the store doesn't carry are left out. Up to 50 ids per Kroger call;
 * cached for a few hours per store and set of products.
 */
export async function getProductPrices(productIds: string[], locationId: string): Promise<Record<string, StorePrice>> {
  "use cache";
  cacheLife("hours");

  const prices: Record<string, StorePrice> = {};
  for (let start = 0; start < productIds.length; start += 50) {
    const params = new URLSearchParams({
      "filter.productId": productIds.slice(start, start + 50).join(","),
      "filter.locationId": locationId,
      "filter.limit": "50",
    });
    const response = await fetch(`${BASE_URL}/v1/products?${params}`, {
      headers: { Authorization: `Bearer ${await getToken()}` },
    });
    if (!response.ok) throw new Error(`Kroger price lookup failed: ${response.status}`);
    const { data } = (await response.json()) as { data: KrogerProduct[] };
    for (const product of data) {
      const regular = product.items?.[0]?.price?.regular;
      const promo = product.items?.[0]?.price?.promo;
      if (!regular) continue; // listed but no price at this store
      const onSale = !!promo && promo < regular;
      prices[product.productId] = { price: onSale ? promo! : regular, regular, onSale };
    }
  }
  return prices;
}
