"use client";

import { useTransition } from "react";
import { removeItem, setQuantity } from "@/app/list/actions";
import type { ListItem } from "@/lib/lists";
import { ProductImage } from "./ListSearch";

/** The items on the user's list, with quantity buttons and remove. */
export function ListItems({ items }: { items: ListItem[] }) {
  const [pending, startTransition] = useTransition();

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line-strong p-8 text-center">
        <p className="font-medium">Your list is empty</p>
        <p className="mt-1 text-sm text-ink-2">Search above to add groceries. Staples let us pick the cheapest brand.</p>
      </div>
    );
  }

  return (
    <ul className={`divide-y divide-line rounded-2xl border border-line bg-surface ${pending ? "opacity-70" : ""}`}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 p-4">
          <ProductImage url={item.imageUrl} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-ink">{item.description}</p>
            <p className="text-sm text-muted">
              {item.productId ? (
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">Any brand</span>
              ) : (
                [item.brand, item.size].filter(Boolean).join(" · ")
              )}
            </p>
          </div>
          <div className="flex items-center rounded-full border border-line" role="group" aria-label={`Quantity of ${item.description}`}>
            <button
              type="button"
              aria-label="One fewer"
              disabled={pending || item.quantity <= 1}
              onClick={() => startTransition(() => setQuantity(item.id, item.quantity - 1))}
              className="h-9 w-9 rounded-full text-lg text-ink-2 hover:text-ink disabled:opacity-30"
            >
              −
            </button>
            <span className="w-6 text-center tabular-nums" aria-live="polite">
              {item.quantity}
            </span>
            <button
              type="button"
              aria-label="One more"
              disabled={pending || item.quantity >= 99}
              onClick={() => startTransition(() => setQuantity(item.id, item.quantity + 1))}
              className="h-9 w-9 rounded-full text-lg text-ink-2 hover:text-ink disabled:opacity-30"
            >
              +
            </button>
          </div>
          <button
            type="button"
            aria-label={`Remove ${item.description}`}
            disabled={pending}
            onClick={() => startTransition(() => removeItem(item.id))}
            className="h-9 w-9 rounded-full text-muted hover:bg-surface-2 hover:text-up"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
