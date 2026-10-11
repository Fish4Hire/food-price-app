import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { DeleteAccount } from "@/components/DeleteAccount";
import { HomeZipForm } from "@/components/HomeZipForm";
import { getCurrentUser } from "@/lib/auth";
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
  const profile = await getProfile(user.id);

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

      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">Where you shop</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          Your ZIP code is private. We use it only to find the grocery stores closest to you.
        </p>
        <HomeZipForm currentZip={profile.homeZip} />
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
