import * as aiCostEventsRepo from "@/repositories/aiCostEvents";
import type {
  AiCostAnalyticsQuery,
  AiCostEventRecord,
} from "@/repositories/aiCostEvents";
import {
  summarizeAiCostEvents,
  type AiCostSummary,
} from "@/services/billing/aiCostEvents";

/**
 * Owner/admin AI observability analytics (Slice 4.COST-7) — READ ONLY.
 *
 * Answers owner questions over the `ai_cost_events` ledger (COST-6): how much
 * AI is costing, which features / models are used most, model + tool
 * latency/failure, patch acceptance, validation-failure (hallucination-catch)
 * types, safety blocks, user feedback, and template / custom-node demand
 * signals.
 *
 * Two layers (mirrors taskUsageStats):
 *  - PURE fold functions (`summarize*`, `group*`, `getAi*Stats`) — no I/O, the
 *    unit-tested core. Builds on COST-6's pure `summarizeAiCostEvents`.
 *  - Async owner functions (`get*`) — thin wrappers that load rows via the
 *    repo's owner/admin range read (service-role, RLS-bypassing) and fold them.
 *
 * SECURITY / REDACTION: outputs contain ONLY ids, counts, model/feature/tool
 * names, token counts, cost micros, AI credits, latency, enums (event_type /
 * validation code / safety reason), and accept/reject flags. The folds NEVER
 * read `event.metadata` VALUES — the template / custom-node signal counters
 * check key PRESENCE only (allowlisted keys), emitting counts, never values.
 * So no raw prompt / completion / chain-of-thought / secret can leak into an
 * aggregate by construction.
 *
 * ACCESS MODEL (documented, not enforced here): the `get*` functions read
 * cross-user data via service-role and are OWNER/ADMIN only. A future admin
 * route must gate them behind an admin authorization check; normal users must
 * never reach the cross-user aggregates.
 */

export { summarizeAiCostEvents };
export type { AiCostSummary };

export type AiDateRange = {
  from?: string;
  to?: string;
};

// ─── Aggregate shapes ─────────────────────────────────────────────────────────

export interface AiUsageOverview extends AiCostSummary {
  modelCallsCompleted: number;
  modelCallsFailed: number;
  /** Sum of total_tokens when present, else input+output. */
  totalTokens: number;
  toolCallCount: number;
  toolFailureCount: number;
  safetyBlockCount: number;
  latencyAvgMs: number | null;
  latencyP95Ms: number | null;
}

export interface AiFeatureStat {
  count: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicros: number;
  aiCredits: number;
}

export interface AiModelStat {
  count: number;
  completed: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostMicros: number;
  aiCredits: number;
  latencyAvgMs: number | null;
  latencyP95Ms: number | null;
}

export interface AiToolStats {
  totalCalls: number;
  totalFailures: number;
  byTool: Record<string, { called: number; failed: number }>;
}

export interface AiPatchOutcomeStats {
  proposed: number;
  validationFailed: number;
  previewed: number;
  applied: number;
  rejected: number;
  /** applied / (applied + rejected); 0 when neither has occurred. */
  acceptanceRate: number;
}

export interface AiFeedbackStats {
  total: number;
  accepted: number;
  rejected: number;
}

export interface AiTemplateSignalStats {
  recommended: number;
  instantiated: number;
  /** Events carrying a (non-sensitive) `templateId` metadata key — presence only. */
  metadataTemplateIdCount: number;
}

export interface AiCustomNodeSignalStats {
  customProviderIdCount: number;
  customNodeIdCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function totalTokensOf(e: AiCostEventRecord): number {
  if (e.totalTokens != null) return e.totalTokens;
  return (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
}

/** Nearest-rank percentile over already-sorted ascending values. */
function percentile(sortedAsc: readonly number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1));
  return sortedAsc[idx] ?? null;
}

