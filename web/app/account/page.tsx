import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut } from "@/app/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { longDay } from "@/lib/format";

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

      <section className="rounded-2xl border border-dashed border-line-strong p-6">
        <p className="font-medium">Coming soon: prices near you</p>
        <p className="mt-1 text-sm text-ink-2">
          Save your home ZIP code to see the cheapest groceries at the stores closest to you.
        </p>
      </section>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:border-line-strong hover:text-ink"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
