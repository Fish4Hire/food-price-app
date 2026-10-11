"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { geocodeAddress } from "@/lib/geocode";
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

export type DeleteState = { status: "idle" } | { status: "error"; message: string };

/** Permanently delete the signed-in user's account, ZIP code and lists. */
export async function deleteAccount(_previous: DeleteState, formData: FormData): Promise<DeleteState> {
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { status: "error", message: 'Type "delete" to confirm.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) return { status: "error", message: "We couldn't delete your account. Please try again or email us." };

  // The account is gone; clear the sign-in cookies on this device.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/account/deleted");
}

export type AddressState = { status: "idle" } | { status: "saved"; matched: string } | { status: "error"; message: string };

/** Save an optional home address (turned into map coordinates) for distances. Private to the user. */
export async function saveHomeAddress(_previous: AddressState, formData: FormData): Promise<AddressState> {
  const address = String(formData.get("address") ?? "").trim().slice(0, 200);
  if (address.length < 8) return { status: "error", message: "Enter a street address, city and state (or ZIP)." };

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Your sign-in expired. Please sign in again." };

  let match;
  try {
    match = await geocodeAddress(address);
  } catch {
    return { status: "error", message: "The address lookup isn't working right now. Please try again later." };
  }
  if (!match) {
    return { status: "error", message: "We couldn't find that address. Try adding the city, state and ZIP." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    home_address: match.matched,
    home_lat: match.lat,
    home_lon: match.lon,
    updated_at: new Date().toISOString(),
  });
  if (error) return { status: "error", message: "We couldn't save your address. Please try again." };
  refresh();
  return { status: "saved", matched: match.matched };
}

/** Remove the saved address (and its coordinates). */
export async function removeHomeAddress() {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase
    .from("profiles")
    .update({ home_address: null, home_lat: null, home_lon: null, updated_at: new Date().toISOString() })
    .eq("id", user.id);
  refresh();
}
