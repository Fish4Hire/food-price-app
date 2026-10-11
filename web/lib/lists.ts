// The signed-in user's shopping list. Database rules only let people see and
// change their own lists, so everything here runs with the visitor's login.

import { createClient } from "./supabase/server";

export type ListItem = {
  id: number;
  productId: number | null; // a staple (any brand)
  krogerProductId: string | null; // or one specific product
  description: string;
  brand: string | null;
  size: string | null;
  imageUrl: string | null;
  quantity: number;
};

/** The user's list id, creating "My list" the first time. */
export async function getOrCreateListId(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data: existing, error } = await supabase
    .from("shopping_lists")
    .select("id")
    .eq("user_id", userId)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load your list: ${error.message}`);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabase
    .from("shopping_lists")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (createError) throw new Error(`Couldn't create your list: ${createError.message}`);
  return created.id;
}

export async function getListItems(listId: number): Promise<ListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("list_items")
    .select("id, product_id, kroger_product_id, description, brand, size, image_url, quantity")
    .eq("list_id", listId)
    .order("added_at");
  if (error) throw new Error(`Couldn't load your list: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    productId: row.product_id,
    krogerProductId: row.kroger_product_id,
    description: row.description,
    brand: row.brand,
    size: row.size,
    imageUrl: row.image_url,
    quantity: row.quantity,
  }));
}
