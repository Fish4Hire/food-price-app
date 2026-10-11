// Works out what the home page should show for the current visitor, based on
// their saved home ZIP: their nearest tracked city, or why we can't show one yet.

import { getCurrentUser } from "./auth";
import { getPriceData } from "./data";
import { getNearbyStores } from "./kroger";
import { getProfile } from "./profile";

export type Personalization =
  | { status: "signed-out" }
  | { status: "no-zip" }
  // Some stores near their ZIP are ones we track: show that city, nearest store first.
  | { status: "tracked"; zip: string; metro: string; nearestStoreId: number; nearestStoreName: string }
  // There are Kroger-family stores near them, but we don't track any of them yet.
  | { status: "untracked"; zip: string; nearbyCount: number; nearestName: string }
  // No Kroger-family stores within 25 miles at all.
  | { status: "none-nearby"; zip: string };

export async function getPersonalization(): Promise<Personalization> {
  const user = await getCurrentUser();
  if (!user) return { status: "signed-out" };
  const { homeZip } = await getProfile(user.id);
  if (!homeZip) return { status: "no-zip" };

  const nearby = await getNearbyStores(homeZip); // nearest first
  if (!nearby.length) return { status: "none-nearby", zip: homeZip };

  const { stores } = await getPriceData();
  for (const candidate of nearby) {
    const tracked = stores.find((s) => s.external_id === candidate.locationId && s.metro);
    if (tracked) {
      return {
        status: "tracked",
        zip: homeZip,
        metro: tracked.metro!,
        nearestStoreId: tracked.id,
        nearestStoreName: tracked.name,
      };
    }
  }
  return { status: "untracked", zip: homeZip, nearbyCount: nearby.length, nearestName: nearby[0].name };
}
