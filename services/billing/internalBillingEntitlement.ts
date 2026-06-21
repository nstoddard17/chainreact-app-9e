import {
  INTERNAL_BILLING_REASONS,
  getBillingModeServiceRole,
  revertBillingModeToStandardServiceRole,
  setBillingModeInternalFreeServiceRole,
  type BillingMode,
  type InternalBillingReason,
} from "@/repositories/accountBilling";

/**
 * Internal billing entitlement — internal-admin / service-role-only surface
 * (Slice 4.BILLING-INTERNAL-ENTITLEMENT-1 / BIE-1).
 *
 * "Internal admin" here means a ChainReact PLATFORM operator (Marcus / business
 * partner / internal staff) acting out-of-band — NOT a customer/team account
 * member with `account_memberships.role = 'owner'` or `'admin'`. The entitlement
 * is tied to the account's `billing_mode` column, never to any customer account
 * role.
 *
 * The single programmatic entry point for marking an account `internal_free`
 * (task-limit + Stripe-checkout bypass) or reverting it to `standard`. There is
 * NO client/HTTP route and NO customer-facing UI — the only callers are
 * server-side / service-role (the `scripts/mark-account-internal.mjs` seed
 * script, or a future internal admin tool). The mutation flows through the
 * service-role helpers in repositories/accountBilling, each of which passes an
 * audit `reason` (including the acting user id) to getServiceRoleClient so the
 * action is logged.
 *
 * This is ACCOUNT-level, not user-level: it flips a column on the workflow-owning
 * account's `account_billing` row. It does NOT grant any user — platform operator
 * or customer account owner/admin — a global bypass, and a standard account is
 * always billed regardless of who runs its workflows.
 *
 * It never fakes Stripe state — an internal_free account simply has no
 * subscription; checkout/portal short-circuit before any Stripe call.
 */

export { INTERNAL_BILLING_REASONS };
export type { BillingMode, InternalBillingReason };

export interface MarkAccountInternalFreeInput {
  /** The account whose billing row is flipped (workflow-owning account). */
  accountId: string;
  /** Why this account is internal (constrained set; audit + reporting). */
  reason: InternalBillingReason;
  /** The user performing the change — recorded for audit provenance. */
  setByUserId: string;
}

function assertValidReason(reason: string): asserts reason is InternalBillingReason {
  if (!INTERNAL_BILLING_REASONS.includes(reason as InternalBillingReason)) {
    throw new Error(
      `internalBillingEntitlement: invalid reason ${JSON.stringify(reason)}; expected one of ${INTERNAL_BILLING_REASONS.join(", ")}`,
    );
  }
}

/**
 * Mark an account `internal_free`: its runs skip task deduction and it never
 * needs Stripe checkout. Validates the reason, requires a non-empty actor id, and
 * delegates to the audited service-role write.
 */
export async function markAccountInternalFree(
  input: MarkAccountInternalFreeInput,
): Promise<void> {
  assertValidReason(input.reason);
  if (!input.accountId || input.accountId.trim().length === 0) {
    throw new Error("internalBillingEntitlement: accountId is required.");
  }
  if (!input.setByUserId || input.setByUserId.trim().length === 0) {
    throw new Error("internalBillingEntitlement: setByUserId is required for audit.");
  }
  await setBillingModeInternalFreeServiceRole(input.accountId, input.reason, input.setByUserId);
}

/**
 * Revert an account to `standard` billing (clears internal metadata). After this
 * the account flows through the normal deduction gate + Stripe checkout again.
 */
export async function revertAccountToStandardBilling(accountId: string): Promise<void> {
  if (!accountId || accountId.trim().length === 0) {
    throw new Error("internalBillingEntitlement: accountId is required.");
  }
  await revertBillingModeToStandardServiceRole(accountId);
}

/** Read the current billing mode of an account (service-role). */
export async function getAccountBillingMode(accountId: string): Promise<BillingMode> {
  return getBillingModeServiceRole(accountId);
}
