"use client";

import { useActionState, useState } from "react";
import { deleteAccount, type DeleteState } from "@/app/account/actions";

/** "Delete account", with a second step where the person types "delete" to confirm. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deleteAccount, { status: "idle" });

  return (
    <section className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="font-semibold">Delete account</h2>
      <p className="mt-1 text-sm text-ink-2">
        Permanently deletes your account, saved ZIP code and shopping lists. This can&apos;t be undone.
      </p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 rounded-full border border-line px-4 py-2 text-sm font-medium text-up hover:border-up"
        >
          Delete my account…
        </button>
      ) : (
        <form action={formAction} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-ink">
              Type <strong>delete</strong> to confirm
            </span>
            <input
              name="confirm"
              autoComplete="off"
              autoFocus
              className="mt-1 block h-10 w-48 rounded-xl border border-line bg-surface px-3 focus:border-up focus:outline-none"
            />
          </label>
          {state.status === "error" && (
            <p className="text-sm text-up" role="alert">
              {state.message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-full bg-up px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {pending ? "Deleting…" : "Permanently delete"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full px-4 py-2 text-sm text-ink-2 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
