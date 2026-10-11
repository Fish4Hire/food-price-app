// Reads the price data from Supabase. Runs on the server only.
//
// Prices change once a day (the collector runs each morning), so results are
// cached for an hour: visitors get fast pages and Supabase gets few requests.

import { cacheLife } from "next/cache";
import type { BenchmarkRow, HistoryRow, Listing, Product, Store } from "./types";

const PAGE_SIZE = 1000; // Supabase returns at most 1,000 rows per request

async function fetchAll<T>(path: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY (see web/.env.local)");
  }

  const rows: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      headers: { apikey: key, Range: `${start}-${start + PAGE_SIZE - 1}` },
    });
    if (!response.ok) {
      throw new Error(`Supabase ${path}: ${response.status} ${await response.text()}`);
    }
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

export type PriceData = {
  stores: Store[];
  products: Product[];
  listings: Listing[];
  history: HistoryRow[];
  benchmarks: BenchmarkRow[];
};

export async function getPriceData(): Promise<PriceData> {
  "use cache";
  cacheLife("hours");

  const [stores, products, listings, history, benchmarks] = await Promise.all([
    fetchAll<Store>("locations?select=id,external_id,name,address_line1,city,zip_code,metro&order=id"),
    fetchAll<Product>(
      "products?select=id,slug,name,category,unit_label,basket_qty&active=eq.true&order=id",
    ),
    fetchAll<Listing>(
      "latest_listing_prices?select=product_id,slug,location_id,store_item_id,description," +
        "brand,size,regular_price,promo_price,price,price_per_unit,fetched_at" +
        "&order=product_id,location_id,price_per_unit",
    ),
    fetchAll<HistoryRow>(
      "basket_price_history?select=product_id,location_id,day,price_per_unit&order=day",
    ),
    fetchAll<BenchmarkRow>("benchmark_prices?select=product_id,period,price_per_unit&order=period"),
  ]);
  return { stores, products, listings, history, benchmarks };
}
