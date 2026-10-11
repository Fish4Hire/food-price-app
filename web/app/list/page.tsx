import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListItems } from "@/components/ListItems";
import { ListSearch } from "@/components/ListSearch";
import { getCurrentUser } from "@/lib/auth";
import { getListItems, getOrCreateListId } from "@/lib/lists";

export const metadata: Metadata = { title: "My list" };

export default function ListPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">My list</h1>
      <p className="mt-2 text-ink-2">
        Add what you buy. Soon we&apos;ll show the cheapest way to buy your whole list near you.
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

  return (
    <div className="mt-6 space-y-6">
      <ListSearch
        staplesOnList={items.flatMap((i) => (i.productId ? [i.productId] : []))}
        productsOnList={items.flatMap((i) => (i.krogerProductId ? [i.krogerProductId] : []))}
      />
      <section>
        <h2 className="mb-3 font-semibold">
          {items.length} {items.length === 1 ? "item" : "items"}
        </h2>
        <ListItems items={items} />
      </section>
    </div>
  );
}
