import { AccountApiError, type AccountApiErrorCode } from "@/lib/api/accounts";
import type { PlanTier } from "@/core/billing/planPolicy";

/**
 * Typed client for the platform checkout route
 * (Slice 4.BILLING-PERSONAL-PRO-TEAM-CHOICE-4 / PPT-4). Thin wrapper over the CS-3
 * `POST /api/accounts/[id]/billing/checkout` so client code never calls `fetch()`
 * directly and never talks to Stripe directly. Returns ONLY the Stripe-hosted Checkout
 * `url` (no customer/subscription id). Failures surface as `AccountApiError` (reused) so
 * the UI shows a generic message — never a raw Stripe error.
 *
 * Reuses the existing route unchanged; this slice adds no backend.
 */

/** Plans the checkout route accepts (free/enterprise are not online-purchasable). */
export type CheckoutPlan = Extract<PlanTier, "pro" | "team" | "business">;

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

/** POST /api/accounts/[id]/billing/checkout → the Stripe Checkout redirect url. */
export async function startCheckout(
  accountId: string,
  plan: CheckoutPlan,
): Promise<{ url: string }> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/billing/checkout`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { url: string };
}

/**
 * POST /api/accounts/[id]/billing/portal → the Stripe Customer Portal redirect url.
 *
 * Thin wrapper over the existing CS-3 portal route (no backend added). Returns ONLY the
 * Stripe-hosted portal `url`. The route answers 409 (→ `AccountApiError` code `CONFLICT`)
 * when the account has no Stripe customer yet — callers branch on that to show "start a
 * paid plan first" copy rather than a raw error. No customer/subscription id is returned.
 */
export async function startBillingPortal(
  accountId: string,
): Promise<{ url: string }> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/billing/portal`,
    { method: "POST" },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { url: string };
}

/** Safe result of a confirmed Business → Team downgrade (counts only — no Stripe/credential data). */
export interface BusinessDowngradeOutcome {
  alreadyTeam: boolean;
  removedMembers: number;
  flattenedFolders: number;
}

/**
 * POST /api/accounts/[id]/billing/downgrade-to-team (Slice 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-5
 * / CS-BD-3) — runs the explicit, owner-confirmed DESTRUCTIVE Business → Team downgrade. Thin
 * wrapper over the route (no client-side mutation logic). Returns only safe counts; failures
 * surface as `AccountApiError` so the UI shows a generic message. The caller must have already
 * confirmed the destructive warning.
 */
export async function startBusinessDowngrade(
  accountId: string,
): Promise<BusinessDowngradeOutcome> {
  const res = await fetch(
    `/api/accounts/${encodeURIComponent(accountId)}/billing/downgrade-to-team`,
    { method: "POST" },
  );
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as Partial<BusinessDowngradeOutcome>;
  return {
    alreadyTeam: Boolean(body.alreadyTeam),
    removedMembers: body.removedMembers ?? 0,
    flattenedFolders: body.flattenedFolders ?? 0,
  };
}
