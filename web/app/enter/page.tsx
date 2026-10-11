import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceEntry } from "@/components/PriceEntry";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { getEntryData } from "@/lib/priceEntry";

export const metadata: Metadata = { title: "Enter prices", robots: { index: false } };

// Only price checkers (app owners and helpers) can open this; others get "page not found".
export default function EnterPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Enter prices</h1>
      <p className="mb-6 mt-2 text-ink-2">
        Pick a store, type each shelf price and press Enter to jump to the next item. If something&apos;s on sale, put
        the sale price first and the normal price in &ldquo;reg&rdquo;. Only filled-in rows are saved.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user || !(await isOwner())) notFound();
  const { stores, items, last } = await getEntryData();
  if (!stores.length) return <p className="text-ink-2">No hand-checked stores yet.</p>;
  return <PriceEntry stores={stores} items={items} last={last} />;
}
