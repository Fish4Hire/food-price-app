"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { saveEntries, type Entry, type SaveResult } from "@/app/enter/actions";
import { money, shortDay } from "@/lib/format";
import type { EntryItem, EntryStore, LastPrice } from "@/lib/priceEntry";

type Draft = { price: string; regular: string; size: string; description: string };

/**
 * Fast hand entry of shelf prices for one store: type a price, press Enter to
 * jump to the next item. Only filled-in rows are saved.
 */
export function PriceEntry({
  stores,
  items,
  last,
}: {
  stores: EntryStore[];
  items: EntryItem[];
  last: Record<number, LastPrice[]>;
}) {
  const [storeId, setStoreId] = useState(stores[0]?.id ?? 0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [category, setCategory] = useState("All");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, startSaving] = useTransition();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const categories = useMemo(() => ["All", ...new Set(items.map((i) => i.category))], [items]);
  const shown = items.filter((i) => category === "All" || i.category === category);
  const lastBySlug = useMemo(() => new Map((last[storeId] ?? []).map((p) => [p.slug, p])), [last, storeId]);
  const filled = items.filter((i) => Number(drafts[i.slug]?.price) > 0);

  function draftFor(item: EntryItem): Draft {
    const previous = lastBySlug.get(item.slug);
    return (
      drafts[item.slug] ?? {
        price: "",
        regular: "",
        size: String(previous?.sizeValue ?? item.defaultSize),
        description: previous?.description ?? "",
      }
    );
  }

  function update(item: EntryItem, change: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [item.slug]: { ...draftFor(item), ...change } }));
    setResult(null);
  }

  function chooseStore(id: number) {
    if (filled.length && !confirm("Switch stores? Prices you typed for this store haven't been saved.")) return;
    setStoreId(id);
    setDrafts({});
    setResult(null);
  }

  function save() {
    const entries: Entry[] = filled.map((item) => {
      const d = draftFor(item);
      return {
        slug: item.slug,
        unit: item.unit,
        price: Number(d.price),
        regular: d.regular ? Number(d.regular) : undefined,
        size: Number(d.size),
        description: d.description,
      };
    });
    startSaving(async () => {
      const outcome = await saveEntries(storeId, entries);
      setResult(outcome);
      if (outcome.ok) setDrafts({});
    });
  }

  const store = stores.find((s) => s.id === storeId);
  const cities = [...new Set(stores.map((s) => s.metro ?? "Other"))];

  return (
    <div className="pb-24">
      {cities.map((city) => (
        <div key={city} className="mb-3">
          {cities.length > 1 && <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{city}</p>}
          <div className="flex flex-wrap gap-2">
            {stores
              .filter((s) => (s.metro ?? "Other") === city)
              .map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => chooseStore(s.id)}
                aria-pressed={s.id === storeId}
                className={
                  s.id === storeId
                    ? "rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink"
                    : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 hover:text-ink"
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {store?.address && <p className="mt-2 text-sm text-muted">{store.address}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          className="h-10 rounded-full border border-line bg-surface px-3 text-sm"
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <p className="text-sm text-ink-2">
          {filled.length} of {items.length} entered · last checked: {lastBySlug.size} items
        </p>
      </div>

      <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
        {shown.map((item, index) => {
          const d = draftFor(item);
          const previous = lastBySlug.get(item.slug);
          return (
            <li key={item.slug} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="font-medium text-ink">{item.name}</p>
                <p className="text-xs text-muted">
                  {previous
                    ? `Last: ${money(previous.promo ?? previous.regular)}${previous.promo ? ` (sale, reg ${money(previous.regular)})` : ""} · ${shortDay(previous.checkedAt.slice(0, 10))}`
                    : "Not checked yet"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 text-sm">
                  <span className="text-muted">$</span>
                  <input
                    ref={(el) => {
                      inputs.current[index] = el;
                    }}
                    inputMode="decimal"
                    placeholder="price"
                    aria-label={`Price of ${item.name}`}
                    value={d.price}
                    onChange={(e) => update(item, { price: e.target.value.replace(/[^\d.]/g, "") })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        inputs.current[index + 1]?.focus();
                      }
                    }}
                    className="h-10 w-24 rounded-lg border border-line bg-surface px-2 tabular-nums focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  sale? reg $
                  <input
                    inputMode="decimal"
                    aria-label={`Regular price of ${item.name} if on sale`}
                    value={d.regular}
                    onChange={(e) => update(item, { regular: e.target.value.replace(/[^\d.]/g, "") })}
                    className="h-10 w-20 rounded-lg border border-line bg-surface px-2 tabular-nums focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    inputMode="decimal"
                    aria-label={`Package size of ${item.name} in ${item.sizeUnit}`}
                    value={d.size}
                    onChange={(e) => update(item, { size: e.target.value.replace(/[^\d.]/g, "") })}
                    className="h-10 w-16 rounded-lg border border-line bg-surface px-2 tabular-nums focus:border-accent focus:outline-none"
                  />
                  {item.sizeUnit}
                </label>
                <input
                  placeholder="brand (optional)"
                  aria-label={`Brand or product for ${item.name}`}
                  value={d.description}
                  onChange={(e) => update(item, { description: e.target.value })}
                  className="h-10 w-40 rounded-lg border border-line bg-surface px-2 text-sm focus:border-accent focus:outline-none"
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <p className="text-sm" role="status">
            {result?.ok && (
              <span className="text-down">
                Saved: {result.added} new or changed, {result.confirmed} unchanged.
              </span>
            )}
            {result && !result.ok && <span className="text-up">{result.message}</span>}
            {!result && <span className="text-ink-2">{store?.name}</span>}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={saving || !filled.length}
            className="h-11 shrink-0 rounded-xl bg-accent px-5 font-medium text-accent-ink disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${filled.length || ""} ${filled.length === 1 ? "price" : "prices"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
