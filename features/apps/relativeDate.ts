/**
 * Format an ISO date as the short "Connected on Mon DD, YYYY" string the
 * AppCard expanded section uses (Slice 4.APPS-PAGE-1).
 *
 * Pure — no client locale picking, no timezone conversion (server-rendered
 * accounts use UTC date math; the cost of cross-tz misformatting one day
 * is lower than the cost of inconsistent SSR/CSR output). If we add a
 * workspace timezone later, this helper picks it up via a parameter.
 */
const MONTHS: readonly string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatConnectedOn(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
