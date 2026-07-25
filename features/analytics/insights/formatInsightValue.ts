import type { ConnectedValueMeta } from "@/contracts/connectedAnalytics";

/**
 * Unit- and currency-aware value formatting for Custom Insights (CD-3A).
 *
 * Driven ENTIRELY by the result's `valueMeta` — never by assumptions:
 *   - currency uses the result's ISO code (zero-decimal currencies come out
 *     right via Intl); an unknown currency renders a plain number, never USD.
 *   - percent values are 0..1 fractions (the CS-1 convention) rendered
 *     honestly to one decimal.
 *   - null is "unavailable / no denominator", displayed as an em dash — it is
 *     NOT zero.
 * All numbers are en-US formatted.
 */

const UNIT_SUFFIX: Record<string, string> = {
  hours: " hrs",
  gallons: " gal",
  miles: " mi",
};

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms).toLocaleString("en-US")} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`;
  const totalMinutes = ms / 60_000;
  if (totalMinutes < 60) {
    const m = Math.floor(totalMinutes);
    const s = Math.round((ms - m * 60_000) / 1000);
    return s > 0 ? `${m} min ${s} s` : `${m} min`;
  }
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
}

export function formatInsightValue(
  value: number | null,
  meta: ConnectedValueMeta,
): string {
  if (value === null) return "—";
  switch (meta.unit) {
    case "count":
      return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
    case "percent":
      return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
    case "milliseconds":
      return formatDurationMs(value);
    case "currency":
      if (meta.currency) {
        try {
          return value.toLocaleString("en-US", { style: "currency", currency: meta.currency });
        } catch {
          // Unknown ISO code — fall through to the honest plain number.
        }
      }
      return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
    default:
      return (
        value.toLocaleString("en-US", { maximumFractionDigits: 2 }) +
        (UNIT_SUFFIX[meta.unit] ?? "")
      );
  }
}

/** Compact axis-tick form (never lies about magnitude; keeps units light). */
export function formatInsightTick(value: number, meta: ConnectedValueMeta): string {
  if (meta.unit === "percent") {
    return `${(value * 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}%`;
  }
  if (meta.unit === "milliseconds") {
    if (value >= 60_000) return `${Math.round(value / 60_000)}m`;
    if (value >= 1000) return `${Math.round(value / 1000)}s`;
    return `${Math.round(value)}ms`;
  }
  const compact =
    Math.abs(value) >= 1000
      ? value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (meta.unit === "currency" && meta.currency) {
    try {
      const parts = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: meta.currency,
      }).formatToParts(0);
      const symbol = parts.find((p) => p.type === "currency")?.value ?? "";
      return `${symbol}${compact}`;
    } catch {
      return compact;
    }
  }
  return compact;
}

/** How long ago, in friendly words ("just now", "5 minutes ago", "2 hours ago"). */
export function formatAgeSeconds(ageSeconds: number): string {
  if (ageSeconds < 60) return "just now";
  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
