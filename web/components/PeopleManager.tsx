"use client";

import { useActionState, useState } from "react";
import { setAccess, type AccessState } from "@/app/admin/people/actions";
import { TIER_LABELS, type Tier } from "@/lib/access";
import { shortDay } from "@/lib/format";

export type Person = {
  email: string;
  signedUp: boolean;
  joinedAt: string | null;
  lastSignInAt: string | null;
  tier: Tier;
  entersPrices: boolean;
  note: string | null;
  paidUntil: string | null;
};

const TIER_ORDER: Tier[] = ["owner", "admin", "trusted", "paid", "free"];
const TIER_HELP: Record<Exclude<Tier, "owner">, string> = {
  admin: "Manages people, enters prices",
  trusted: "Full service, free",
  paid: "Subscriber",
  free: "Free plan",
};
const TIER_STYLES: Record<Tier, string> = {
  owner: "bg-accent text-accent-ink",
  admin: "bg-ink text-page",
  trusted: "bg-accent-soft text-accent",
  paid: "bg-surface-2 text-ink",
  free: "border border-line text-ink-2",
};

/** Everyone, with groups and price-entry access the owner and admins can change. */
export function PeopleManager({ people }: { people: Person[] }) {
  const [filter, setFilter] = useState<Tier | "all">("all");
  const [query, setQuery] = useState("");
  const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, people.filter((p) => p.tier === t).length]));
  const shown = people.filter(
    (p) => (filter === "all" || p.tier === filter) && p.email.includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Add someone</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">
          They don&apos;t need an account yet. Nothing is emailed to them; tell them to sign in with this address.
        </p>
        <PersonForm key={people.length} />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", ...TIER_ORDER] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilter(t)}
            aria-pressed={filter === t}
            className={
              filter === t
                ? "rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-page"
                : "rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
            }
          >
            {t === "all" ? `Everyone ${people.length}` : `${TIER_LABELS[t]} ${counts[t]}`}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email"
          aria-label="Search email"
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-surface px-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none sm:max-w-56"
        />
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {shown.length === 0 && <li className="px-5 py-6 text-center text-sm text-ink-2">No one here yet.</li>}
        {shown.map((p) => (
          <li key={p.email} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="min-w-0 break-all font-medium text-ink">{p.email}</p>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TIER_STYLES[p.tier]}`}>
                {TIER_LABELS[p.tier]}
              </span>
              {p.entersPrices && (
                <span className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2">Enters prices</span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {p.signedUp
                ? `Joined ${shortDay(p.joinedAt!.slice(0, 10))}${p.lastSignInAt ? ` · last signed in ${shortDay(p.lastSignInAt.slice(0, 10))}` : ""}`
                : "Hasn't signed up yet"}
              {p.tier === "paid" && p.paidUntil && ` · paid through ${shortDay(p.paidUntil.slice(0, 10))}`}
              {p.note && ` · ${p.note}`}
            </p>
            {p.tier !== "owner" && (
              <>
                <GroupButtons person={p} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-accent hover:underline">
                    More options (price entry, note, paid date)
                  </summary>
                  <div className="mt-3">
                    <PersonForm key={`${p.tier}|${p.entersPrices}|${p.note}|${p.paidUntil}`} person={p} />
                  </div>
                </details>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One click moves a person to another group, keeping their other settings. */
function GroupButtons({ person }: { person: Person }) {
  const [state, formAction, pending] = useActionState<AccessState, FormData>(setAccess, { status: "idle" });
  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="email" value={person.email} />
      {person.entersPrices && <input type="hidden" name="enters_prices" value="on" />}
      <input type="hidden" name="note" value={person.note ?? ""} />
      <input type="hidden" name="paid_until" value={person.paidUntil?.slice(0, 10) ?? ""} />
      <div role="group" aria-label={`Group for ${person.email}`} className="flex flex-wrap gap-1.5">
        {(["admin", "trusted", "paid", "free"] as const).map((t) => (
          <button
            key={t}
            type="submit"
            name="tier"
            value={t}
            disabled={pending || person.tier === t}
            aria-pressed={person.tier === t}
            title={TIER_HELP[t]}
            className={
              person.tier === t
                ? `rounded-full px-3 py-1 text-xs font-medium ${TIER_STYLES[t]}`
                : "rounded-full border border-line bg-surface px-3 py-1 text-xs text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60"
            }
          >
            {TIER_LABELS[t]}
          </button>
        ))}
        {pending && <span className="self-center text-xs text-muted">Saving…</span>}
      </div>
      {state.status === "error" && (
        <p className="mt-1 text-xs text-up" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Add a new person (no `person`) or change an existing one. */
function PersonForm({ person }: { person?: Person }) {
  const [state, formAction, pending] = useActionState<AccessState, FormData>(setAccess, { status: "idle" });
  const [tier, setTier] = useState<Tier>(person?.tier ?? "trusted");
  const field =
    "h-10 rounded-xl border border-line bg-surface px-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none";

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {person ? (
        <input type="hidden" name="email" value={person.email} />
      ) : (
        <label className="block min-w-0 flex-1 basis-56">
          <span className="text-sm font-medium text-ink">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="friend@example.com"
            className={`${field} mt-1 block w-full`}
          />
        </label>
      )}
      <label className="block">
        <span className="text-sm font-medium text-ink">Group</span>
        <select
          name="tier"
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
          className={`${field} mt-1 block`}
        >
          {(["admin", "trusted", "paid", "free"] as const).map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}: {TIER_HELP[t]}
            </option>
          ))}
        </select>
      </label>
      {tier === "paid" && (
        <label className="block">
          <span className="text-sm font-medium text-ink">Paid through (optional)</span>
          <input
            name="paid_until"
            type="date"
            defaultValue={person?.paidUntil?.slice(0, 10) ?? ""}
            className={`${field} mt-1 block`}
          />
        </label>
      )}
      <label className="block min-w-0 flex-1 basis-40">
        <span className="text-sm font-medium text-ink">Note (only you see it)</span>
        <input
          name="note"
          defaultValue={person?.note ?? ""}
          maxLength={200}
          placeholder="e.g. my sister"
          className={`${field} mt-1 block w-full`}
        />
      </label>
      {tier === "admin" ? (
        <p className="flex h-10 items-center text-sm text-muted">Admins always enter prices</p>
      ) : (
        <label className="flex h-10 items-center gap-2 text-sm text-ink-2">
          <input
            name="enters_prices"
            type="checkbox"
            defaultChecked={person?.entersPrices ?? false}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          Can enter prices
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-accent-ink transition-opacity disabled:opacity-60"
      >
        {pending ? "Saving…" : person ? "Save" : "Add"}
      </button>
      {state.status === "saved" && (
        <p className="w-full text-sm text-down" role="status">
          Saved {state.email}.
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
