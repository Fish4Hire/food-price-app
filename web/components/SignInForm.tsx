"use client";

import { useActionState } from "react";
import { sendSignInLink, type SignInState } from "@/app/auth/actions";

/** Email box that sends a sign-in link, then shows "check your email". */
export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(sendSignInLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="rounded-xl bg-accent-soft p-5" role="status">
        <p className="font-semibold text-ink">Check your email</p>
        <p className="mt-1 text-ink-2">
          We sent a sign-in link to <span className="font-medium text-ink">{state.email}</span>. Open it on this device to
          finish signing in. It may take a minute, and it&apos;s worth checking your spam folder.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <label className="block">
        <span className="text-sm font-medium text-ink">Email address</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      {state.status === "error" && (
        <p className="text-sm text-up" role="alert">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-xl bg-accent font-medium text-accent-ink transition-opacity disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
