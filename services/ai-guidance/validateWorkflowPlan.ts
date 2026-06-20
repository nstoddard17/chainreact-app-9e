/**
 * WorkflowPlan capability validator (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * Hermes (or any guidance brain) may HALLUCINATE providers/actions. ChainReact is the source of
 * truth: every `trigger`/`action` step's `provider:type` MUST resolve in the discovery registry
 * (`getActionMeta`/`getTriggerMeta`) or the plan is rejected. `logic` steps are structural and
 * carry no provider capability, so they are accepted without a registry lookup (but must not
 * smuggle an unknown provider). This is a deterministic, model-free gate — guidance never bypasses
 * the real capability catalog, and nothing here mutates a workflow.
 */

import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

export interface InvalidPlanStep {
  readonly ref: string;
  readonly role: WorkflowPlanStep["role"];
  /** The unknown `provider:type` claim (capability key only — never config/values). */
  readonly capabilityKey: string;
  readonly reason: "UNKNOWN_ACTION" | "UNKNOWN_TRIGGER" | "UNKNOWN_CAPABILITY";
}

export type ValidateWorkflowPlanResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly invalidSteps: readonly InvalidPlanStep[] };

/** Key the discovery registry uses: `${provider}:${type}`. */
function capabilityKey(step: WorkflowPlanStep): string {
  return `${step.provider}:${step.type}`;
}

/** Validate a single step against the real capability catalog. */
export function isPlanStepKnown(step: WorkflowPlanStep): boolean {
  const key = capabilityKey(step);
  if (step.role === "trigger") return getTriggerMeta(key) !== undefined;
  if (step.role === "action") return getActionMeta(key) !== undefined;
  // logic: structural; valid only when it does NOT claim a provider capability.
  return step.provider.trim() === "" || step.provider.trim().toLowerCase() === "core";
}

/**
 * Validate every step of a plan. Returns `ok: false` with the offending steps if any
 * trigger/action references a capability ChainReact does not have.
 */
export function validateWorkflowPlan(plan: WorkflowPlan): ValidateWorkflowPlanResult {
  const invalidSteps: InvalidPlanStep[] = [];
  for (const step of plan.steps) {
    if (isPlanStepKnown(step)) continue;
    const reason =
      step.role === "trigger" ? "UNKNOWN_TRIGGER" : step.role === "action" ? "UNKNOWN_ACTION" : "UNKNOWN_CAPABILITY";
    invalidSteps.push({ ref: step.ref, role: step.role, capabilityKey: capabilityKey(step), reason });
  }
  return invalidSteps.length === 0 ? { ok: true } : { ok: false, invalidSteps };
}
