"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteSavedMenu } from "@/app/save/actions";
import { APP_LABELS } from "@/lib/bookmarklet";
import { money, shortDay } from "@/lib/format";
import type { SavedMenu } from "@/lib/savedMenus";

/** Search across your saved delivery-app menus, cheapest first, to compare apps. */
export function MySavedMenus({ menus }: { menus: SavedMenu[] }) {
  const [query, setQuery] = useState("");
  const [deleting, startDeleting] = useTransition();
  const label = (app: string) => APP_LABELS[app] ?? app;

  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return menus
      .flatMap((m) => m.items.map((item) => ({ ...item, menu: m })))
      .filter((i) => words.every((w) => `${i.name} ${i.description ?? ""}`.toLowerCase().includes(w)))
      .sort((a, b) => a.price - b.price)
      .slice(0, 100);
  }, [menus, query]);

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search your saved menus, e.g. burrito, pad thai"
        aria-label="Search saved menus"
        className="h-11 w-full rounded-xl border border-line bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none"
      />

      {query && (
        <section>
          <p className="mb-2 text-sm text-muted">
            {results.length} {results.length === 1 ? "match" : "matches"}, cheapest first
          </p>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {results.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{r.name}</p>
                  <p className="text-sm text-ink-2">
                    {r.menu.restaurantName}{" "}
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs">{label(r.menu.app)}</span>
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{money(r.price)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Saved menus</h2>
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {menus.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">
                  {m.restaurantName}{" "}
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-normal">{label(m.app)}</span>
                </p>
                <p className="text-sm text-muted">
                  {m.items.length} dishes · saved {shortDay(m.savedAt.slice(0, 10))}
                  {m.pageUrl && (
                    <>
                      {" · "}
                      <a href={m.pageUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                        open in {label(m.app)}
                      </a>
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDeleting(() => deleteSavedMenu(m.id))}
                className="shrink-0 text-sm text-muted hover:text-up disabled:opacity-50"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
