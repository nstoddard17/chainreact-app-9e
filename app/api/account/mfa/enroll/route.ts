import { NextResponse } from "next/server";
import { requireAuthedUserId } from "@/app/api/account/_shared";
import { beginTotpEnrollment } from "@/services/accounts/mfa";

/**
 * POST /api/account/mfa/enroll — begin TOTP enrollment for the caller (SEC-3).
 *
 * Returns the factor id + ONE-TIME enrollment material (QR data-URI + shared
 * secret + otpauth URI) for the user to add to their authenticator app. This
 * response is sensitive: it is `no-store`, is never logged, and must be discarded
 * by the client after the user scans/enters it. The factor stays UNVERIFIED until
 * `/verify` succeeds — enrolling alone does not enable MFA or elevate the session.
 *
 * 409 when a verified factor already exists (idempotent "already on").
 */
export async function POST(): Promise<Response> {
  const auth = await requireAuthedUserId();
  if (!auth.ok) return auth.response;

  const result = await beginTotpEnrollment();
  if (!result.ok) {
    if (result.reason === "already_enrolled") {
      return NextResponse.json(
        { error: "Two-factor authentication is already on.", code: "ALREADY_ENROLLED" },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }
    return NextResponse.json(
      { error: "Couldn't start two-factor setup. Please try again.", code: "ENROLL_FAILED" },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }

  // No logging of the enrollment material — lifecycle bookkeeping only.
  console.info(JSON.stringify({ event: "account.mfa.enroll_started" }));

  return NextResponse.json(
    {
      factorId: result.enrollment.factorId,
      qrCode: result.enrollment.qrCode,
      secret: result.enrollment.secret,
      uri: result.enrollment.uri,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
