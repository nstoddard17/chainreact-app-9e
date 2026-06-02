/**
 * Short "Mon DD, YYYY" formatter for team roster / invite dates
 * (Slice 4.TEAM-PAGE-1).
 *
 * UTC-based, same rationale as `features/apps/relativeDate.ts`: deterministic
 * SSR/CSR output (no client locale / timezone picking) until a workspace
 * timezone setting exists to thread through.
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

export function formatTeamDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
