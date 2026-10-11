"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { perUnit, shortDay } from "@/lib/format";
import type { Point } from "@/lib/types";

/** dashed: a reference line (like the U.S. average) rather than a store. */
export type ChartSeries = { id: number; label: string; color: string; points: Point[]; dashed?: boolean };

const HEIGHT = 280;
const MARGIN = { top: 16, right: 96, bottom: 28, left: 56 };
const MAX_END_LABELS = 5; // more lines than this: rely on the legend and tooltip instead
const LABEL_GAP = 14; // min vertical space between end-of-line labels

const dayMs = (day: string) => Date.parse(`${day}T12:00:00Z`);

/** Rounded tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const ticks = [];
  const last = Math.ceil(max / step - 0.001) * step; // first tick at or above max
  for (let t = Math.floor(min / step) * step; t <= last + step * 0.001; t += step) ticks.push(t);
  return ticks;
}

/** Push labels apart so none overlap, keeping them inside the plot. */
function spreadLabels(ys: number[], top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    order[k].y = Math.max(order[k].y, order[k - 1].y + LABEL_GAP);
  }
  const overflow = order.length ? order[order.length - 1].y - bottom : 0;
  if (overflow > 0) order.forEach((o) => (o.y -= overflow));
  order.forEach((o) => (o.y = Math.max(o.y, top)));
  const out = new Array<number>(ys.length);
  order.forEach((o) => (out[o.i] = o.y));
  return out;
}

/**
 * Line chart of price per unit over time, one line per store.
 * Hover (or focus + arrow keys) shows every store's value for that day.
 */