function avg(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function bump(rec: Record<string, number>, key: string | null | undefined): void {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
}

/** Presence check on a metadata key — NEVER reads the value (no-leak invariant). */
function hasMetadataKey(e: AiCostEventRecord, key: string): boolean {
  return (
    !!e.metadata && Object.prototype.hasOwnProperty.call(e.metadata, key)
  );
}

// ─── Pure folds ───────────────────────────────────────────────────────────────

/** Owner-level AI usage overview (extends COST-6's base summary). */
export function summarizeAiUsage(
  events: readonly AiCostEventRecord[],
): AiUsageOverview {
  const base = summarizeAiCostEvents(events);
  let modelCallsCompleted = 0;
  let modelCallsFailed = 0;
  let totalTokens = 0;
  let toolCallCount = 0;
  let toolFailureCount = 0;
  let safetyBlockCount = 0;
  const latencies: number[] = [];

  for (const e of events) {
    totalTokens += totalTokensOf(e);
    if (e.eventType === "ai_model_call_completed") modelCallsCompleted += 1;
    if (e.eventType === "ai_model_call_failed") modelCallsFailed += 1;
    if (e.eventType === "ai_tool_called") toolCallCount += 1;
    if (e.eventType === "ai_tool_failed") {
      toolCallCount += 1;
      toolFailureCount += 1;
    }
    if (e.eventType === "ai_safety_block_triggered") safetyBlockCount += 1;
    if (e.latencyMs != null) latencies.push(e.latencyMs);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  return {
    ...base,
    modelCallsCompleted,
    modelCallsFailed,
    totalTokens,
    toolCallCount,
    toolFailureCount,
    safetyBlockCount,
    latencyAvgMs: avg(latencies),
    latencyP95Ms: percentile(sorted, 95),
  };
}

/** Per-feature usage (tokens / cost / credits). */
export function groupAiByFeature(
  events: readonly AiCostEventRecord[],
): Record<string, AiFeatureStat> {
  const out: Record<string, AiFeatureStat> = {};
  for (const e of events) {
    const stat = (out[e.feature] ??= {
      count: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: 0,
      aiCredits: 0,
    });
    stat.count += 1;
    stat.inputTokens += e.inputTokens ?? 0;
    stat.outputTokens += e.outputTokens ?? 0;
    stat.totalTokens += totalTokensOf(e);
    stat.estimatedCostMicros += e.estimatedCostMicros ?? 0;
    stat.aiCredits += e.aiCreditsCharged ?? 0;
  }
  return out;
}

/** Per-model cost + latency. Events with no `modelName` are skipped. */
export function groupAiByModel(
  events: readonly AiCostEventRecord[],
): Record<string, AiModelStat> {
  const latByModel: Record<string, number[]> = {};
  const out: Record<string, AiModelStat> = {};
  for (const e of events) {
    if (!e.modelName) continue;
    const stat = (out[e.modelName] ??= {
      count: 0,
      completed: 0,
      failed: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: 0,
      aiCredits: 0,
      latencyAvgMs: null,
      latencyP95Ms: null,
    });
    stat.count += 1;
    if (e.eventType === "ai_model_call_completed") stat.completed += 1;
    if (e.eventType === "ai_model_call_failed") stat.failed += 1;
    stat.inputTokens += e.inputTokens ?? 0;
    stat.outputTokens += e.outputTokens ?? 0;
    stat.totalTokens += totalTokensOf(e);
    stat.estimatedCostMicros += e.estimatedCostMicros ?? 0;
    stat.aiCredits += e.aiCreditsCharged ?? 0;
    if (e.latencyMs != null) (latByModel[e.modelName] ??= []).push(e.latencyMs);
  }
  for (const [model, lats] of Object.entries(latByModel)) {
    const stat = out[model];
    if (!stat) continue;
    const sorted = [...lats].sort((a, b) => a - b);
    stat.latencyAvgMs = avg(lats);
    stat.latencyP95Ms = percentile(sorted, 95);
  }
  return out;
}

/** Tool-call counts + failures, overall and per tool. */
export function getAiToolStats(
  events: readonly AiCostEventRecord[],
): AiToolStats {
  const stats: AiToolStats = { totalCalls: 0, totalFailures: 0, byTool: {} };
  for (const e of events) {
    const isCall = e.eventType === "ai_tool_called";
    const isFail = e.eventType === "ai_tool_failed";
    if (!isCall && !isFail) continue;
    const key = e.toolName ?? "unknown";
    const t = (stats.byTool[key] ??= { called: 0, failed: 0 });
    t.called += 1;
    stats.totalCalls += 1;
    if (isFail) {
      t.failed += 1;
      stats.totalFailures += 1;
    }
  }
  return stats;
}

/** Patch lifecycle counts + acceptance rate. */
export function getAiPatchOutcomeStats(
  events: readonly AiCostEventRecord[],
): AiPatchOutcomeStats {
  const stats: AiPatchOutcomeStats = {
    proposed: 0,
    validationFailed: 0,
    previewed: 0,
    applied: 0,
    rejected: 0,
    acceptanceRate: 0,
  };
  for (const e of events) {
    switch (e.eventType) {
      case "ai_patch_proposed":
        stats.proposed += 1;
        break;
      case "ai_patch_validation_failed":
        stats.validationFailed += 1;
        break;
      case "ai_patch_previewed":
        stats.previewed += 1;
        break;
      case "ai_patch_applied":
        stats.applied += 1;
        break;
      case "ai_patch_rejected":
        stats.rejected += 1;
        break;
    }
  }
  const decided = stats.applied + stats.rejected;
  stats.acceptanceRate = decided === 0 ? 0 : stats.applied / decided;
  return stats;
}

/** Validation-failure (hallucination-catch) counts by error code. */
export function getAiValidationFailureStats(
  events: readonly AiCostEventRecord[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.eventType !== "ai_patch_validation_failed") continue;
    bump(out, e.validationErrorCode ?? "unknown");
  }
  return out;
}

/** Safety-block counts by reason. */
export function getAiSafetyBlockStats(
  events: readonly AiCostEventRecord[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.eventType !== "ai_safety_block_triggered") continue;
    bump(out, e.safetyBlockReason ?? "unknown");
  }
  return out;
}

