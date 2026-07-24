import type { PlanStatus, PlanTier } from "@/core/billing/planPolicy";
import {
  isLiveStripeSubscriptionStatus,
  resolveSubscriptionPeriodEndSeconds,
} from "@/core/billing/stripeSubscriptionFacts";
import { getByIdServiceRole } from "@/repositories/accounts";
import {
  getBillingModeServiceRole,
  getStripeAttachmentServiceRole,
  getUsage,
} from "@/repositories/accountBilling";
import {
  PlatformStripeApiError,
  PlatformStripeConfigError,
  getPlatformStripeClient,
  type PlatformStripeClient,
} from "@/services/billing/platformStripeClient";

/**
 * CANONICAL account-scoped subscription cancellation (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * The ONE place that cancels, resumes, or interrogates ChainReact's OWN billing
 * subscription for an account. Every caller — the Billing settings surface, the personal
 * Pro→Free choice flow (`personalPlan.ts`), the account-deletion request, and the purge
 * fail-closed guard — goes through here so there is exactly one Stripe cancellation
 * contract in the codebase.
 *
 * ── Scope: it is ACCOUNT-scoped, never user-scoped ──────────────────────────────────────
 * Every operation resolves the subscription from `account_billing(account_id)`. Deleting a
 * user's PERSONAL account can therefore only ever cancel the personal account's own
 * subscription — a team/organization account the user merely belongs to has its own
 * `account_billing` row and is never reached from here. There is no user→subscription
 * lookup anywhere in this module.
 *
 * ── NOT the workflow Stripe provider ────────────────────────────────────────────────────
 * This uses the PLATFORM Stripe client (`STRIPE_SECRET_KEY`, ChainReact's own billing
 * account). It has no relationship whatsoever to `integrations/stripe/` — the customer's
 * connected Stripe account used inside their workflows. Canceling a ChainReact plan never
 * touches a customer's own Stripe subscriptions, and the customer's Stripe INTEGRATION is
 * disconnected/revoked only by the normal integration teardown at purge.
 *
 * ── Source of truth ─────────────────────────────────────────────────────────────────────
 * Stripe is authoritative for subscription STATUS; the CS-4 webhook
 * (`stripeBillingWebhook.ts`) remains the sole writer of `account_billing.plan` /
 * `plan_status`. Nothing in this module writes a plan or a status — a cancel here only
 * changes Stripe, and the local downgrade arrives via the subsequent
 * `customer.subscription.*` event. That is why "cancel" never optimistically shows Free.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────────────────
 * Every mutation reads the live subscription first and no-ops when it is already in the
 * requested state, and every "the subscription is already gone" condition (`404` /
 * `resource_missing`) is a SUCCESS, not an error. Repeat calls are therefore safe from the
 * UI, from a retried deletion request, and from the reconciliation cron.
 *
 * ── No-leak ─────────────────────────────────────────────────────────────────────────────
 * Stripe customer / subscription ids are read service-role and NEVER returned, logged, or
 * surfaced in an error. Every exported result carries only booleans, plan tiers, and dates.
 */

// ─── Shared failure vocabulary ───────────────────────────────────────────────

export type SubscriptionOpReason =
  | "account_not_found"
  /** The account is `pending_deletion` — plan changes are unavailable while frozen. */
  | "account_frozen"
  /** BIE-1 internal_free account — no paid billing exists, so nothing to cancel. */
  | "internal_account"
  /** No `stripe_subscription_id` attached — the account never subscribed. */
  | "no_subscription"
  /** The subscription exists locally but is already fully ended in Stripe. */
  | "subscription_already_ended"
  /** `STRIPE_SECRET_KEY` missing — platform billing is not configured. */
  | "stripe_not_configured";

/** Metadata key stamped on a subscription canceled because the account is being deleted. */
export const CANCELED_BY_METADATA_KEY = "chainreact_canceled_by";
/** Metadata value recorded when the cancellation was initiated by account deletion. */
export const CANCELED_BY_ACCOUNT_DELETION = "account_deletion";

// ─── Live Stripe subscription read ───────────────────────────────────────────

interface LiveSubscription {
  status: string | null;
  cancelAtPeriodEnd: boolean;
  /** ISO period end resolved Basil-aware, or null when Stripe reports none. */
  currentPeriodEnd: string | null;
}

interface StripeSubscriptionResponse {
  status?: unknown;
  cancel_at_period_end?: unknown;
  [key: string]: unknown;
}

