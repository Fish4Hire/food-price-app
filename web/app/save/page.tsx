import type { Metadata } from "next";
import { SaveMenu } from "@/components/SaveMenu";

export const metadata: Metadata = { title: "Save delivery app menus", robots: { index: false } };

export default function SavePage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Save delivery app menus</h1>
      <p className="mb-6 mt-2 text-ink-2">
        Compare what the same order costs on DoorDash, Uber Eats and Grubhub. Delivery app prices are often higher than the
        restaurant&apos;s own, but this shows which app is cheapest for you.
      </p>
      <SaveMenu />
    </div>
  );
}
