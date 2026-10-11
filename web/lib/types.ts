// Shapes of the rows we read from Supabase (see ../schema.sql for the views).

export type Store = {
  id: number;
  external_id: string; // Kroger locationId
  name: string;
  address_line1: string | null;
  city: string | null;
  zip_code: string | null;
  metro: string | null; // e.g. "Houston, TX"
};

/** A city and the stores we track there. */
export type Metro = { name: string; storeIds: number[] };

export type Product = {
  id: number;
  slug: string;
  name: string;
  category: string;
  unit_label: string;
  basket_qty: number;
};

/** One row of the latest_listing_prices view: a listing's latest price at one store. */
export type Listing = {
  product_id: number;
  slug: string;
  location_id: number;
  store_item_id: number;
  description: string;
  brand: string | null;
  size: string | null;
  regular_price: number;
  promo_price: number | null;
  price: number;
  price_per_unit: number;
  fetched_at: string;
};

/** One row of the basket_price_history view: cheapest price per unit that day. */
export type HistoryRow = {
  product_id: number;
  location_id: number;
  day: string; // YYYY-MM-DD, Houston time
  price_per_unit: number;
};

/** One row of benchmark_prices: an official monthly average (e.g. BLS). */
export type BenchmarkRow = {
  product_id: number;
  period: string; // YYYY-MM-01
  price_per_unit: number;
};

/** The latest U.S. average for an item, plus its monthly history. */
export type Benchmark = {
  ppu: number;
  periodLabel: string; // "Aug 2026"
  history: Point[];    // [YYYY-MM-01, price per unit], oldest first
};

/** [day, price per unit] */
export type Point = [string, number];

/** The cheapest listing for one item at one store, trimmed for the browser. */
export type Offer = {
  description: string;
  brand: string | null;
  size: string | null;
  price: number;
  regular: number;
  onSale: boolean;
  ppu: number;
};

export type DashboardItem = {
  slug: string;
  name: string;
  category: string;
  unit: string;
  basketQty: number;
  offers: Record<number, Offer>;      // by store id
  history: Record<number, Point[]>;   // by store id, oldest first
  benchmark: Benchmark | null;         // U.S. average, if the BLS tracks this item
};

export type DashboardModel = {
  stores: Store[];
  metros: Metro[];
  items: DashboardItem[];
  updatedLabel: string;
  trackingSinceLabel: string;
  trackedDays: number;
};
