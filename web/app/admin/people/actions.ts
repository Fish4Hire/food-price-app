"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AccessState = { status: "idle" } | { status: "saved"; email: string } | { status: "error"; message: string };

const GROUPS = new Set(["admin", "trusted", "paid", "free"]);

/**
 * Owner or admin: put a person (by email) in a group, and say whether they can
 * enter prices. The database checks the caller and logs the change (admin_set_access).
 */
export async function setAccess(_previous: AccessState, formData: FormData): Promise<AccessState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const tier = String(formData.get("tier") ?? "");
  const entersPrices = formData.get("enters_prices") === "on";
  const note = String(formData.get("note") ?? "").trim().slice(0, 200);
  const paidUntil = String(formData.get("paid_until") ?? "");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: "error", message: "Please enter an email address." };
  if (!GROUPS.has(tier)) return { status: "error", message: "Please pick a group." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_access", {
    p_email: email,
    p_tier: tier,
    p_enters_prices: entersPrices,
    p_note: note,
    p_paid_until: tier === "paid" && paidUntil ? new Date(`${paidUntil}T23:59:59`).toISOString() : null,
  });
  if (error) {
    const known = ["owner account", "not an email", "unknown group", "admins only"].some((m) => error.message.includes(m));
    return { status: "error", message: known ? error.message : "Couldn't save that. Please try again." };
  }

  refresh();
  return { status: "saved", email };
}
