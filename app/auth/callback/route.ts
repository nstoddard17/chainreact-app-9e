import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/**
 * Supabase Auth callback. Handles two link shapes:
 *
 * 1. **token_hash + type** — device-independent email-link flow (signup
 *    confirmation, password recovery). Everything needed to verify lives in the
 *    URL, so the link works even when opened on a DIFFERENT device than the one
 *    that started the flow. Verified via `verifyOtp`.
 *
 * 2. **code** — PKCE flow for OAuth providers (e.g. Google) and same-device
 *    email links. Verified via `exchangeCodeForSession`, which needs the
 *    originating device's verifier cookie (so it cannot work cross-device — that
 *    is exactly why email links use token_hash above).
 *
 * After verifying, redirect to the `next` path (default `/`), restricted to
 * same-origin to prevent open redirects. Tokens are never logged or rendered.
 *
 * Thin route per project-structure-and-module-boundaries.md §5: validate,
 * delegate to the Supabase client, redirect.
 */

// Narrow allow-list — only the email-link types this app actually issues.
// `email` = signup confirmation; `recovery` = password reset. Both are valid
// Supabase EmailOtpType values. We deliberately exclude invite / email_change /
// magiclink (unused flows) so an attacker can't drive verifyOtp with them.
const ALLOWED_OTP_TYPES = ["email", "recovery"] as const;
type AllowedOtpType = (typeof ALLOWED_OTP_TYPES)[number];

function isAllowedOtpType(value: string | null): value is AllowedOtpType {
  return value !== null && (ALLOWED_OTP_TYPES as readonly string[]).includes(value);
}

// Only allow same-origin `next` paths to prevent open-redirect.
function safeNextPath(next: string | null): string {
  const candidate = next ?? "/";
  return candidate.startsWith("/") && !candidate.startsWith("//") ? candidate : "/";
}

function authError(request: Request, code: string): NextResponse {
  return NextResponse.redirect(
    new URL(`/auth/sign-in?error=${encodeURIComponent(code)}`, request.url),
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");

  const supabase = await createClient();

  // 1. Device-independent email-link flow (token_hash + type).
  if (tokenHash) {
    if (!isAllowedOtpType(type)) {
      return authError(request, "invalid_confirmation");
    }
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) {
      return authError(request, error.message);
    }
    return NextResponse.redirect(new URL(safeNextPath(next), request.url));
  }

  // 2. PKCE code flow — OAuth providers and same-device email links.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return authError(request, error.message);
    }
    return NextResponse.redirect(new URL(safeNextPath(next), request.url));
  }

  // Neither verifiable param present.
  return authError(request, "oauth_missing_code");
}
