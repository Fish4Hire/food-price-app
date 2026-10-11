// A Supabase client for server code (pages, server actions, route handlers)
// that knows who the visitor is, by reading and writing Supabase's login cookies.
// Create a new one for every request; never share one between requests.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY (see web/.env.local)");
  }
  return { url, key };
}

export async function createClient() {
  const { url, key } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Pages can't set cookies. That's fine: proxy.ts refreshes logins on every request.
        }
      },
    },
  });
}
