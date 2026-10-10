import { money } from "@/lib/format";

type Bar = { id: number; label: string; value: number; missing: number };

/**
 * Horizontal bars: what the weekly basket costs at each store.
 * Bars start at $0 so their lengths are honest; the gap to the cheapest is written out.
 */
export function StoreBars({ bars, selected }: { bars: Bar[]; selected: "all" | number }) {
  const sorted = [...bars].sort((a, b) => a.value - b.value);
  const max = Math.max(...sorted.map((bar) => bar.value), 1);
  const cheapest = sorted[0]?.value ?? 0;

  return (
    <ul className="space-y-3">
      {sorted.map((bar, index) => {
        const dimmed = selected !== "all" && selected !== bar.id;
        const gap = bar.value - cheapest;
        return (
          <li key={bar.id} className={dimmed ? "opacity-45 transition-opacity" : "transition-opacity"}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-ink">{bar.label}</span>
              <span className="tabular-nums text-ink-2">
                <span className="font-semibold text-ink">{money(bar.value)}</span>
                <span className="ml-2 inline-block w-16 text-right text-xs text-muted">
                  {index === 0 ? "cheapest" : `+${money(gap)}`}
                </span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-2" title={`${bar.label}: ${money(bar.value)}`}>
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(bar.value / max) * 100}%` }}
              />
            </div>
            {bar.missing > 0 && (
              <p className="mt-1 text-xs text-muted">{bar.missing} item(s) not found at this store</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
