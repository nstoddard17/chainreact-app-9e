import { AccountApiError, type AccountApiErrorCode } from "@/lib/api/accounts";
import type { PlanStatus, PlanTier } from "@/core/billing/planPolicy";
import type { DowngradeBlocker } from "@/core/billing/downgradeRules";

/**
 * Typed client for the personal-plan billing routes
 * (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-3 / PPT-3). Thin wrappers over
 * `/api/accounts/[id]/billing/personal` (PPT-1) so the Settings UI never calls
 * `fetch()` directly. Failures surface as `AccountApiError` (reused from the account
 * client) so the panel can branch on `code`.
 *
 * The DTO mirrors the PPT-1 route's safe projection — booleans/dates + a downgrade
 * preview ONLY. It deliberately carries NO Stripe customer/subscription id (those stay
 * server-only).
 */

export interface PersonalPlanStateView {
  isPaidPersonalPro: boolean;
  plan: PlanTier;
  planStatus: PlanStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  downgrade: { allowed: boolean; blockers: DowngradeBlocker[] };
}

function codeForStatus(status: number): AccountApiErrorCode {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 400) return "VALIDATION";
  if (status === 409) return "CONFLICT";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

async function parseError(res: Response): Promise<AccountApiError> {
  let message = `Request failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    // Non-JSON body — keep the default message (never surfaces Stripe internals).
  }
  return new AccountApiError(message, codeForStatus(res.status), res.status);
}

/** GET /api/accounts/[id]/billing/personal — safe personal-plan state. */
export async function getPersonalBillingState(
  accountId: string,
): Promise<PersonalPlanStateView> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/billing/personal`,
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PersonalPlanStateView;
}

/** POST /api/accounts/[id]/billing/personal — set/undo cancel-at-period-end. */
export async function setPersonalCancelAtPeriodEnd(
  accountId: string,
  cancelAtPeriodEnd: boolean,
): Promise<boolean> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/billing/personal`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cancelAtPeriodEnd }),
    },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { cancelAtPeriodEnd: boolean };
  return body.cancelAtPeriodEnd;
}
