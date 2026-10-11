"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ZipState = { status: "idle" } | { status: "saved"; zip: string } | { status: "error"; message: string };

/** Save the signed-in user's home ZIP code to their profile. */
export async function saveHomeZip(_previous: ZipState, formData: FormData): Promise<ZipState> {
  const zip = String(formData.get("zip") ?? "").trim();
  if (!/^\d{5}$/.test(zip)) {
    return { status: "error", message: "Please enter a 5-digit ZIP code." };
  }

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your sign-in expired. Please sign in again." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, home_zip: zip, updated_at: new Date().toISOString() });
  if (error) return { status: "error", message: "We couldn't save your ZIP code. Please try again." };

  refresh(); // re-render the account page so the nearby stores update
  return { status: "saved", zip };
}
