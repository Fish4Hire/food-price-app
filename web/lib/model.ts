// Turns raw database rows into the shapes the pages need.

import { houstonTime, longDay, monthLabel } from "./format";
import type { PriceData } from "./data";
import type { Benchmark, BenchmarkRow, DashboardItem, DashboardModel, Listing, Metro, Offer, Point, Store } from "./types";

/** The stores being compared: one store's id, or every store in a city. */
export type StoreChoice = number[];

/**
 * Group stores by city, in the order cities were added (oldest store first).
 * Stores with no city (e.g. a placeholder location we stopped tracking) are left out.
 */
export function groupMetros(stores: Store[]): Metro[] {
  const metros: Metro[] = [];
  for (const store of [...stores].sort((a, b) => a.id - b.id)) {
    const name = store.metro;
    if (!name) continue;
    let metro = metros.find((m) => m.name === name);
    if (!metro) metros.push((metro = { name, storeIds: [] }));
    metro.storeIds.push(store.id);
  }
  return metros;
}

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

export function buildBenchmark(rows: BenchmarkRow[], productId: number): Benchmark | null {
  const points: Point[] = rows
    .filter((row) => row.product_id === productId)
    .map((row) => [row.period, row.price_per_unit]);
  if (!points.length) return null;
  const [latestPeriod, latestValue] = points[points.length - 1];
  return { ppu: latestValue, periodLabel: monthLabel(latestPeriod), history: points };
}

/** The U.S. average in effect on a day: the latest published month on or before it. */
export function benchmarkOn(benchmark: Benchmark, day: string): number {
  let value = benchmark.history[0][1];
  for (const [period, v] of benchmark.history) {
    if (period <= day) value = v;
  }
  return value;
}

/**
 * Our basket vs the U.S. average, using only items the BLS tracks.
 * Returns the fractional difference (-0.2 = 20% below) and how many items were compared.
 */
export function basketVsBenchmark(items: DashboardItem[], choice: StoreChoice) {
  let ours = 0;
  let average = 0;
  let count = 0;
  for (const item of items) {
    const picked = pickOffer(item, choice);
    if (!item.benchmark || !picked) continue;
    ours += picked.offer.ppu * item.basketQty;
    average += item.benchmark.ppu * item.basketQty;
    count += 1;
  }
  return count ? { change: (ours - average) / average, count } : null;
}

export function buildDashboard({ stores, products, listings, history, benchmarks }: PriceData): DashboardModel {
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
      benchmark: buildBenchmark(benchmarks, product.id),
    };
  });

  const days = [...new Set(history.map((row) => row.day))].sort();
  const latestFetch = listings.reduce(
    (latest, listing) => (listing.fetched_at > latest ? listing.fetched_at : latest),
    "",
  );
  return {
    stores,
    metros: groupMetros(stores),
    items,
    updatedLabel: latestFetch ? houstonTime(latestFetch) : "not yet",
    trackingSinceLabel: days.length ? longDay(days[0]) : "today",
    trackedDays: days.length,
  };
}

/** The cheapest offer for an item among the chosen stores. */
export function pickOffer(
  item: DashboardItem,
  choice: StoreChoice,
): { offer: Offer; storeId: number } | null {
  let best: { offer: Offer; storeId: number } | null = null;
  for (const storeId of choice) {
    const offer = item.offers[storeId];
    if (offer && (!best || offer.ppu < best.offer.ppu)) best = { offer, storeId };
  }
  return best;
}

/** Daily price per unit for an item: the cheapest of the chosen stores each day. */
export function pickHistory(item: DashboardItem, choice: StoreChoice): Point[] {
  return cheapestPerDay(choice.map((id) => item.history[id] ?? []));
}

/** Merge several daily series into one, keeping the lowest value each day. */
export function cheapestPerDay(seriesList: Point[][]): Point[] {
  const byDay = new Map<string, number>();
  for (const points of seriesList) {
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
