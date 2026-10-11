"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, percent, perUnit, shortStore } from "@/lib/format";
import {
  basketCost,
  basketVsBenchmark,
  pickHistory,
  pickOffer,
  weeklyChange,
} from "@/lib/model";
import type { Personalization } from "@/lib/personal";
import type { DashboardItem, DashboardModel } from "@/lib/types";
import { CostBars } from "./CostBars";
import { Sparkline } from "./Sparkline";

type Sort = "category" | "price-low" | "price-high" | "change";

const SORTS: { value: Sort; label: string }[] = [
  { value: "category", label: "Category" },
  { value: "price-low", label: "Price: low to high" },
  { value: "price-high", label: "Price: high to low" },
  { value: "change", label: "Biggest weekly change" },
];

export function Dashboard({ model }: { model: DashboardModel }) {
  const { stores, metros, items } = model;
  const categories = useMemo(() => [...new Set(items.map((i) => i.category))], [items]);
  const priceCeiling = useMemo(() => {
    const prices = items.flatMap((i) => Object.values(i.offers).map((o) => o.price));
    return Math.ceil(Math.max(1, ...prices));
  }, [items]);

  const [metroName, setMetroName] = useState(metros[0]?.name ?? "");
  const [storeId, setStoreId] = useState<"all" | number>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [saleOnly, setSaleOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState(priceCeiling);
  const [sort, setSort] = useState<Sort>("category");

  // After the page loads, ask who this is and jump to their home city
  // (unless they've already picked a city themselves).
  const [personal, setPersonal] = useState<Personalization | null>(null);
  const pickedCity = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((response) => response.json() as Promise<Personalization>)
      .then((result) => {
        if (cancelled) return;
        setPersonal(result);
        if (result.status === "tracked" && !pickedCity.current) {
          setMetroName(result.metro);
          setStoreId("all");
        }
      })
      .catch(() => {}); // keep the default view
    return () => {
      cancelled = true;
    };
  }, []);

  // The stores being compared: every store in the chosen city, or just one.
  const metro = metros.find((m) => m.name === metroName) ?? metros[0];
  const metroStores = stores.filter((s) => metro.storeIds.includes(s.id));
  const store = useMemo(() => (storeId === "all" ? metro.storeIds : [storeId]), [storeId, metro]);

  const basket = basketCost(items, store);
  const bestStoreBasket = basketCost(items, metro.storeIds);
  const storeBars = metroStores.map((s) => ({ id: s.id, label: shortStore(s.name), ...basketTotal(items, [s.id]) }));
  const cityBars = metros.map((m) => {
    const vs = basketVsBenchmark(items, m.storeIds);
    return {
      id: m.name,
      label: m.name,
      ...basketTotal(items, m.storeIds),
      note: vs ? <VsAverage change={vs.change} /> : undefined,
    };
  });

  function chooseMetro(name: string) {
    pickedCity.current = true;
    setMetroName(name);
    setStoreId("all");
  }

  // Basket cost a week ago vs now, from each item's history (only once a week of data exists).
  const basketChange = useMemo(() => {
    let now = 0;
    let before = 0;
    for (const item of items) {
      const points = pickHistory(item, store);
      const change = weeklyChange(points);
      if (change === null) return null;
      const latest = points[points.length - 1][1];
      now += latest * item.basketQty;
      before += (latest / (1 + change)) * item.basketQty;
    }
    return before ? (now - before) / before : null;
  }, [items, store]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items
      .map((item) => {
        const picked = pickOffer(item, store);
        const history = pickHistory(item, store);
        return { item, picked, history, change: weeklyChange(history) };
      })
      .filter(({ item, picked }) => {
        if (!picked) return false;
        if (category && item.category !== category) return false;
        if (saleOnly && !picked.offer.onSale) return false;
        if (picked.offer.price > maxPrice) return false;
        if (needle) {
          const text = `${item.name} ${picked.offer.description}`.toLowerCase();
          if (!text.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        switch (sort) {
          case "price-low":
            return a.picked!.offer.price - b.picked!.offer.price;
          case "price-high":
            return b.picked!.offer.price - a.picked!.offer.price;
          case "change":
            return Math.abs(b.change ?? 0) - Math.abs(a.change ?? 0);
          default:
            return 0; // keep basket order, which is grouped by category
        }
      });
  }, [items, store, category, saleOnly, maxPrice, query, sort]);

  const vsAverage = basketVsBenchmark(items, store);
  const onSaleCount = items.filter((item) => pickOffer(item, store)?.offer.onSale).length;
  const filtersActive = category !== null || saleOnly || query !== "" || maxPrice < priceCeiling;
  const selectedStoreName = storeId === "all" ? null : stores.find((s) => s.id === storeId)?.name;

  function resetFilters() {
    setCategory(null);
    setSaleOnly(false);
    setQuery("");
    setMaxPrice(priceCeiling);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <PersonalBar personal={personal} metroName={metro.name} onGoHome={chooseMetro} />

      {/* Hero */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8 lg:col-span-3">
          <p className="text-sm font-medium text-accent">This week&apos;s basket</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight sm:text-6xl">{money(basket.total)}</p>
          <p className="mt-3 max-w-md text-ink-2">
            {items.length} everyday staples at the lowest price per unit
            {selectedStoreName
              ? ` at ${selectedStoreName}, ${metro.name}`
              : ` across ${metroStores.length} stores in ${metro.name}`}
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-sm">
            {basketChange !== null ? (
              <ChangePill change={basketChange} suffix="vs last week" />
            ) : (
              <span className="rounded-full bg-surface-2 px-3 py-1 text-ink-2">
                Tracking since {model.trackingSinceLabel} · weekly trends start after 7 days
              </span>
            )}
            {vsAverage && (
              <span title="Compared with the Bureau of Labor Statistics' latest U.S. average prices">
                <ChangePill change={vsAverage.change} suffix={`vs U.S. average (${vsAverage.count} items)`} />
              </span>
            )}
            <span className="rounded-full bg-sale-bg px-3 py-1 font-medium text-sale-ink">
              {onSaleCount} on sale now
            </span>
            <span className="rounded-full bg-surface-2 px-3 py-1 text-ink-2">Updated {model.updatedLabel}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 lg:col-span-2">
          <h2 className="font-semibold">Basket cost by store in {metro.name}</h2>
          <p className="mb-5 mt-1 text-sm text-ink-2">
            Shopping only at one store. Mixing stores costs {money(bestStoreBasket.total)}.
          </p>
          <CostBars bars={storeBars} selected={storeId === "all" ? null : storeId} />
        </div>
      </section>

      {/* Compare cities: click a city to see its stores and prices */}
      {metros.length > 1 && (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Basket cost by city</h2>
            <p className="text-sm text-ink-2">Cheapest option at each city&apos;s stores. Click a city to explore it.</p>
          </div>
          <CostBars bars={cityBars} selected={metro.name} onSelect={(id) => chooseMetro(String(id))} twoColumns />
        </section>
      )}

      {/* Filters: one row above everything they scope */}
      <section aria-label="Filters" className="mt-8 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {metros.length > 1 && (
            <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm">
              <span className="text-ink-2">City</span>
              <select
                value={metro.name}
                onChange={(e) => chooseMetro(e.target.value)}
                className="bg-transparent font-medium focus:outline-none"
              >
                {metros.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Segmented<"all" | number>
            label="Store"
            value={storeId}
            onChange={setStoreId}
            options={[
              { value: "all", label: "All stores" },
              ...metroStores.map((s) => ({ value: s.id, label: shortStore(s.name) })),
            ]}
          />
          <div className="relative min-w-48 flex-1">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search items or brands"
              aria-label="Search items or brands"
              className="h-10 w-full rounded-full border border-line bg-surface pl-9 pr-4 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
          <label className="flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm">
            <span className="text-ink-2">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="bg-transparent font-medium focus:outline-none"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            All items
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </Chip>
          ))}
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <Chip active={saleOnly} onClick={() => setSaleOnly(!saleOnly)}>
            On sale
          </Chip>
          <label className="ml-auto flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-1.5 text-sm">
            <span className="whitespace-nowrap text-ink-2">
              Max price <span className="inline-block w-12 font-medium tabular-nums text-ink">{money(maxPrice)}</span>
            </span>
            <input
              type="range"
              min={1}
              max={priceCeiling}
              step={0.5}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              aria-label="Maximum package price"
              className="w-28 accent-[var(--accent)] sm:w-36"
            />
          </label>
        </div>
      </section>

      {/* Items */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_8rem_7rem_1.5rem] gap-4 border-b border-line px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted md:grid">
          <span>Item · cheapest option</span>
          <span>Trend</span>
          <span className="text-right">Week</span>
          <span className="text-right">Per unit</span>
          <span className="text-right">Price</span>
          <span />
        </div>

        {rows.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <p className="font-medium">No items match these filters.</p>
            <button onClick={resetFilters} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
              Clear filters
            </button>
          </div>
        ) : (
          <ul>
            {rows.map(({ item, picked, history, change }, index) => {
              const showHeader = sort === "category" && (index === 0 || rows[index - 1].item.category !== item.category);
              return (
                <li key={item.slug}>
                  {showHeader && (
                    <p className="border-b border-line bg-surface-2/60 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-ink-2">
                      {item.category}
                    </p>
                  )}
                  <ItemRow
                    item={item}
                    offer={picked!.offer}
                    storeLabel={storeId === "all" ? shortStore(stores.find((s) => s.id === picked!.storeId)?.name ?? "") : null}
                    spread={storeId === "all" ? priceSpread(item, metro.storeIds) : null}
                    history={history}
                    change={change}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {filtersActive && rows.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Showing {rows.length} of {items.length} items ·{" "}
          <button onClick={resetFilters} className="font-medium text-accent hover:underline">
            clear filters
          </button>
        </p>
      )}
    </div>
  );
}

function basketTotal(items: DashboardItem[], storeIds: number[]) {
  const { total, missing } = basketCost(items, storeIds);
  return { value: total, missing };
}

/** "Same at all stores", or the price-per-unit range across the given stores. */
function priceSpread(item: DashboardItem, storeIds: number[]): { same: boolean; low: number; high: number } {
  const ppus = storeIds.flatMap((id) => (item.offers[id] ? [item.offers[id].ppu] : []));
  const low = Math.min(...ppus);
  const high = Math.max(...ppus);
  return { same: high - low < 0.005, low, high };
}

function ItemRow({
  item,
  offer,
  storeLabel,
  spread,
  history,
  change,
}: {
  item: DashboardItem;
  offer: DashboardItem["offers"][number];
  storeLabel: string | null;
  spread: { same: boolean; low: number; high: number } | null;
  history: DashboardItem["history"][number];
  change: number | null;
}) {
  return (
    <Link
      href={`/item/${item.slug}`}
      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2/60 md:grid-cols-[minmax(0,1fr)_7rem_6rem_8rem_7rem_1.5rem]"
    >
      <div className="min-w-0">
        <p className="font-medium text-ink">{item.name}</p>
        <p className="truncate text-sm text-ink-2">
          {offer.description}
          {offer.size && <span className="text-muted"> · {offer.size}</span>}
        </p>
        {(spread || item.benchmark) && (
          <p className="mt-0.5 text-xs text-muted">
            {spread &&
              (spread.same
                ? "Same price at all stores"
                : `Cheapest at ${storeLabel} · up to ${perUnit(spread.high, item.unit)} elsewhere`)}
            {spread && item.benchmark && " · "}
            {item.benchmark && <VsAverage change={(offer.ppu - item.benchmark.ppu) / item.benchmark.ppu} />}
          </p>
        )}
      </div>

      <div className="hidden md:block">
        <Sparkline points={history} />
      </div>
      <div className="hidden text-right text-sm md:block">
        {change === null ? <span className="text-muted">—</span> : <ChangeText change={change} />}
      </div>

      <div className="text-right">
        <p className="font-semibold tabular-nums text-ink">{perUnit(offer.ppu, item.unit)}</p>
        <p className="text-sm tabular-nums text-ink-2 md:hidden">{money(offer.price)}</p>
      </div>
      <div className="hidden text-right md:block">
        <p className="tabular-nums text-ink">{money(offer.price)}</p>
        {offer.onSale && (
          <p className="mt-0.5 text-xs">
            <span className="rounded bg-sale-bg px-1.5 py-0.5 font-medium text-sale-ink">Sale</span>{" "}
            <span className="text-muted line-through">{money(offer.regular)}</span>
          </p>
        )}
      </div>
      <span className="hidden text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink md:block" aria-hidden="true">
        →
      </span>
      {offer.onSale && (
        <p className="col-span-2 text-xs md:hidden">
          <span className="rounded bg-sale-bg px-1.5 py-0.5 font-medium text-sale-ink">Sale</span>{" "}
          <span className="text-muted">was {money(offer.regular)}</span>
        </p>
      )}
    </Link>
  );
}

/** "18% below U.S. avg", colored, with the words carrying the meaning too. */
function VsAverage({ change }: { change: number }) {
  if (Math.abs(change) < 0.005) return <span>about the U.S. average</span>;
  return (
    <span className={change < 0 ? "text-down" : "text-up"}>
      {Math.abs(change * 100).toFixed(0)}% {change < 0 ? "below" : "above"} U.S. avg
    </span>
  );
}

function ChangeText({ change }: { change: number }) {
  if (Math.abs(change) < 0.0005) return <span className="text-muted">no change</span>;
  return (
    <span className={change > 0 ? "text-up" : "text-down"}>
      {change > 0 ? "▲" : "▼"} {percent(change).replace(/^[+−]/, "")}
    </span>
  );
}

function ChangePill({ change, suffix }: { change: number; suffix: string }) {
  const up = change > 0.0005;
  const down = change < -0.0005;
  return (
    <span className="rounded-full bg-surface-2 px-3 py-1">
      <span className={up ? "font-medium text-up" : down ? "font-medium text-down" : "text-ink-2"}>
        {up ? "▲ " : down ? "▼ " : ""}
        {up || down ? percent(change) : "No change"}
      </span>{" "}
      <span className="text-ink-2">{suffix}</span>
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "rounded-full bg-ink px-3.5 py-1.5 text-sm font-medium text-page"
          : "rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-2 hover:border-line-strong hover:text-ink"
      }
    >
      {children}
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-10 w-full items-center overflow-x-auto rounded-full border border-line bg-surface p-1 sm:w-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={
            value === option.value
              ? "h-full flex-1 whitespace-nowrap rounded-full bg-accent px-3 text-sm font-medium text-accent-ink sm:flex-none sm:px-3.5"
              : "h-full flex-1 whitespace-nowrap rounded-full px-3 text-sm text-ink-2 hover:text-ink sm:flex-none sm:px-3.5"
          }
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true">
      <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m14 14 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * One line at the top saying whose prices you're looking at, with a nudge to
 * sign in or save a ZIP. Always the same height, so the page doesn't jump.
 */
function PersonalBar({
  personal,
  metroName,
  onGoHome,
}: {
  personal: Personalization | null;
  metroName: string;
  onGoHome: (metro: string) => void;
}) {
  const linkClass = "font-medium text-accent hover:underline";
  let message: React.ReactNode;

  switch (personal?.status) {
    case "tracked":
      message =
        personal.metro === metroName ? (
          <>
            Near <strong className="font-medium text-ink">{personal.zip}</strong>: your closest tracked store is{" "}
            {personal.nearestStoreName}.
          </>
        ) : (
          <>
            Viewing {metroName}.{" "}
            <button type="button" className={linkClass} onClick={() => onGoHome(personal.metro)}>
              Back to stores near {personal.zip}
            </button>
          </>
        );
      break;
    case "untracked":
      message = (
        <>
          We found {personal.nearbyCount} stores near {personal.zip} (closest: {personal.nearestName}) but don&apos;t track
          their prices yet. Showing {metroName} for now.
        </>
      );
      break;
    case "none-nearby":
      message = (
        <>
          We don&apos;t cover stores near {personal.zip} yet. More chains are on the way. Showing {metroName} for now.
        </>
      );
      break;
    case "no-zip":
      message = (
        <>
          Showing {metroName}.{" "}
          <Link href="/account" className={linkClass}>
            Save your home ZIP
          </Link>{" "}
          to see prices at stores near you.
        </>
      );
      break;
    case "signed-out":
      message = (
        <>
          Showing {metroName}.{" "}
          <Link href="/login" className={linkClass}>
            Sign in
          </Link>{" "}
          and save your ZIP to see prices near you.
        </>
      );
      break;
    default:
      message = <>Showing prices in {metroName}.</>;
  }

  return (
    <p className="mb-4 flex min-h-6 items-start gap-2 text-sm text-ink-2">
      <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true">
        <path
          d="M10 18s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="10" cy="8" r="2.2" fill="currentColor" />
      </svg>
      <span>{message}</span>
    </p>
  );
}
