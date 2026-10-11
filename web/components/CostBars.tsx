import type { ReactNode } from "react";
import { money } from "@/lib/format";

export type CostBar = {
  id: string | number;
  label: string;
  value: number;
  missing: number; // basket items not found there
  note?: ReactNode; // extra detail under the bar
};

/**
 * Horizontal bars of what the weekly basket costs at each store or city.
 * Bars start at $0 so their lengths are honest; the gap to the cheapest is written out.
 * With onSelect, each bar is a button that picks that store or city.
 * twoColumns flows the ranked list into two columns on wide screens (top to bottom, then right).
 */
export function CostBars({
  bars,
  selected,
  onSelect,
  twoColumns = false,
}: {
  bars: CostBar[];
  selected?: string | number | null;
  onSelect?: (id: string | number) => void;
  twoColumns?: boolean;
}) {
  const sorted = [...bars].sort((a, b) => a.value - b.value);
  const max = Math.max(...sorted.map((bar) => bar.value), 1);
  const cheapest = sorted[0]?.value ?? 0;

  return (
    <ul className={twoColumns ? "gap-x-8 md:columns-2" : ""}>
      {sorted.map((bar, index) => {
        const dimmed = selected != null && selected !== bar.id;
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{bar.label}</span>
              <span className="tabular-nums text-ink-2">
                <span className="font-semibold text-ink">{money(bar.value)}</span>
                <span className="ml-2 inline-block w-16 text-right text-xs text-muted">
                  {index === 0 ? "cheapest" : `+${money(bar.value - cheapest)}`}
                </span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${(bar.value / max) * 100}%` }} />
            </div>
            {(bar.note || bar.missing > 0) && (
              <p className="mt-1 text-xs text-muted">
                {bar.note}
                {bar.note && bar.missing > 0 && " · "}
                {bar.missing > 0 && `${bar.missing} item(s) not found here`}
              </p>
            )}
          </>
        );
        return (
          <li
            key={bar.id}
            className={`mb-1 break-inside-avoid transition-opacity ${dimmed ? "opacity-45 hover:opacity-80" : ""}`}
          >
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(bar.id)}
                aria-pressed={selected === bar.id}
                className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2/60"
              >
                {body}
              </button>
            ) : (
              <div className="px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
