import { TIER_LABELS, type Tier } from "@/lib/access";
import { shortDay } from "@/lib/format";

type AccessSnapshot = { tier: Tier; enters_prices: boolean; note: string | null; paid_until: string | null };

export type ActivityEntry = {
  at: string;
  actor_email: string | null;
  action: string;
  target_email: string | null;
  details: {
    from?: AccessSnapshot;
    to?: AccessSnapshot;
    store?: string;
    prices?: number;
    changed?: number;
  };
};

/** The activity log (newest first): access changes and price saves. Owner and admins only. */
export function ActivityLog({ entries }: { entries: ActivityEntry[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
      <p className="mb-4 mt-1 text-sm text-ink-2">
        Every change to someone&apos;s access and every price save, newest first. It can&apos;t be edited or deleted.
      </p>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-ink-2">
          Nothing yet.
        </p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {entries.map((e, i) => (
            <li key={`${e.at}-${i}`} className="px-5 py-3 text-sm">
              <p className="text-ink">
                <span className="font-medium">{e.actor_email ?? "System"}</span> {describe(e)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{when(e.at)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function describe(e: ActivityEntry): string {
  const d = e.details;
  if (e.action === "prices_saved") {
    const n = d.prices ?? 0;
    return `saved ${n} ${n === 1 ? "price" : "prices"} at ${d.store ?? "a store"}${
      d.changed !== undefined ? ` (${d.changed} new or changed)` : ""
    }`;
  }
  if (e.action === "access_changed" && d.from && d.to) {
    const changes: string[] = [];
    if (d.from.tier !== d.to.tier) changes.push(`${TIER_LABELS[d.from.tier]} → ${TIER_LABELS[d.to.tier]}`);
    if (d.from.enters_prices !== d.to.enters_prices)
      changes.push(d.to.enters_prices ? "can now enter prices" : "can no longer enter prices");
    if ((d.from.paid_until ?? null) !== (d.to.paid_until ?? null))
      changes.push(d.to.paid_until ? `paid through ${shortDay(d.to.paid_until.slice(0, 10))}` : "no paid end date");
    if ((d.from.note ?? null) !== (d.to.note ?? null)) changes.push("note updated");
    return `changed ${e.target_email ?? "someone"}: ${changes.length ? changes.join(", ") : "no changes"}`;
  }
  return e.action.replace(/_/g, " ");
}

/** Shown in the owner's time zone (Central), since the page is built on a server set to UTC. */
function when(at: string): string {
  return new Date(at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
    timeZoneName: "short",
  });
}
