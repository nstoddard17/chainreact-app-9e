import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthedUserId, parseAccountBody } from "@/app/api/account/_shared";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import {
  getAccountSubscriptionState,
  resumeSubscription,
  scheduleSubscriptionCancellation,
  type SubscriptionOpReason,
} from "@/services/billing/subscriptionCancellation";

/**
 * /api/accounts/[id]/billing/subscription (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 *   GET  — safe, account-scoped subscription state (plan / status / period end /
 *          cancel-scheduled / cancelable). NO Stripe ids.
 *   POST — `{ action: "cancel" }` schedules cancellation at the current period end;
 *          `{ action: "resume" }` undoes it ("Keep plan"). Both idempotent.
 *
 * This is the account-scoped cancellation surface for ANY account type — the personal-only
 * `../personal` route stays as the Pro→Free choice flow (it now shares the same underlying
 * operation). Cancelling here NEVER deletes the account or any data.
 *
 * ── Authorization ───────────────────────────────────────────────────────────────────────
 * Read: owner or admin (matches the existing billing read gate — admins already see
 * billing). Mutate: **owner only**. Per `docs/rules/account-ownership-model.md` the owner
 * "manages billing" while an admin "views billing", and cancelling a shared account's
 * subscription is a new capability — granting it to admins would be a silent expansion of
 * admin power, so it is deliberately withheld.
 *
 * The account id comes from the path and every operation is keyed on it, so a caller can
 * only ever affect the subscription of an account they own. Nothing here can reach a
 * different account's billing row.
 *
 * The route never mutates plan/status — the CS-4 webhook stays authoritative and the local
 * downgrade only happens once Stripe confirms the subscription actually ended. Responses
 * carry booleans/dates only: no Stripe customer/subscription id, no secret, no raw Stripe
 * error text.
 */

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found.", code: "NOT_FOUND" }, { status: 404 });
}

function roleGateFailure(reason: "not_member" | "forbidden"): NextResponse {
  return NextResponse.json(
    reason === "not_member"
      ? { error: "You are not a member of this account.", code: "NOT_ACCOUNT_MEMBER" }
      : { error: "Only the account owner can change billing.", code: "FORBIDDEN" },
    { status: 403 },
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

  const result = await getAccountSubscriptionState(accountId);
  if (!result.ok) return notFound();
  // `canManage` lets the client render read-only state for an admin without a second
  // round-trip, and keeps the authority decision on the server.
  return NextResponse.json({ ...result.state, canManage: role.role === "owner" });
}

const ActionBodySchema = z
  .object({ action: z.enum(["cancel", "resume"]) })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;
  const { id: accountId } = await params;

  // Owner-only for the mutation — see the authorization note above.
  const role = await requireAccountRole(auth.userId, accountId, ["owner"]);
  if (!role.ok) return roleGateFailure(role.reason);

  const body = await parseAccountBody(request, ActionBodySchema);
  if (!body.ok) return body.response;

  try {
    const result =
      body.data.action === "cancel"
        ? await scheduleSubscriptionCancellation(accountId)
        : await resumeSubscription(accountId);
    if (!result.ok) return opFailure(result.reason);
    return NextResponse.json({
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      effectiveAt: result.effectiveAt,
      alreadyInState: result.alreadyInState,
    });
  } catch {
    // Never surface a raw Stripe message (it can carry ids). Generic + actionable.
    return NextResponse.json(
      {
        error: "Could not update the subscription. Please try again.",
        code: "SUBSCRIPTION_UPDATE_FAILED",
      },
      { status: 502 },
    );
  }
}

function opFailure(reason: SubscriptionOpReason): NextResponse {
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
          error: "This account uses internal billing and has no subscription.",
          code: "INTERNAL_BILLING_ACCOUNT",
        },
        { status: 409 },
      );
    case "no_subscription":
      return NextResponse.json(
        { error: "There is no subscription to change.", code: "NO_SUBSCRIPTION" },
        { status: 409 },
      );
    case "subscription_already_ended":
      return NextResponse.json(
        {
          error: "This subscription has already ended.",
          code: "SUBSCRIPTION_ALREADY_ENDED",
        },
        { status: 409 },
      );
    case "stripe_not_configured":
      return NextResponse.json(
        { error: "Billing is not configured.", code: "PLATFORM_BILLING_NOT_CONFIGURED" },
        { status: 503 },
      );
  }
}
