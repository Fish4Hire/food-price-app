import { cacheLife } from "next/cache";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ItemChart } from "@/components/ItemChart";
import type { ChartSeries } from "@/components/PriceChart";
import { getPriceData } from "@/lib/data";
import { money, perUnit, shortDay, shortStore } from "@/lib/format";
import { benchmarkOn, buildBenchmark, cheapestPerDay, groupMetros, visibleStores } from "@/lib/model";
import type { Listing, Metro, Point } from "@/lib/types";

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

// One color per city, in a fixed order (validated for color-blind safety in globals.css).
const CITY_COLORS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--series-${n})`);

async function ItemDetails({ params }: { params: PageProps<"/item/[slug]">["params"] }) {
  const { slug } = await params;
  return <ItemContent slug={slug} />;
}

async function ItemContent({ slug }: { slug: string }) {
  "use cache";
  cacheLife("hours");

  const data = await getPriceData();
  const { products, listings, history, benchmarks } = data;
  const stores = visibleStores(data);
  const product = products.find((p) => p.slug === slug);
  if (!product) notFound();
  const unit = product.unit_label;
  const metros = groupMetros(stores);
  const metroOf = (storeId: number) => metros.find((m) => m.storeIds.includes(storeId))?.name ?? "";
  const storeLabel = (storeId: number) => shortStore(stores.find((s) => s.id === storeId)?.name ?? "");

  const shown = new Set(stores.map((s) => s.id));
  const itemListings = listings.filter((l) => l.product_id === product.id && shown.has(l.location_id));
  const itemHistory = history.filter((h) => h.product_id === product.id && shown.has(h.location_id));
  const benchmark = buildBenchmark(benchmarks, product.id);

  // One chart line per city: its cheapest store each day.
  const series: ChartSeries[] = metros.map((metro, i) => ({
    id: i,
    label: metro.name,
    color: CITY_COLORS[i % CITY_COLORS.length],
    points: cheapestPerDay(
      metro.storeIds.map((id) =>
        itemHistory.filter((h) => h.location_id === id).map((h): Point => [h.day, h.price_per_unit]),
      ),
    ),
  }));
  const days = [...new Set(itemHistory.map((h) => h.day))].sort();
  if (benchmark && days.length) {
    // The U.S. average as a dashed line: on each day, the latest month the BLS had published.
    series.push({
      id: -1,
      label: "U.S. avg",
      color: "var(--ink-2)",
      dashed: true,
      points: days.map((day): Point => [day, benchmarkOn(benchmark, day)]),
    });
  }

  // Today's cheapest listing in each city, cheapest city first.
  const cityRows = metros
    .map((metro, i) => ({ metro, color: CITY_COLORS[i % CITY_COLORS.length], best: cheapestAt(itemListings, metro) }))
    .filter((row): row is { metro: Metro; color: string; best: Listing } => row.best !== null)
    .sort((a, b) => a.best.price_per_unit - b.best.price_per_unit);
  const cheapestCity = cityRows[0];
  const priciestCity = cityRows[cityRows.length - 1];
  const lowest = itemHistory.reduce<(typeof itemHistory)[number] | null>(
    (best, h) => (!best || h.price_per_unit < best.price_per_unit ? h : best),
    null,
  );

  // Every matching product, with its lowest price in each city, cheapest first.
  const byListing = new Map<number, { first: Listing; all: Listing[] }>();
  for (const l of itemListings) {
    const entry = byListing.get(l.store_item_id) ?? { first: l, all: [] };
    entry.all.push(l);
    byListing.set(l.store_item_id, entry);
  }
  const table = [...byListing.values()]
    .map(({ first, all }) => ({
      first,
      perCity: metros.map((metro) => cheapestAt(all, metro)),
      best: Math.min(...all.map((l) => l.price_per_unit)),
    }))
    .sort((a, b) => a.best - b.best);

  return (
    <>
      <header className="mt-4">
        <p className="text-sm font-medium text-accent">{product.category}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">{product.name}</h1>
        <p className="mt-2 text-ink-2">
          Compared per {unit} across {metros.length} cities. The weekly basket counts {product.basket_qty} {unit}.
        </p>
      </header>

      {/* Stat tiles */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Cheapest city today"
          value={cheapestCity ? perUnit(cheapestCity.best.price_per_unit, unit) : "—"}
          detail={cheapestCity ? `${cheapestCity.metro.name} · ${storeLabel(cheapestCity.best.location_id)}` : "No prices today"}
        />
        <Stat
          label="Priciest city today"
          value={priciestCity ? perUnit(priciestCity.best.price_per_unit, unit) : "—"}
          detail={
            priciestCity && cheapestCity && priciestCity !== cheapestCity
              ? `${priciestCity.metro.name} · ${percentMore(priciestCity.best.price_per_unit, cheapestCity.best.price_per_unit)} more`
              : "Same everywhere"
          }
        />
        {benchmark ? (
          <Stat
            label="U.S. average"
            value={perUnit(benchmark.ppu, unit)}
            detail={
              cheapestCity
                ? `${vsAverageText(cheapestCity.best.price_per_unit, benchmark.ppu)} · ${benchmark.periodLabel}`
                : benchmark.periodLabel
            }
          />
        ) : (
          <Stat
            label="In the weekly basket"
            value={cheapestCity ? money(cheapestCity.best.price_per_unit * product.basket_qty) : "—"}
            detail={`${product.basket_qty} ${unit} at the lowest price`}
          />
        )}
        <Stat
          label="Lowest recorded"
          value={lowest ? perUnit(lowest.price_per_unit, unit) : "—"}
          detail={lowest ? `${shortDay(lowest.day)} · ${metroOf(lowest.location_id)}` : "—"}
        />
      </section>

      {/* Chart */}
      <section className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="font-semibold">Lowest price per {unit}, by city</h2>
        <p className="mb-4 mt-1 text-sm text-ink-2">The cheapest matching product in each city, each day. Sale prices included.</p>
        <ItemChart series={series} unit={unit} trackedDays={days.length} />
        {benchmark && (
          <p className="mt-4 text-sm text-muted">
            Dashed line: the Bureau of Labor Statistics&apos; monthly U.S. average price ({benchmark.periodLabel} is the
            latest). It averages all brands and stores, so it usually sits above the cheapest option shown here.
          </p>
        )}
      </section>

      {/* By city today (also the chart's table view) */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">Lowest price in each city today</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">City</th>
                <th className="px-3 py-3 font-medium">Cheapest option</th>
                <th className="px-3 py-3 text-right font-medium">Price</th>
                <th className="px-3 py-3 text-right font-medium">Per {unit}</th>
                {benchmark && <th className="px-5 py-3 text-right font-medium">vs U.S. avg</th>}
              </tr>
            </thead>
            <tbody>
              {cityRows.map(({ metro, color, best }) => (
                <tr key={metro.name} className="border-b border-line last:border-b-0">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-medium text-ink">
                      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} />
                      {metro.name}
                    </span>
                    <span className="block pl-5 text-muted">{storeLabel(best.location_id)}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className="text-ink">{best.description}</span>
                    <span className="block text-muted">{best.size}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {money(best.price)}
                    {best.promo_price !== null && (
                      <span className="block text-xs">
                        <span className="rounded bg-sale-bg px-1 font-medium text-sale-ink">Sale</span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{perUnit(best.price_per_unit, unit)}</td>
                  {benchmark && (
                    <td className="px-5 py-3 text-right tabular-nums">
                      <VsAverageCell ours={best.price_per_unit} average={benchmark.ppu} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Every matching product */}
      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold">Every matching product today</h2>
          <p className="mt-1 text-sm text-ink-2">
            {table.length} {table.length === 1 ? "product counts" : "products count"} as &ldquo;{product.name}&rdquo;.
            Lowest price in each city, cheapest per {unit} first.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Product</th>
                <th className="px-3 py-3 text-right font-medium">Per {unit}</th>
                {metros.map((m) => (
                  <th key={m.name} className="px-3 py-3 text-right font-medium">
                    {m.name.replace(/,.*$/, "")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map(({ first, perCity, best }, index) => (
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
                  {perCity.map((l, i) => (
                    <td key={metros[i].name} className="px-3 py-3 text-right tabular-nums">
                      {l ? (
                        <>
                          <span className="text-ink">{money(l.price)}</span>
                          {l.promo_price !== null && (
                            <span className="block text-xs">
                              <span className="rounded bg-sale-bg px-1 font-medium text-sale-ink">Sale</span>
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** The cheapest of these listings at any of a city's stores, or null. */
function cheapestAt(listings: Listing[], metro: Metro): Listing | null {
  let best: Listing | null = null;
  for (const l of listings) {
    if (metro.storeIds.includes(l.location_id) && (!best || l.price_per_unit < best.price_per_unit)) best = l;
  }
  return best;
}

function percentMore(high: number, low: number): string {
  return `${(((high - low) / low) * 100).toFixed(0)}%`;
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

function VsAverageCell({ ours, average }: { ours: number; average: number }) {
  const change = (ours - average) / average;
  if (Math.abs(change) < 0.005) return <span className="text-ink-2">about average</span>;
  return (
    <span className={change < 0 ? "text-down" : "text-up"}>
      {Math.abs(change * 100).toFixed(0)}% {change < 0 ? "below" : "above"}
    </span>
  );
}

/** "Today's lowest is 18% below" style text comparing a price to the U.S. average. */
function vsAverageText(ours: number, average: number): string {
  const change = (ours - average) / average;
  if (Math.abs(change) < 0.005) return "Lowest today is about average";
  return `Lowest today is ${Math.abs(change * 100).toFixed(0)}% ${change < 0 ? "below" : "above"}`;
}
