"use client";

import { useActionState, useTransition } from "react";
import { removeHomeAddress, saveHomeAddress, type AddressState } from "@/app/account/actions";

/** Optional home address for distances. Shows the saved one with a Remove button. */
export function HomeAddressForm({ currentAddress }: { currentAddress: string | null }) {
  const [state, formAction, pending] = useActionState<AddressState, FormData>(saveHomeAddress, { status: "idle" });
  const [removing, startRemoving] = useTransition();

  return (
    <div className="space-y-3">
      {currentAddress && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2 px-4 py-3 text-sm">
          <span>
            <span className="text-ink-2">Saved: </span>
            <span className="font-medium text-ink">{currentAddress}</span>
          </span>
          <button
            type="button"
            disabled={removing}
            onClick={() => startRemoving(() => removeHomeAddress())}
            className="font-medium text-up hover:underline disabled:opacity-50"
          >
            {removing ? "Removing…" : "Remove"}
          </button>
        </div>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <label className="block min-w-0 flex-1">
          <span className="text-sm font-medium text-ink">{currentAddress ? "Change address" : "Home address"}</span>
          <input
            name="address"
            required
            autoComplete="street-address"
            placeholder="123 Main St, San Antonio, TX 78205"
            className="mt-1 block h-11 w-full rounded-xl border border-line bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink transition-opacity disabled:opacity-60"
        >
          {pending ? "Checking…" : "Save"}
        </button>
        {state.status === "saved" && (
          <p className="w-full text-sm text-down" role="status">
            Saved as {state.matched}. Distances now use this address.
          </p>
        )}
        {state.status === "error" && (
          <p className="w-full text-sm text-up" role="alert">
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
