import { NextResponse } from "next/server";
import { requireUserWithAccount } from "@/app/api/workflows/_shared";
import { getOnboardingChecklist } from "@/services/onboarding/checklistState";
import { isOnboardingChecklistEnabled } from "@/services/onboarding/onboardingFlags";

/**
 * GET /api/onboarding — derived first-workflow checklist state for the
 * caller's ACTIVE account (5.ONBOARD-1 Batch 1).
 *
 * Gate order: auth + active-account resolution (`requireUserWithAccount` —
 * membership re-verified, frozen accounts 403) → flag → derivation. The DTO is
 * computed entirely server-side; there is no client-writable completion
 * surface on this route.
 *
 * Flag OFF → `{enabled:false}` (inert, cheap, no DB reads). Derivation errors
 * are a safe 500 — the dashboard omits the card rather than breaking.
 */
export async function GET(): Promise<Response> {
  const auth = await requireUserWithAccount();
  if (!auth.ok) return auth.response;

  if (!isOnboardingChecklistEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const dto = await getOnboardingChecklist({
      userId: auth.userId,
      accountId: auth.accountId,
    });
    return NextResponse.json(dto);
  } catch (err) {
    console.error(
      "[onboarding] checklist derivation failed:",
      err instanceof Error ? err.message : "unknown error",
    );
    return NextResponse.json(
      { error: "ONBOARDING_UNAVAILABLE" },
      { status: 500 },
    );
  }
}
