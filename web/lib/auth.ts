// Who is signed in? The one place the site reads the login.
// Reads cookies, so callers must sit inside a <Suspense> boundary.

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

/** Is the signed-in user an app owner or price checker? (See app_owners in schema.sql.) */
export async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_app_owner");
  return !error && data === true;
}
