// Shapes of the rows we read from Supabase (see ../schema.sql for the views).

export type Store = {
  id: number;
  name: string;
  address_line1: string | null;
  city: string | null;
  zip_code: string | null;
};

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
};

export type DashboardModel = {
  stores: Store[];
  items: DashboardItem[];
  updatedLabel: string;
  trackingSinceLabel: string;
  trackedDays: number;
};
