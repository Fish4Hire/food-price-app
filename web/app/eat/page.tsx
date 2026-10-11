import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EatSearch } from "@/components/EatSearch";
import { getCurrentUser } from "@/lib/auth";
import { shortDay } from "@/lib/format";
import { getDishes, isOwner } from "@/lib/menus";

export const metadata: Metadata = { title: "Eat out", robots: { index: false } };

// Private: only app owners can open this page; everyone else gets "page not found".
export default function EatPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <EatContent />
      </Suspense>
    </div>
  );
}

async function EatContent() {
  const user = await getCurrentUser();
  if (!user || !(await isOwner())) notFound();
  const dishes = await getDishes();
  const latest = dishes.reduce((max, d) => (d.fetchedAt > max ? d.fetchedAt : max), "");
  const restaurants = new Set(dishes.map((d) => d.restaurantId)).size;

  return (
    <>
      <p className="text-sm font-medium text-accent">San Antonio · private</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Eat out</h1>
      <p className="mb-6 mt-2 text-ink-2">
        {dishes.length.toLocaleString()} dishes from {restaurants} restaurants&apos; own websites
        {latest && <>, last checked {shortDay(latest.slice(0, 10))}</>}. Menu prices can change; check with the
        restaurant.
      </p>
      <EatSearch dishes={dishes} />
    </>
  );
}
