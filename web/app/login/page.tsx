import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInForm } from "@/components/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in or create an account</h1>
        <p className="mt-2 text-ink-2">
          Enter your email and we&apos;ll send you a link. No password needed. New here? The link creates your free account.
        </p>
        <Suspense>
          <LinkError searchParams={props.searchParams} />
        </Suspense>
        <div className="mt-6">
          <SignInForm />
        </div>
      </div>
    </div>
  );
}

/** Shown when a sign-in link didn't work (expired, already used, or opened on another device). */
async function LinkError({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { error } = await searchParams;
  if (error !== "link") return null;
  return (
    <p className="mt-4 rounded-xl bg-sale-bg p-3 text-sm text-sale-ink" role="alert">
      That sign-in link didn&apos;t work. It may have expired or already been used. Please request a new one.
    </p>
  );
}
