import {
  ProviderManifestSchema,
  type ProviderManifest,
} from "@/contracts/integration";

/**
 * Google Analytics (GA4) provider manifest — Slice 3.GOOGLE-ANALYTICS-2
 * (runtime port).
 *
 * Per the GOOGLE-ANALYTICS-1 audit (decisions D-GA1..5):
 *   - **GA4-only.** Data API v1beta (runReport / runPivotReport /
 *     runRealtimeReport), Admin API v1beta (conversionEvents list/create),
 *     and the Measurement Protocol (mp/collect). No Universal Analytics.
 *   - **Actions-only.** 6 handlers ship in this slice; triggers are deferred
 *     (GA4 has no clean push/webhook; a polling threshold trigger is
 *     fragile — D-GA3). `webhookTrigger` / `pollingTrigger` stay false.
 *
 * Auth — standard refreshable Google OAuth, identical to Docs / Sheets /
 * Drive / Gmail / Calendar (shared `_shared/google/oauth.ts`):
 *   - `tokenScope: "user"`, `oauthFlows: ["v2"]`, `refreshable: true`.
 *   - `accountIdField: "email"` — account identity comes from the OIDC
 *     userinfo endpoint (the `userinfo.email` scope), same as the other
 *     Google providers (GA's own APIs expose no getProfile-style endpoint).
 *
 * Scopes (D-GA2 — ship the full edit surface now; the Google OAuth
 * sensitive-scope verification is an INTERNAL launch-readiness gate, not a
 * code blocker and never surfaced in customer-facing copy):
 *   - `analytics.readonly` — run_report / run_pivot_report /
 *     get_realtime_data / find_conversion.
 *   - `analytics.edit`     — send_event (Measurement Protocol) +
 *     create_conversion_event (Admin API write).
 *   - `userinfo.email`     — OIDC account identity at callback time.
 *
 * `apiVersion: "v1beta"` — the GA4 Data + Admin API version the wrappers
 * target. Health-check interval 6h (CLAUDE.md "Google/Microsoft: 6h").
 */
export const googleAnalyticsManifest: ProviderManifest =
  ProviderManifestSchema.parse({
    id: "google-analytics",
    displayName: "Google Analytics",
    isEnabled: true,
    apiVersion: "v1beta",
    tokenScope: "user",
    oauthFlows: ["v2"],
    accountIdField: "email",
    scopes: {
      required: [
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/analytics.edit",
        "https://www.googleapis.com/auth/userinfo.email",
      ],
      optional: [],
      deprecated: [],
    },
    capabilities: {
      oauth: true,
      // Deferred (D-GA3) — GA4 has no push/webhook for the accepted surface;
      // a polling threshold trigger is fragile (processing latency,
      // backfills, snapshot/dedup ambiguity). Actions-only provider.
      webhookTrigger: false,
      pollingTrigger: false,
      // 6 action handlers ship in GOOGLE-ANALYTICS-2.
      actions: true,
    },
    healthCheckIntervalMs: 6 * 60 * 60 * 1000,
    refreshable: true,
  });
