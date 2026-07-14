import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { getMfaStatus } from "@/services/accounts/mfa";

/**
 * GET /api/account/mfa — the caller's OWN two-factor status (SEC-3).
 *
 * Self-scoped: the factor list is read from the caller's cookie-bound session, so
 * it can only ever reflect the signed-in user's own factors. Returns non-secret
 * metadata only — never a secret, otpauth URI, or QR. `no-store` so the status is
 * never cached by an intermediary.
 */
export async function GET(): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const status = await getMfaStatus();
  return NextResponse.json(
    {
      enabled: status.enabled,
      factor: status.factor,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
