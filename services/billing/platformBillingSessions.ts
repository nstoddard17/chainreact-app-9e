import type { PlanTier, BillingInterval } from "@/core/billing/planPolicy";
import { isPlanAllowedForType, upgradeTargetAccountType } from "@/core/billing/planPolicy";
import { getByIdServiceRole } from "@/repositories/accounts";
import {
  attachStripeCustomerIfAbsentServiceRole,
  getBillingModeServiceRole,
  getStripeAttachmentServiceRole,
} from "@/repositories/accountBilling";
import {
  PlatformStripeConfigError,
  getPlatformStripeClient,
} from "@/services/billing/platformStripeClient";
import { resolvePlanPrice } from "@/services/billing/platformStripePrices";
import { isTrialEligiblePlan } from "@/core/billing/trialPolicy";
import { resolveTrialPeriodDays } from "@/services/billing/platformTrialConfig";
import { claimAccountTrialServiceRole } from "@/repositories/accountBilling";

/**
 * Platform billing — Checkout + Customer Portal SESSION creation
 * (Slice 4.BILLING-PLAN-METADATA-4 / CS-3).
 *
 * Owns the server-side business logic behind the two account-scoped billing routes. The
 * ROUTE owns the auth gate and the owner/admin role gate (billing is live — no feature-flag
 * gate); THIS service is reached only after those pass and
 * owns: freeze check, plan↔type validation, SERVER-side price resolution (a client may
 * never choose a price id), lazy + race-safe Stripe customer attach, and Stripe session
 * creation. It returns typed result unions the route maps to HTTP — no secret or Stripe
 * id ever appears in a failure reason.
 *
 * HARD SCOPE (CS-3): creates Checkout / Portal sessions ONLY. It does NOT sync
 * subscription state and MUST NOT mutate `account_billing.plan` / `plan_status` — Stripe
 * redirect success is NOT proof of a paid subscription; the CS-4 webhook is the sole
 * authority that flips plan/status. Checkout writes exactly two things: `stripe_customer_id`
 * (lazy attach) and — for an approved Pro/Team trial only — the account's atomic one-trial
 * claim (`trial_consumed_at` etc., via the claim RPC; PRO-TEAM-TRIAL-ENFORCEMENT-1). It never
 * touches plan/status.
 *
 * Separate from the WORKFLOW Stripe provider (`integrations/stripe/`) — uses the platform
 * secret-key client, never a per-merchant OAuth token.
 */

function appBaseUrl(): string {
  // Mirrors the OAuth-callback convention (app/api/integrations/oauth/.../callback):
  // redirect bases come from NEXT_PUBLIC_APP_URL, not request.url (proxy-safe).
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// ─── Checkout ────────────────────────────────────────────────────────────────

export type CheckoutFailureReason =
  | "account_not_found"
  | "account_frozen"
  /** BIE-1 — account is internal_free; it has no paid billing and never checks out. */
  | "internal_account"
  | "invalid_plan_for_type"
  /** free / enterprise — no fixed online price (enterprise = contact sales). */
  | "plan_not_purchasable"
  /** a paid tier whose Stripe price env var is unset/blank — a server misconfig. */
  | "price_not_configured"
  /** STRIPE_SECRET_KEY missing — platform billing not configured. */
  | "stripe_not_configured";

export type CreateCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: CheckoutFailureReason };

export interface CreateCheckoutInput {
  accountId: string;
  /** The plan the caller asked to buy. Validated server-side against the account type
   *  and purchasability — accepts any PlanTier so non-purchasable tiers are rejected
   *  here (defense-in-depth) even though the route's body schema only allows paid tiers. */
  requestedPlan: PlanTier;
  /** Billing interval to purchase. Defaults to `monthly` when omitted (backward compatible). */
  interval?: BillingInterval;
  /** Safe contact email for the Stripe customer (the acting owner/admin's session email),
   *  or null when unavailable. Never a client-supplied value. */
  contactEmail?: string | null;
}

