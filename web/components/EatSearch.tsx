"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { Dish } from "@/lib/menus";

const QUICK = ["tacos", "burger", "pho", "biryani", "crab", "pancakes", "enchiladas", "coffee", "pizza", "wings"];
const PAGE = 60;

/** "Eat out": search every dish across our restaurants, cheapest first. */
export function EatSearch({ dishes }: { dishes: Dish[] }) {
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [maxPriceSetting, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<"low" | "high">("low");
  const [shown, setShown] = useState(PAGE);

  const ceiling = useMemo(() => Math.ceil(Math.max(10, ...dishes.map((d) => d.price))), [dishes]);
  const maxPrice = maxPriceSetting ?? ceiling;
  const restaurants = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; cuisine: string }>();
    for (const d of dishes) byId.set(d.restaurantId, { id: d.restaurantId, name: d.restaurant, cuisine: cuisineLabel(d.cuisine) });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dishes]);
  const cuisines = useMemo(() => [...new Set(restaurants.map((r) => r.cuisine))].sort(), [restaurants]);

  const results = useMemo(() => {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean).map(singular);
    return dishes
      .filter((d) => {
        if (restaurantId !== null && d.restaurantId !== restaurantId) return false;
        if (cuisine && cuisineLabel(d.cuisine) !== cuisine) return false;
        if (d.price > maxPrice) return false;
        const text = `${d.name} ${d.section} ${d.description ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => (sort === "low" ? a.price - b.price : b.price - a.price));
  }, [dishes, query, cuisine, restaurantId, maxPrice, sort]);

  const filtersOn = query || cuisine || restaurantId !== null || maxPriceSetting !== null;
  function reset() {
    setQuery("");
    setCuisine(null);
    setRestaurantId(null);
    setMaxPrice(null);
    setShown(PAGE);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Search dishes, e.g. tacos, pho, burger"
          aria-label="Search dishes"
          autoFocus
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "low" | "high")}
          aria-label="Sort"
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="low">Cheapest first</option>
          <option value="high">Priciest first</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK.map((word) => (
          <button
            key={word}
            type="button"
            onClick={() => {
              setQuery(query === word ? "" : word);
              setShown(PAGE);
            }}
            aria-pressed={query === word}
            className={
              query === word
                ? "rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-page"
                : "rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-2 hover:text-ink"
            }
          >
            {word}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <select
          value={cuisine ?? ""}
          onChange={(e) => setCuisine(e.target.value || null)}
          aria-label="Cuisine"
          className="h-10 rounded-full border border-line bg-surface px-3"
        >
          <option value="">All cuisines</option>
          {cuisines.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          value={restaurantId ?? ""}
          onChange={(e) => setRestaurantId(e.target.value ? Number(e.target.value) : null)}
          aria-label="Restaurant"
          className="h-10 max-w-60 rounded-full border border-line bg-surface px-3"
        >
          <option value="">All {restaurants.length} restaurants</option>
          {restaurants.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-1.5">
          <span className="whitespace-nowrap text-ink-2">
            Up to <span className="inline-block w-14 font-medium tabular-nums text-ink">{money(maxPrice)}</span>
          </span>
          <input
            type="range"
            min={1}
            max={ceiling}
            step={1}
            value={maxPrice}
            onChange={(e) => setMaxPrice(Number(e.target.value))}
            aria-label="Maximum price"
            className="w-28 accent-[var(--accent)] sm:w-36"
          />
        </label>
        {filtersOn && (
          <button type="button" onClick={reset} className="font-medium text-accent hover:underline">
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        {results.length.toLocaleString()} {results.length === 1 ? "dish" : "dishes"}
        {query && <> matching &ldquo;{query}&rdquo;</>}
      </p>

      {results.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-ink-2">
          No dishes match. Try a different word or clear the filters.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {results.slice(0, shown).map((d) => (
            <li key={d.id} className="flex items-start justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{d.name}</p>
                <p className="text-sm text-ink-2">
                  {d.menuUrl ? (
                    <a href={d.menuUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent hover:underline">
                      {d.restaurant}
                    </a>
                  ) : (
                    d.restaurant
                  )}
                  {d.section && <span className="text-muted"> · {d.section}</span>}
                </p>
                {d.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{d.description}</p>}
              </div>
              <p className="shrink-0 text-lg font-semibold tabular-nums text-ink">{money(d.price)}</p>
            </li>
          ))}
        </ul>
      )}
      {results.length > shown && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE)}
          className="w-full rounded-xl border border-line bg-surface py-2.5 text-sm font-medium text-ink-2 hover:text-ink"
        >
          Show more ({(results.length - shown).toLocaleString()} left)
        </button>
      )}
    </div>
  );
}

/** "sandwich;pizza" -> "Sandwich"; missing -> "Other". */
function cuisineLabel(cuisine: string | null): string {
  const first = cuisine?.split(";")[0]?.trim();
  return first ? first.charAt(0).toUpperCase() + first.slice(1).replace(/_/g, " ") : "Other";
}

/** "tacos" also finds "taco"; "enchiladas" finds "enchilada". */
function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}
