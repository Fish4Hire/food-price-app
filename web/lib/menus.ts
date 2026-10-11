// Restaurant menu data for the Eat out tab: each dish's latest price, read from
// the restaurant's own website (see ../menus.py). Public, cached for an hour.

import { cacheLife } from "next/cache";
import { fetchAll } from "./data";

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
  lat: number | null;
  lon: number | null;
  price: number;
  fetchedAt: string;
};

type Row = {
  menu_item_id: number;
  name: string;
  section: string;
  description: string | null;
  location_id: number;
  restaurant: string;
  cuisine: string | null;
  address_line1: string | null;
  menu_url: string | null;
  latitude: number | null;
  longitude: number | null;
  price: number;
  fetched_at: string;
};

/** Every dish's latest price, cheapest first. */
export async function getDishes(): Promise<Dish[]> {
  "use cache";
  cacheLife("hours");

  const rows = await fetchAll<Row>(
    "latest_menu_prices?select=menu_item_id,name,section,description,location_id,restaurant,cuisine," +
      "address_line1,menu_url,latitude,longitude,price,fetched_at&order=price,menu_item_id",
  );
  return rows.map((row) => ({
    id: row.menu_item_id,
    name: row.name,
    section: row.section,
    description: row.description,
    restaurantId: row.location_id,
    restaurant: row.restaurant,
    cuisine: row.cuisine,
    address: row.address_line1,
    menuUrl: row.menu_url,
    lat: row.latitude,
    lon: row.longitude,
    price: Number(row.price),
    fetchedAt: row.fetched_at,
  }));
}
