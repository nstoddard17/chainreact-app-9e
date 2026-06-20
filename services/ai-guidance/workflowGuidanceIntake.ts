/**
 * Workflow-guidance intake service — SKELETON (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * The single seam a future caller (e.g. a React Agent advisory capability) uses to ask for
 * workflow guidance. It:
 *   1. SANITIZES the workflow (the privacy boundary) into a de-identified request, then
 *   2. asks an injected `WorkflowGuidanceProvider` for ADVICE (default: the noop provider).
 *
 * It NEVER mutates the workflow, applies a patch, saves/runs anything, calls a model
 * directly, or reads/writes the DB — it imports no repository, no mutation service, and no
 * model client. Guidance is ADVISORY: ChainReact's deterministic validator + apply pipeline
 * remain the source of truth and the only mutation path. The mapping of any provider
 * suggestion back to real node ids (via the sanitizer's internal ref map) and any decision
 * to act on it is a SEPARATE, future, approval-gated step — not this function.
 */

import type { WorkflowDefinition } from "@/contracts/workflow";
import type { GuidanceKind, GuidanceResult } from "@/contracts/aiGuidance";
import type { WorkflowGuidanceProvider } from "./types";
import { sanitizeWorkflowForGuidance } from "./sanitizeWorkflowForGuidance";
import { noopWorkflowGuidanceProvider } from "./noopGuidanceProvider";

export interface WorkflowGuidanceIntakeInput {
  /** Read-only — the intake never mutates it. */
  readonly definition: WorkflowDefinition;
  readonly guidanceKind: GuidanceKind;
  /** Optional SAFE finding codes; filtered by the sanitizer. */
  readonly findingCodes?: readonly string[];
  /** Defaults to the noop provider; a future caller injects the hosted Hermes adapter. */
  readonly provider?: WorkflowGuidanceProvider;
}

export async function requestWorkflowGuidance(
  input: WorkflowGuidanceIntakeInput,
): Promise<GuidanceResult> {
  const provider = input.provider ?? noopWorkflowGuidanceProvider;
  const { request } = sanitizeWorkflowForGuidance({
    definition: input.definition,
    guidanceKind: input.guidanceKind,
    ...(input.findingCodes ? { findingCodes: input.findingCodes } : {}),
  });
  // Only the de-identified `request` crosses to the provider — never the definition or the ref map.
  return provider.getWorkflowGuidance(request);
}
