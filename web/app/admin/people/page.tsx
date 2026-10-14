import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActivityLog, type ActivityEntry } from "@/components/ActivityLog";
import { PeopleManager, type Person } from "@/components/PeopleManager";
import type { Tier } from "@/lib/access";
import { getAccess, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "People", robots: { index: false } };

// Owner and admins only; everyone else gets "page not found".
export default function PeoplePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">People</h1>
      <p className="mb-6 mt-2 text-ink-2">
        Everyone who signs up starts as a free user. Add someone by email to make them trusted (the full service, free)
        or paid, even before they sign up: it applies the moment they log in with that email.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const user = await getCurrentUser();
  if (!user || !(await getAccess()).isAdmin) notFound();

  const supabase = await createClient();
  const [{ data, error }, activity] = await Promise.all([
    supabase.rpc("admin_people"),
    supabase.rpc("admin_activity", { p_limit: 200 }),
  ]);
  if (error || activity.error) throw new Error("Couldn't load people");

  const people: Person[] = (data ?? []).map(
    (p: {
      email: string;
      user_id: string | null;
      joined_at: string | null;
      last_sign_in_at: string | null;
      tier: Tier;
      enters_prices: boolean;
      note: string | null;
      paid_until: string | null;
    }) => ({
      email: p.email,
      signedUp: p.user_id !== null,
      joinedAt: p.joined_at,
      lastSignInAt: p.last_sign_in_at,
      tier: p.tier,
      entersPrices: p.enters_prices,
      note: p.note,
      paidUntil: p.paid_until,
    }),
  );
  return (
    <>
      <PeopleManager people={people} />
      <ActivityLog entries={(activity.data ?? []) as ActivityEntry[]} />
    </>
  );
}
