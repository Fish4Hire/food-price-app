"use server";

// Server actions for the shopping list page: search, add, change quantity, remove.

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { getPriceData } from "@/lib/data";
import { getNearbyStores, searchProducts, type ProductResult } from "@/lib/kroger";
import { getOrCreateListId } from "@/lib/lists";
import { getProfile } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export type Staple = { productId: number; name: string; category: string };

export type SearchState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; query: string; staples: Staple[]; products: ProductResult[]; priceNote: string };

/** Search our staples and Kroger's products. Prices come from the user's nearest store. */
export async function search(_previous: SearchState, formData: FormData): Promise<SearchState> {
  const query = String(formData.get("q") ?? "").trim().slice(0, 60);
  if (query.length < 2) return { status: "error", message: "Type at least 2 letters to search." };

  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Please sign in again." };

  // Staples: our basket items whose name or category contains every word typed.
  const words = query.toLowerCase().split(/\s+/);
  const { products } = await getPriceData();
  const staples = products
    .filter((p) => words.every((w) => `${p.name} ${p.category}`.toLowerCase().includes(w)))
    .map((p) => ({ productId: p.id, name: p.name, category: p.category }));

  // Prices from the Kroger-family store nearest the user's ZIP, if there is one.
  const { homeZip } = await getProfile(user.id);
  const store = homeZip ? (await getNearbyStores(homeZip, 1))[0] : undefined;
  const priceNote = store
    ? `Prices at ${store.name}.`
    : homeZip
      ? `No Kroger-family stores near ${homeZip} yet, so no prices. More chains are coming.`
      : "Save your ZIP on your account page to see prices.";
  try {
    const results = await searchProducts(query.toLowerCase(), store?.locationId ?? null);
    return { status: "done", query, staples, products: results, priceNote };
  } catch {
    return { status: "error", message: "Product search isn't working right now. Please try again in a minute." };
  }
}

/** The user's list id, or an error message. */
async function listForCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Please sign in again.");
  return getOrCreateListId(user.id);
}

export async function addStaple(productId: number) {
  const listId = await listForCurrentUser();
  const { products } = await getPriceData();
  const product = products.find((p) => p.id === productId);
  if (!product) return;
  const supabase = await createClient();
  await supabase
    .from("list_items")
    .upsert({ list_id: listId, product_id: product.id, description: product.name }, { onConflict: "list_id,product_id", ignoreDuplicates: true });
  refresh();
}

export async function addProduct(product: Pick<ProductResult, "productId" | "description" | "brand" | "size" | "imageUrl">) {
  if (!/^\d{1,20}$/.test(product.productId)) return; // Kroger product ids are digits
  const listId = await listForCurrentUser();
  const supabase = await createClient();
  await supabase.from("list_items").upsert(
    {
      list_id: listId,
      kroger_product_id: product.productId,
      description: product.description.slice(0, 200),
      brand: product.brand?.slice(0, 100) ?? null,
      size: product.size?.slice(0, 50) ?? null,
      image_url: product.imageUrl?.startsWith("https://www.kroger.com/") ? product.imageUrl : null,
    },
    { onConflict: "list_id,kroger_product_id", ignoreDuplicates: true },
  );
  refresh();
}

export async function setQuantity(itemId: number, quantity: number) {
  await listForCurrentUser();
  const supabase = await createClient();
  await supabase
    .from("list_items")
    .update({ quantity: Math.min(99, Math.max(1, Math.round(quantity))) })
    .eq("id", itemId);
  refresh();
}

export async function removeItem(itemId: number) {
  await listForCurrentUser();
  const supabase = await createClient();
  await supabase.from("list_items").delete().eq("id", itemId);
  refresh();
}
