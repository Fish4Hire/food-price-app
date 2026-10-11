import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListItems } from "@/components/ListItems";
import { ListPricingView } from "@/components/ListPricingView";
import { ListSearch } from "@/components/ListSearch";
import { getCurrentUser } from "@/lib/auth";
import { priceList } from "@/lib/listPricing";
import { getListItems, getOrCreateListId, type ListItem } from "@/lib/lists";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "My list" };

export default function ListPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">My list</h1>
      <p className="mt-2 text-ink-2">
        Add what you buy, and we&apos;ll show the cheapest way to buy your whole list at stores near you.
      </p>
      <Suspense fallback={<div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <ListContent />
      </Suspense>
    </div>
  );
}

async function ListContent() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const items = await getListItems(await getOrCreateListId(user.id));
  const { homeZip } = await getProfile(user.id);

  return (
    <div className="mt-6 space-y-6">
      <ListSearch
        staplesOnList={items.flatMap((i) => (i.productId ? [i.productId] : []))}
        productsOnList={items.flatMap((i) => (i.krogerProductId ? [i.krogerProductId] : []))}
      />
      {/* Prices load separately, so the list itself shows right away */}
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-surface-2" />}>
        <Pricing items={items} homeZip={homeZip} />
      </Suspense>
      <section>
        <h2 className="mb-3 font-semibold">
          Your list · {items.length} {items.length === 1 ? "item" : "items"}
        </h2>
        <ListItems items={items} />
      </section>
    </div>
  );
}

async function Pricing({ items, homeZip }: { items: ListItem[]; homeZip: string | null }) {
  const pricing = await priceList(items, homeZip).catch(() => null);
  if (!pricing) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2">
        We couldn&apos;t load prices right now. Please try again in a minute.
      </p>
    );
  }
  return <ListPricingView pricing={pricing} />;
}
