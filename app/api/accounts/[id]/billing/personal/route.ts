import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  getPersonalPlanState,
  setPersonalCancelAtPeriodEnd,
  type PersonalPlanReadReason,
  type SetPersonalCancelReason,
} from "@/services/billing/personalPlan";

/**
 * /api/accounts/[id]/billing/personal (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-2 / PPT-1).
 *   GET  — safe personal-plan state (paid-Pro flag, plan/status/period/cancel, downgrade
 *          preview to Free). NO Stripe ids.
 *   POST — set/undo cancel_at_period_end on the personal subscription (period-end cancel).
 *
 * Billing is live (no feature-flag gate): owner/admin only, account-scoped, personal
 * account only. POST additionally rejects a frozen account.
 * The route never mutates plan/status — the CS-4 webhook stays authoritative. Responses
 * carry only booleans/dates — no Stripe customer/subscription id or secret.
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

function notPersonal(): NextResponse {
  return NextResponse.json(
    { error: "This is not a personal account.", code: "NOT_PERSONAL_ACCOUNT" },
    { status: 400 },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const result = await getPersonalPlanState(accountId);
  if (!result.ok) return readFailure(result.reason);
  return NextResponse.json(result.state);
}

function readFailure(reason: PersonalPlanReadReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return notFound();
    case "not_personal":
      return notPersonal();
  }
}

const CancelBodySchema = z.object({ cancelAtPeriodEnd: z.boolean() }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  const role = await requireAccountRole(auth.userId, accountId, ["owner", "admin"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, CancelBodySchema);
  if (!body.ok) return body.response;

  try {
    const result = await setPersonalCancelAtPeriodEnd(accountId, body.data.cancelAtPeriodEnd);
    if (!result.ok) return cancelFailure(result.reason);
    return NextResponse.json({ cancelAtPeriodEnd: result.cancelAtPeriodEnd });
  } catch {
    return NextResponse.json(
      { error: "Could not update the subscription.", code: "CANCEL_FAILED" },
      { status: 500 },
    );
  }
}

function cancelFailure(reason: SetPersonalCancelReason): NextResponse {
  switch (reason) {
    case "account_not_found":
      return notFound();
    case "not_personal":
      return notPersonal();
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "no_subscription":
      return NextResponse.json(
        { error: "No active subscription to change.", code: "NO_SUBSCRIPTION" },
        { status: 409 },
      );
    case "stripe_not_configured":
      return NextResponse.json(
        { error: "Billing is not configured.", code: "PLATFORM_BILLING_NOT_CONFIGURED" },
        { status: 503 },
      );
  }
}
