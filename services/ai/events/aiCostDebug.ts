/**
 * Developer cost guard + per-request cost visibility for React Agent model
 * calls (Slice 4.AI-35D).
 *
 * Emits a single, SAFE, dev-only console line after each recorded React Agent
 * model call so expensive planner calls are visible immediately during QA. It
 * exists because AI-COST-INCIDENT-1 found 17 planner calls (3 full-catalog
 * fallbacks at ~3x cost) where Marcus expected ~6 — none of which were visible
 * without querying `ai_cost_events` after the fact.
 *
 * Gating (dev-only AND flag-gated so it can be toggled locally):
 *   - NEVER emits in production (`NODE_ENV === "production"`).
 *   - Otherwise emits only when `ENABLE_AI_COST_DEBUG === "true"`.
 *
 * No-leak: `buildAiCostDebugRecord` copies ONLY an explicit allow-list of safe
 * primitive fields (enums, counts, token totals, model ids). It NEVER accepts
 * or forwards the raw `ai_cost_events.metadata` blob, raw prompt text, raw
 * model output, catalog content, config values, integration account labels, or
 * secrets/tokens — those simply have no field on {@link AiCostDebugInput}.
 *
 * Cost: computed via the pure `core/ai/modelPricing` book. Unknown/unpriced
 * model → cost renders as `unknown` (never a guessed number).
 *
 * Reference: docs/slices/phase-4/ai-cost-telemetry-validation-and-cache-audit.md.
 */

import { estimateModelCostUsd, formatUsd } from "@/core/ai/modelPricing";

/**
 * Whether a plan request was the user's first prompt, a follow-up answer
 * (which currently re-runs the FULL planner — the AI-COST-INCIDENT-1 finding),
 * a retry, or unknown (legacy callers that don't tag the request).
 */
export type PlannerInteractionKind = "initial_plan" | "follow_up" | "retry" | "unknown";

export const PLANNER_INTERACTION_KINDS: readonly PlannerInteractionKind[] = [
  "initial_plan",
  "follow_up",
  "retry",
  "unknown",
] as const;

/** Patch lifecycle outcome surfaced in the dev line (plan or apply). */
export type AiCostDebugPatchOutcome =
  | "proposed"
  | "previewed"
  | "validation_failed"
  | "applied"
  | "none";

/**
 * The SAFE inputs to one dev cost line. Every field is an enum / count / id /
 * boolean — there is deliberately no field for raw prompt, raw output, catalog
 * content, config values, account labels, or secrets.
 */
export interface AiCostDebugInput {
  readonly feature: string;
  readonly eventType: string;
  readonly modelProvider?: string | null;
  readonly modelName?: string | null;
  readonly promptVersion?: string | null;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly providerNarrowingMode?: string;
  readonly providerNarrowingFallbackUsed?: boolean;
  readonly providerNarrowingReason?: string;
  readonly catalogProviderCount?: number;
  readonly catalogProvidersTotal?: number;
  readonly plannerModelTier?: string;
  readonly classifierUsed?: boolean;
  readonly classifierModelTier?: string | null;
  readonly tierRoutingReason?: string;
  readonly plannerInteractionKind?: PlannerInteractionKind;
  readonly patchOutcome?: AiCostDebugPatchOutcome;
  readonly workflowId?: string | null;
}

/** Full-catalog warning thresholds (Part C). Any one trips the warning. */
export const FULL_CATALOG_TOKEN_THRESHOLD = 20_000;
export const FULL_CATALOG_PROVIDER_THRESHOLD = 20;

export const FULL_CATALOG_WARNING_MESSAGE =
  "AI planner full-catalog call: this is expected for broad/ambiguous prompts but costs about 3x a narrowed call.";

/** Dev-only AND flag-gated. Never true in production. */
export function isAiCostDebugEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.ENABLE_AI_COST_DEBUG === "true";
}

/**
 * Whether this call should escalate to a stronger dev warning: a full-catalog
 * fallback, an oversized input packet, or a near-full catalog. Pure.
 */
export function shouldWarnFullCatalog(
  input: Pick<
    AiCostDebugInput,
    "providerNarrowingFallbackUsed" | "inputTokens" | "catalogProviderCount" | "providerNarrowingMode"
  >,
): boolean {
  return (
    input.providerNarrowingFallbackUsed === true ||
    input.providerNarrowingMode === "full-catalog" ||
    (input.inputTokens ?? 0) >= FULL_CATALOG_TOKEN_THRESHOLD ||
    (input.catalogProviderCount ?? 0) >= FULL_CATALOG_PROVIDER_THRESHOLD
  );
}

export interface AiCostDebugRecord {
  readonly feature: string;
  readonly eventType: string;
  readonly modelProvider: string | null;
  readonly modelName: string | null;
  readonly promptVersion: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  /** Estimated USD cost, or `null` when the model is unpriced/unknown. */
  readonly estimatedCostUsd: number | null;
  readonly providerNarrowingMode: string | null;
  readonly providerNarrowingFallbackUsed: boolean | null;
  readonly providerNarrowingReason: string | null;
  readonly catalogProviderCount: number | null;
  readonly catalogProvidersTotal: number | null;
  readonly plannerModelTier: string | null;
  readonly classifierUsed: boolean | null;
  readonly classifierModelTier: string | null;
  readonly tierRoutingReason: string | null;
  readonly plannerInteractionKind: PlannerInteractionKind | null;
  readonly patchOutcome: AiCostDebugPatchOutcome | null;
  readonly workflowId: string | null;
  readonly fullCatalogWarning: boolean;
}

