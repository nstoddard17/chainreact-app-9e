/**
 * Timeout → deterministic-fallback recovery (REACT-AGENT-TIMEOUT-FALLBACK-RELIABILITY-1).
 *
 * The production gap this closes: the registry-driven chain fallback
 * (`inferNamedProviderChainPlan`) protected only ok-but-no-plan replies — it lived behind
 * `enforcePreviewFirst`, which the route only reaches on `result.ok`. A gateway TIMEOUT took the
 * failure branch and returned the typed 503 directly, so a fully-unambiguous four-app request died
 * at the 45s abort even though ChainReact could have built the skeleton locally in milliseconds.
 *
 * This module is the route's LOCAL, model-free recovery for exactly that branch:
 *
 *   gateway TIMEOUT on a NEW-workflow turn
 *     + preview-first classification says the user named their apps (no alternation)
 *     + the registry fallback resolves every named app to exactly ONE capability
 *   → a skeletal plan + honest lead-in; the route continues the normal pipeline.
 *
 *   anything else (editing turn, ambiguous topology, fallback declines)
 *   → null; the route returns the typed GUIDANCE_TIMEOUT failure unchanged.
 *
 * Invariants:
 *   - NO model call, no network, no retry — pure local registry work (a timed-out brain must not
 *     be asked again; the repair path is reserved for ok-but-no-plan replies).
 *   - The plan carries NO config values; requiredInputs come from real registry metadata; it flows
 *     through the SAME downstream pipeline (config prep, provider guard, entitlement, preview).
 *   - One safe observability line — enums/counts/booleans only, never goal text or model output.
 */

import type { WorkflowPlan } from "@/contracts/guidanceSession";
import { inferNamedProviderChainPlan } from "../fallback/inferNamedProviderChainPlan";
import { classifyPreviewFirst } from "./classifyPreviewFirst";

/**
 * Honest lead-in for a timeout-recovered skeleton: the assistant DID time out, the sketch is
 * ChainReact's own, and nothing was changed. Fixed copy — no model text, no values.
 */
export const TIMEOUT_FALLBACK_LEAD_IN =
  "The assistant took too long to respond, so I sketched the workflow directly from the apps you named. " +
  "Finish the remaining choices in each step's setup below — nothing in your workflow has been changed.";

export interface TimeoutFallbackRecovery {
  readonly guidanceText: string;
  readonly workflowPlan: WorkflowPlan;
}

/**
 * One safe line per TIMEOUT turn, whether or not recovery succeeded — production must be able to
 * tell "timeout, rescued locally" from "timeout, typed failure" without the dashboard.
 */
function logTimeoutFallbackDecision(info: {
  requestId: string;
  classification: string;
  namedProviderCount: number;
  fallbackUsed: boolean;
  elapsedMs: number;
}): void {
  console.info(
    `[workflow-guidance] timeout_fallback requestId=${info.requestId} ` +
      `classification=${info.classification} namedProviders=${info.namedProviderCount} ` +
      `fallbackUsed=${info.fallbackUsed} elapsedMs=${info.elapsedMs}`,
  );
}

/**
 * Attempt local recovery of a gateway TIMEOUT. Returns the synthesized guidance (lead-in + plan)
 * or null when the typed timeout failure should stand. Pure + model-free; sub-millisecond-scale
 * registry work, safely inside the route's reserved local budget.
 */
export function recoverGuidanceTimeoutWithFallback(input: {
  /** The TOKENIZED goal text (provider names survive tokenization). */
  readonly safeGoalText: string;
  /** True when the turn edits an existing non-empty draft — recovery never applies. */
  readonly editing: boolean;
  readonly requestId: string;
  /** Elapsed ms since the brain call started — for the observability line only. */
  readonly elapsedMs: number;
}): TimeoutFallbackRecovery | null {
  if (input.editing) return null;

  const classification = classifyPreviewFirst({ goalText: input.safeGoalText, editing: false });
  const plan =
    classification.kind === "preview_expected" ? inferNamedProviderChainPlan(input.safeGoalText) : null;

  logTimeoutFallbackDecision({
    requestId: input.requestId,
    classification:
      classification.kind === "clarification_allowed" ? classification.reason : "preview_expected",
    namedProviderCount: classification.namedProviders.length,
    fallbackUsed: plan !== null,
    elapsedMs: input.elapsedMs,
  });

  if (!plan) return null;
  return { guidanceText: TIMEOUT_FALLBACK_LEAD_IN, workflowPlan: plan };
}
