/**
 * Resolve a HubSpot engagement timestamp input (ISO 8601 string OR
 * numeric epoch-ms string) to the epoch-ms-string format HubSpot's CRM
 * v3 API expects. Returns `null` if the input is undefined / unparseable.
 *
 * Used by create_note / create_task / create_call / create_meeting for
 * `hs_timestamp`, `hs_meeting_start_time`, `hs_meeting_end_time`.
 *
 * V1's per-handler pattern repeats `new Date(x).getTime().toString()`
 * across 4 files — this helper consolidates with NaN protection
 * (V1's createTask had it; createNote/Call/Meeting didn't).
 */
export function resolveTimestampMs(input: string | undefined): string | null {
  if (typeof input !== "string" || input.length === 0) return null;
  // Try epoch-ms string first (cheap path) — if it's already a clean
  // numeric string of reasonable length, return it as-is.
  if (/^\d{10,16}$/.test(input)) return input;
  const ms = new Date(input).getTime();
  if (!Number.isFinite(ms) || Number.isNaN(ms)) return null;
  return ms.toString();
}
