// GET /api/home: the signed-in user's own saved address coordinates, for showing
// distances in their browser. Never cached; returns nothing for anyone else.

import { connection, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProfile } from "@/lib/profile";

const PRIVATE = { headers: { "Cache-Control": "private, no-store" } };

export async function GET() {
  await connection();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ home: null, signedIn: false }, PRIVATE);
    const { homeLat, homeLon } = await getProfile(user.id);
    const home = homeLat !== null && homeLon !== null ? { lat: homeLat, lon: homeLon } : null;
    return NextResponse.json({ home, signedIn: true }, PRIVATE);
  } catch {
    return NextResponse.json({ home: null, signedIn: false }, PRIVATE);
  }
}
