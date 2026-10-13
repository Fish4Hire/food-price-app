"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { money } from "@/lib/format";
import { milesBetween } from "@/lib/geocode";
import type { Dish } from "@/lib/menus";

type Home = { lat: number; lon: number };

const QUICK = ["tacos", "burger", "pho", "biryani", "crab", "pancakes", "enchiladas", "coffee", "pizza", "wings"];
const PAGE = 60;

/** "Eat out": search every dish across one city's restaurants, cheapest first. */
export function EatSearch({ dishes: allDishes }: { dishes: Dish[] }) {
  const [cityChoice, setCityChoice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<number | null>(null);
  const [maxPriceSetting, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<"low" | "high" | "near">("low");
  const [shown, setShown] = useState(PAGE);
  const [withinMiles, setWithinMiles] = useState<number | null>(null);

  // The visitor's own saved address (private), fetched after the page loads.
  const [home, setHome] = useState<Home | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/home")
      .then((response) => response.json() as Promise<{ home: Home | null; signedIn: boolean }>)
      .then((result) => {
        if (cancelled) return;
        setHome(result.home);
        setSignedIn(result.signedIn);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const distanceTo = (d: Dish) =>
    home && d.lat !== null && d.lon !== null ? milesBetween(home.lat, home.lon, d.lat, d.lon) : null;

  // Cities with menus, most dishes first. Until the visitor picks one, show the
  // city nearest their saved address (within 100 miles), else the biggest city.
  const cities = useMemo(() => cityCenters(allDishes), [allDishes]);
  const nearestCity = home
    ? cities
        .map((c) => ({ name: c.name, miles: milesBetween(home.lat, home.lon, c.lat, c.lon) }))
        .filter((c) => c.miles <= 100)
        .sort((a, b) => a.miles - b.miles)[0]?.name
    : undefined;
  const city = cityChoice ?? nearestCity ?? cities[0]?.name ?? null;
  const dishes = useMemo(() => allDishes.filter((d) => (d.metro ?? "Other") === city), [allDishes, city]);
  function chooseCity(name: string) {
    setCityChoice(name);
    setCuisine(null);
    setRestaurantId(null);
    setMaxPrice(null);
    setWithinMiles(null);
    setShown(PAGE);
  }

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
        if (withinMiles !== null) {
          const miles = distanceTo(d);
          if (miles === null || miles > withinMiles) return false;
        }
        const text = `${d.name} ${d.section} ${d.description ?? ""}`.toLowerCase();
        return words.every((w) => text.includes(w));
      })
      .sort((a, b) => {
        if (sort === "near") return (distanceTo(a) ?? 1e9) - (distanceTo(b) ?? 1e9) || a.price - b.price;
        return sort === "low" ? a.price - b.price : b.price - a.price;
      });
    // distanceTo only depends on home
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes, query, cuisine, restaurantId, maxPrice, sort, withinMiles, home]);

  const filtersOn = query || cuisine || restaurantId !== null || maxPriceSetting !== null || withinMiles !== null;
  function reset() {
    setQuery("");
    setCuisine(null);
    setRestaurantId(null);
    setMaxPrice(null);
    setWithinMiles(null);
    setShown(PAGE);
  }

  return (
    <div className="space-y-4">
      {cities.length > 1 && (
        <div role="group" aria-label="City" className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => chooseCity(c.name)}
              aria-pressed={c.name === city}
              className={
                c.name === city
                  ? "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink"
                  : "rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink-2 hover:text-ink"
              }
            >
              {c.name.split(",")[0]}
            </button>
          ))}
        </div>
      )}
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
          onChange={(e) => setSort(e.target.value as "low" | "high" | "near")}
          aria-label="Sort"
          className="h-11 rounded-xl border border-line bg-surface px-3 text-sm"
        >
          <option value="low">Cheapest first</option>
          <option value="high">Priciest first</option>
          {home && <option value="near">Nearest first</option>}
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
        {home && (
          <select
            value={withinMiles ?? ""}
            onChange={(e) => setWithinMiles(e.target.value ? Number(e.target.value) : null)}
            aria-label="Distance"
            className="h-10 rounded-full border border-line bg-surface px-3"
          >
            <option value="">Any distance</option>
            {[1, 3, 5, 10, 20].map((m) => (
              <option key={m} value={m}>
                Within {m} mi
              </option>
            ))}
          </select>
        )}
        {filtersOn && (
          <button type="button" onClick={reset} className="font-medium text-accent hover:underline">
            Clear
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        {results.length.toLocaleString()} {results.length === 1 ? "dish" : "dishes"}
        {query && <> matching &ldquo;{query}&rdquo;</>}
        {signedIn !== null && !home && (
          <>
            {" · "}
            <Link href={signedIn ? "/account" : "/login"} className="font-medium text-accent hover:underline">
              {signedIn ? "Add your address" : "Sign in and add your address"}
            </Link>{" "}
            to see how far each place is.
          </>
        )}
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
                  {distanceTo(d) !== null && <span className="text-muted"> · {distanceTo(d)!.toFixed(1)} mi</span>}
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

/** Each city's name and rough center (average restaurant location), most dishes first. */
function cityCenters(dishes: Dish[]): { name: string; lat: number; lon: number }[] {
  const byName = new Map<string, { name: string; dishes: number; lat: number; lon: number; located: number }>();
  for (const d of dishes) {
    const name = d.metro ?? "Other";
    const c = byName.get(name) ?? { name, dishes: 0, lat: 0, lon: 0, located: 0 };
    c.dishes += 1;
    if (d.lat !== null && d.lon !== null) {
      c.lat += d.lat;
      c.lon += d.lon;
      c.located += 1;
    }
    byName.set(name, c);
  }
  return [...byName.values()]
    .sort((a, b) => b.dishes - a.dishes)
    .map((c) => ({ name: c.name, lat: c.located ? c.lat / c.located : 0, lon: c.located ? c.lon / c.located : 0 }));
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
