"use server";

import { refresh } from "next/cache";
import { SIZE_UNITS } from "@/lib/priceEntry";
import { createClient } from "@/lib/supabase/server";

export type Entry = {
  slug: string;
  unit: string;
  price: number;
  regular?: number; // normal price, if the item is on sale
  size: number; // package size, in the item's entry unit
  description?: string;
};

export type SaveResult = { ok: true; added: number; confirmed: number } | { ok: false; message: string };

/** Save hand-checked prices for one store. The database only accepts these from price checkers. */
export async function saveEntries(locationId: number, entries: Entry[]): Promise<SaveResult> {
  const rows = entries
    .filter((e) => Number.isFinite(e.price) && e.price > 0 && Number.isFinite(e.size) && e.size > 0 && SIZE_UNITS[e.unit])
    .map((e) => {
      const units = SIZE_UNITS[e.unit];
      return {
        slug: e.slug,
        price: Math.round(e.price * 100) / 100,
        regular: e.regular && e.regular > e.price ? Math.round(e.regular * 100) / 100 : undefined,
        size: `${e.size} ${units.sizeUnit}`,
        size_value: e.size,
        size_unit: units.sizeUnit,
        base_qty: e.size * units.perSize,
        base_unit: units.baseUnit,
        description: e.description?.trim().slice(0, 120) || undefined,
      };
    });
  if (!rows.length) return { ok: false, message: "Enter at least one price." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_manual_prices", { p_location_id: locationId, p_entries: rows });
  if (error) {
    return {
      ok: false,
      message: error.message.includes("price checkers") ? "Your account isn't set up as a price checker." : "Saving failed. Please try again.",
    };
  }
  const counts = Array.isArray(data) ? data[0] : data;
  refresh();
  return { ok: true, added: counts.added, confirmed: counts.confirmed };
}
