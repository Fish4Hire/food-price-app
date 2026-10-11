// The signed-in user's private profile (home ZIP). Database rules only let
// people read and change their own row, so these use the visitor's login.

import { createClient } from "./supabase/server";

export type Profile = {
  homeZip: string | null;
  homeAddress: string | null; // optional, for distances
  homeLat: number | null;
  homeLon: number | null;
};

export async function getProfile(userId: string): Promise<Profile> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("home_zip, home_address, home_lat, home_lon")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load profile: ${error.message}`);
  return {
    homeZip: data?.home_zip ?? null,
    homeAddress: data?.home_address ?? null,
    homeLat: data?.home_lat ?? null,
    homeLon: data?.home_lon ?? null,
  };
}
