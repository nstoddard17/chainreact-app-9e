import { NextResponse } from "next/server";
import { requireUserWithAccount } from "@/app/api/workflows/_shared";
import { getUsage, getBillingModeServiceRole } from "@/repositories/accountBilling";
import { getAiCreditUsage } from "@/repositories/accountBillingAiCredits";
import { computeAccountUsageSummary } from "@/core/billing/accountUsageSummary";

/**
 * GET /api/account/usage — the ACTIVE account's current-period usage for the
 * app-shell header meter (Slice HEADER-USAGE-VISIBILITY-1).
 *
 * READ-ONLY. Returns `computeAccountUsageSummary`'s display-safe shape — the
 * exact summary Account Settings renders — for BOTH billing dimensions
 * (workflow tasks + AI credits), so the header can never disagree with the
 * billing page or the deduct RPCs (same lazy-rollover period math).
 *
 * SCOPE / AUTH: `requireUserWithAccount` — the same active-account chokepoint
 * the /api/workflows + /api/folders routes use (explicit → stored
 * active_account_id → personal fallback), so the meter always reflects the
 * account the rest of the app is operating on. The underlying reads are
 * RLS-scoped (`getUsage` / `getAiCreditUsage` select explicit non-secret
 * columns); `billing_mode` is a display-only coarse status read for the
 * caller's own membership-verified account.
 *
 * No-leak: the response carries only counts / percents / booleans / reset ISO
 * + the coarse billing mode — never Stripe ids, plan audit provenance, ledger
 * rows, or provider data. Fail-open per dimension: an unreadable billing row →
 * `available: false` (the client renders nothing), never faked zeros.
 */
export async function GET() {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  const [tasks, aiCredits, billingMode] = await Promise.all([
    getUsage(auth.accountId).catch(() => null),
    getAiCreditUsage(auth.accountId).catch(() => null),
    getBillingModeServiceRole(auth.accountId).catch(() => "standard" as const),
  ]);

  const usage = computeAccountUsageSummary({
    billingMode,
    tasks: tasks
      ? {
          used: tasks.tasksUsed,
          limit: tasks.tasksLimit,
          periodStartedAt: tasks.periodStartedAt,
        }
      : null,
    aiCredits: aiCredits
      ? {
          used: aiCredits.aiCreditsUsed,
          limit: aiCredits.aiCreditsLimit,
          periodStartedAt: aiCredits.aiCreditsPeriodStartedAt,
        }
      : null,
    now: new Date(),
  });

  return NextResponse.json({ usage });
}
