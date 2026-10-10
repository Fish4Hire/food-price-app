import type { Point } from "@/lib/types";

const WIDTH = 96;
const HEIGHT = 28;
const PAD = 3;

/** A tiny trend line of price per unit. Decorative: the numbers sit next to it. */
export function Sparkline({ points }: { points: Point[] }) {
  if (points.length < 2) {
    return (
      <span className="inline-flex h-7 w-24 items-center text-xs text-muted" title="Trend appears after a few days of prices">
        <span className="mr-2 h-px w-8 border-t border-dashed border-line-strong" />
        new
      </span>
    );
  }

  const values = points.map(([, value]) => value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2);
  const y = (v: number) => (max === min ? HEIGHT / 2 : PAD + (1 - (v - min) / span) * (HEIGHT - PAD * 2));
  const path = points.map(([, v], i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = points.length - 1;

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true" className="text-ink-2">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r="2.5" fill="currentColor" />
    </svg>
  );
}
