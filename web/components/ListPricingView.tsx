import Link from "next/link";
import { money, shortStore } from "@/lib/format";
import type { ListPricing } from "@/lib/listPricing";

/** "Cheapest way to buy it": best single store, the best split, and a price table. */
export function ListPricingView({ pricing }: { pricing: ListPricing }) {
  if (pricing.status === "empty") return null;
  if (pricing.status === "no-zip") {
    return (
      <Notice>
        <Link href="/account" className="font-medium text-accent hover:underline">
          Save your home ZIP
        </Link>{" "}
        to see what your list costs at stores near you.
      </Notice>
    );
  }
  if (pricing.status === "no-stores") {
    return (
      <Notice>
        We don&apos;t have prices for stores near {pricing.zip} yet. If there are Kroger-family stores nearby, they&apos;re
        added at the next morning&apos;s price check. More chains are on the way.
      </Notice>
    );
  }

  const { stores, rows, totals, best, split } = pricing;
  const nameOf = (id: number) => shortStore(stores.find((s) => s.id === id)?.name ?? "");
  const itemCount = rows.length;

  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Cheapest way to buy it</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-2">Cheapest single store</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight">{money(best.total)}</p>
          <p className="mt-1 text-sm text-muted">
            {nameOf(best.storeId)} ·{" "}
            {best.found === itemCount ? `all ${itemCount} items` : `${best.found} of ${itemCount} items available`}
          </p>
        </div>
        <div className={`rounded-2xl border p-5 ${split ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}>
          {split ? (
            <>
              <p className="text-sm text-ink-2">Split between {split.storesUsed} stores</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{money(split.total)}</p>
              <p className="mt-1 text-sm font-medium text-down">Save {money(split.savings)} (cheapest store for each item is highlighted)</p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink-2">Splitting between stores</p>
              <p className="mt-2 text-sm text-ink-2">
                {stores.length > 1
                  ? "Wouldn't save enough to be worth a second trip. One store is your best bet."
                  : "Only one store near you has prices so far, so there's nothing to split."}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-medium uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Item</th>
              {stores.map((s) => (
                <th key={s.id} className="px-3 py-3 text-right font-medium">
                  {shortStore(s.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ item, costs }) => {
              const available = stores.map((s) => costs[s.id]?.total).filter((t): t is number => t !== undefined);
              const cheapest = available.length ? Math.min(...available) : null;
              return (
                <tr key={item.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">
                      {item.quantity > 1 && <span className="text-muted">{item.quantity} × </span>}
                      {item.description}
                    </p>
                    {item.productId && <p className="text-xs text-muted">Any brand</p>}
                  </td>
                  {stores.map((s) => {
                    const cost = costs[s.id];
                    if (!cost) {
                      return (
                        <td key={s.id} className="px-3 py-3 text-right text-muted" title="Not available at this store">
                          —
                        </td>
                      );
                    }
                    const isCheapest = stores.length > 1 && cost.total === cheapest;
                    return (
                      <td key={s.id} className={`px-3 py-3 text-right tabular-nums ${isCheapest ? "bg-accent-soft" : ""}`}>
                        <span className={isCheapest ? "font-semibold text-ink" : "text-ink-2"}>{money(cost.total)}</span>
                        {cost.onSale && (
                          <span className="ml-1 rounded bg-sale-bg px-1 text-xs font-medium text-sale-ink">Sale</span>
                        )}
                        {cost.detail && (
                          <span className="block max-w-40 truncate text-xs text-muted" title={cost.detail}>
                            {cost.detail}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong">
              <td className="px-4 py-3 font-semibold">Total</td>
              {totals.map((t) => (
                <td key={t.storeId} className="px-3 py-3 text-right tabular-nums">
                  <span className="font-semibold">{money(t.total)}</span>
                  {t.found < itemCount && <span className="block text-xs text-muted">{t.found} of {itemCount} items</span>}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        Any-brand staples use the cheapest option per unit at each store; specific products use that store&apos;s current
        price. Sale prices included.
      </p>
    </section>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong p-5 text-sm text-ink-2">{children}</p>;
}
