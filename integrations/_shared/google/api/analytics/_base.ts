/**
 * Google Analytics (GA4) API base URLs — Slice 3.GOOGLE-ANALYTICS-2.
 *
 * GA4 spans three hosts; each has an e2e-only env override so the
 * walkthrough's mock server can own the host without coupling to OAuth:
 *   - **Data API** (`analyticsdata.googleapis.com`) — runReport /
 *     runPivotReport / runRealtimeReport.
 *   - **Admin API** (`analyticsadmin.googleapis.com`) — conversionEvents
 *     list/create (and, in GA-3, accountSummaries / dataStreams).
 *   - **Measurement Protocol** (`www.google-analytics.com`) — mp/collect
 *     (send_event).
 *
 * Mirrors `integrations/_shared/google/api/docs/_base.ts`.
 */
export function analyticsDataApiBase(): string {
  return (
    process.env.GOOGLE_ANALYTICS_DATA_API_BASE ??
    "https://analyticsdata.googleapis.com"
  );
}

export function analyticsAdminApiBase(): string {
  return (
    process.env.GOOGLE_ANALYTICS_ADMIN_API_BASE ??
    "https://analyticsadmin.googleapis.com"
  );
}

export function measurementProtocolBase(): string {
  return (
    process.env.GOOGLE_ANALYTICS_MP_BASE ?? "https://www.google-analytics.com"
  );
}
