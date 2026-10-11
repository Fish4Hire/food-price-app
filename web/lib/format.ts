// Number and date formatting shared by server and browser code.

export function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

/** Price per unit: "$2.69/gal", or cents for small units: "7.4¢/oz". */
export function perUnit(value: number, unit: string): string {
  if (unit === "each") return `${money(value)} each`;
  if ((unit === "oz" || unit === "fl oz") && value < 1) {
    return `${(value * 100).toFixed(1)}¢/${unit}`;
  }
  return `${money(value)}/${unit}`;
}

/** "Oct 10" from "2026-10-10" (treated as a calendar day, no time zone shifts). */
export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Aug 2026" from "2026-08-01". */
export function monthLabel(period: string): string {
  return new Date(`${period.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Oct 10, 2:15 PM" in Houston time. */
export function houstonTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Chicago",
  });
}

export function percent(change: number): string {
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return `${sign}${Math.abs(change * 100).toFixed(1)}%`;
}

/** "Kroger - Polk" -> "Polk" for compact labels. */
export function shortStore(name: string): string {
  return name.replace(/^Kroger\s*-\s*/, "");
}
