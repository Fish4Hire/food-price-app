"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { saveMenu, type SavePayload } from "@/app/save/actions";
import { APP_LABELS, appFromUrl, bookmarkletHref } from "@/lib/bookmarklet";
import { money } from "@/lib/format";

type Captured = { url: string; title: string; items: { name: string; price: number; desc?: string }[] };

const subscribeNothing = () => () => {};
const readHash = () => window.location.hash;

/** Shows the install button, or (when opened by the bookmarklet) the captured menu to confirm. */
export function SaveMenu() {
  const hash = useSyncExternalStore(subscribeNothing, readHash, () => "");
  const captured = parseCapture(hash);
  return captured ? <ConfirmCapture captured={captured} /> : <InstallButton />;
}

function parseCapture(hash: string): Captured | null {
  if (hash.length < 3) return null;
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice(1)));
    return Array.isArray(data?.items) ? data : null;
  } catch {
    return null;
  }
}

function InstallButton() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    // Set the javascript: address directly; React won't render javascript: links.
    linkRef.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">1. Add the button to your bookmarks bar</h2>
        <p className="mt-1 text-sm text-ink-2">
          Drag this button up onto your browser&apos;s bookmarks bar. (Don&apos;t see the bar? Press Ctrl+Shift+B, or
          Cmd+Shift+B on a Mac.)
        </p>
        <a
          ref={linkRef}
          onClick={(e) => {
            e.preventDefault();
            alert("Drag this button to your bookmarks bar, then click it while viewing a delivery app menu.");
          }}
          className="mt-4 inline-block cursor-grab rounded-full bg-accent px-5 py-2.5 font-medium text-accent-ink"
        >
          Save to Cheaper Eats
        </a>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">2. Click it on a menu</h2>
        <p className="mt-1 text-sm text-ink-2">
          Open a restaurant&apos;s menu on DoorDash, Uber Eats or Grubhub (on a computer), scroll so the menu loads, then
          click <strong>Save to Cheaper Eats</strong>. A new tab opens here so you can check the dishes and save them.
        </p>
      </section>
      <section className="rounded-2xl border border-line bg-surface p-6">
        <h2 className="font-semibold">3. Compare</h2>
        <p className="mt-1 text-sm text-ink-2">
          Saved menus are private to you. Search them on{" "}
          <Link href="/my-menus" className="font-medium text-accent hover:underline">
            My saved menus
          </Link>{" "}
          to compare the same dish across apps.
        </p>
      </section>
    </div>
  );
}

function guessRestaurantName(title: string): string {
  return title
    .split(/\s[|•·–-]\s/)[0]
    .replace(/\b(delivery|takeout|menu|order online|near me)\b.*$/i, "")
    .replace(/[\s,:-]+$/, "")
    .trim()
    .slice(0, 120);
}

function ConfirmCapture({ captured }: { captured: Captured }) {
  const app = appFromUrl(captured.url);
  const [name, setName] = useState(guessRestaurantName(captured.title));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function save() {
    setError(null);
    const payload: SavePayload = { url: captured.url, restaurantName: name, items: captured.items };
    startSaving(async () => {
      const result = await saveMenu(payload);
      if (result?.status === "error") setError(result.message);
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-surface p-6">
        <p className="text-sm text-ink-2">From {APP_LABELS[app] ?? app}</p>
        <label className="mt-2 block">
          <span className="text-sm font-medium text-ink">Restaurant name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block h-11 w-full rounded-xl border border-line bg-surface px-4 focus:border-accent focus:outline-none"
          />
        </label>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || !name.trim()}
            className="h-11 rounded-xl bg-accent px-5 font-medium text-accent-ink disabled:opacity-60"
          >
            {saving ? "Saving…" : `Save ${captured.items.length} dishes`}
          </button>
          <span className="text-sm text-muted">Private to you.</span>
        </div>
        {error && (
          <p className="mt-3 text-sm text-up" role="alert">
            {error}{" "}
            {error.includes("sign in") && (
              <Link href="/login" className="font-medium underline">
                Sign in
              </Link>
            )}
          </p>
        )}
      </section>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {captured.items.slice(0, 50).map((item, i) => (
          <li key={i} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <span className="text-ink">{item.name}</span>
            <span className="font-semibold tabular-nums">{money(item.price)}</span>
          </li>
        ))}
        {captured.items.length > 50 && (
          <li className="px-4 py-2.5 text-sm text-muted">…and {captured.items.length - 50} more</li>
        )}
      </ul>
    </div>
  );
}