export function PriceChart({ series, unit }: { series: ChartSeries[]; unit: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const days = useMemo(
    () => [...new Set(series.flatMap((s) => s.points.map(([day]) => day)))].sort(),
    [series],
  );
  const values = series.flatMap((s) => s.points.map(([, v]) => v));

  const showEndLabels = series.length > 1 && series.length <= MAX_END_LABELS;
  const plotW = Math.max(width - MARGIN.left - (showEndLabels ? MARGIN.right : 16), 10);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  // Y range with breathing room; a flat line sits in the middle.
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  const pad = (hi - lo) * 0.15 || Math.max(hi * 0.1, 0.01);
  lo = Math.max(0, lo - pad);
  hi = hi + pad;
  const ticks = niceTicks(lo, hi);
  lo = Math.min(lo, ticks[0]);
  hi = Math.max(hi, ticks[ticks.length - 1]);

  const t0 = days.length ? dayMs(days[0]) : 0;
  const t1 = days.length ? dayMs(days[days.length - 1]) : 1;
  const x = (day: string) =>
    MARGIN.left + (t1 === t0 ? plotW / 2 : ((dayMs(day) - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => MARGIN.top + (1 - (v - lo) / (hi - lo)) * plotH;

  // Up to ~6 evenly spaced date labels.
  const xTickEvery = Math.max(1, Math.ceil(days.length / Math.max(2, Math.floor(plotW / 90))));
  const xTicks = days.filter((_, i) => i % xTickEvery === 0 || i === days.length - 1);

  const endLabels = spreadLabels(
    series.map((s) => (s.points.length ? y(s.points[s.points.length - 1][1]) : MARGIN.top)),
    MARGIN.top + 4,
    MARGIN.top + plotH,
  );

  /** Reference lines (monthly averages) are flat steps spanning the whole plot. */
  function stepPath(points: Point[]): string {
    if (!points.length) return "";
    let d = `M${MARGIN.left},${y(points[0][1])}`;
    for (let i = 1; i < points.length; i++) {
      if (points[i][1] !== points[i - 1][1]) d += `H${x(points[i][0])}V${y(points[i][1])}`;
    }
    return `${d}H${MARGIN.left + plotW}`;
  }

  function indexFromPointer(clientX: number) {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    let best = 0;
    days.forEach((day, i) => {
      if (Math.abs(x(day) - px) < Math.abs(x(days[best]) - px)) best = i;
    });
    return best;
  }

  const hoverDay = hoverIndex !== null ? days[hoverIndex] : null;
  const hoverRows = hoverDay
    ? series
        .map((s) => ({ s, value: s.points.find(([day]) => day === hoverDay)?.[1] }))
        .filter((r): r is { s: ChartSeries; value: number } => r.value !== undefined)
    : [];
  const tooltipLeft = hoverDay ? x(hoverDay) : 0;

  return (
    <div>
      {/* Legend: line keys, always present for more than one store */}
      {series.length > 1 && (
        <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-2">
          {series.map((s) => (
            <li key={s.id} className="flex items-center gap-2">
              <LineKey series={s} className="w-4" />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      <div
        ref={wrapRef}
        className="relative touch-pan-y select-none"
        style={{ height: HEIGHT }}
        tabIndex={0}
        role="img"
        aria-label={`Price per ${unit} over time. Use left and right arrow keys to read values.`}
        onPointerMove={(e) => days.length && setHoverIndex(indexFromPointer(e.clientX))}
        onPointerLeave={() => setHoverIndex(null)}
        onBlur={() => setHoverIndex(null)}
        onKeyDown={(e) => {
          if (!days.length) return;
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            setHoverIndex((i) => Math.min(days.length - 1, Math.max(0, (i ?? days.length - 1) + step)));
          }
        }}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} className="block overflow-visible">
            {/* Gridlines and y labels */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={MARGIN.left} x2={MARGIN.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
                <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {perUnit(t, unit).replace(`/${unit}`, "")}
                </text>
              </g>
            ))}
            {/* X labels */}
            {xTicks.map((day) => (
              <text key={day} x={x(day)} y={HEIGHT - 8} textAnchor="middle" className="fill-muted text-[11px]">
                {shortDay(day)}
              </text>
            ))}

            {/* Crosshair */}
            {hoverDay && (
              <line x1={x(hoverDay)} x2={x(hoverDay)} y1={MARGIN.top} y2={MARGIN.top + plotH} stroke="var(--line-strong)" strokeWidth="1" />
            )}

            {/* Lines, each with a surface-colored ring so overlapping lines stay visible */}
            {series.map((s) => {
              const d = s.dashed ? stepPath(s.points) : s.points.map(([day, v], i) => `${i ? "L" : "M"}${x(day)},${y(v)}`).join("");
              return (
                <g key={s.id}>
                  <path d={d} fill="none" stroke="var(--surface)" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
                  <path
                    d={d}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.dashed ? "6 5" : undefined}
                  />
                  {s.points.length === 1 && !s.dashed && (
                    <circle cx={x(s.points[0][0])} cy={y(s.points[0][1])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
                  )}
                </g>
              );
            })}

            {/* Hover markers */}
            {hoverRows.map(({ s, value }) => (
              <circle key={s.id} cx={x(hoverDay!)} cy={y(value)} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />
            ))}

            {/* Direct labels at the end of each line (text in ink, key in series color) */}
            {showEndLabels &&
              series.map((s, i) =>
                s.points.length ? (
                  <g key={s.id}>
                    <line
                      x1={MARGIN.left + plotW + 8}
                      x2={MARGIN.left + plotW + 16}
                      y1={endLabels[i]}
                      y2={endLabels[i]}
                      stroke={s.color}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={s.dashed ? "3 2" : undefined}
                    />
                    <text x={MARGIN.left + plotW + 20} y={endLabels[i]} dy="0.32em" className="fill-ink-2 text-[11px]">
                      {s.label}
                    </text>
                  </g>
                ) : null,
              )}
          </svg>
        )}

        {/* Tooltip: value first, store second */}
        {hoverDay && hoverRows.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{
              left: tooltipLeft,
              transform: tooltipLeft > width / 2 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
            }}
          >
            <p className="mb-1 text-xs text-muted">{shortDay(hoverDay)}</p>
            {[...hoverRows]
              .sort((a, b) => a.value - b.value)
              .map(({ s, value }) => (
                <p key={s.id} className="flex items-center gap-2 whitespace-nowrap">
                  <LineKey series={s} className="w-3" />
                  <span className="font-semibold tabular-nums text-ink">{perUnit(value, unit)}</span>
                  <span className="text-ink-2">{s.label}</span>
                </p>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A short line in the series color: solid for stores, dashed for reference lines. */
function LineKey({ series, className }: { series: ChartSeries; className: string }) {
  return series.dashed ? (
    <span className={`border-t-2 border-dashed ${className}`} style={{ borderColor: series.color }} />
  ) : (
    <span className={`h-0.5 rounded-full ${className}`} style={{ background: series.color }} />
  );
}
