import type { PlanTier, BillingInterval } from "@/core/billing/planPolicy";
import { isPlanAllowedForType, upgradeTargetAccountType } from "@/core/billing/planPolicy";
import { getByIdServiceRole } from "@/repositories/accounts";
import {
  attachStripeCustomerIfAbsentServiceRole,
  getStripeAttachmentServiceRole,
} from "@/repositories/accountBilling";
import {
  PlatformStripeConfigError,
  getPlatformStripeClient,
} from "@/services/billing/platformStripeClient";
import { resolvePlanPrice } from "@/services/billing/platformStripePrices";

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
 * authority that flips plan/status. This service writes exactly one column ever:
 * `stripe_customer_id` (lazy attach), and nothing else.
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
      subscription_data: { metadata: checkoutMetadata },
    },
  });

  return { ok: true, url: session.url };
}

// ─── Customer Portal ─────────────────────────────────────────────────────────

export type PortalFailureReason =
  | "account_not_found"
  | "account_frozen"
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
