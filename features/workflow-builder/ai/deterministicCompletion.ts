import type { AiPlanResult } from "@/lib/api/ai";
import type { RequiredInputAnswer } from "./RequiredInputControl";

/**
 * Slice 4.AI-35B — decide whether a required-input follow-up can be completed
 * DETERMINISTICALLY (drop the user's staged answers straight into the pending
 * patch's known config fields, no model call) or must go through the model
 * planner.
 *
 * Pure + client-side: it only decides WHICH path to take; the server's
 * `completePlanWithRequiredInputs` is the authority that actually builds +
 * previews the patch (and may still bounce back to re-plan).
 *
 * Deterministic ONLY when ALL hold (otherwise the model planner runs):
 *   - no free-text was typed (free text may be a new natural-language change),
 *   - the plan is a success,
 *   - every BLOCKING required input (kind !== select_integration) is a
 *     field-specific entry (nodeId + field), single-valued (not multi-select),
 *     and has a matching staged answer.
 * A `provider_choice` (no field) → re-plan, because resolving it changes the
 * trigger/action shape, which only the planner can build safely.
 */

export interface ResolvedRequiredInputAnswer {
  readonly nodeId: string;
  readonly field: string;
  readonly value: string;
  readonly multiple?: boolean;
}

export type DeterministicCompletionDecision =
  | { readonly mode: "deterministic"; readonly answers: readonly ResolvedRequiredInputAnswer[] }
  | { readonly mode: "model_replan"; readonly reason: string };

export function evaluateDeterministicCompletion(
  planResult: AiPlanResult | null,
  structuredAnswers: readonly RequiredInputAnswer[],
  freeText: string,
): DeterministicCompletionDecision {
  if (freeText.trim().length > 0) {
    return { mode: "model_replan", reason: "free_text_present" };
  }
  if (!planResult || !planResult.ok) {
    return { mode: "model_replan", reason: "no_plan" };
  }

  const blocking = planResult.requiredUserInput.filter((r) => r.kind !== "select_integration");
  if (blocking.length === 0) {
    return { mode: "model_replan", reason: "no_blocking_inputs" };
  }
  if (blocking.some((r) => r.kind === "provider_choice")) {
    return { mode: "model_replan", reason: "provider_choice_requires_replan" };
  }

  // Index staged answers by `${nodeId}::${field}` for an exact field match.
  const byKey = new Map<string, RequiredInputAnswer>();
  for (const a of structuredAnswers) {
    const d = a.descriptor;
    if (d.nodeId && d.field) byKey.set(`${d.nodeId}::${d.field}`, a);
  }

  const answers: ResolvedRequiredInputAnswer[] = [];
  for (const entry of blocking) {
    if (!entry.nodeId || !entry.field) {
      return { mode: "model_replan", reason: "unmapped_required_input" };
    }
    if (entry.multiple === true) {
      return { mode: "model_replan", reason: "multi_value_field" };
    }
    const answer = byKey.get(`${entry.nodeId}::${entry.field}`);
    const value = answer?.value ?? answer?.display;
    if (value === undefined || value.trim().length === 0) {
      return { mode: "model_replan", reason: "missing_answer" };
    }
    // Multi-select entries already returned model_replan above, so every
    // answer reaching here is single-valued.
    answers.push({ nodeId: entry.nodeId, field: entry.field, value });
  }

  return { mode: "deterministic", answers };
}
