import * as aiCostEventsRepo from "@/repositories/aiCostEvents";
import type {
  AiCostEventInsert,
  AiCostEventRecord,
  AiCostEventType,
  AiCostFeature,
} from "@/repositories/aiCostEvents";

/**
 * AI cost / observability recorder (Slice 4.COST-6).
 *
 * The single entry point future AI slices use to emit structured events the
 * owner dashboard (future) reads: model usage, token counts, estimated
 * provider cost, AI credits, latency, tool calls/failures, patch outcomes,
 * safety blocks, user feedback, and (later) template + custom-node demand.
 *
 * This slice adds the FOUNDATION only — no model calls, no AI behavior. All
 * `metadata` is sanitized (key denylist + length caps) before persistence as
 * defense in depth; callers must still pass redacted summaries, never raw
 * prompts/completions/chain-of-thought/secrets.
 */

export type {
  AiCostEventInsert,
  AiCostEventRecord,
  AiCostEventType,
  AiCostFeature,
} from "@/repositories/aiCostEvents";

// ─── Metadata sanitization ───────────────────────────────────────────────────

const MAX_STRING_LEN = 512;
const MAX_DEPTH = 3;
const MAX_ARRAY_ITEMS = 50;

/**
 * Keys whose values are dropped wholesale — they name things that must never
 * reach the ledger (secrets, tokens, raw model IO, hidden reasoning, bodies).
 */
const BLOCKED_KEY_PATTERNS: readonly RegExp[] = [
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /api[-_]?key/i,
  /credential/i,
  /prompt/i,
  /completion/i,
  /chain[-_]?of[-_]?thought/i,
  /\bcot\b/i,
  // Substring (not \b) so camelCase keys like `messageBody` / `nodeConfig`
  // are caught — there is no word boundary before an internal capital.
  /body/i,
  /file[-_]?content/i,
  /config/i,
  // Boundary BEFORE only: catches `rawPrompt` / `raw_data` but not `drawing`.
  /\braw/i,
];

function isBlockedKey(key: string): boolean {
  return BLOCKED_KEY_PATTERNS.some((re) => re.test(key));
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null) return null;
  const t = typeof value;
  if (t === "number" || t === "boolean") return value;
  if (t === "string") {
    const s = value as string;
    return s.length > MAX_STRING_LEN ? s.slice(0, MAX_STRING_LEN) : s;
  }
  if (depth >= MAX_DEPTH) return undefined; // don't descend further
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((v) => sanitizeValue(v, depth + 1))
      .filter((v) => v !== undefined);
  }
  if (t === "object") return sanitizeObject(value as Record<string, unknown>, depth + 1);
  return undefined; // functions, symbols, etc.
}

function sanitizeObject(
  obj: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isBlockedKey(key)) continue;
    const s = sanitizeValue(value, depth);
    if (s !== undefined) out[key] = s;
  }
  return out;
}

/**
 * Redact metadata before it is stored: drop blocked keys (secrets / tokens /
 * raw model IO / chain-of-thought / bodies / configs), cap string lengths,
 * bound depth + array size. A KEY-level + STRUCTURAL guard — callers must not
 * stuff raw content into innocuously-named keys.
 */
export function sanitizeAiEventMetadata(
  metadata: Record<string, unknown> | undefined | null,
): Record<string, unknown> {
  if (!metadata) return {};
  return sanitizeObject(metadata, 0);
}

// ─── Recording ───────────────────────────────────────────────────────────────

/** Record any AI cost/observability event (metadata sanitized here). */
export async function recordAiCostEvent(event: AiCostEventInsert): Promise<void> {
  await aiCostEventsRepo.insertEvent({
    ...event,
    metadata: sanitizeAiEventMetadata(event.metadata),
  });
}

/** Common id/feature scope threaded into every event. */
export interface AiEventScope {
  /** Cost owner — the account the AI usage is billed to (4.ACCOUNT-MODEL-9d). */
  accountId: string;
  /** Actor — the user who drove the AI interaction (provenance, not owner). */
  userId: string;
  feature: AiCostFeature;
  workflowId?: string | null;
  workflowRunId?: string | null;
  patchId?: string | null;
  conversationId?: string | null;
}