function toLiveSubscription(obj: StripeSubscriptionResponse): LiveSubscription {
  const seconds = resolveSubscriptionPeriodEndSeconds(obj as Record<string, unknown>);
  return {
    status: typeof obj.status === "string" ? obj.status : null,
    cancelAtPeriodEnd: obj.cancel_at_period_end === true,
    currentPeriodEnd:
      seconds !== null ? new Date(seconds * 1000).toISOString() : null,
  };
}

/**
 * True when a Stripe error means "this subscription does not exist (any more)". Branches on
 * the machine-readable status/code, never on the human message — so a copy change at Stripe
 * cannot silently turn an idempotent no-op into a hard failure.
 */
function isMissingResource(err: unknown): boolean {
  return (
    err instanceof PlatformStripeApiError &&
    (err.status === 404 || err.stripeCode === "resource_missing")
  );
}

/** GET the live subscription, or null when Stripe no longer has it. Other errors throw. */
async function fetchLiveSubscription(
  client: PlatformStripeClient,
  subscriptionId: string,
): Promise<LiveSubscription | null> {
  try {
    const res = await client.request<StripeSubscriptionResponse>({
      method: "GET",
      path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    });
    return toLiveSubscription(res);
  } catch (err) {
    if (isMissingResource(err)) return null;
    throw err;
  }
}

// ─── Resolution shared by every operation ────────────────────────────────────

interface ResolvedTarget {
  subscriptionId: string;
  client: PlatformStripeClient;
}

type ResolveResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; reason: SubscriptionOpReason };

/**
 * Resolve the account's subscription + a platform Stripe client, applying the shared gates.
 * `allowFrozen` is set ONLY by the deletion/purge paths — a frozen account must still be
 * able to have its billing canceled (that is the whole point), while an interactive plan
 * change must not run on a frozen account.
 */
async function resolveTarget(
  accountId: string,
  options: { allowFrozen: boolean },
): Promise<ResolveResult> {
  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (!options.allowFrozen && account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }
  if ((await getBillingModeServiceRole(accountId)) === "internal_free") {
    return { ok: false, reason: "internal_account" };
  }

  const attachment = await getStripeAttachmentServiceRole(accountId);
  const subscriptionId = attachment?.stripeSubscriptionId;
  if (!subscriptionId) return { ok: false, reason: "no_subscription" };

  try {
    return { ok: true, target: { subscriptionId, client: getPlatformStripeClient() } };
  } catch (e) {
    if (e instanceof PlatformStripeConfigError) {
      return { ok: false, reason: "stripe_not_configured" };
    }
    throw e;
  }
}

// ─── Read: safe account subscription state ───────────────────────────────────

export interface AccountSubscriptionState {
  plan: PlanTier;
  planStatus: PlanStatus;
  /** True when a Stripe subscription is attached to this account. */
  hasSubscription: boolean;
  /** True when the account is on a live PAID subscription that can be canceled. */
  isCancelable: boolean;
  /** True when cancellation is already scheduled (resume is the available action). */
  cancelAtPeriodEnd: boolean;
  /** ISO period boundary — the renewal date, or the cancellation-effective date. */
  currentPeriodEnd: string | null;
  /** True when the account is frozen (`pending_deletion`) — actions are unavailable. */
  frozen: boolean;
  /** True for a BIE-1 internal_free account — it has no paid billing at all. */
  internalBilling: boolean;
}

export type GetAccountSubscriptionResult =
  | { ok: true; state: AccountSubscriptionState }
  | { ok: false; reason: "account_not_found" };

/**
 * Safe, account-scoped subscription state for the Billing UI. Reads LOCAL synced facts
 * only — no Stripe round-trip — because the webhook is the source of truth for what we
 * display, and a settings page must not depend on Stripe being reachable. Carries no
 * Stripe ids.
 */
export async function getAccountSubscriptionState(
  accountId: string,
): Promise<GetAccountSubscriptionResult> {
  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };

  const [usage, attachment, billingMode] = await Promise.all([
    getUsage(accountId),
    getStripeAttachmentServiceRole(accountId),
    getBillingModeServiceRole(accountId),
  ]);

  const plan: PlanTier = usage?.plan ?? "free";
  const planStatus: PlanStatus = usage?.planStatus ?? "active";
  const hasSubscription = Boolean(attachment?.stripeSubscriptionId);
  // Cancelable = a real paid subscription that has not already ended. `past_due` is
  // deliberately included: a customer in dunning must still be able to stop the plan.
  const isCancelable =
    hasSubscription &&
    plan !== "free" &&
    billingMode !== "internal_free" &&
    planStatus !== "canceled";

  return {
    ok: true,
    state: {
      plan,
      planStatus,
      hasSubscription,
      isCancelable,
      cancelAtPeriodEnd: usage?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: usage?.currentPeriodEnd ?? null,
      frozen: account.deletionStatus === "pending_deletion",
      internalBilling: billingMode === "internal_free",
    },
  };
}

