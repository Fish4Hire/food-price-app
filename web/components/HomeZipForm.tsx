"use client";

import { useActionState } from "react";
import { saveHomeZip, type ZipState } from "@/app/account/actions";

/** Lets a signed-in user save or change their home ZIP code. */
export function HomeZipForm({ currentZip }: { currentZip: string | null }) {
  const [state, formAction, pending] = useActionState<ZipState, FormData>(saveHomeZip, { status: "idle" });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-sm font-medium text-ink">Home ZIP code</span>
        <input
          name="zip"
          defaultValue={currentZip ?? ""}
          required
          inputMode="numeric"
          pattern="[0-9]{5}"
          maxLength={5}
          autoComplete="postal-code"
          placeholder="e.g. 77002"
          className="mt-1 block h-11 w-36 rounded-xl border border-line bg-surface px-4 tabular-nums placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink transition-opacity disabled:opacity-60"
      >
        {pending ? "Saving…" : currentZip ? "Update" : "Save"}
      </button>
      {state.status === "saved" && (
        <p className="w-full text-sm text-down" role="status">
          Saved. We&apos;ll use {state.zip} to find stores near you.
        </p>
      )}
      {state.status === "error" && (
        <p className="w-full text-sm text-up" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
