// Account groups (see account_access in schema.sql). Plain values only, so both
// server and browser code can use them.

export type Tier = "owner" | "admin" | "trusted" | "paid" | "free";

// isAdmin is true for the owner too: both can manage people and read the activity log.
export type Access = { tier: Tier; isOwner: boolean; isAdmin: boolean; entersPrices: boolean };

export const TIER_LABELS: Record<Tier, string> = {
  owner: "Owner",
  admin: "Admin",
  trusted: "Trusted",
  paid: "Paid",
  free: "Free",
};

/** Does this group get the full service? Everyone except free does. */
export function hasFullAccess(tier: Tier): boolean {
  return tier !== "free";
}
