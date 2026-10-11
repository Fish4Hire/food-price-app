"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { appFromUrl } from "@/lib/bookmarklet";
import { createClient } from "@/lib/supabase/server";

export type SavePayload = {
  url: string;
  restaurantName: string;
  items: { name: string; price: number; desc?: string }[];
};

export type SaveState = { status: "idle" } | { status: "error"; message: string };

/** Save a menu captured by the bookmarklet to the signed-in user's private saved menus. */
export async function saveMenu(payload: SavePayload): Promise<SaveState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Please sign in first, then click the button on the menu page again." };

  const items = (payload.items ?? [])
    .filter((i) => typeof i.name === "string" && i.name.trim() && Number.isFinite(i.price) && i.price >= 0 && i.price < 1000)
    .slice(0, 400);
  if (!items.length) return { status: "error", message: "There were no dishes with prices to save." };

  let url: string | null = null;
  try {
    const parsed = new URL(payload.url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.toString().slice(0, 500);
  } catch {}

  const supabase = await createClient();
  const { data: menu, error } = await supabase
    .from("saved_menus")
    .insert({
      user_id: user.id,
      app: appFromUrl(url ?? ""),
      restaurant_name: (payload.restaurantName || "Saved menu").trim().slice(0, 120),
      page_url: url,
    })
    .select("id")
    .single();
  if (error) return { status: "error", message: "We couldn't save this menu. Please try again." };

  const { error: itemsError } = await supabase.from("saved_menu_items").insert(
    items.map((i) => ({
      saved_menu_id: menu.id,
      name: i.name.trim().slice(0, 120),
      description: i.desc?.trim().slice(0, 300) || null,
      price: Math.round(i.price * 100) / 100,
    })),
  );
  if (itemsError) {
    await supabase.from("saved_menus").delete().eq("id", menu.id);
    return { status: "error", message: "We couldn't save this menu. Please try again." };
  }
  redirect("/my-menus");
}

export async function deleteSavedMenu(id: number) {
  const user = await getCurrentUser();
  if (!user) return;
  const supabase = await createClient();
  await supabase.from("saved_menus").delete().eq("id", id); // database rules: only your own
  refresh();
}