// ─── Schedule cancellation at period end / resume ────────────────────────────

export interface SetCancellationSuccess {
  ok: true;
  cancelAtPeriodEnd: boolean;
  /**
   * When cancellation is scheduled, the ISO date paid access ends (Stripe's authoritative
   * period end read back from the mutation response). Null when unknown or when resuming.
   */
  effectiveAt: string | null;
  /** True when the subscription was ALREADY in the requested state (no Stripe write). */
  alreadyInState: boolean;
}

export type SetCancellationResult =
  | SetCancellationSuccess
  | { ok: false; reason: SubscriptionOpReason };

async function setCancelAtPeriodEnd(
  accountId: string,
  cancel: boolean,
): Promise<SetCancellationResult> {
  const resolved = await resolveTarget(accountId, { allowFrozen: false });
  if (!resolved.ok) return resolved;
  const { subscriptionId, client } = resolved.target;

  const live = await fetchLiveSubscription(client, subscriptionId);
  // Gone at Stripe, or already dead: there is nothing to schedule or resume. Honest,
  // specific outcome — never a fake success and never a fake error.
  if (live === null || !isLiveStripeSubscriptionStatus(live.status)) {
    return { ok: false, reason: "subscription_already_ended" };
  }
  if (live.cancelAtPeriodEnd === cancel) {
    // Idempotent no-op — do not spend a Stripe write to set the value it already has.
    return {
      ok: true,
      cancelAtPeriodEnd: cancel,
      effectiveAt: cancel ? live.currentPeriodEnd : null,
      alreadyInState: true,
    };
  }

  const updated = await client.request<StripeSubscriptionResponse>({
    method: "POST",
    path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    body: { cancel_at_period_end: cancel },
  });
  const after = toLiveSubscription(updated);

  return {
    ok: true,
    cancelAtPeriodEnd: cancel,
    effectiveAt: cancel ? (after.currentPeriodEnd ?? live.currentPeriodEnd) : null,
    alreadyInState: false,
  };
}

/**
 * Schedule the account's subscription to cancel at the END of the current billing period.
 * The account, its workflows, integrations, runs, and history are untouched; paid
 * entitlements continue until `effectiveAt`. Idempotent. Never writes plan/status — the
 * local downgrade happens only when Stripe confirms the subscription ended.
 */
export function scheduleSubscriptionCancellation(
  accountId: string,
): Promise<SetCancellationResult> {
  return setCancelAtPeriodEnd(accountId, true);
}

/**
 * Undo a scheduled cancellation ("Keep plan") so the subscription renews normally.
 * Idempotent. Only valid while the subscription is still live — once it has actually
 * ended, the account must subscribe again (→ `subscription_already_ended`).
 */
export function resumeSubscription(accountId: string): Promise<SetCancellationResult> {
  return setCancelAtPeriodEnd(accountId, false);
}

// ─── Immediate cancellation for account deletion ─────────────────────────────

export type DeletionCancellationOutcome =
  /** A live subscription was canceled immediately by this call. */
  | "canceled"
  /** Nothing to do — no subscription, internal billing, or already fully ended. */
  | "not_applicable";

export type CancelForDeletionResult =
  | { ok: true; outcome: DeletionCancellationOutcome }
  /** Stripe was reachable but refused, or is unreachable/misconfigured. NOT a success. */
  | { ok: false; reason: "stripe_unavailable" | "stripe_not_configured" };

/**
 * Cancel the account's ChainReact subscription IMMEDIATELY because the account is being
 * deleted. Runs on a FROZEN account by design (`allowFrozen`) — the deletion request
 * freezes first, then cancels.
 *
 * Immediate (`DELETE /v1/subscriptions/{id}`) rather than at-period-end: a deleted account
 * cannot use what it is paying for, so leaving a live subscription open for up to a month
 * would keep an unusable plan on the customer's card. No proration/refund is requested —
 * there is no refund policy in the product today, so this deliberately does NOT pass
 * `prorate` and never issues money back on its own.
 *
 * The cancellation is stamped with `chainreact_canceled_by=account_deletion` in Stripe
 * subscription metadata, which is the durable, observable record of WHY the subscription
 * ended (readable in the Stripe Dashboard and on every subsequent webhook event) without
 * needing a new local column.
 *
 * Idempotent and honest:
 *   - no subscription / internal billing / already ended → `not_applicable` (success);
 *   - a live subscription → canceled → `canceled`;
 *   - Stripe unreachable, misconfigured, or refusing → `ok:false`. The CALLER must not
 *     report deletion as complete on a false result.
 */
