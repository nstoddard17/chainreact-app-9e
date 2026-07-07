import { NextResponse } from "next/server";
import {
  handleCallback,
  ReconnectIdentityMismatchError,
  StateAccountAccessError,
} from "@/services/oauth/dispatcher";
import { redactedOAuthErrorCode } from "../_shared";

/**
 * OAuth callback handler. The provider redirects the user here after they
 * authorize. We exchange the code for tokens via the dispatcher (which
 * delegates to the per-provider OAuth module), then redirect to the Apps
 * page (`/apps`) with a status param `ConnectionStatusBanner` renders.
 *
 * Pre-Slice-4.APPS-PAGE-1 this redirected to `/` and let the homepage
 * render the toast. Once the homepage became the public marketing surface
 * (signed-in users redirect away from `/`), the toast had nowhere to
 * land; this slice moved it to `/apps`, the user's real post-connect home.
 *
 * Redirect base comes from NEXT_PUBLIC_APP_URL, not request.url: behind a
 * tunnel (ngrok dev) or proxy, the upstream Host header may be rewritten,
 * which would point the redirect Location back at the wrong origin (e.g.
 * http://localhost:3000 even though the browser is on the public URL). The
 * env value is the canonical public URL of this deployment.
 *
 * Thin route per project-structure-and-module-boundaries.md §5.
 */
function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const base = appUrl();

  if (providerError) {
    return NextResponse.redirect(
      new URL(
        `/apps?integration_error=${encodeURIComponent(providerError)}`,
        base,
      ),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/apps?integration_error=missing_code_or_state", base),
    );
  }

  // QUICKBOOKS-1 — pass the provider-redirect's OWN extra query params
  // through the dispatcher (minus code/state, already consumed above). Some
  // providers deliver tenancy only here (QuickBooks `realmId`). Generic:
  // no per-provider logic; providers that don't need them ignore them.
  const callbackParams: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    if (key !== "code" && key !== "state") callbackParams[key] = value;
  });

  try {
    const { integration } = await handleCallback({
      provider,
      code,
      state,
      callbackParams,
    });
    return NextResponse.redirect(
      new URL(
        `/apps?integration=connected&provider=${encodeURIComponent(integration.provider)}`,
        base,
      ),
    );
  } catch (err) {
    // Slice 4.APPS-RECONNECT — a wrong-account reconnect maps to a STABLE,
    // non-leaking code (never the provider-returned identity or a raw error);
    // the Apps banner renders the friendly "different account" copy.
    if (err instanceof ReconnectIdentityMismatchError) {
      return NextResponse.redirect(
        new URL("/apps?integration_error=reconnect_account_mismatch", base),
      );
    }
    // OAUTH-ACCT-BIND — the initiator lost access to the state-bound account
    // between connect and callback. Stable, non-leaking code (never the account
    // or user id); the Apps banner renders friendly copy. Nothing was written.
    if (err instanceof StateAccountAccessError) {
      return NextResponse.redirect(
        new URL("/apps?integration_error=account_access_revoked", base),
      );
    }
    // V2-READY-21 — any UNRECOGNISED error collapses to a stable code; the raw
    // message (provider OAuth codes, dispatcher config hints, infra / Supabase
    // errors) is logged server-side only, never echoed into the URL param.
    const code = redactedOAuthErrorCode(
      err,
      { event: "oauth.callback_failed", provider },
      "callback_failed",
    );
    return NextResponse.redirect(
      new URL(`/apps?integration_error=${encodeURIComponent(code)}`, base),
    );
  }
}
