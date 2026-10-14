import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { DeleteAccount } from "@/components/DeleteAccount";
import { HomeAddressForm } from "@/components/HomeAddressForm";
import { HomeZipForm } from "@/components/HomeZipForm";
import { TIER_LABELS, type Access } from "@/lib/access";
import { getAccess, getCurrentUser } from "@/lib/auth";
import { getPriceData } from "@/lib/data";
import { longDay } from "@/lib/format";
import { getNearbyStores } from "@/lib/kroger";
import { getProfile } from "@/lib/profile";

export const metadata: Metadata = { title: "Your account" };

export default function AccountPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Your account</h1>
      <Suspense fallback={<div className="mt-6 h-48 animate-pulse rounded-2xl bg-surface-2" />}>
        <AccountDetails />
      </Suspense>
    </div>
  );
}

async function AccountDetails() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [profile, access] = await Promise.all([getProfile(user.id), getAccess()]);

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-ink-2">Email</dt>
            <dd className="mt-1 font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Member since</dt>
            <dd className="mt-1 font-medium">{longDay(user.createdAt.slice(0, 10))}</dd>
          </div>
        </dl>
      </section>

      <PlanSection access={access} />

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Where you shop</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          Your ZIP code is private. We use it only to find the grocery stores closest to you.
        </p>
        <HomeZipForm currentZip={profile.homeZip} />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Your address (optional)</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          Add your address to see how far each restaurant is from you. It&apos;s private: only you can see it, and
          distances are worked out in your own browser.
        </p>
        <HomeAddressForm currentAddress={profile.homeAddress} />
      </section>

      {profile.homeZip && (
        <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
          <NearbyStores zip={profile.homeZip} />
        </Suspense>
      )}

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink"
        >
          Sign out
        </button>
      </form>

      <DeleteAccount />
    </div>
  );
}

const PLAN_TEXT: Record<Access["tier"], string> = {
  owner: "You run Cheaper Eats.",
  admin: "You're a Cheaper Eats admin: you can manage people and enter prices.",
  trusted: "You have the full Cheaper Eats service for free, courtesy of the owner.",
  paid: "Thanks for subscribing. You have the full Cheaper Eats service.",
  free: "Everything on Cheaper Eats is free right now.",
};

/** The user's group, plus links for admins (People) and price checkers (Enter prices). */
function PlanSection({ access }: { access: Access }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold">Your plan</h2>
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
          {TIER_LABELS[access.tier]}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-2">{PLAN_TEXT[access.tier]}</p>
      {(access.isAdmin || access.entersPrices) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {access.isAdmin && (
            <Link
              href="/admin/people"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90"
            >
              Manage people
            </Link>
          )}
          {access.entersPrices && (
            <Link
              href="/enter"
              className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink"
            >
              Enter prices
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

/** The Kroger-family stores closest to the user's ZIP, marking ones we already track. */
async function NearbyStores({ zip }: { zip: string }) {
  let stores;
  try {
    stores = await getNearbyStores(zip);
  } catch {
    return (
      <section className="rounded-2xl border border-line bg-surface p-6 text-sm text-ink-2">
        We couldn&apos;t look up stores near {zip} right now. Please try again later.
      </section>
    );
  }
  const data = await getPriceData();
  const active = new Set(data.listings.map((l) => l.location_id));
  const tracked = new Set(data.stores.filter((s) => s.metro && active.has(s.id)).map((s) => s.external_id));
  const anyTracked = stores.some((s) => tracked.has(s.locationId));

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold">Stores near {zip}</h2>
      {stores.length === 0 ? (
        <p className="mt-2 text-sm text-ink-2">
          We didn&apos;t find any Kroger-family stores within 25 miles of {zip}. Cheaper Eats can&apos;t show prices
          there yet, but we&apos;re adding more stores and chains.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-2">
            {anyTracked
              ? "Closest first. The home page shows prices for the tracked store nearest you."
              : `Closest first. We'll start checking prices at ${stores[0].name} each morning; they should appear on the home page after the next check.`}
          </p>
          <ul className="mt-4 divide-y divide-line">
            {stores.map((store) => (
              <li key={store.locationId} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium text-ink">{store.name}</p>
                  <p className="text-sm text-muted">
                    {store.address}, {store.city}, {store.state} {store.zip}
                  </p>
                </div>
                {tracked.has(store.locationId) && (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
                    Prices tracked
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
