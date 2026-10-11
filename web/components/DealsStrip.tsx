import Link from "next/link";
import { money } from "@/lib/format";
import type { Deal } from "@/lib/types";

/** "On sale now": the biggest discounts on basket products at the chosen stores. */
export function DealsStrip({ deals, storeLabel }: { deals: Deal[]; storeLabel: (storeId: number) => string | null }) {
  if (!deals.length) return null;
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">On sale now</h2>
        <p className="text-sm text-muted">Biggest discounts on basket items here</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => {
          const off = Math.round(((deal.regular - deal.price) / deal.regular) * 100);
          const store = storeLabel(deal.storeId);
          return (
            <li key={`${deal.storeItemId}-${deal.storeId}`}>
              <Link
                href={`/item/${deal.slug}`}
                className="flex h-full gap-3 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sale-bg text-sm font-bold text-sale-ink">
                  −{off}%
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-muted">{deal.itemName}</span>
                  <span className="line-clamp-2 text-sm font-medium text-ink">{deal.description}</span>
                  <span className="mt-1 block text-sm tabular-nums">
                    <span className="font-semibold text-ink">{money(deal.price)}</span>{" "}
                    <span className="text-muted line-through">{money(deal.regular)}</span>
                    {deal.size && <span className="text-muted"> · {deal.size}</span>}
                    {store && <span className="text-muted"> · {store}</span>}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
