import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your account has been deleted</h1>
      <p className="mt-3 text-ink-2">
        Your account, saved ZIP code and shopping lists are gone. Thanks for trying Cheaper Eats. You&apos;re welcome back
        anytime.
      </p>
      <Link href="/" className="mt-6 inline-block rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink">
        Back to prices
      </Link>
    </div>
  );
}
