import type { WorkflowDefinition } from "@/contracts/workflow";
import {
  ADVANCED_BRANCHING_CAPABILITY,
  ADVANCED_BRANCHING_MIN_PLAN,
  advancedBranchingNodeIds,
  definitionUsesAdvancedBranching,
} from "@/core/workflows/advancedBranching";
import {
  resolveAdvancedBranchingEntitlement,
  resolveAdvancedBranchingEntitlementServiceRole,
} from "@/services/billing/advancedBranchingEntitlement";

/**
 * Shared plan-feature gate for workflow DEFINITIONS (BRANCH-ENT-1 C5).
 *
 * One rule, every boundary: a definition that uses advanced branching
 * (If/Then Condition, Router) may only be SAVED INTO or EXECUTED FOR an
 * account whose current billing entitles it (Pro+ live/trialing/past_due —
 * see `services/billing/advancedBranchingEntitlement`). The check runs on the
 * PROPOSED / EFFECTIVE definition, so a downgraded account can always save a
 * compliant replacement (removing the branching nodes) and can always READ
 * its workflows — reads are never gated here.
 *
 * Callers MUST run account authorization (membership / no-leak 404) BEFORE
 * this gate: the typed error deliberately carries no account facts beyond
 * what the already-authorized caller may see.
 */

/** Stable wire code for the typed error (routes return it with HTTP 403). */
export const PLAN_FEATURE_REQUIRED_CODE = "PLAN_FEATURE_REQUIRED" as const;

/** Safe upgrade destination — matches the failed-run CTA (`failedRunCta`). */
export const PLAN_FEATURE_UPGRADE_ROUTE = "/account" as const;

/** User-facing copy shared by save/apply/template rejections. */
export const ADVANCED_BRANCHING_REQUIRED_MESSAGE =
  "This workflow uses If/Else routing (advanced branching), which requires the Pro plan or higher. Upgrade, or remove the branching step to continue." as const;

export class PlanFeatureRequiredError extends Error {
  readonly name = "PlanFeatureRequiredError";
  readonly code = PLAN_FEATURE_REQUIRED_CODE;
  readonly capability = ADVANCED_BRANCHING_CAPABILITY;
  readonly requiredPlan = ADVANCED_BRANCHING_MIN_PLAN;
  readonly upgradeRoute = PLAN_FEATURE_UPGRADE_ROUTE;
  /** The offending node ids — safe: the caller is already workflow-authorized. */
  readonly nodeIds: readonly string[];

  constructor(nodeIds: readonly string[]) {
    super(ADVANCED_BRANCHING_REQUIRED_MESSAGE);
    this.nodeIds = nodeIds;
  }
}

export function isPlanFeatureRequiredError(
  err: unknown,
): err is PlanFeatureRequiredError {
  return (
    err instanceof Error &&
    (err as PlanFeatureRequiredError).code === PLAN_FEATURE_REQUIRED_CODE
  );
}

export interface AssertDefinitionPlanEntitlementInput {
  /** The WORKFLOW-OWNING account (never the acting user's active account). */
  accountId: string;
  /** The proposed (save paths) or effective (execution paths) definition. */
  definition: WorkflowDefinition;
  /**
   * `user` (default) resolves billing through the SSR/RLS client — for
   * authenticated request contexts. `service_role` is for background
   * execution contexts (engine / queue / dispatch) with no user session.
   */
  context?: "user" | "service_role";
}

/**
 * Throws {@link PlanFeatureRequiredError} when `definition` uses advanced
 * branching and the owning account's CURRENT entitlement does not allow it
 * (unknown/unreadable entitlement fails closed to denied). No-op for
 * definitions without branching nodes — a compliant replacement always saves.
 */
export async function assertDefinitionPlanEntitlement(
  input: AssertDefinitionPlanEntitlementInput,
): Promise<void> {
  if (!definitionUsesAdvancedBranching(input.definition)) return;
  const entitlement =
    input.context === "service_role"
      ? await resolveAdvancedBranchingEntitlementServiceRole(input.accountId)
      : await resolveAdvancedBranchingEntitlement(input.accountId);
  if (entitlement.entitled) return;
  throw new PlanFeatureRequiredError(advancedBranchingNodeIds(input.definition));
}

/**
 * JSON body for the typed 403 the routes return. One shape everywhere so the
 * client renders the same upgrade CTA for save / AI apply / template /
 * activate / run attempts. Never includes Stripe data or the current plan of
 * an account the caller isn't already authorized on.
 */
export function planFeatureRequiredBody(err: PlanFeatureRequiredError): {
  error: string;
  code: typeof PLAN_FEATURE_REQUIRED_CODE;
  capability: string;
  requiredPlan: string;
  upgradeRoute: string;
  nodeIds: readonly string[];
} {
  return {
    error: err.message,
    code: PLAN_FEATURE_REQUIRED_CODE,
    capability: err.capability,
    requiredPlan: err.requiredPlan,
    upgradeRoute: err.upgradeRoute,
    nodeIds: err.nodeIds,
  };
}
