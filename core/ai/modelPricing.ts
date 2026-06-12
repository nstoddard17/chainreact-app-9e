/**
 * Model pricing + cost estimation (Slice 4.AI-35D).
 *
 * Pure pricing book + estimator used ONLY for developer-facing cost visibility
 * (the AI-35D dev cost guard). It is NOT wired into billing/tasks and does NOT
 * write `estimated_cost_micros` to `ai_cost_events` — it exists so a local
 * console log can show "this planner call cost ~$0.12" during QA.
 *
 * Purity: `core/ai/*` imports only from `contracts/` + sibling `./modelTypes`
 * (eslint-enforced). This file exports plain data + pure functions — no I/O,
 * no env reads, no side effects.
 *
 * Pricing source-of-truth: only models whose published per-token price is
 * KNOWN are listed. An unknown model id returns `null` (the caller shows token
 * counts with cost "unknown") — we never GUESS a price. OpenAI pricing is
 * intentionally absent until confirmed (AI-34A's gpt-4.1 ids are scaffolding);
 * a classifier call on an unpriced model therefore reports tokens only.
 *
 * Reference: docs/slices/phase-4/ai-cost-telemetry-validation-and-cache-audit.md
 * (AI-COST-INCIDENT-1: 271,359 in / 7,364 out → $0.9245 at Sonnet pricing).
 */

/** Per-million-token USD price for one model. */
export interface ModelPrice {
  readonly inputPerMillionUsd: number;
  readonly outputPerMillionUsd: number;
}

/**
 * Known model pricing, keyed by vendor model id (matches `core/ai/models.ts`).
 * Sonnet 4.6 is the React Agent's default planner and the only model with a
 * confirmed price used by AI-COST-INCIDENT-1 ($3 / $15 per MTok). Add more
 * entries here as their prices are confirmed — never guess.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPrice>> = {
  "claude-sonnet-4-6": { inputPerMillionUsd: 3, outputPerMillionUsd: 15 },
} as const;

export interface ModelCostEstimate {
  readonly modelId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly inputCostUsd: number;
  readonly outputCostUsd: number;
  readonly totalCostUsd: number;
}

/** The known price for a model id, or `undefined` when unpriced. */
export function getModelPrice(modelId: string | undefined): ModelPrice | undefined {
  if (!modelId) return undefined;
  return MODEL_PRICING[modelId];
}

/**
 * Estimate the USD cost of one model call from its token usage. Returns `null`
 * when the model id is unknown/unpriced (caller shows tokens only — never a
 * guessed cost) or when `modelId` is absent. Never throws; negative/NaN token
 * counts are floored to 0.
 */
export function estimateModelCostUsd(
  modelId: string | undefined,
  usage: { readonly inputTokens?: number; readonly outputTokens?: number } | undefined,
): ModelCostEstimate | null {
  const price = getModelPrice(modelId);
  if (!price || !modelId) return null;
  const inputTokens = normalizeTokens(usage?.inputTokens);
  const outputTokens = normalizeTokens(usage?.outputTokens);
  const inputCostUsd = (inputTokens / 1_000_000) * price.inputPerMillionUsd;
  const outputCostUsd = (outputTokens / 1_000_000) * price.outputPerMillionUsd;
  return {
    modelId,
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
  };
}

/**
 * Estimate one model call's cost in **micro-USD** (integer millionths), the unit
 * `ai_cost_events.estimated_cost_micros` stores. Returns `null` when the model is
 * unpriced (so the ledger records `null`, never a guessed cost). Slice
 * 4.AI-CREDITS-2 wires this into the recorder so the ledger carries provider cost
 * alongside the product-unit credit charge.
 */
export function estimateModelCostMicros(
  modelId: string | undefined,
  usage: { readonly inputTokens?: number; readonly outputTokens?: number } | undefined,
): number | null {
  const estimate = estimateModelCostUsd(modelId, usage);
  if (!estimate) return null;
  return Math.round(estimate.totalCostUsd * 1_000_000);
}

function normalizeTokens(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
  return value;
}

/** Format a USD amount for a dev log (4 dp; e.g. `$0.1238`). */
export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}
