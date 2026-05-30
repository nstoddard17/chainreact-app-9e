/**
 * Pure relative-time formatter for the workflows dashboard
 * (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Renders an ISO timestamp as a short, human-friendly age — "just now",
 * "3 minutes ago", "yesterday", "3 days ago", "last month" — to match the
 * design's `modified` column. Pure: takes the timestamp and (optional) `now`,
 * so tests can pass a fixed clock.
 */

export function formatRelativeTime(
  iso: string,
  now: Date = new Date(),
): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;

  const diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) return "just now";

  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;

  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;

  const week = Math.floor(day / 7);
  if (week === 1) return "last week";
  if (week < 5) return `${week} weeks ago`;

  const month = Math.floor(day / 30);
  if (month === 1) return "last month";
  if (month < 12) return `${month} months ago`;

  const year = Math.floor(day / 365);
  return year === 1 ? "last year" : `${year} years ago`;
}