export interface ModelCallInput {
  modelName: string;
  modelProvider?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostMicros?: number;
  aiCreditsCharged?: number;
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

/** A completed model call (success). Computes total_tokens when both halves given. */
export async function recordAiModelCallCompleted(
  scope: AiEventScope,
  call: ModelCallInput,
): Promise<void> {
  await recordAiCostEvent({
    ...scope,
    eventType: "ai_model_call_completed",
    modelName: call.modelName,
    modelProvider: call.modelProvider ?? null,
    promptVersion: call.promptVersion ?? null,
    inputTokens: call.inputTokens ?? null,
    outputTokens: call.outputTokens ?? null,
    totalTokens:
      call.inputTokens !== undefined && call.outputTokens !== undefined
        ? call.inputTokens + call.outputTokens
        : null,
    estimatedCostMicros: call.estimatedCostMicros ?? null,
    aiCreditsCharged: call.aiCreditsCharged ?? null,
    latencyMs: call.latencyMs ?? null,
    success: true,
    metadata: call.metadata,
  });
}

/** A failed model call. */
export async function recordAiModelCallFailed(
  scope: AiEventScope,
  call: { modelName?: string; modelProvider?: string; latencyMs?: number; metadata?: Record<string, unknown> },
): Promise<void> {
  await recordAiCostEvent({
    ...scope,
    eventType: "ai_model_call_failed",
    modelName: call.modelName ?? null,
    modelProvider: call.modelProvider ?? null,
    latencyMs: call.latencyMs ?? null,
    success: false,
    metadata: call.metadata,
  });
}

/** A tool call. `toolStatus: "failed"` records an `ai_tool_failed` event. */
export async function recordAiToolCalled(
  scope: AiEventScope,
  tool: { toolName: string; toolStatus?: string; latencyMs?: number; metadata?: Record<string, unknown> },
): Promise<void> {
  const failed = tool.toolStatus === "failed";
  await recordAiCostEvent({
    ...scope,
    eventType: failed ? "ai_tool_failed" : "ai_tool_called",
    toolName: tool.toolName,
    toolStatus: tool.toolStatus ?? null,
    latencyMs: tool.latencyMs ?? null,
    success: !failed,
    metadata: tool.metadata,
  });
}

export type PatchOutcome =
  | "proposed"
  | "validation_failed"
  | "previewed"
  | "applied"
  | "rejected";

const PATCH_OUTCOME_EVENT: Record<PatchOutcome, AiCostEventType> = {
  proposed: "ai_patch_proposed",
  validation_failed: "ai_patch_validation_failed",
  previewed: "ai_patch_previewed",
  applied: "ai_patch_applied",
  rejected: "ai_patch_rejected",
};

/** A patch lifecycle outcome (proposed / validation_failed / previewed / applied / rejected). */
export async function recordAiPatchOutcome(
  scope: AiEventScope,
  outcome: PatchOutcome,
  extra?: { validationErrorCode?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  await recordAiCostEvent({
    ...scope,
    eventType: PATCH_OUTCOME_EVENT[outcome],
    validationErrorCode: extra?.validationErrorCode ?? null,
    accepted:
      outcome === "applied" ? true : outcome === "rejected" ? false : null,
    success: outcome !== "validation_failed",
    metadata: extra?.metadata,
  });
}

/** A deterministic-validator / guard safety block (e.g. hallucination caught). */
export async function recordAiSafetyBlock(
  scope: AiEventScope,
  reason: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordAiCostEvent({
    ...scope,
    eventType: "ai_safety_block_triggered",
    safetyBlockReason: reason,
    metadata,
  });
}

/** A thumbs-up/down (or richer) user feedback signal on an AI interaction. */
export async function recordAiUserFeedback(
  scope: AiEventScope,
  accepted: boolean,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await recordAiCostEvent({
    ...scope,
    eventType: "ai_user_feedback_submitted",
    accepted,
    metadata,
  });
}

/** RLS-gated read of a workflow's AI events. */
export async function listAiCostEventsForWorkflow(
  workflowId: string,
): Promise<readonly AiCostEventRecord[]> {
  return aiCostEventsRepo.listByWorkflow(workflowId);
}

// ─── Aggregation (pure — owner dashboard feeds it rows later) ─────────────────

export interface AiCostSummary {
  totalEvents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostMicros: number;
  totalAiCredits: number;
  acceptedCount: number;
  rejectedCount: number;
  byFeature: Record<string, number>;
  byEventType: Record<string, number>;
}

/**
 * Pure roll-up over a set of AI events. No DB — the future owner dashboard
 * loads rows (service-role) and folds them here.
 */
export function summarizeAiCostEvents(
  events: readonly AiCostEventRecord[],
): AiCostSummary {
  const summary: AiCostSummary = {
    totalEvents: events.length,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalEstimatedCostMicros: 0,
    totalAiCredits: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    byFeature: {},
    byEventType: {},
  };
  for (const e of events) {
    summary.totalInputTokens += e.inputTokens ?? 0;
    summary.totalOutputTokens += e.outputTokens ?? 0;
    summary.totalEstimatedCostMicros += e.estimatedCostMicros ?? 0;
    summary.totalAiCredits += e.aiCreditsCharged ?? 0;
    if (e.accepted === true) summary.acceptedCount += 1;
    if (e.accepted === false) summary.rejectedCount += 1;
    summary.byFeature[e.feature] = (summary.byFeature[e.feature] ?? 0) + 1;
    summary.byEventType[e.eventType] = (summary.byEventType[e.eventType] ?? 0) + 1;
  }
  return summary;
}
