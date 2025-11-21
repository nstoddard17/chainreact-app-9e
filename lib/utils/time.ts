export const MINUTES_IN_DAY = 24 * 60;

/**
 * Convert a HH:mm (24-hour) string into minutes after midnight.
 */
export function timeStringToMinutes(value?: string | null): number | null {
  if (!value) return null;

  const [hourStr, minuteStr] = value.split(':');
  const hour = Number(hourStr);
  const minute = Number(minuteStr);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

/**
 * Convert minutes after midnight into HH:mm (24-hour) string.
 */
export function minutesToTimeString(totalMinutes: number): string {
  const normalized = normalizeMinutes(totalMinutes);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;

  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Format minutes after midnight into a human-friendly 12-hour display (e.g., 10:30 AM).
 */
export function formatMinutesForDisplay(
  totalMinutes: number,
  options: { uppercase?: boolean } = {}
): string {
  const normalized = normalizeMinutes(totalMinutes);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const hour12 = hour24 % 12 || 12;
  const period = hour24 >= 12 ? 'pm' : 'am';
  const suffix = options.uppercase ? period.toUpperCase() : period;

  return `${hour12}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

/**
 * Normalize minutes to keep them inside a single day window.
 */
export function normalizeMinutes(totalMinutes: number): number {
  let normalized = totalMinutes % MINUTES_IN_DAY;
  if (normalized < 0) {
    normalized += MINUTES_IN_DAY;
  }
  return normalized;
}

/**
 * Return the number of minutes elapsed since midnight for the current local time.
 */
export function getCurrentMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Round a minute count to the nearest interval (default 15 minutes).
 * Uses "nearest" strategy by default; use "ceil" to always round up.
 */
export function roundMinutesToInterval(
  minutes: number,
  interval: number = 15,
  strategy: "nearest" | "ceil" = "nearest"
): number {
  if (!Number.isFinite(minutes)) return 0;
  if (interval <= 0) return normalizeMinutes(minutes);

  const ratio = minutes / interval;
  const multiplier = strategy === "ceil" ? Math.ceil(ratio) : Math.round(ratio);

  return normalizeMinutes(multiplier * interval);
}
