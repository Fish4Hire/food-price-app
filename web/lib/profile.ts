// The signed-in user's private profile (home ZIP). Database rules only let
// people read and change their own row, so these use the visitor's login.

import { createClient } from "./supabase/server";

export type Profile = { homeZip: string | null };

export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("home_zip").eq("id", userId).maybeSingle();
  if (error) throw new Error(`Couldn't load profile: ${error.message}`);
  return { homeZip: data?.home_zip ?? null };
}
