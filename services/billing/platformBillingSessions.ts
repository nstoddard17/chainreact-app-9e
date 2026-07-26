import type { PlanTier, BillingInterval } from "@/core/billing/planPolicy";
import { isPlanAllowedForType, upgradeTargetAccountType } from "@/core/billing/planPolicy";
import { getByIdServiceRole } from "@/repositories/accounts";
import {
  attachStripeCustomerIfAbsentServiceRole,
  getBillingModeServiceRole,
  getPlanStateServiceRole,
  getStripeAttachmentServiceRole,
  replaceStaleStripeCustomerServiceRole,
} from "@/repositories/accountBilling";
import {
  PlatformStripeApiError,
  PlatformStripeConfigError,
  getPlatformStripeClient,
  getPlatformStripeSecretKey,
  type PlatformStripeClient,
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
  /** STRIPE_SECRET_KEY missing, or Stripe rejected the key (401) — not configured. */
  | "stripe_not_configured"
  /**
   * BILLING-CHECKOUT-PROD-1 — the configured price id is set but Stripe does not recognize
   * it under the current secret key. Almost always a MODE MISMATCH (a `price_…` from test
   * mode used with a live key, or vice versa) or a price deleted in the dashboard. A
   * CONFIGURATION fault, not a transient one: retrying cannot help.
   */
  | "stripe_price_invalid"
  /** BILLING-CHECKOUT-PROD-1 — Stripe rejected/failed the customer CREATE call. */
  | "stripe_customer_create_failed"
  /**
   * BILLING-CHECKOUT-PROD-1 — the account's stored `stripe_customer_id` is not visible to
   * the current key (deleted, or from the other Stripe mode) AND the automatic repair could
   * not complete (e.g. the account already has a subscription, so detaching is unsafe).
   */
  | "billing_attachment_invalid"
  /** BILLING-CHECKOUT-PROD-1 — Stripe rejected/failed the Checkout Session create call. */
  | "stripe_checkout_create_failed"
  /**
   * BILLING-CHECKOUT-PROD-1 — the account is ALREADY live on the exact plan being bought, so
   * a second Checkout Session would create a duplicate subscription and bill twice. Scoped
   * deliberately to the SAME plan: a genuine change of tier (free→pro, team→business) is an
   * upgrade and must still be allowed.
   */
  | "already_on_plan";

/**
 * Structured, SAFE checkout telemetry (BILLING-CHECKOUT-PROD-1).
 *
 * The production incident was undiagnosable because the route caught every throw and
 * returned a bare 500 with NO log line — the last trace of the request was a service-role
 * read, so there was no way to tell a bad price from a bad customer from a dead key. Every
 * checkout outcome now emits one line.
 *
 * Emits ONLY enum-ish identifiers and the account id: never the secret key, never a
 * `cus_…`/`price_…`/`cs_…` id, never the Checkout URL, never a customer payload, never an
 * env value. `stripeParam` is a Stripe request-parameter NAME (`customer`,
 * `line_items[0][price]`), which is exactly what distinguishes the failure modes.
 */
interface CheckoutLogFields {
  accountId: string;
  plan: PlanTier;
  interval: BillingInterval;
  /** The step that produced the outcome. */
  op:
    | "customer_create"
    | "customer_repair"
    | "checkout_session_create"
    | "completed";
  outcome: "ok" | "failed";
  reason?: CheckoutFailureReason;
  stripeStatus?: number;
  stripeType?: string | null;
  stripeCode?: string | null;
  stripeParam?: string | null;
  /** Whether the account's existing customer was reused or a new one created. */
  customer?: "reused" | "created" | "repaired";
  elapsedMs?: number;
}

function logCheckout(fields: CheckoutLogFields): void {
  const line = JSON.stringify({ event: "billing.checkout", ...fields });
  if (fields.outcome === "failed") console.error(line);
  // A repair is a successful outcome but an ANOMALY worth surfacing: the account was
  // pointing at a Stripe customer that no longer exists, which usually means a mode switch.
  else if (fields.op === "customer_repair") console.warn(line);
  else console.log(line);
}

/**
 * Classify a thrown Stripe error into a typed checkout reason.
 *
 * Branches on Stripe's machine-readable `type`/`code`/`param` — never on the human message
 * — so the mapping is stable across Stripe copy changes. The key distinction is
 * CONFIGURATION faults (401 dead key, unknown price id ⇒ retrying is pointless, someone
 * must fix env/Stripe) versus TRANSIENT faults (5xx, rate limit, network ⇒ retry is
 * reasonable).
 */
function classifyStripeFailure(
  err: unknown,
  op: "customer_create" | "checkout_session_create",
): CheckoutFailureReason {
  if (!(err instanceof PlatformStripeApiError)) {
    // Network/DNS/abort — no Stripe envelope at all. Transient by nature.
    return op === "customer_create"
      ? "stripe_customer_create_failed"
      : "stripe_checkout_create_failed";
  }
  // A rejected/expired/restricted key is a configuration fault, not a checkout fault —
  // report it exactly like a missing key so the operator looks at the secret, not at Stripe.
  if (err.status === 401 || err.stripeType === "authentication_error") {
    return "stripe_not_configured";
  }
  // `resource_missing` on the PRICE parameter means the configured price id does not exist
  // under this key — the classic live-key/test-price mode mismatch.
  if (
    err.stripeCode === "resource_missing" &&
    typeof err.stripeParam === "string" &&
    err.stripeParam.includes("price")
  ) {
    return "stripe_price_invalid";
  }
  return op === "customer_create"
    ? "stripe_customer_create_failed"
    : "stripe_checkout_create_failed";
}

/** True when Stripe says the CUSTOMER parameter refers to something it cannot see. */
function isMissingCustomerError(err: unknown): boolean {
  return (
    err instanceof PlatformStripeApiError &&
    err.stripeCode === "resource_missing" &&
    err.stripeParam === "customer"
  );
}

/**
 * The SAFE subset of a Stripe error worth logging: HTTP status plus Stripe's own
 * enum-ish identifiers. Deliberately excludes `err.message`, which embeds Stripe's
 * human text and can echo submitted parameter VALUES.
 */
function stripeLogFacts(err: unknown): {
  stripeStatus?: number;
  stripeType?: string | null;
  stripeCode?: string | null;
  stripeParam?: string | null;
} {
  if (!(err instanceof PlatformStripeApiError)) return {};
  return {
    stripeStatus: err.status,
    stripeType: err.stripeType,
    stripeCode: err.stripeCode,
    stripeParam: err.stripeParam,
  };
}

/**
 * Internal control-flow carrier: lets a deep Stripe call site abort with an ALREADY
 * CLASSIFIED reason, which the exported entry point converts back into the typed
 * `{ ok: false, reason }` union. It never escapes this module, so no caller can
 * accidentally surface it — and, crucially, no Stripe detail rides along with it.
 */
class CheckoutFailure extends Error {
  readonly reason: CheckoutFailureReason;
  constructor(reason: CheckoutFailureReason) {
    super(`checkout failed: ${reason}`);
    this.name = "CheckoutFailure";
    this.reason = reason;
  }
}

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
 * Whether platform checkout could even be ATTEMPTED for a plan (BILLING-CHECKOUT-PROD-1).
 *
 * A cheap, throw-free, SERVER-side config probe: the platform secret key is present AND a
 * price id is configured for this (plan, interval). Lets the account page avoid rendering a
 * working-looking "Start Pro free trial" button that the server already knows must fail.
 *
 * Deliberately CONFIG-ONLY — it makes no Stripe call, so it cannot detect a revoked key, a
 * wrong-mode price, or a Stripe outage. Those are only knowable by trying, which is why the
 * route still returns typed 502/503 responses rather than relying on this signal. Returns a
 * bare boolean: never the key, the price id, or which of the two was missing.
 */
export function isPlanCheckoutConfigured(
  plan: PlanTier,
  interval: BillingInterval = "monthly",
): boolean {
  if (!resolvePlanPrice(plan, interval).priceId) return false;
  try {
    getPlatformStripeSecretKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a Stripe Checkout Session (mode: subscription) for an account plan change.
 * Returns only the redirect `url`. Does NOT change plan/status (webhook owns that).
 */
export async function createCheckoutSession(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  try {
    return await runCheckoutSession(input);
  } catch (err) {
    // A Stripe/DB fault classified deeper in the flow arrives here as an already-typed
    // reason. Anything else is genuinely unexpected and stays a throw, so the route can
    // still distinguish "known billing condition" from "unhandled bug".
    if (err instanceof CheckoutFailure) {
      return { ok: false, reason: err.reason };
    }
    throw err;
  }
}

async function runCheckoutSession(
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

  // BILLING-CHECKOUT-PROD-1 — refuse a duplicate subscription. An account already LIVE on the
  // requested plan (active, or mid-trial) must not be able to open a second Checkout Session
  // for it; without this, a stale tab or a double-click on an already-upgraded account buys
  // the same plan twice. Only `active`/`trialing` block: `past_due`, `canceled`, and
  // `incomplete` all legitimately need to re-subscribe. Runs BEFORE any Stripe call, so an
  // ineligible request never reaches Stripe and never consumes the trial.
  const planState = await getPlanStateServiceRole(accountId);
  if (
    planState?.plan === requestedPlan &&
    (planState.planStatus === "active" || planState.planStatus === "trialing")
  ) {
    return { ok: false, reason: "already_on_plan" };
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

  let client: PlatformStripeClient;
  try {
    client = getPlatformStripeClient();
  } catch (e) {
    if (e instanceof PlatformStripeConfigError) {
      return { ok: false, reason: "stripe_not_configured" };
    }
    throw e;
  }

  const startedAt = Date.now();
  const logBase = { accountId, plan: requestedPlan, interval } as const;

  /** Create a Stripe customer for THIS account. Throws a classified failure on rejection. */
  async function createCustomer(idempotencySuffix: string): Promise<string> {
    try {
      const customer = await client.request<StripeIdResponse>({
        method: "POST",
        path: "/v1/customers",
        body: {
          metadata: { accountId },
          ...(contactEmail ? { email: contactEmail } : {}),
        },
        // Account-scoped key — dedups repeated clicks inside Stripe's 24h window so a
        // double-click can never yield two customers for one account.
        idempotencyKey: `platform-customer:${accountId}${idempotencySuffix}`,
      });
      return customer.id;
    } catch (err) {
      const reason = classifyStripeFailure(err, "customer_create");
      logCheckout({
        ...logBase,
        op: "customer_create",
        outcome: "failed",
        reason,
        ...stripeLogFacts(err),
        elapsedMs: Date.now() - startedAt,
      });
      throw new CheckoutFailure(reason);
    }
  }

  // Lazy + race-safe customer attach. The Idempotency-Key dedups repeated create
  // attempts inside Stripe's 24h window; the guarded DB write + unique index dedup at
  // the persistence layer.
  const existing = await getStripeAttachmentServiceRole(accountId);
  let customerId = existing?.stripeCustomerId ?? null;
  let customerDisposition: "reused" | "created" | "repaired" = "reused";
  if (!customerId) {
    const createdId = await createCustomer("");
    const attach = await attachStripeCustomerIfAbsentServiceRole(accountId, createdId);
    customerId = attach.customerId;
    customerDisposition = "created";
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

  /** Create the Checkout Session against a specific customer id. */
  async function createSession(forCustomerId: string): Promise<StripeUrlResponse> {
    return client.request<StripeUrlResponse>({
      method: "POST",
      path: "/v1/checkout/sessions",
      body: {
        mode: "subscription",
        customer: forCustomerId,
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
  }

  let session: StripeUrlResponse;
  try {
    session = await createSession(customerId);
  } catch (err) {
    // SELF-HEAL (BILLING-CHECKOUT-PROD-1): Stripe says this account's stored customer does
    // not exist under the current key — it was deleted in the dashboard, or (far more
    // commonly) it was created in the OTHER Stripe mode. Left alone this is PERMANENT: every
    // future attempt re-sends the same dead id. Mint a replacement and retry ONCE.
    //
    // Guarded on `stripe_subscription_id IS NULL` in the repository, so an account that
    // actually has a subscription is never silently detached from its customer — that case
    // needs a human, and surfaces as `billing_attachment_invalid`.
    const repairable =
      isMissingCustomerError(err) &&
      customerDisposition === "reused" &&
      !existing?.stripeSubscriptionId;
    if (!repairable) {
      const reason = classifyStripeFailure(err, "checkout_session_create");
      logCheckout({
        ...logBase,
        op: "checkout_session_create",
        outcome: "failed",
        reason: isMissingCustomerError(err) ? "billing_attachment_invalid" : reason,
        ...stripeLogFacts(err),
        customer: customerDisposition,
        elapsedMs: Date.now() - startedAt,
      });
      throw new CheckoutFailure(
        isMissingCustomerError(err) ? "billing_attachment_invalid" : reason,
      );
    }

    logCheckout({
      ...logBase,
      op: "customer_repair",
      outcome: "ok",
      ...stripeLogFacts(err),
      customer: "reused",
      elapsedMs: Date.now() - startedAt,
    });
    // Distinct idempotency suffix: the original key may already be bound to the now-dead
    // customer inside Stripe's 24h window, and replaying it would return that same dead id.
    const freshId = await createCustomer(`:repair:${customerId}`);
    const repaired = await replaceStaleStripeCustomerServiceRole(
      accountId,
      customerId,
      freshId,
    );
    customerId = repaired.customerId;
    customerDisposition = "repaired";
    try {
      session = await createSession(customerId);
    } catch (retryErr) {
      const reason = classifyStripeFailure(retryErr, "checkout_session_create");
      logCheckout({
        ...logBase,
        op: "checkout_session_create",
        outcome: "failed",
        reason,
        ...stripeLogFacts(retryErr),
        customer: "repaired",
        elapsedMs: Date.now() - startedAt,
      });
      throw new CheckoutFailure(reason);
    }
  }

  logCheckout({
    ...logBase,
    op: "completed",
    outcome: "ok",
    customer: customerDisposition,
    elapsedMs: Date.now() - startedAt,
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
