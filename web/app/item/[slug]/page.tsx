import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemChart } from "@/components/ItemChart";
import type { ChartSeries } from "@/components/PriceChart";
import { getPriceData } from "@/lib/data";
import { money, perUnit, shortDay, shortStore } from "@/lib/format";
import { storeName } from "@/lib/model";
import type { Listing, Point } from "@/lib/types";

export async function generateStaticParams() {
  const { products } = await getPriceData();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: PageProps<"/item/[slug]">) {
  const { slug } = await params;
  const { products } = await getPriceData();
  const product = products.find((p) => p.slug === slug);
  return { title: product ? `${product.name} prices` : "Item not found" };
}

export default function ItemPage(props: PageProps<"/item/[slug]">) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <Link href="/" className="text-sm text-ink-2 hover:text-ink">
        ← All prices
      </Link>
      <Suspense fallback={<div className="mt-6 h-96 animate-pulse rounded-2xl bg-surface-2" />}>
        <ItemDetails params={props.params} />
      </Suspense>
    </div>
  );
}

const SERIES_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

async function ItemDetails({ params }: { params: PageProps<"/item/[slug]">["params"] }) {
  const { slug } = await params;
  return <ItemContent slug={slug} />;
}

async function ItemContent({ slug }: { slug: string }) {
  "use cache";
  cacheLife("hours");

  const { stores, products, listings, history } = await getPriceData();
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  const unit = product.unit_label;

  const itemListings = listings.filter((l) => l.product_id === product.id);
  const itemHistory = history.filter((h) => h.product_id === product.id);

  // One chart line per store.
  const series: ChartSeries[] = stores.map((store, i) => ({
    id: store.id,
    label: shortStore(store.name),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    points: itemHistory.filter((h) => h.location_id === store.id).map((h): Point => [h.day, h.price_per_unit]),
  }));
  const trackedDays = new Set(itemHistory.map((h) => h.day)).size;

  // Today's cheapest, and the lowest ever recorded.
  const cheapest = itemListings.reduce<Listing | null>(
    (best, l) => (!best || l.price_per_unit < best.price_per_unit ? l : best),
    null,
  );
  const lowest = itemHistory.reduce<(typeof itemHistory)[number] | null>(
    (best, h) => (!best || h.price_per_unit < best.price_per_unit ? h : best),
    null,
  );
  const storeCheapest = stores
    .map((s) => itemListings.filter((l) => l.location_id === s.id).sort((a, b) => a.price_per_unit - b.price_per_unit)[0])
    .filter(Boolean);
  const spread = storeCheapest.length
    ? Math.max(...storeCheapest.map((l) => l.price_per_unit)) - Math.min(...storeCheapest.map((l) => l.price_per_unit))
    : 0;

  // Every matching product, with its price at each store, cheapest first.
  const byListing = new Map<number, { first: Listing; perStore: Map<number, Listing> }>();
  for (const l of itemListings) {
    const entry = byListing.get(l.store_item_id) ?? { first: l, perStore: new Map() };
    entry.perStore.set(l.location_id, l);
    byListing.set(l.store_item_id, entry);
  }
  const table = [...byListing.values()]
    .map((entry) => ({ ...entry, best: Math.min(...[...entry.perStore.values()].map((l) => l.price_per_unit)) }))
    .sort((a, b) => a.best - b.best);

  return (
    <>
      <header className="mt-4">
        <p className="text-sm font-medium text-accent">{product.category}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
        <p className="mt-2 text-ink-2">
          Compared per {unit}. The weekly basket counts {product.basket_qty} {unit}.
        </p>
      </header>

      {/* Stat tiles */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Lowest today"
          value={cheapest ? perUnit(cheapest.price_per_unit, unit) : "—"}
          detail={cheapest ? `${cheapest.brand ?? cheapest.description} · ${shortStore(storeName(stores, cheapest.location_id))}` : "No prices today"}
        />
        <Stat
          label="In the weekly basket"
          value={cheapest ? money(cheapest.price_per_unit * product.basket_qty) : "—"}
          detail={`${product.basket_qty} ${unit} at the lowest price`}
        />
        <Stat
          label="Lowest recorded"
          value={lowest ? perUnit(lowest.price_per_unit, unit) : "—"}
          detail={lowest ? `${shortDay(lowest.day)} · ${shortStore(storeName(stores, lowest.location_id))}` : "—"}
        />
        <Stat
          label="Difference between stores"
          value={spread < 0.005 ? "None" : perUnit(spread, unit)}
          detail={spread < 0.005 ? "Same lowest price everywhere" : "Between the cheapest and priciest store"}
        />
      </section>

      {/* Chart */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">Lowest price per {unit}, by store</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">The cheapest matching product at each store, each day. Sale prices included.</p>
        <ItemChart series={series} unit={unit} trackedDays={trackedDays} />
      </section>

      {/* Every matching product */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">Every matching product today</h2>
          <p className="mt-1 text-sm text-ink-2">
            {table.length} {table.length === 1 ? "product counts" : "products count"} as &ldquo;{product.name}&rdquo;. Cheapest per {unit} first.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-3 py-3 text-right font-medium">Per {unit}</th>
                {stores.map((s) => (
                  <th key={s.id} className="px-3 py-3 text-right font-medium">
                    {shortStore(s.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map(({ first, perStore, best }, index) => (
                <tr key={first.store_item_id} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">
                      {first.description}
                      {index === 0 && (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">Best value</span>
                      )}
                    </p>
                    <p className="text-muted">{first.size}</p>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{perUnit(best, unit)}</td>
                  {stores.map((s) => {
                    const l = perStore.get(s.id);
                    return (
                      <td key={s.id} className="px-3 py-3 text-right tabular-nums">
                        {l ? (
                          <>
                            <span className="text-ink">{money(l.price)}</span>
                            {l.promo_price !== null && (
                              <span className="block text-xs">
                                <span className="rounded bg-sale-bg px-1 font-medium text-sale-ink">Sale</span>{" "}
                                <span className="text-muted line-through">{money(l.regular_price)}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-sm text-muted">{detail}</p>
    </div>
  );
}