interface StripeIdResponse {
  id: string;
}
interface StripeUrlResponse {
  url: string;
}

/**
 * Create a Stripe Checkout Session (mode: subscription) for an account plan change.
 * Returns only the redirect `url`. Does NOT change plan/status (webhook owns that).
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const { accountId, requestedPlan, contactEmail } = input;
  const interval: BillingInterval = input.interval ?? "monthly";

  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // BIE-1 — internal_free accounts bypass paid billing entirely. Short-circuit
  // BEFORE any Stripe call (no customer created, no checkout session) so a marked
  // internal/test account never requires payment setup.
  if ((await getBillingModeServiceRole(accountId)) === "internal_free") {
    return { ok: false, reason: "internal_account" };
  }

  // Plan must be valid for the account's structural type (personal→pro, team→team,
  // organization→business/enterprise) OR a recognized in-place UPGRADE (BU-2: team→business,
  // which the webhook later flips to `organization`). Server-enforced — the client cannot
  // bypass it. This slice only PERMITS the upgrade checkout + stamps trusted metadata; it
  // does NOT mutate accounts.type or account_billing.plan.
  const upgradeTargetType = upgradeTargetAccountType(account.type, requestedPlan);
  if (!isPlanAllowedForType(account.type, requestedPlan) && upgradeTargetType === null) {
    return { ok: false, reason: "invalid_plan_for_type" };
  }

  // Resolve the price SERVER-side from config for the requested interval — the client never
  // supplies a price id, only the interval (validated by the route enum).
  const price = resolvePlanPrice(requestedPlan, interval);
  if (price.envVar === null) {
    // free (no charge) or enterprise (custom/contact-sales) — not purchasable online.
    return { ok: false, reason: "plan_not_purchasable" };
  }
  if (price.missing || !price.priceId) {
    return { ok: false, reason: "price_not_configured" };
  }

  let client;
  try {
    client = getPlatformStripeClient();
  } catch (e) {
    if (e instanceof PlatformStripeConfigError) {
      return { ok: false, reason: "stripe_not_configured" };
    }
    throw e;
  }

  // Lazy + race-safe customer attach. The Idempotency-Key dedups repeated create
  // attempts inside Stripe's 24h window; the guarded DB write + unique index dedup at
  // the persistence layer.
  const existing = await getStripeAttachmentServiceRole(accountId);
  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await client.request<StripeIdResponse>({
      method: "POST",
      path: "/v1/customers",
      body: {
        metadata: { accountId },
        ...(contactEmail ? { email: contactEmail } : {}),
      },
      idempotencyKey: `platform-customer:${accountId}`,
    });
    const attach = await attachStripeCustomerIfAbsentServiceRole(accountId, customer.id);
    customerId = attach.customerId;
  }

  // Metadata lets the CS-4 webhook map the resulting subscription → account + plan, and
  // (for an upgrade) carries the trusted `targetAccountType` the BU-3 webhook re-validates
  // before flipping the account type. Stamped on BOTH the session and the subscription.
  const checkoutMetadata: Record<string, string> = { accountId, plan: requestedPlan };
  if (upgradeTargetType !== null) {
    checkoutMetadata.targetAccountType = upgradeTargetType;
  }

  // Trial gate — the LAST decision before creating the session, and the ONLY place a trial is
  // granted. Three independent authorities must all pass; any one vetoes:
  //   1. server-owned allowlist (`isTrialEligiblePlan`): Pro/Team only — Business/Enterprise/Free
  //      can NEVER carry a trial (Enterprise never reaches checkout; Business is dropped here);
  //   2. platform config (`resolveTrialPeriodDays`): 0 = trials off (dark default) → no trial;
  //   3. the account's authoritative DB state, enforced ATOMICALLY: `claimAccountTrialServiceRole`
  //      consumes the account's one trial only when `trial_consumed_at IS NULL`. `claimed: true`
  //      means THIS request won the compare-and-set → it gets trial config; `claimed: false` means
  //      the account already used its trial (or a concurrent request won) → subscribe with NO trial.
  // Ordering: the claim runs after every validation + customer attach, so a rejected checkout never
  // consumes the trial. If Stripe session creation throws AFTER a successful claim, the trial stays
  // consumed by design (a deliberate, documented state transition — we do NOT roll back, which would
  // reintroduce the duplicate-trial race). The user simply has no subscription and, on retry,
  // subscribes without a trial. The DB — not this metadata, not Stripe status — is the source of truth.
  const trialPeriodDays = resolveTrialPeriodDays();
  let trialApplies = false;
  if (trialPeriodDays > 0 && isTrialEligiblePlan(requestedPlan)) {
    const trialEndsAtIso = new Date(Date.now() + trialPeriodDays * 86_400_000).toISOString();
    const claim = await claimAccountTrialServiceRole(accountId, requestedPlan, trialEndsAtIso);
    trialApplies = claim.claimed;
  }

  const base = appBaseUrl();
  const session = await client.request<StripeUrlResponse>({
    method: "POST",
    path: "/v1/checkout/sessions",
    body: {
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: price.priceId, quantity: 1 }],
      success_url: `${base}/account?billing=success`,
      cancel_url: `${base}/account?billing=canceled`,
      metadata: checkoutMetadata,
      subscription_data: {
        metadata: checkoutMetadata,
        // Only an approved, atomically-claimed Pro/Team trial adds trial config. Business,
        // Enterprise, Free, ineligible/already-consumed accounts, and the dark (days=0) state all
        // send NO trial_period_days — so their subscription bills immediately.
        ...(trialApplies ? { trial_period_days: trialPeriodDays } : {}),
      },
    },
  });

  return { ok: true, url: session.url };
}

// ─── Customer Portal ─────────────────────────────────────────────────────────

export type PortalFailureReason =
  | "account_not_found"
  | "account_frozen"
  /** BIE-1 — account is internal_free; it has no paid billing and no portal. */
  | "internal_account"
  /** no stripe_customer_id yet — the account must complete a checkout first. */
  | "no_customer"
  | "stripe_not_configured";

