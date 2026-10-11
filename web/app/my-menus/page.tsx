import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { MySavedMenus } from "@/components/MySavedMenus";
import { getCurrentUser } from "@/lib/auth";
import { getSavedMenus } from "@/lib/savedMenus";

export const metadata: Metadata = { title: "My saved menus", robots: { index: false } };

export default function MyMenusPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <p className="text-sm font-medium text-accent">Private to you</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">My saved menus</h1>
      <p className="mb-6 mt-2 text-ink-2">
        Menus you saved from delivery apps with the{" "}
        <Link href="/save" className="font-medium text-accent hover:underline">
          Save to Cheaper Eats
        </Link>{" "}
        button. Search them to see which app has the dish cheapest.
      </p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-surface-2" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const menus = await getSavedMenus();
  if (!menus.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="font-medium">No saved menus yet</p>
        <p className="mt-1 text-sm text-ink-2">
          <Link href="/save" className="font-medium text-accent hover:underline">
            Add the Save to Cheaper Eats button
          </Link>
          , then click it on a DoorDash, Uber Eats or Grubhub menu.
        </p>
      </div>
    );
  }
  return <MySavedMenus menus={menus} />;
}
