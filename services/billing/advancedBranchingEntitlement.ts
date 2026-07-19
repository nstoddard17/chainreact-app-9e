import {
  isAdvancedBranchingEntitled,
  type PlanStatus,
  type PlanTier,
} from "@/core/billing/planPolicy";
import * as accountBilling from "@/repositories/accountBilling";

/**
 * The ONE server-side answer to "can this workflow's owning account use advanced
 * branching right now?" (BRANCH-ENT-1).
 *
 * Every enforcement boundary (definition save, template instantiation, AI mutation
 * proposal, activate/publish/run-now preflights, and the engine pre-execution gate)
 * resolves entitlement through this module — never through scattered
 * `plan === "free"` checks and never from `accounts.type`.
 *
 * Decision inputs are the WORKFLOW-OWNING account's `account_billing.plan` +
 * `plan_status` (Stripe webhook is the sole writer of both), combined by the pure
 * `isAdvancedBranchingEntitled` policy: tier must be Pro+ AND status must be
 * active / trialing / past_due. `billing_mode='internal_free'` deliberately plays no
 * part here — it bypasses task DEDUCTION only, never plan capabilities.
 *
 * FAIL-CLOSED: a missing billing row or a read error resolves to
 * (`plan: "free"`, `entitled: false`, `fallback: true`). Unknown or unprovable
 * entitlement must deny, mirroring `resolveAccountPlan`.
 *
 * NO-LEAK: the DTO carries only the tier/status pair + booleans — never Stripe ids.
 * Callers must run their normal account-authorization checks BEFORE consulting this
 * resolver so the typed denial can never disclose account existence or plan across
 * an authz boundary.
 */
export interface AdvancedBranchingEntitlement {
  /** Whether the account may use advanced branching right now. */
  entitled: boolean;
  /** Effective plan used for the decision ("free" on fallback). */
  plan: PlanTier;
  /** Billing status used for the decision, or null when no row was readable. */
  planStatus: PlanStatus | null;
  /** True when the billing row could not be read and the resolver failed closed. */
  fallback: boolean;
}

function decide(
  state: accountBilling.AccountPlanState | null,
): AdvancedBranchingEntitlement {
  if (!state) {
    return { entitled: false, plan: "free", planStatus: null, fallback: true };
  }
  return {
    entitled: isAdvancedBranchingEntitled(state.plan, state.planStatus),
    plan: state.plan,
    planStatus: state.planStatus,
    fallback: false,
  };
}

/**
 * User-context resolution (SSR-cookie / RLS read). Use from routes/services running
 * inside an authenticated request AFTER membership authorization has passed.
 */
export async function resolveAdvancedBranchingEntitlement(
  accountId: string,
): Promise<AdvancedBranchingEntitlement> {
  try {
    return decide(await accountBilling.getPlanState(accountId));
  } catch {
    // Fail closed — a read error must never grant a paid capability.
    return { entitled: false, plan: "free", planStatus: null, fallback: true };
  }
}

/**
 * Service-role resolution for background contexts with no user session (engine
 * pre-execution gate, queue processor, trigger dispatch). Same decision, same
 * fail-closed posture.
 */
export async function resolveAdvancedBranchingEntitlementServiceRole(
  accountId: string,
): Promise<AdvancedBranchingEntitlement> {
  try {
    return decide(await accountBilling.getPlanStateServiceRole(accountId));
  } catch {
    return { entitled: false, plan: "free", planStatus: null, fallback: true };
  }
}
