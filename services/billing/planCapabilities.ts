import {
  planCapabilitiesFor,
  type PlanTier,
  type PlanCapabilities,
} from "@/core/billing/planPolicy";
import * as accountBilling from "@/repositories/accountBilling";

/**
 * Account plan + feature-capability resolver (4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-2 /
 * CS-XT-1).
 *
 * Server-side only. Resolves the account's ACTUAL stored billing plan
 * (`account_billing.plan`, via the lean `accountBilling.getPlan` read) and maps it through the
 * pure `planCapabilitiesFor` policy. This is deliberately NOT `defaultPlanForAccountType` — the
 * member/folder limit helpers key off the structural account type, but feature gates must use the
 * real plan so a personal **Pro** account resolves Pro capabilities instead of the Free type
 * default (and so future paid-Team/Business behavior keys off the subscribed tier).
 *
 * NO-LEAK: the returned DTO carries ONLY the plan tier + boolean capabilities — never a Stripe
 * customer/subscription id (the underlying `getPlan` reads a single non-secret column). Nothing
 * enforces these capabilities yet; CS-XT-1 ships the resolver only, no route wiring.
 *
 * FAIL-CLOSED: if the account has no billing row, or the read throws, we resolve to **"free"**
 * (the most restrictive tier) and mark `fallback: true`. A capability gate must never fail OPEN —
 * a transient read problem denies the paid feature rather than granting it.
 */

export interface AccountCapabilities {
  /** Effective plan used for the decision (the stored plan, or "free" on fallback). */
  plan: PlanTier;
  /** Per-tier feature decisions. Plan + booleans only — no Stripe identifiers. */
  capabilities: PlanCapabilities;
  /** True when the plan could not be read and the resolver fell back to the restrictive default. */
  fallback: boolean;
}

/**
 * Resolve the account's effective billing plan, failing closed to "free". Returns `{ plan,
 * fallback }` so callers can distinguish a genuine Free account from a read-failure fallback.
 */
export async function resolveAccountPlan(
  accountId: string,
): Promise<{ plan: PlanTier; fallback: boolean }> {
  try {
    const plan = await accountBilling.getPlan(accountId);
    if (plan === null) return { plan: "free", fallback: true };
    return { plan, fallback: false };
  } catch {
    // Fail closed — a read error must not grant a paid capability.
    return { plan: "free", fallback: true };
  }
}

/**
 * Resolve the account's effective plan + feature capabilities. The single helper a future export
 * / template route calls (alongside its own membership + role checks) to answer "does this
 * account's plan permit the feature".
 */
export async function resolveAccountCapabilities(
  accountId: string,
): Promise<AccountCapabilities> {
  const { plan, fallback } = await resolveAccountPlan(accountId);
  return { plan, capabilities: planCapabilitiesFor(plan), fallback };
}
