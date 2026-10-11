import { cacheLife } from "next/cache";
import type { Metadata } from "next";
import { EatSearch } from "@/components/EatSearch";
import { CONTACT_EMAIL } from "@/components/LegalPage";
import { shortDay } from "@/lib/format";
import { getDishes } from "@/lib/menus";

export const metadata: Metadata = {
  title: "Eat out",
  description: "Search San Antonio restaurant menus and find the cheapest version of the dish you're craving.",
};

export default async function EatPage() {
  "use cache";
  cacheLife("hours");

  const dishes = await getDishes();
  const latest = dishes.reduce((max, d) => (d.fetchedAt > max ? d.fetchedAt : max), "");
  const restaurants = new Set(dishes.map((d) => d.restaurantId)).size;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-sm font-medium text-accent">San Antonio</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Eat out</h1>
      <p className="mb-6 mt-2 text-ink-2">
        {dishes.length.toLocaleString()} dishes from {restaurants} local restaurants, read from each restaurant&apos;s own
        website{latest && <> (last checked {shortDay(latest.slice(0, 10))})</>}. Prices can change, so check with the
        restaurant before you go.
      </p>
      <p className="mb-6 rounded-2xl border border-line bg-surface p-4 text-sm text-ink-2">
        <strong className="text-ink">Ordering delivery?</strong> Save menus from DoorDash, Uber Eats or Grubhub as you
        browse and compare which app is cheapest:{" "}
        <a href="/save" className="font-medium text-accent hover:underline">
          get the Save button
        </a>{" "}
        ·{" "}
        <a href="/my-menus" className="font-medium text-accent hover:underline">
          my saved menus
        </a>
      </p>
      <EatSearch dishes={dishes} />
      <p className="mt-8 text-xs text-muted">
        Restaurant owner? To update or remove your menu, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-ink">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </div>
  );
}
