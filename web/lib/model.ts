// Turns raw database rows into the shapes the pages need.

import { houstonTime, longDay } from "./format";
import type { PriceData } from "./data";
import type { DashboardItem, DashboardModel, Listing, Offer, Point, Store } from "./types";

/** All stores selected: compare across every store. Otherwise a store id. */
export type StoreChoice = "all" | number;

export function toOffer(listing: Listing): Offer {
  return {
    description: listing.description,
    brand: listing.brand,
    size: listing.size,
    price: listing.price,
    regular: listing.regular_price,
    onSale: listing.promo_price !== null,
    ppu: listing.price_per_unit,
  };
}

export function buildDashboard({ stores, products, listings, history }: PriceData): DashboardModel {
  const items: DashboardItem[] = products.map((product) => {
    // Listings arrive sorted by price per unit, so the first per store is the cheapest.
    const offers: Record<number, Offer> = {};
    for (const listing of listings) {
      if (listing.product_id === product.id && !(listing.location_id in offers)) {
        offers[listing.location_id] = toOffer(listing);
      }
    }
    const itemHistory: Record<number, Point[]> = {};
    for (const row of history) {
      if (row.product_id === product.id) {
        (itemHistory[row.location_id] ??= []).push([row.day, row.price_per_unit]);
      }
    }
    return {
      slug: product.slug,
      name: product.name,
      category: product.category,
      unit: product.unit_label,
      basketQty: product.basket_qty,
      offers,
      history: itemHistory,
    };
  });

  const days = [...new Set(history.map((row) => row.day))].sort();
  const latestFetch = listings.reduce(
    (latest, listing) => (listing.fetched_at > latest ? listing.fetched_at : latest),
    "",
  );
  return {
    stores,
    items,
    updatedLabel: latestFetch ? houstonTime(latestFetch) : "not yet",
    trackingSinceLabel: days.length ? longDay(days[0]) : "today",
    trackedDays: days.length,
  };
}

/** The offer to show for an item: that store's, or the cheapest across all stores. */
export function pickOffer(
  item: DashboardItem,
  choice: StoreChoice,
): { offer: Offer; storeId: number } | null {
  if (choice !== "all") {
    const offer = item.offers[choice];
    return offer ? { offer, storeId: choice } : null;
  }
  let best: { offer: Offer; storeId: number } | null = null;
  for (const [storeId, offer] of Object.entries(item.offers)) {
    if (!best || offer.ppu < best.offer.ppu) best = { offer, storeId: Number(storeId) };
  }
  return best;
}

/** Daily price per unit for an item: one store's, or the cheapest store each day. */
export function pickHistory(item: DashboardItem, choice: StoreChoice): Point[] {
  if (choice !== "all") return item.history[choice] ?? [];
  const byDay = new Map<string, number>();
  for (const points of Object.values(item.history)) {
    for (const [day, value] of points) {
      const current = byDay.get(day);
      if (current === undefined || value < current) byDay.set(day, value);
    }
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Change from about a week ago to the latest day, or null if there isn't a week of data. */
export function weeklyChange(points: Point[]): number | null {
  if (points.length < 2) return null;
  const [lastDay, lastValue] = points[points.length - 1];
  const weekAgo = new Date(`${lastDay}T12:00:00Z`);
  weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
  const cutoff = weekAgo.toISOString().slice(0, 10);
  const earlier = [...points].reverse().find(([day]) => day <= cutoff);
  if (!earlier) return null;
  return (lastValue - earlier[1]) / earlier[1];
}

/** What one week's basket costs: price per unit x basket quantity, summed. */
export function basketCost(items: DashboardItem[], choice: StoreChoice) {
  let total = 0;
  let missing = 0;
  for (const item of items) {
    const picked = pickOffer(item, choice);
    if (picked) total += picked.offer.ppu * item.basketQty;
    else missing += 1;
  }
  return { total, missing };
}

export function storeName(stores: Store[], id: number): string {
  return stores.find((store) => store.id === id)?.name ?? "Unknown store";
}
