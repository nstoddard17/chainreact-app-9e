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

/**
 * The actionable "where does the data come from?" question used whenever a plan's TRIGGER (the source
 * ChainReact would watch) isn't a real catalog capability. Names a few representative, catalog-backed
 * sources so the user can answer concretely. No-secret, provider-id-free, safe to show + send.
 */
export const GUIDANCE_SOURCE_QUESTION =
  "Where should React read this from — Stripe, HubSpot, Google Analytics, a webhook, or your app/database? Tell me the source and I'll wire up the trigger.";

/** A safe, user-facing summary of WHY a suggested plan failed capability validation. */
export interface InvalidPlanSummary {
  /** Plain-English, no-secret explanation + next step. Never echoes the raw provider/type or model JSON. */
  readonly message: string;
  /** True when the blocking problem is an unknown/missing TRIGGER (source) — drives the source question. */
  readonly needsSource: boolean;
  /** De-identified capability KEYS that failed (`provider:type`) — for dev/server LOGS only, never the UI. */
  readonly invalidCapabilityKeys: readonly string[];
}

/**
 * Turn the validator's `invalidSteps` into ONE safe, actionable explanation the agent surface can show
 * INSTEAD of a vague "couldn't be validated". Honest + specific without leaking the raw model JSON:
 *   - a missing TRIGGER (source) → ask exactly where the data should come from (the real failure when a
 *     "watch usage / low usage" style flow has no catalog trigger);
 *   - a missing ACTION → say the step isn't in the catalog yet and ask which app to use;
 *   - anything else → a neutral "not supported yet".
 * The raw `provider:type` keys are returned separately for server logs only (never placed in `message`).
 */
export function summarizeInvalidPlan(invalidSteps: readonly InvalidPlanStep[]): InvalidPlanSummary {
  const invalidCapabilityKeys = invalidSteps.map((s) => s.capabilityKey);
  const hasUnknownTrigger = invalidSteps.some((s) => s.reason === "UNKNOWN_TRIGGER");
  const hasUnknownAction = invalidSteps.some((s) => s.reason === "UNKNOWN_ACTION");

  if (hasUnknownTrigger) {
    return {
      needsSource: true,
      invalidCapabilityKeys,
      message:
        "I can't watch that automatically yet — ChainReact doesn't have a trigger for that source. " +
        GUIDANCE_SOURCE_QUESTION,
    };
  }
  if (hasUnknownAction) {
    return {
      needsSource: false,
      invalidCapabilityKeys,
      message:
        "One of the suggested steps isn't in ChainReact's catalog yet, so I couldn't add it. " +
        "Tell me which app you'd like to use and I'll check what's available.",
    };
  }
  return {
    needsSource: false,
    invalidCapabilityKeys,
    message:
      "Part of the suggested plan used a step ChainReact doesn't support yet, so I couldn't build it as described. " +
      "Let's pick from the available apps instead.",
  };
}
