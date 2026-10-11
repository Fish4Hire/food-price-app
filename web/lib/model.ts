// Turns raw database rows into the shapes the pages need.

import { houstonTime, longDay, monthLabel } from "./format";
import type { PriceData } from "./data";
import type { Benchmark, BenchmarkRow, DashboardItem, DashboardModel, Deal, Listing, Metro, Offer, Point, Store } from "./types";

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

/**
 * Stores to show: in a city, with prices from the last 3 days, of the given kind.
 * The public pages use "featured" only, so they never reveal where users live.
 */
export function visibleStores(data: PriceData, tracking: Store["tracking"] = "featured"): Store[] {
  const active = new Set(data.listings.map((listing) => listing.location_id));
  return data.stores.filter((s) => s.metro && s.tracking === tracking && active.has(s.id));
}

/** The dashboard for a set of stores (by default, the public featured cities). */
export function buildDashboard(data: PriceData, stores: Store[] = visibleStores(data)): DashboardModel {
  const storeIds = new Set(stores.map((s) => s.id));
  const listings = data.listings.filter((l) => storeIds.has(l.location_id));
  const history = data.history.filter((h) => storeIds.has(h.location_id));
  const { products, benchmarks } = data;
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
  const names = new Map(products.map((p) => [p.id, p.name]));
  const deals: Deal[] = listings
    .filter((l) => l.promo_price !== null && l.promo_price < l.regular_price)
    .map((l) => ({
      slug: l.slug,
      itemName: names.get(l.product_id) ?? "",
      storeItemId: l.store_item_id,
      storeId: l.location_id,
      description: l.description,
      size: l.size,
      price: l.promo_price!,
      regular: l.regular_price,
    }));

  return {
    stores,
    metros: groupMetros(stores),
    deals,
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

/**
 * The best deals at the chosen stores: biggest percentage off first, and only the
 * best deal per basket item, so one brand-wide sale can't fill the whole list.
 */
export function topDeals(deals: Deal[], choice: StoreChoice, limit = 6): Deal[] {
  const off = (d: Deal) => (d.regular - d.price) / d.regular;
  const best = new Map<string, Deal>(); // basket item slug -> its best deal
  for (const deal of deals) {
    if (!choice.includes(deal.storeId) || off(deal) < 0.05) continue;
    const current = best.get(deal.slug);
    if (!current || off(deal) > off(current) || (off(deal) === off(current) && deal.price < current.price)) {
      best.set(deal.slug, deal);
    }
  }
  return [...best.values()].sort((a, b) => off(b) - off(a)).slice(0, limit);
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
