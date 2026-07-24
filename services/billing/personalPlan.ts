import type { PlanStatus, PlanTier } from "@/core/billing/planPolicy";
import type { DowngradeBlocker } from "@/core/billing/downgradeRules";
import { getByIdServiceRole } from "@/repositories/accounts";
import { getUsage, getStripeAttachmentServiceRole } from "@/repositories/accountBilling";
import { previewDowngrade } from "@/services/billing/downgradePreview";
import {
  resumeSubscription,
  scheduleSubscriptionCancellation,
  type SubscriptionOpReason,
} from "@/services/billing/subscriptionCancellation";

/**
 * Personal-plan read + cancel-at-period-end (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-2 /
 * PPT-1). Backend foundation for the Personal Pro → Free choice flow — NO checkout dialog
 * or Settings toggle UI here (those are PPT-3/PPT-4).
 *
 * The route owns the auth and owner/admin role gate (billing is live — no feature-flag
 * gate); this service owns personal-only + freeze checks, the safe state read, and the
 * single mutation (set/undo cancel_at_period_end on the EXISTING personal subscription).
 *
 * Conservative by design: the cancel action sets ONLY the Stripe `cancel_at_period_end`
 * flag — it never writes plan/plan_status locally (the CS-4 webhook stays the sole writer
 * of those, syncing the flag back via subscription.updated). Cancellation is period-end,
 * never immediate; no data is deleted. Stripe customer/subscription ids are read
 * service-role and NEVER returned to the caller (CS-2 no-leak posture).
 */

// ─── Read ────────────────────────────────────────────────────────────────────

export type PersonalPlanReadReason = "account_not_found" | "not_personal";

export interface PersonalPlanState {
  /** True only when the personal account is on a live paid Pro subscription. */
  isPaidPersonalPro: boolean;
  plan: PlanTier;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  /** Whether a downgrade to Free is safe, with any over-limit blockers (CS-5 preview). */
  downgrade: { allowed: boolean; blockers: DowngradeBlocker[] };
}

export type GetPersonalPlanResult =
  | { ok: true; state: PersonalPlanState }
  | { ok: false; reason: PersonalPlanReadReason };

export async function getPersonalPlanState(
  accountId: string,
): Promise<GetPersonalPlanResult> {
  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.type !== "personal") return { ok: false, reason: "not_personal" };

  // Non-secret billing facts + service-role attachment (sub id used only to decide
  // "paid Pro"; the id itself never leaves this service).
  const [usage, attachment, downgrade] = await Promise.all([
    getUsage(accountId),
    getStripeAttachmentServiceRole(accountId),
    previewDowngrade(accountId, "free"),
  ]);

  const plan: PlanTier = usage?.plan ?? "free";
  const planStatus: PlanStatus = usage?.planStatus ?? "active";
  const isPaidPersonalPro =
    plan === "pro" &&
    (planStatus === "active" || planStatus === "trialing") &&
    Boolean(attachment?.stripeSubscriptionId);

  return {
    ok: true,
    state: {
      isPaidPersonalPro,
      plan,
      planStatus,
      currentPeriodEnd: usage?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: usage?.cancelAtPeriodEnd ?? false,
      downgrade: { allowed: downgrade.ok, blockers: downgrade.blockers },
    },
  };
}

// ─── Cancel at period end (set / undo) ───────────────────────────────────────

export type SetPersonalCancelReason =
  | "not_personal"
  | SubscriptionOpReason;

export type SetPersonalCancelResult =
  | { ok: true; cancelAtPeriodEnd: boolean; effectiveAt: string | null }
  | { ok: false; reason: SetPersonalCancelReason };

/**
 * Set (or undo) `cancel_at_period_end` on the personal account's existing Stripe
 * subscription.
 *
 * This keeps the personal-only product gate (the Pro→Free choice flow is personal-account
 * UX) but DELEGATES the Stripe work to the canonical account-scoped operation in
 * `subscriptionCancellation.ts` — there is exactly one cancellation contract in the
 * codebase, so personal and shared accounts cannot drift apart. Idempotent; still never
 * mutates account_billing.plan/plan_status (webhook authority).
 */
export async function setPersonalCancelAtPeriodEnd(
  accountId: string,
  cancel: boolean,
): Promise<SetPersonalCancelResult> {
  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.type !== "personal") return { ok: false, reason: "not_personal" };

  const result = cancel
    ? await scheduleSubscriptionCancellation(accountId)
    : await resumeSubscription(accountId);
  if (!result.ok) return { ok: false, reason: result.reason };
  return {
    ok: true,
    cancelAtPeriodEnd: result.cancelAtPeriodEnd,
    effectiveAt: result.effectiveAt,
  };
}
