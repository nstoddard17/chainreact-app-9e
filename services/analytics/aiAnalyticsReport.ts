import * as aiCostEventsRepo from "@/repositories/aiCostEvents";
import type { AiCostEventRecord } from "@/repositories/aiCostEvents";
import {
  getAiCustomNodeSignalStats,
  getAiFeedbackStats,
  getAiPatchOutcomeStats,
  getAiSafetyBlockStats,
  getAiTemplateSignalStats,
  getAiToolStats,
  getAiValidationFailureStats,
  groupAiByFeature,
  groupAiByModel,
  summarizeAiUsage,
  type AiCustomNodeSignalStats,
  type AiFeatureStat,
  type AiFeedbackStats,
  type AiModelStat,
  type AiPatchOutcomeStats,
  type AiTemplateSignalStats,
  type AiToolStats,
  type AiUsageOverview,
} from "@/services/analytics/ownerAiStats";

/**
 * AI analytics REPORT builder (Slice 4.AI-12).
 *
 * Composes the COST-7 pure folds (`ownerAiStats`) into one combined report the
 * AI analytics route returns. READ-ONLY: no model calls, no mutation, no
 * ledger writes. COST-7 behavior is unchanged — this only assembles its folds.
 *
 * No-leak: the folds read only ids / enums / counts / model+feature names /
 * token+latency+cost numbers, and metadata KEY-presence (never metadata VALUES),
 * so no raw prompt / completion / config / secret can appear in the report.
 *
 * Scope (4.ACCOUNT-MODEL-9d): `getAiAnalyticsForAccount` loads via the RLS-gated
 * `listByAccount`, so it only ever sees events for accounts the caller is a
 * member of. Owner/admin CROSS-account reporting needs an admin gate (not yet
 * present in V2) + the service-role `listEventsForAnalytics`.
 */

export interface AiAnalyticsReport {
  readonly overview: AiUsageOverview;
  readonly byFeature: Record<string, AiFeatureStat>;
  readonly byModel: Record<string, AiModelStat>;
  readonly patchOutcomes: AiPatchOutcomeStats;
  readonly toolStats: AiToolStats;
  readonly validationFailures: Record<string, number>;
  readonly safetyBlocks: Record<string, number>;
  readonly feedback: AiFeedbackStats;
  readonly templateSignals: AiTemplateSignalStats;
  readonly customNodeSignals: AiCustomNodeSignalStats;
}

/** Pure — assemble the full report from a set of AI events. */
export function buildAiAnalyticsReport(
  events: readonly AiCostEventRecord[],
): AiAnalyticsReport {
  return {
    overview: summarizeAiUsage(events),
    byFeature: groupAiByFeature(events),
    byModel: groupAiByModel(events),
    patchOutcomes: getAiPatchOutcomeStats(events),
    toolStats: getAiToolStats(events),
    validationFailures: getAiValidationFailureStats(events),
    safetyBlocks: getAiSafetyBlockStats(events),
    feedback: getAiFeedbackStats(events),
    templateSignals: getAiTemplateSignalStats(events),
    customNodeSignals: getAiCustomNodeSignalStats(events),
  };
}

export interface AccountAiAnalyticsQuery {
  readonly accountId: string;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

/**
 * Account AI analytics: load the account's events (RLS-gated by membership) and
 * fold them. Safe under `requireUser` + a server-side membership check because
 * the read is scoped to `accountId` and RLS rejects non-member accounts.
 */
export async function getAiAnalyticsForAccount(
  query: AccountAiAnalyticsQuery,
): Promise<AiAnalyticsReport> {
  const events = await aiCostEventsRepo.listByAccount(query.accountId, {
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  });
  return buildAiAnalyticsReport(events);
}
