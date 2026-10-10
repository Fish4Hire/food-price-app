"use client";

import { useState } from "react";
import { PriceChart, type ChartSeries } from "./PriceChart";

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: Infinity },
];

/** The price history chart with date-range presets above it. */
export function ItemChart({ series, unit, trackedDays }: { series: ChartSeries[]; unit: string; trackedDays: number }) {
  const [range, setRange] = useState(30);

  const latest = series.flatMap((s) => s.points.map(([day]) => day)).sort().at(-1);
  let visible = series;
  if (latest && Number.isFinite(range)) {
    const cutoff = new Date(`${latest}T12:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - range + 1);
    const from = cutoff.toISOString().slice(0, 10);
    visible = series.map((s) => ({ ...s, points: s.points.filter(([day]) => day >= from) }));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Date range" className="flex rounded-full border border-line bg-surface p-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              role="radio"
              aria-checked={range === r.days}
              onClick={() => setRange(r.days)}
              className={
                range === r.days
                  ? "rounded-full bg-ink px-3 py-1 text-sm font-medium text-page"
                  : "rounded-full px-3 py-1 text-sm text-ink-2 hover:text-ink"
              }
            >
              {r.label}
            </button>
          ))}
        </div>
        {trackedDays < 2 && (
          <p className="text-sm text-muted">Day 1 of tracking. The lines grow as prices are checked each morning.</p>
        )}
      </div>
      <PriceChart series={visible} unit={unit} />
    </div>
  );
}
