// Prices a user's shopping list at the stores near them, and works out the
// cheapest way to buy it: one store, or split between stores.

import { getPriceData } from "./data";
import { getNearbyStores, getProductPrices, type StorePrice } from "./kroger";
import type { ListItem } from "./lists";
import { visibleStores } from "./model";
import type { Store } from "./types";

const MAX_STORES = 6; // how many nearby stores to compare
const MIN_SPLIT_SAVINGS = 0.5; // don't suggest a second trip to save pennies

/** One item's cost at one store (already multiplied by quantity). */
export type ItemCost = { total: number; detail: string; onSale: boolean };

export type StoreTotal = { storeId: number; total: number; found: number };

export type ListPricing =
  | { status: "empty" }
  | { status: "no-zip" }
  | { status: "no-stores"; zip: string } // no stores with prices near them yet
  | {
      status: "ok";
      zip: string;
      stores: Pick<Store, "id" | "name">[];
      rows: { item: ListItem; costs: Record<number, ItemCost | null> }[];
      totals: StoreTotal[]; // one per store, same order as stores
      best: StoreTotal; // cheapest single store (finding the most items first)
      split: { total: number; storesUsed: number; found: number; savings: number } | null;
    };

export async function priceList(items: ListItem[], homeZip: string | null): Promise<ListPricing> {
  if (!items.length) return { status: "empty" };
  if (!homeZip) return { status: "no-zip" };

  // Nearby stores we have prices for, nearest first.
  const data = await getPriceData();
  const priced = [...visibleStores(data, "featured"), ...visibleStores(data, "user")];
  const nearby = await getNearbyStores(homeZip, 8);
  const kroger = nearby.map((n) => priced.find((s) => s.external_id === n.locationId)).filter((s): s is Store => !!s);
  // Plus stores we price by hand (H-E-B, Walmart, ...) in the same ZIP area (first three digits).
  const sameArea = priced.filter((s) => !kroger.includes(s) && s.zip_code?.startsWith(homeZip.slice(0, 3)));
  const stores = [...kroger, ...sameArea].slice(0, MAX_STORES);
  if (!stores.length) return { status: "no-stores", zip: homeZip };

  // Live prices for specific products at each store (one Kroger call per 50 products per store).
  const productIds = [...new Set(items.flatMap((i) => (i.krogerProductId ? [i.krogerProductId] : [])))].sort();
  const livePrices = new Map<number, Record<string, StorePrice>>();
  await Promise.all(
    stores.map(async (store) => {
      livePrices.set(store.id, productIds.length ? await getProductPrices(productIds, store.external_id) : {});
    }),
  );

  const rows = items.map((item) => {
    const costs: Record<number, ItemCost | null> = {};
    for (const store of stores) {
      if (item.productId) {
        // Staple: the cheapest option per unit at this store, from our daily prices.
        const options = data.listings.filter((l) => l.product_id === item.productId && l.location_id === store.id);
        const best = options.sort((a, b) => a.price_per_unit - b.price_per_unit)[0];
        costs[store.id] = best
          ? {
              total: best.price * item.quantity,
              detail: [best.description, best.size].filter(Boolean).join(" · "),
              onSale: best.promo_price !== null,
            }
          : null;
      } else {
        const live = livePrices.get(store.id)?.[item.krogerProductId!];
        costs[store.id] = live ? { total: live.price * item.quantity, detail: "", onSale: live.onSale } : null;
      }
    }
    return { item, costs };
  });

  const totals: StoreTotal[] = stores.map((store) => {
    const found = rows.filter((r) => r.costs[store.id]);
    return { storeId: store.id, total: sum(found.map((r) => r.costs[store.id]!.total)), found: found.length };
  });
  const best = [...totals].sort((a, b) => b.found - a.found || a.total - b.total)[0];

  // Split: buy each item wherever it's cheapest.
  let split = null;
  if (stores.length > 1) {
    const picks = rows
      .map((r) => {
        const options = stores.map((s) => ({ storeId: s.id, cost: r.costs[s.id] })).filter((o) => o.cost);
        return options.sort((a, b) => a.cost!.total - b.cost!.total)[0];
      })
      .filter(Boolean);
    const total = sum(picks.map((p) => p.cost!.total));
    const storesUsed = new Set(picks.map((p) => p.storeId)).size;
    // Compare like with like: only when the split finds the same items as the best store.
    const savings = picks.length === best.found ? best.total - total : 0;
    if (storesUsed > 1 && savings >= MIN_SPLIT_SAVINGS) {
      split = { total, storesUsed, found: picks.length, savings };
    }
  }

  return {
    status: "ok",
    zip: homeZip,
    stores: stores.map(({ id, name }) => ({ id, name })),
    rows,
    totals,
    best,
    split,
  };
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
