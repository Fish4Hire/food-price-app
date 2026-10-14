// Who is signed in? The one place the site reads the login.
// Reads cookies, so callers must sit inside a <Suspense> boundary.

import type { Access, Tier } from "./access";
import { createClient } from "./supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  createdAt: string;
};

/** The signed-in user (checked with Supabase), or null for visitors. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, email: data.user.email ?? "", createdAt: data.user.created_at };
}

const NO_ACCESS: Access = { tier: "free", isOwner: false, isAdmin: false, entersPrices: false };

/** The signed-in user's group and permissions (free with nothing extra for visitors). */
export async function getAccess(): Promise<Access> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_access");
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return NO_ACCESS;
  return {
    tier: row.tier as Tier,
    isOwner: row.is_owner === true,
    isAdmin: row.is_admin === true,
    entersPrices: row.enters_prices === true,
  };
}

/** Can the signed-in user enter shelf prices on /enter? */
export async function canEnterPrices(): Promise<boolean> {
  return (await getAccess()).entersPrices;
}