export async function cancelSubscriptionForAccountDeletion(
  accountId: string,
): Promise<CancelForDeletionResult> {
  let resolved: ResolveResult;
  try {
    resolved = await resolveTarget(accountId, { allowFrozen: true });
  } catch {
    // A repository/read failure must not read as "nothing to cancel".
    return { ok: false, reason: "stripe_unavailable" };
  }

  if (!resolved.ok) {
    switch (resolved.reason) {
      case "no_subscription":
      case "internal_account":
      case "account_not_found":
        // Free / internal / already-gone accounts need no Stripe call at all.
        return { ok: true, outcome: "not_applicable" };
      case "stripe_not_configured":
        return { ok: false, reason: "stripe_not_configured" };
      default:
        return { ok: false, reason: "stripe_unavailable" };
    }
  }

  const { subscriptionId, client } = resolved.target;
  try {
    const live = await fetchLiveSubscription(client, subscriptionId);
    if (live === null || !isLiveStripeSubscriptionStatus(live.status)) {
      return { ok: true, outcome: "not_applicable" };
    }

    // Stamp the reason BEFORE cancelling so the metadata survives on the canceled
    // subscription and on the resulting `customer.subscription.deleted` event.
    await client.request({
      method: "POST",
      path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      body: {
        metadata: { [CANCELED_BY_METADATA_KEY]: CANCELED_BY_ACCOUNT_DELETION },
      },
    });

    await client.request({
      method: "DELETE",
      path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      // Stripe dedups a repeated immediate-cancel inside its 24h window; combined with the
      // status pre-check this makes a retried deletion request a true no-op.
      idempotencyKey: `account-deletion-cancel:${accountId}:${subscriptionId}`,
    });
    return { ok: true, outcome: "canceled" };
  } catch (err) {
    if (isMissingResource(err)) return { ok: true, outcome: "not_applicable" };
    return { ok: false, reason: "stripe_unavailable" };
  }
}

// ─── Purge fail-closed guard ─────────────────────────────────────────────────

export type RenewableCheck =
  /** Verified against Stripe: the account has no subscription that can bill again. */
  | { ok: true; renewable: false }
  /** Verified against Stripe: a live subscription remains. Purge MUST NOT proceed. */
  | { ok: true; renewable: true }
  /** Could not verify (Stripe unreachable/misconfigured). Purge MUST NOT proceed. */
  | { ok: false; reason: "unverifiable" };

/**
 * Authoritative "can this account still be billed?" check for the purge fail-closed guard.
 *
 * Deliberately asks STRIPE rather than trusting the local `plan_status` mirror: the purge
 * permanently destroys the account row (and with it the only handle to the subscription),
 * so it must not proceed on a webhook that might not have arrived. An unverifiable answer
 * is NOT treated as "safe" — the caller skips the purge and the next cron tick retries.
 *
 * A subscription that is merely `cancel_at_period_end` still counts as renewable here (see
 * `isLiveStripeSubscriptionStatus`): deletion cancels immediately, so anything still live
 * at purge time means the cancellation did not take effect.
 */
export async function accountHasRenewableSubscription(
  accountId: string,
): Promise<RenewableCheck> {
  let resolved: ResolveResult;
  try {
    resolved = await resolveTarget(accountId, { allowFrozen: true });
  } catch {
    return { ok: false, reason: "unverifiable" };
  }

  if (!resolved.ok) {
    switch (resolved.reason) {
      case "no_subscription":
      case "internal_account":
      case "account_not_found":
        return { ok: true, renewable: false };
      default:
        // Stripe not configured → we cannot prove the subscription is dead. Fail closed.
        return { ok: false, reason: "unverifiable" };
    }
  }

  try {
    const live = await fetchLiveSubscription(
      resolved.target.client,
      resolved.target.subscriptionId,
    );
    if (live === null) return { ok: true, renewable: false };
    return { ok: true, renewable: isLiveStripeSubscriptionStatus(live.status) };
  } catch {
    return { ok: false, reason: "unverifiable" };
  }
}
