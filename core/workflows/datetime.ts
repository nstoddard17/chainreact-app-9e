/**
 * Q12 — Datetime helpers for action handlers.
 *
 * Pure functions only. No DB calls, no env reads.
 *
 * `resolveTimezone` currently does explicit-or-UTC. The workspace→user→UTC
 * fallback chain (V1's `resolveTimezone`) is deferred until V2 grows a
 * workspace/user-profile timezone preference. When that lands, expand this
 * helper's signature to accept `{ workspaceId?, userId? }` and add the DB
 * resolver as a separate seam.
 */
import type { ConfigFailure, RequireResult } from "./requireExplicitField";

const HHMM_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function resolveTimezone(input: {
  explicitTz?: string | null;
}): string {
  const tz = input.explicitTz?.trim();
  if (!tz || tz.toLowerCase() === "auto") return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

export function parseTimeOrFail(
  time: string | null | undefined,
  fieldPath: string,
): RequireResult<{ hours: number; minutes: number }> {
  if (typeof time !== "string" || !HHMM_24H.test(time)) {
    const failure: ConfigFailure = {
      success: false,
      category: "config",
      error: { code: "INVALID_FIELD_FORMAT", path: fieldPath },
      message: `Field '${fieldPath}' must be a 24-hour HH:MM time string (e.g. '09:30').`,
    };
    return { ok: false, failure };
  }
  const [h, m] = time.split(":");
  return { ok: true, value: { hours: Number(h), minutes: Number(m) } };
}

export function addMinutesToTime(time: string, minutesToAdd: number): string {
  const parsed = parseTimeOrFail(time, "addMinutesToTime");
  if (!parsed.ok) {
    throw new Error(
      `addMinutesToTime: invalid time '${time}' — must be 24-hour HH:MM`,
    );
  }
  const total =
    parsed.value.hours * 60 + parsed.value.minutes + Math.trunc(minutesToAdd);
  const wrapped = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60)
    .toString()
    .padStart(2, "0");
  const m = (wrapped % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
