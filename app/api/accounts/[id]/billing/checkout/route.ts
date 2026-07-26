import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  createCheckoutSession,
  type CheckoutFailureReason,
} from "@/services/billing/platformBillingSessions";

/**
 * POST /api/accounts/[id]/billing/checkout (Slice 4.BILLING-PLAN-METADATA-4 / CS-3).
 *
 * Starts a Stripe Checkout session (mode: subscription) for an account plan change and
 * returns ONLY `{ url }`. Billing is live (no feature-flag gate). Gates, in order:
 *   1. auth → 401;
 *   2. owner/admin role on the target account → 403 (non-member vs forbidden, no leak);
 *   3. strict body { plan: pro|team|business } → 400 (client cannot send a price id or
 *      any other field — price is resolved SERVER-side);
 *   4. service: freeze / plan↔type / price-config / Stripe-config → typed reason → HTTP.
 *
 * Checkout success is NOT proof of a subscription — this route NEVER mutates
 * account_billing.plan/status; the CS-4 webhook owns subscription state. No Stripe id or
 * secret appears in any response; failures map to generic typed errors.
 */

function notFound(): NextResponse {
  // Flag-off mirrors the public-API convention: identical 404 whether or not the
  // feature/account exists — no existence oracle.
  return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
}

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Insufficient permissions.", code: "FORBIDDEN" },
    { status: 403 },
  );
}

const CheckoutBodySchema = z
  .object({
    // Only purchasable, fixed-price tiers. free / enterprise are not online-purchasable;
    // unknown values 400. .strict() blocks any client-supplied price/customer/plan-status.
    plan: z.enum(["pro", "team", "business"]),
    // Optional billing interval; omitted defaults to monthly in the service (backward
    // compatible). An invalid value 400s here, so a bad interval never reaches Stripe.
    interval: z.enum(["monthly", "annual"]).optional(),
  })
  .strict();

/**
 * User-facing copy (BILLING-CHECKOUT-PROD-1). Both messages state plainly that NOTHING was
 * charged or changed — the previous "Could not start checkout." left users unsure whether
 * they had been billed. Neither names an env var, a Stripe id, or an internal code.
 */
const BILLING_UNAVAILABLE =
  "Billing checkout is temporarily unavailable. Your account was not changed. Please try again later.";
const STRIPE_TEMPORARY =
  "Stripe could not start checkout right now. Your account was not changed. Please try again.";

function checkoutFailure(reason: CheckoutFailureReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return notFound();
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "internal_account":
      return NextResponse.json(
        {
          error: "This account uses internal billing and does not require checkout.",
          code: "INTERNAL_BILLING_ACCOUNT",
        },
        { status: 409 },
      );
    case "invalid_plan_for_type":
      return NextResponse.json(
        { error: "That plan is not available for this account.", code: "INVALID_PLAN_FOR_TYPE" },
        { status: 400 },
      );
    case "already_on_plan":
      return NextResponse.json(
        {
          error: "This account already has an active paid plan.",
          code: "ACCOUNT_ALREADY_ON_PAID_PLAN",
        },
        { status: 409 },
      );
    case "plan_not_purchasable":
      return NextResponse.json(
        { error: "This plan can't be purchased online — contact sales.", code: "PLAN_NOT_PURCHASABLE" },
        { status: 400 },
      );
    // ── Configuration faults (503). Retrying cannot help; an operator must fix env/Stripe.
    // The user-facing copy is deliberately identical across all three so it never hints at
    // which env var or Stripe resource is wrong, while the CODE stays distinct for logs.
    case "price_not_configured":
      return NextResponse.json(
        { error: BILLING_UNAVAILABLE, code: "PRICE_NOT_CONFIGURED" },
        { status: 503 },
      );
    case "stripe_not_configured":
      return NextResponse.json(
        { error: BILLING_UNAVAILABLE, code: "PLATFORM_BILLING_NOT_CONFIGURED" },
        { status: 503 },
      );
    case "stripe_price_invalid":
      // The price id is set but Stripe doesn't recognize it under the current key —
      // typically a test/live MODE MISMATCH. A config fault, so 503, not 502.
      return NextResponse.json(
        { error: BILLING_UNAVAILABLE, code: "STRIPE_PRICE_INVALID" },
        { status: 503 },
      );
    case "billing_attachment_invalid":
      // The stored Stripe customer is unusable and could not be auto-repaired (the account
      // already has a subscription, so detaching it needs a human).
      return NextResponse.json(
        { error: BILLING_UNAVAILABLE, code: "BILLING_ATTACHMENT_INVALID" },
        { status: 503 },
      );

    // ── Provider faults (502). Stripe was reachable but the call failed; retry is sensible.
    case "stripe_customer_create_failed":
      return NextResponse.json(
        { error: STRIPE_TEMPORARY, code: "STRIPE_CUSTOMER_CREATE_FAILED" },
        { status: 502 },
      );
    case "stripe_checkout_create_failed":
      return NextResponse.json(
        { error: STRIPE_TEMPORARY, code: "STRIPE_CHECKOUT_CREATE_FAILED" },
        { status: 502 },
      );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, CheckoutBodySchema);
  if (!body.ok) return body.response;

  // Plan↔account-type validity (e.g. only personal accounts may buy `pro`) is enforced
  // server-side by createCheckoutSession → `invalid_plan_for_type`. Missing Stripe config
  // still fails closed there (503). No feature-flag gate — billing is live.
  try {
    const result = await createCheckoutSession({
      accountId,
      requestedPlan: body.data.plan,
      interval: body.data.interval,
      contactEmail: auth.email,
    });
    if (!result.ok) return checkoutFailure(result.reason);
    return NextResponse.json({ url: result.url });
  } catch (err) {
    // Reaching here now means a genuinely UNEXPECTED fault: every known Stripe/config/
    // attachment condition is classified in the service and returned as a typed reason
    // above. The original incident produced this branch with NO log line at all, which is
    // why it was undiagnosable — so record the error class + message (never the account's
    // Stripe ids, never the request body) before returning the generic 500.
    console.error(
      JSON.stringify({
        event: "billing.checkout.unhandled",
        accountId,
        plan: body.data.plan,
        error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      }),
    );
    return NextResponse.json(
      {
        error:
          "Something went wrong starting checkout. Your account was not changed. Please try again.",
        code: "CHECKOUT_FAILED",
      },
      { status: 500 },
    );
  }
}
