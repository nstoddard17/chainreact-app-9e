import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  createPortalSession,
  type PortalFailureReason,
} from "@/services/billing/platformBillingSessions";

/**
 * POST /api/accounts/[id]/billing/portal (Slice 4.BILLING-PLAN-METADATA-4 / CS-3).
 *
 * Opens a Stripe Customer Portal session (upgrade / downgrade / cancel / payment method)
 * and returns ONLY `{ url }`. Same gate order as checkout (billing is live, no flag): auth
 * → 401, owner/admin → 403. Requires an existing `stripe_customer_id` — it never lazily creates
 * a customer (→ `no_customer`, caller must checkout first). No body. This route NEVER
 * mutates plan/status; it only mints a portal URL. No Stripe id/secret in any response.
 */

function notFound(): NextResponse {
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

function portalFailure(reason: PortalFailureReason): NextResponse {
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
          error: "This account uses internal billing and has no billing portal.",
          code: "INTERNAL_BILLING_ACCOUNT",
        },
        { status: 409 },
      );
    case "no_customer":
      return NextResponse.json(
        { error: "Start a subscription first.", code: "NO_BILLING_CUSTOMER" },
        { status: 409 },
      );
    case "stripe_not_configured":
      return NextResponse.json(
        { error: "Billing is not configured.", code: "PLATFORM_BILLING_NOT_CONFIGURED" },
        { status: 503 },
      );
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  try {
    const result = await createPortalSession({ accountId });
    if (!result.ok) return portalFailure(result.reason);
    return NextResponse.json({ url: result.url });
  } catch {
    return NextResponse.json(
      { error: "Could not open the billing portal.", code: "PORTAL_FAILED" },
      { status: 500 },
    );
  }
}
