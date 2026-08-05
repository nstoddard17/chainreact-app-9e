/**
 * Deterministic capability-key normalization (REACT-AGENT-LIVE-BROWSER-CERTIFICATION-RUN-1).
 *
 * Observed LIVE during browser certification: on a clarification-answer turn the model returned the
 * right workflow shape but wrote the FULL capability id into the step's `type` field —
 * `{provider: "gmail", type: "gmail:new_email"}` — so the key ChainReact validated was
 * `gmail:gmail:new_email`. `validateWorkflowPlan` correctly rejected it, the whole plan was thrown
 * away, and the user was left with a blank canvas on the very turn they had just answered a
 * clarification. It is intermittent because it depends on how the model formats one field.
 *
 * This is a FORMATTING mistake, not a capability the product lacks, so it is repaired mechanically
 * rather than by asking the model again (a retry costs a whole model call and often repeats itself).
 *
 * SAFETY — the rewrite can never change what a plan means:
 *   - it only ever strips a redundant `"<provider>:"` prefix the step already declares in `provider`;
 *   - it applies ONLY when the original key is NOT registered AND the stripped key IS registered, so
 *     a valid plan is never touched and an unknown capability is never invented or substituted;
 *   - it never picks between two capabilities, and never edits config, refs, or ordering.
 *
 * Pure + model-free; reads only the frozen in-memory discovery registry.
 */

import type { WorkflowPlan, WorkflowPlanStep } from "@/contracts/guidanceSession";
import { getActionMeta, getTriggerMeta } from "@/services/discovery/_registry";

/** Bounded — guards against a pathological `gmail:gmail:gmail:…` value. */
const MAX_PREFIX_STRIPS = 3;

/** Is `provider:type` a capability the registry actually has for this step's role? */
function isRegistered(step: { provider: string; type: string; role: WorkflowPlanStep["role"] }): boolean {
  const key = `${step.provider}:${step.type}`;
  if (step.role === "trigger") return getTriggerMeta(key) !== undefined;
  if (step.role === "action") return getActionMeta(key) !== undefined;
  return false; // logic steps carry no provider capability — never normalized
}

/** Strip up to `MAX_PREFIX_STRIPS` redundant `"<provider>:"` prefixes from a type. */
function stripRedundantProviderPrefix(provider: string, type: string): string {
  let out = type;
  const prefix = `${provider}:`;
  for (let i = 0; i < MAX_PREFIX_STRIPS && out.startsWith(prefix); i += 1) {
    out = out.slice(prefix.length);
  }
  return out;
}

export interface NormalizePlanResult {
  readonly plan: WorkflowPlan;
  /** The `provider:type` keys that were repaired, as originally emitted. Public ids; safe to log. */
  readonly repairedKeys: readonly string[];
}

/**
 * Return the plan with mechanically-repairable capability keys fixed. When nothing qualifies the
 * ORIGINAL plan object is returned unchanged (referential equality), so callers can cheaply tell
 * whether anything happened.
 */
export function normalizePlanCapabilityKeys(plan: WorkflowPlan): NormalizePlanResult {
  const repairedKeys: string[] = [];
  const steps = plan.steps.map((step) => {
    if (step.role !== "trigger" && step.role !== "action") return step;
    if (isRegistered(step)) return step; // already valid — never rewritten
    const normalizedType = stripRedundantProviderPrefix(step.provider, step.type);
    if (normalizedType === step.type) return step; // nothing redundant to strip
    const candidate = { ...step, type: normalizedType };
    if (!isRegistered(candidate)) return step; // strip did not yield a real capability — leave it
    repairedKeys.push(`${step.provider}:${step.type}`);
    return candidate;
  });
  if (repairedKeys.length === 0) return { plan, repairedKeys };
  return { plan: { ...plan, steps }, repairedKeys };
}
