// GET /api/me: what the home page should show for this visitor (see lib/personal.ts).
// The home page itself is pre-built for speed and asks this after it loads.

import { connection, NextResponse } from "next/server";
import { getPersonalization } from "@/lib/personal";

export async function GET() {
  await connection(); // always run per visitor, never cached
  try {
    return NextResponse.json(await getPersonalization(), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    // If anything goes wrong, the page simply shows its default view.
    return NextResponse.json({ status: "signed-out" }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
