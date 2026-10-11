// Menus a user saved from delivery apps with the "Save to Cheaper Eats" button.
// Private: database rules only let each person read their own.

import { createClient } from "./supabase/server";

export type SavedMenu = {
  id: number;
  app: string;
  restaurantName: string;
  pageUrl: string | null;
  savedAt: string;
  items: { id: number; name: string; description: string | null; price: number }[];
};

export async function getSavedMenus(): Promise<SavedMenu[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_menus")
    .select("id, app, restaurant_name, page_url, saved_at, saved_menu_items(id, name, description, price)")
    .order("saved_at", { ascending: false });
  if (error) throw new Error(`Couldn't load saved menus: ${error.message}`);
  return data.map((m) => ({
    id: m.id,
    app: m.app,
    restaurantName: m.restaurant_name,
    pageUrl: m.page_url,
    savedAt: m.saved_at,
    items: (m.saved_menu_items ?? []).map((i) => ({ id: i.id, name: i.name, description: i.description, price: Number(i.price) })),
  }));
}
