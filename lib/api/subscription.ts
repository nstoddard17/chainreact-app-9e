import { AccountApiError, type AccountApiErrorCode } from "@/lib/api/accounts";
import type { PlanStatus, PlanTier } from "@/core/billing/planPolicy";

/**
 * Typed client for the account-scoped subscription route
 * (`/api/accounts/[id]/billing/subscription`, Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Cancel = stop the paid subscription at period end. It never deletes the account or any
 * data — account deletion is an entirely separate action with its own client
 * (`lib/api/accounts.ts` → `requestAccountDeletion`) and its own Danger-Zone surface.
 *
 * The DTO mirrors the route's safe projection: plan tier, status, dates, and booleans ONLY.
 * It deliberately carries NO Stripe customer/subscription id (those stay server-only).
 */

export interface AccountSubscriptionView {
  plan: PlanTier;
  planStatus: PlanStatus;
  hasSubscription: boolean;
  isCancelable: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  frozen: boolean;
  internalBilling: boolean;
  /** True when the viewer is the owner and may actually cancel/resume. */
  canManage: boolean;
}

export interface SubscriptionActionResult {
  cancelAtPeriodEnd: boolean;
  /** ISO date paid access ends when cancellation is scheduled; null when resuming. */
  effectiveAt: string | null;
  /** True when the subscription was already in the requested state (no Stripe write). */
  alreadyInState: boolean;
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

function url(accountId: string): string {
  return `/api/accounts/${encodeURIComponent(accountId)}/billing/subscription`;
}

/** GET — safe, account-scoped subscription state. */
export async function getAccountSubscription(
  accountId: string,
): Promise<AccountSubscriptionView> {
  const res = await fetch(url(accountId));
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AccountSubscriptionView;
}

/** POST `{action}` — schedule cancellation at period end, or resume ("Keep plan"). */
export async function setAccountSubscriptionAction(
  accountId: string,
  action: "cancel" | "resume",
): Promise<SubscriptionActionResult> {
  const res = await fetch(url(accountId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubscriptionActionResult;
}
