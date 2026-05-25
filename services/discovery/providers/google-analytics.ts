import type { ActionMeta } from "@/contracts/actionMeta";

/**
 * Google Analytics (GA4) discovery sub-registry — Slice
 * 3.GOOGLE-ANALYTICS-4 (actions only).
 *
 * Per-provider grouping of the 6 GA4 action meta imports — mirrors
 * `services/discovery/providers/facebook.ts` / `dropbox.ts`. Central registry
 * validation (`ActionMetaSchema.parse` + duplicate-key rejection) happens in
 * `services/discovery/_registry.ts`; this file is purely an import grouping.
 *
 * **Coverage:** 6 actions, 0 triggers.
 *
 * **Actions-only — triggers intentionally deferred/rejected (D-GA3).** GA4
 * has no clean push/webhook model for the accepted surface, and a polling
 * metric-threshold trigger is fragile (GA processing latency, backfills, and
 * snapshot/dedup ambiguity). No weak trigger is invented to match a count;
 * GA stays actions-only unless a future product requirement justifies a
 * carefully-designed polling trigger. The manifest's
 * `capabilities.webhookTrigger` / `pollingTrigger` stay `false`. The
 * meta-coverage structural test enforces action↔handler 1:1 only — trigger
 * coverage is not enforced (precedent: Stripe / Discord / Facebook).
 *
 * Action metas in displayOrder (10..60). All `category: "data"`,
 * `requiresIntegration: true`:
 *   10 - run_report            40 - find_conversion
 *   20 - run_pivot_report      50 - send_event
 *   30 - get_realtime_data     60 - create_conversion_event
 *
 * Resolver wiring (the 4 GA-3 keys):
 *   - `google-analytics:accounts` (no deps) — UI-scope `accountId` picker.
 *   - `google-analytics:properties` (dep accountId) — `propertyId` on every
 *     action (UI-scope on send_event).
 *   - `google-analytics:data_streams` (dep propertyId) — `measurementId` on
 *     send_event.
 *   - `google-analytics:conversion_events` (dep propertyId) —
 *     `conversionEventName` on find_conversion.
 *
 * `send_event.apiSecret` is a sensitive INPUT — `text` (no password
 * FieldType exists), clearly described as a secret, and NEVER an output.
 * Excluded per the GA-1 audit: create_measurement_secret + get_user_activity
 * are not implemented/registered. No FileRef actions.
 */

import { googleAnalyticsRunReportMeta } from "@/integrations/google-analytics/actions/runReport.meta";
import { googleAnalyticsRunPivotReportMeta } from "@/integrations/google-analytics/actions/runPivotReport.meta";
import { googleAnalyticsGetRealtimeDataMeta } from "@/integrations/google-analytics/actions/getRealtimeData.meta";
import { googleAnalyticsFindConversionMeta } from "@/integrations/google-analytics/actions/findConversion.meta";
import { googleAnalyticsSendEventMeta } from "@/integrations/google-analytics/actions/sendEvent.meta";
import { googleAnalyticsCreateConversionEventMeta } from "@/integrations/google-analytics/actions/createConversionEvent.meta";

export const GOOGLE_ANALYTICS_ACTION_METAS: ReadonlyArray<ActionMeta> = [
  googleAnalyticsRunReportMeta,
  googleAnalyticsRunPivotReportMeta,
  googleAnalyticsGetRealtimeDataMeta,
  googleAnalyticsFindConversionMeta,
  googleAnalyticsSendEventMeta,
  googleAnalyticsCreateConversionEventMeta,
];