/**
 * Build the SAFE, fully-resolved dev record from the safe inputs. Pure — copies
 * only allow-listed fields, computes total tokens + estimated cost, and decides
 * the full-catalog warning. There is no path by which a secret/raw value enters
 * the record (the input type has no field for one).
 */
export function buildAiCostDebugRecord(input: AiCostDebugInput): AiCostDebugRecord {
  const inputTokens = input.inputTokens ?? null;
  const outputTokens = input.outputTokens ?? null;
  const totalTokens =
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null;
  const cost = estimateModelCostUsd(input.modelName ?? undefined, {
    ...(input.inputTokens !== undefined ? { inputTokens: input.inputTokens } : {}),
    ...(input.outputTokens !== undefined ? { outputTokens: input.outputTokens } : {}),
  });
  return {
    feature: input.feature,
    eventType: input.eventType,
    modelProvider: input.modelProvider ?? null,
    modelName: input.modelName ?? null,
    promptVersion: input.promptVersion ?? null,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd: cost ? cost.totalCostUsd : null,
    providerNarrowingMode: input.providerNarrowingMode ?? null,
    providerNarrowingFallbackUsed: input.providerNarrowingFallbackUsed ?? null,
    providerNarrowingReason: input.providerNarrowingReason ?? null,
    catalogProviderCount: input.catalogProviderCount ?? null,
    catalogProvidersTotal: input.catalogProvidersTotal ?? null,
    plannerModelTier: input.plannerModelTier ?? null,
    classifierUsed: input.classifierUsed ?? null,
    classifierModelTier: input.classifierModelTier ?? null,
    tierRoutingReason: input.tierRoutingReason ?? null,
    plannerInteractionKind: input.plannerInteractionKind ?? null,
    patchOutcome: input.patchOutcome ?? null,
    workflowId: input.workflowId ?? null,
    fullCatalogWarning: shouldWarnFullCatalog(input),
  };
}

function fmtTokens(value: number | null): string {
  return value === null ? "?" : String(value);
}

/**
 * Render a compact, greppable single-line summary. Pure. Only the allow-listed
 * record fields appear — no secrets can reach this string.
 */
export function formatAiCostDebugLine(record: AiCostDebugRecord): string {
  const cost =
    record.estimatedCostUsd === null ? "unknown" : formatUsd(record.estimatedCostUsd);
  const providers =
    record.catalogProviderCount !== null || record.catalogProvidersTotal !== null
      ? ` providers=${record.catalogProviderCount ?? "?"}/${record.catalogProvidersTotal ?? "?"}`
      : "";
  const narrowing = record.providerNarrowingMode
    ? ` narrowing=${record.providerNarrowingMode}` +
      (record.providerNarrowingFallbackUsed !== null
        ? ` fallback=${record.providerNarrowingFallbackUsed}`
        : "") +
      (record.providerNarrowingReason ? ` reason=${record.providerNarrowingReason}` : "")
    : "";
  const classifier =
    record.classifierUsed !== null
      ? ` classifier=${record.classifierUsed}(${record.classifierModelTier ?? "det"})`
      : "";
  const routing = record.tierRoutingReason ? ` routing=${record.tierRoutingReason}` : "";
  const tier = record.plannerModelTier ? ` tier=${record.plannerModelTier}` : "";
  const interaction = record.plannerInteractionKind
    ? ` interaction=${record.plannerInteractionKind}`
    : "";
  const patch = record.patchOutcome ? ` patch=${record.patchOutcome}` : "";
  const wf = record.workflowId ? ` wf=${record.workflowId}` : "";
  const pv = record.promptVersion ? ` pv=${record.promptVersion}` : "";
  return (
    `[ai-cost] feature=${record.feature} event=${record.eventType}` +
    ` provider=${record.modelProvider ?? "?"} model=${record.modelName ?? "?"}${pv}` +
    ` in=${fmtTokens(record.inputTokens)} out=${fmtTokens(record.outputTokens)}` +
    ` total=${fmtTokens(record.totalTokens)} cost=${cost}` +
    `${narrowing}${providers}${tier}${classifier}${routing}${interaction}${patch}${wf}`
  );
}

/**
 * Emit the dev cost line. No-op unless {@link isAiCostDebugEnabled}. Full-catalog
 * calls escalate to `console.warn` + the warning message; everything else is
 * `console.info`. Never throws (callers are fail-open recorders).
 */
export function logAiCostDebug(input: AiCostDebugInput): void {
  if (!isAiCostDebugEnabled()) return;
  try {
    const record = buildAiCostDebugRecord(input);
    const line = formatAiCostDebugLine(record);
    if (record.fullCatalogWarning) {
      console.warn(`${line}\n[ai-cost] ${FULL_CATALOG_WARNING_MESSAGE}`);
    } else {
      console.info(line);
    }
  } catch {
    /* dev logging must never break the recorder */
  }
}