export type CreatePortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: PortalFailureReason };

export interface CreatePortalInput {
  accountId: string;
}

/**
 * Create a Stripe Customer Portal session for an account. Requires an existing
 * `stripe_customer_id` — it never lazily creates a customer (a portal with no
 * subscription history is meaningless; the caller is told to checkout first).
 * Returns only the portal `url`.
 */
export async function createPortalSession(
  input: CreatePortalInput,
): Promise<CreatePortalResult> {
  const { accountId } = input;

  const account = await getByIdServiceRole(accountId);
  if (!account) return { ok: false, reason: "account_not_found" };
  if (account.deletionStatus === "pending_deletion") {
    return { ok: false, reason: "account_frozen" };
  }

  // BIE-1 — internal_free accounts have no paid subscription / portal. Short-circuit
  // before any Stripe call.
  if ((await getBillingModeServiceRole(accountId)) === "internal_free") {
    return { ok: false, reason: "internal_account" };
  }

  const attachment = await getStripeAttachmentServiceRole(accountId);
  if (!attachment?.stripeCustomerId) {
    return { ok: false, reason: "no_customer" };
  }

  let client;
  try {
    client = getPlatformStripeClient();
  } catch (e) {
    if (e instanceof PlatformStripeConfigError) {
      return { ok: false, reason: "stripe_not_configured" };
    }
    throw e;
  }

  const base = appBaseUrl();
  const session = await client.request<StripeUrlResponse>({
    method: "POST",
    path: "/v1/billing_portal/sessions",
    body: {
      customer: attachment.stripeCustomerId,
      return_url: `${base}/account`,
    },
  });

  return { ok: true, url: session.url };
}
