"use client";

import { useActionState, useTransition } from "react";
import { addProduct, addStaple, search, type SearchState } from "@/app/list/actions";
import { money } from "@/lib/format";
import type { ProductResult } from "@/lib/kroger";

/** Search box plus results: staples (any brand) first, then specific Kroger products. */
export function ListSearch({ staplesOnList, productsOnList }: { staplesOnList: number[]; productsOnList: string[] }) {
  const [state, formAction, searching] = useActionState<SearchState, FormData>(search, { status: "idle" });
  const [adding, startAdding] = useTransition();

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <form action={formAction} className="flex gap-2">
        <input
          name="q"
          type="search"
          required
          minLength={2}
          defaultValue={state.status === "done" ? state.query : ""}
          placeholder="Search groceries, e.g. eggs, peanut butter, Barilla"
          aria-label="Search groceries"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={searching}
          className="h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink transition-opacity disabled:opacity-60"
        >
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {state.status === "error" && (
        <p className="mt-3 text-sm text-up" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "done" && (
        <div className={`mt-5 space-y-6 transition-opacity ${searching ? "opacity-50" : ""}`}>
          {state.staples.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink">Staples · any brand</h3>
              <p className="mb-2 text-xs text-muted">We&apos;ll find the cheapest brand for you.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {state.staples.map((staple) => {
                  const added = staplesOnList.includes(staple.productId);
                  return (
                    <li key={staple.productId} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
                      <div>
                        <p className="font-medium text-ink">{staple.name}</p>
                        <p className="text-xs text-muted">{staple.category}</p>
                      </div>
                      <AddButton added={added} disabled={adding} onAdd={() => startAdding(() => addStaple(staple.productId))} />
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">Products</h3>
            <p className="mb-2 text-xs text-muted">
              {state.storeName ? `Prices at ${state.storeName}.` : "Save your ZIP on your account page to see prices."}
            </p>
            {state.products.length === 0 ? (
              <p className="text-sm text-ink-2">No products found for &ldquo;{state.query}&rdquo;.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {state.products.map((product) => (
                  <ProductCard
                    key={product.productId}
                    product={product}
                    added={productsOnList.includes(product.productId)}
                    disabled={adding}
                    onAdd={() => startAdding(() => addProduct(product))}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function ProductCard({
  product,
  added,
  disabled,
  onAdd,
}: {
  product: ProductResult;
  added: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-line p-3">
      <ProductImage url={product.imageUrl} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium text-ink">{product.description}</p>
        <p className="text-xs text-muted">{product.size}</p>
        {product.price !== null && (
          <p className="mt-0.5 text-sm tabular-nums">
            <span className="font-semibold text-ink">{money(product.promo ?? product.price)}</span>
            {product.promo !== null && (
              <span className="ml-1.5 text-xs">
                <span className="rounded bg-sale-bg px-1 font-medium text-sale-ink">Sale</span>{" "}
                <span className="text-muted line-through">{money(product.price)}</span>
              </span>
            )}
          </p>
        )}
      </div>
      <AddButton added={added} disabled={disabled} onAdd={onAdd} />
    </li>
  );
}

export function ProductImage({ url }: { url: string | null }) {
  return url ? (
    // Kroger's product photos (plain img: they're already sized by Kroger's CDN)
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1" />
  ) : (
    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-xs text-muted">
      Any
      <br />
      brand
    </span>
  );
}

function AddButton({ added, disabled, onAdd }: { added: boolean; disabled: boolean; onAdd: () => void }) {
  if (added) {
    return <span className="shrink-0 rounded-full bg-accent-soft px-3 py-1.5 text-sm font-medium text-accent">Added ✓</span>;
  }
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled}
      className="shrink-0 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-ink hover:border-accent hover:text-accent disabled:opacity-50"
    >
      + Add
    </button>
  );
}
