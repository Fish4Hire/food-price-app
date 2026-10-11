// Works out what the home page should show for the current visitor, based on
// their saved home ZIP: their nearest tracked city, or why we can't show one yet.

import { getCurrentUser } from "./auth";
import { getPriceData } from "./data";
import { getNearbyStores } from "./kroger";
import { buildDashboard, visibleStores } from "./model";
import { getProfile } from "./profile";
import type { DashboardArea } from "./types";

export type Personalization =
  | { status: "signed-out" }
  | { status: "no-zip" }
  // A store near their ZIP has prices. `area` is included when it's a store we
  // collect just for nearby users (not one of the public featured cities).
  | { status: "tracked"; zip: string; metro: string; nearestStoreId: number; nearestStoreName: string; area?: DashboardArea }
  // There are Kroger-family stores near them, but no prices yet (added at the next morning's check).
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

  const data = await getPriceData();
  const featured = visibleStores(data, "featured");
  const userAreas = visibleStores(data, "user");

  for (const candidate of nearby) {
    const store = [...featured, ...userAreas].find((s) => s.external_id === candidate.locationId);
    if (!store) continue;
    const result = {
      status: "tracked" as const,
      zip: homeZip,
      metro: store.metro!,
      nearestStoreId: store.id,
      nearestStoreName: store.name,
    };
    if (store.tracking === "featured") return result;

    // A user-area store: send this person their area's prices (and only theirs).
    const areaStores = userAreas.filter((s) => s.metro === store.metro);
    const model = buildDashboard(data, areaStores);
    const featuredNames = new Set(featured.map((s) => s.metro));
    const name = featuredNames.has(store.metro) ? `${store.metro} (near you)` : store.metro!;
    return {
      ...result,
      metro: name,
      area: {
        metro: { name, storeIds: areaStores.map((s) => s.id) },
        stores: model.stores.map((s) => ({ ...s, metro: name })),
        items: model.items.map(({ slug, offers, history }) => ({ slug, offers, history })),
        deals: model.deals,
      },
    };
  }
  return { status: "untracked", zip: homeZip, nearbyCount: nearby.length, nearestName: nearby[0].name };
}
