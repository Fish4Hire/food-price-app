// Turns a street address into map coordinates using the U.S. Census Bureau's
// free geocoder (public, no account needed). Server side only.

export type GeocodeResult = { matched: string; lat: number; lon: number };

export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const params = new URLSearchParams({ address, benchmark: "Public_AR_Current", format: "json" });
  const response = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Geocoder failed: ${response.status}`);
  const body = await response.json();
  const match = body?.result?.addressMatches?.[0];
  if (!match) return null;
  return { matched: match.matchedAddress, lat: match.coordinates.y, lon: match.coordinates.x };
}

/** Miles between two points (straight line, "as the crow flies"). */
export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}
