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
