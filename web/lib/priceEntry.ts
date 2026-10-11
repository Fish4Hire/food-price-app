// Data for the price entry screen (/enter): stores whose prices are checked by
// hand, the basket items, and each store's last hand-checked prices.
// Not cached: checkers need to see their own saves right away.

import { createClient } from "./supabase/server";

export type EntryStore = { id: number; name: string; chain: string | null; address: string | null };

export type EntryItem = {
  slug: string;
  name: string;
  category: string;
  unit: string; // the item's comparison unit: gal, fl oz, lb, oz, dozen, each
  sizeUnit: string; // what checkers type the package size in (dozen/each -> ct)
  defaultSize: number;
};

export type LastPrice = {
  slug: string;
  description: string | null;
  sizeValue: number | null;
  regular: number;
  promo: number | null;
  checkedAt: string;
};

/** The unit checkers enter sizes in, and how many base units one of it is. */
export const SIZE_UNITS: Record<string, { sizeUnit: string; baseUnit: string; perSize: number }> = {
  gal: { sizeUnit: "gal", baseUnit: "fl oz", perSize: 128 },
  "fl oz": { sizeUnit: "fl oz", baseUnit: "fl oz", perSize: 1 },
  lb: { sizeUnit: "lb", baseUnit: "oz", perSize: 16 },
  oz: { sizeUnit: "oz", baseUnit: "oz", perSize: 1 },
  dozen: { sizeUnit: "ct", baseUnit: "ct", perSize: 1 },
  each: { sizeUnit: "ct", baseUnit: "ct", perSize: 1 },
};

export async function getEntryData(): Promise<{ stores: EntryStore[]; items: EntryItem[]; last: Record<number, LastPrice[]> }> {
  const supabase = await createClient();
  const [storesResult, productsResult, lastResult] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, chain, address_line1")
      .eq("kind", "grocery")
      .neq("source", "kroger")
      .order("chain"),
    supabase
      .from("products")
      .select("slug, name, category, unit_label, basket_qty, size_value")
      .eq("active", true)
      .order("id"),
    supabase.from("manual_last_prices").select("location_id, slug, description, size_value, regular_price, promo_price, checked_at"),
  ]);
  if (storesResult.error || productsResult.error || lastResult.error) {
    throw new Error("Couldn't load the price entry data");
  }

  const items = productsResult.data.map((p) => {
    const unit = p.unit_label as string;
    const defaultSize =
      unit === "dozen" ? 12 * (p.size_value ?? 1) : unit === "each" ? 1 : Number(p.size_value ?? p.basket_qty ?? 1);
    return { slug: p.slug, name: p.name, category: p.category, unit, sizeUnit: SIZE_UNITS[unit]?.sizeUnit ?? unit, defaultSize };
  });

  const last: Record<number, LastPrice[]> = {};
  for (const row of lastResult.data) {
    (last[row.location_id] ??= []).push({
      slug: row.slug,
      description: row.description,
      sizeValue: row.size_value === null ? null : Number(row.size_value),
      regular: Number(row.regular_price),
      promo: row.promo_price === null ? null : Number(row.promo_price),
      checkedAt: row.checked_at,
    });
  }

  return {
    stores: storesResult.data.map((s) => ({ id: s.id, name: s.name, chain: s.chain, address: s.address_line1 })),
    items,
    last,
  };
}
