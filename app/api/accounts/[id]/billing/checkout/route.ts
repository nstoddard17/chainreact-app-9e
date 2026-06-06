import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { isPlatformBillingEnabled } from "@/services/billing/billingFeatureFlags";
import {
  createCheckoutSession,
  type CheckoutFailureReason,
} from "@/services/billing/platformBillingSessions";

/**
 * POST /api/accounts/[id]/billing/checkout (Slice 4.BILLING-PLAN-METADATA-4 / CS-3).
 *
 * Starts a Stripe Checkout session (mode: subscription) for an account plan change and
 * returns ONLY `{ url }`. Gates, in order:
 *   1. ENABLE_PLATFORM_BILLING OFF → 404 (the surface is dark; no oracle it exists);
 *   2. auth → 401;
 *   3. owner/admin role on the target account → 403 (non-member vs forbidden, no leak);
 *   4. strict body { plan: pro|team|business } → 400 (client cannot send a price id or
 *      any other field — price is resolved SERVER-side);
 *   5. service: freeze / plan↔type / price-config / Stripe-config → typed reason → HTTP.
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
  })
  .strict();

function checkoutFailure(reason: CheckoutFailureReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return notFound();
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "invalid_plan_for_type":
      return NextResponse.json(
        { error: "That plan is not available for this account.", code: "INVALID_PLAN_FOR_TYPE" },
        { status: 400 },
      );
    case "plan_not_purchasable":
      return NextResponse.json(
        { error: "This plan can't be purchased online — contact sales.", code: "PLAN_NOT_PURCHASABLE" },
        { status: 400 },
      );
    case "price_not_configured":
      return NextResponse.json(
        { error: "Billing is not fully configured yet.", code: "PRICE_NOT_CONFIGURED" },
        { status: 503 },
      );
    case "stripe_not_configured":
      return NextResponse.json(
        { error: "Billing is not configured.", code: "PLATFORM_BILLING_NOT_CONFIGURED" },
        { status: 503 },
      );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!isPlatformBillingEnabled()) return notFound();

  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, CheckoutBodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await createCheckoutSession({
      accountId,
      requestedPlan: body.data.plan,
      contactEmail: auth.email,
    });
    if (!result.ok) return checkoutFailure(result.reason);
    return NextResponse.json({ url: result.url });
  } catch {
    // Stripe/network failure — generic 500, no detail leaked.
    return NextResponse.json(
      { error: "Could not start checkout.", code: "CHECKOUT_FAILED" },
      { status: 500 },
    );
  }
}
