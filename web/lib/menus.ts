// Restaurant menu data (private: database rules only let app owners read it).
// Everything here runs with the visitor's login.

import { createClient } from "./supabase/server";

export type Dish = {
  id: number;
  name: string;
  section: string;
  description: string | null;
  restaurantId: number;
  restaurant: string;
  cuisine: string | null;
  address: string | null;
  menuUrl: string | null;
  price: number;
  fetchedAt: string;
};

/** Is the signed-in user an app owner? (Owners can see private features like Eat out.) */
export async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_app_owner");
  return !error && data === true;
}

/** Every dish's latest price, cheapest first. Empty for anyone who isn't an owner. */
export async function getDishes(): Promise<Dish[]> {
  const supabase = await createClient();
  const dishes: Dish[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await supabase
      .from("latest_menu_prices")
      .select("menu_item_id, name, section, description, location_id, restaurant, cuisine, address_line1, menu_url, price, fetched_at")
      .order("price")
      .order("menu_item_id")
      .range(start, start + 999);
    if (error) throw new Error(`Couldn't load menus: ${error.message}`);
    dishes.push(
      ...data.map((row) => ({
        id: row.menu_item_id,
        name: row.name,
        section: row.section,
        description: row.description,
        restaurantId: row.location_id,
        restaurant: row.restaurant,
        cuisine: row.cuisine,
        address: row.address_line1,
        menuUrl: row.menu_url,
        price: Number(row.price),
        fetchedAt: row.fetched_at,
      })),
    );
    if (data.length < 1000) return dishes;
  }
}