/** User-feedback (thumbs up/down) counts. */
export function getAiFeedbackStats(
  events: readonly AiCostEventRecord[],
): AiFeedbackStats {
  const stats: AiFeedbackStats = { total: 0, accepted: 0, rejected: 0 };
  for (const e of events) {
    if (e.eventType !== "ai_user_feedback_submitted") continue;
    stats.total += 1;
    if (e.accepted === true) stats.accepted += 1;
    if (e.accepted === false) stats.rejected += 1;
  }
  return stats;
}

/** Template demand signals (event types + presence-only metadata key). */
export function getAiTemplateSignalStats(
  events: readonly AiCostEventRecord[],
): AiTemplateSignalStats {
  const stats: AiTemplateSignalStats = {
    recommended: 0,
    instantiated: 0,
    metadataTemplateIdCount: 0,
  };
  for (const e of events) {
    if (e.eventType === "ai_template_recommended") stats.recommended += 1;
    if (e.eventType === "ai_template_instantiated") stats.instantiated += 1;
    if (hasMetadataKey(e, "templateId")) stats.metadataTemplateIdCount += 1;
  }
  return stats;
}

/** Custom-provider/node demand signals (presence-only metadata keys). */
export function getAiCustomNodeSignalStats(
  events: readonly AiCostEventRecord[],
): AiCustomNodeSignalStats {
  const stats: AiCustomNodeSignalStats = {
    customProviderIdCount: 0,
    customNodeIdCount: 0,
  };
  for (const e of events) {
    if (hasMetadataKey(e, "customProviderId")) stats.customProviderIdCount += 1;
    if (hasMetadataKey(e, "customNodeId")) stats.customNodeIdCount += 1;
  }
  return stats;
}

// ─── Async owner/admin functions (load + fold) ───────────────────────────────

async function load(
  q: AiCostAnalyticsQuery,
): Promise<readonly AiCostEventRecord[]> {
  return aiCostEventsRepo.listEventsForAnalytics(q);
}

/** Owner AI usage overview across all users in a date range. */
export async function getAiUsageOverview(
  range: AiDateRange = {},
): Promise<AiUsageOverview> {
  return summarizeAiUsage(await load(range));
}

/** Owner per-feature AI usage in a date range. */
export async function getAiUsageByFeature(
  range: AiDateRange = {},
): Promise<Record<string, AiFeatureStat>> {
  return groupAiByFeature(await load(range));
}

/** Owner per-model AI cost + latency in a date range. */
export async function getAiCostByModel(
  range: AiDateRange = {},
): Promise<Record<string, AiModelStat>> {
  return groupAiByModel(await load(range));
}

/** Owner tool-call / failure stats in a date range. */
export async function getAiToolFailureStats(
  range: AiDateRange = {},
): Promise<AiToolStats> {
  return getAiToolStats(await load(range));
}

/** Owner patch-outcome stats (with acceptance rate) in a date range. */
export async function getAiPatchOutcomeStatsForRange(
  range: AiDateRange = {},
): Promise<AiPatchOutcomeStats> {
  return getAiPatchOutcomeStats(await load(range));
}

/** Owner validation-failure stats in a date range. */
export async function getAiValidationFailureStatsForRange(
  range: AiDateRange = {},
): Promise<Record<string, number>> {
  return getAiValidationFailureStats(await load(range));
}

/** Owner safety-block stats in a date range. */
export async function getAiSafetyBlockStatsForRange(
  range: AiDateRange = {},
): Promise<Record<string, number>> {
  return getAiSafetyBlockStats(await load(range));
}

/** Owner user-feedback stats in a date range. */
export async function getAiFeedbackStatsForRange(
  range: AiDateRange = {},
): Promise<AiFeedbackStats> {
  return getAiFeedbackStats(await load(range));
}
