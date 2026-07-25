import type { AnalyticsSourceExposure } from "@/contracts/analyticsCatalog";

/**
 * Source-exposure resolution (CD-3A).
 *
 * The catalog's declarative `exposure` state is the ONLY switch deciding
 * where a source appears and may be queried — no provider-name conditionals
 * anywhere. Two consumers:
 *   - `buildClientAnalyticsCatalog` filters the builder's source list.
 *   - `runConnectedAnalyticsQuery` refuses non-exposed sources exactly as if
 *     they didn't exist (UNKNOWN_SOURCE) — a crafted request can't reach an
 *     uncertified provider in production.
 *
 * "preview" sources (implemented but awaiting live certification, e.g.
 * Stripe pre-certification) are available in development/tests only.
 */

export type InsightsEnvironment = "production" | "development";

/** The runtime environment class for exposure decisions. */
export function currentInsightsEnvironment(): InsightsEnvironment {
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Whether a source with this exposure is available in this environment. */
export function isSourceExposed(
  exposure: AnalyticsSourceExposure,
  environment: InsightsEnvironment,
): boolean {
  if (exposure === "public") return true;
  if (exposure === "preview") return environment === "development";
  return false; // hidden — nowhere
}
