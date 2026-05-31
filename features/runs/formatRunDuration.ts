/**
 * Compact human-readable duration label for the Runs page.
 *
 * Renders the value the server already computed on the DTO
 * (`durationMs`). Falls back to `"—"` for `null` (a swept stale-
 * running row or a pre-COST-15B legacy row with no `finishedAt`).
 * Keeps the format short enough for the toolbar-style list rows:
 *
 *    `912ms` · `1.4s` · `12s` · `2m 14s` · `1h 7m` · `1d 3h`
 */
export function formatRunDuration(durationMs: number | null): string {
  if (durationMs === null) return "—";
  if (durationMs < 0) return "0ms";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 10) {
    // 1.4s, 9.9s — one decimal so the sub-10s slice still reads as
    // "fast" instead of all collapsing to "1s/2s".
    const rounded = Math.round(seconds * 10) / 10;
    return `${rounded}s`;
  }
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.floor(seconds - minutes * 60);
  if (minutes < 60) {
    return remSeconds === 0 ? `${minutes}m` : `${minutes}m ${remSeconds}s`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes - hours * 60;
  if (hours < 24) {
    return remMinutes === 0 ? `${hours}h` : `${hours}h ${remMinutes}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours - days * 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}

/**
 * Compact relative-time label for the run-start column. Keeps the
 * list dense — uses `2m`, `4h`, `3d`; falls back to a localized date
 * once the run is more than a week old.
 */
export function formatRunStartedAt(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}
