import { NextResponse } from "next/server";
import type { DisconnectFailureReason } from "@/services/integrations/disconnect";

/**
 * Shared route-layer helpers for the connected-app disconnect routes
 * (Slice 4.APPS-DISCONNECT / CD-2). Underscore-prefixed: not a route.
 *
 * One failure mapper for BOTH the advisory GET and the DELETE so they expose an
 * identical, no-leak error surface:
 *   - `feature_disabled` ⇒ 404 generic (the flag is OFF; the endpoint behaves as
 *     if it doesn't exist — never reveals the feature). Belt-and-suspenders: the
 *     routes also flag-gate up front via `notFoundResponse()`.
 *   - `not_found` ⇒ 404 INTEGRATION_NOT_FOUND. Covers cross-account, unknown id,
 *     AND non-member uniformly — a caller can't distinguish "doesn't exist" from
 *     "not yours", so existence/ownership never leaks.
 *   - `account_frozen` ⇒ 403 ACCOUNT_PENDING_DELETION (mirrors member mgmt).
 *   - `forbidden` ⇒ 403 FORBIDDEN (you're a member but lack permission for THIS
 *     provider — e.g. a plain member on a shared provider).
 *
 * No raw provider/DB/token detail ever appears here — only typed codes.
 */
export function disconnectFailureResponse(reason: DisconnectFailureReason): NextResponse {
  switch (reason) {
    case "feature_disabled":
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    case "account_frozen":
      return NextResponse.json(
        { error: "This account is pending deletion.", code: "ACCOUNT_PENDING_DELETION" },
        { status: 403 },
      );
    case "not_found":
      return NextResponse.json(
        { error: "Integration not found.", code: "INTEGRATION_NOT_FOUND" },
        { status: 404 },
      );
    case "forbidden":
      return NextResponse.json(
        { error: "Insufficient permissions.", code: "FORBIDDEN" },
        { status: 403 },
      );
  }
}

/** Generic 404 used when the feature flag is OFF — the endpoint reveals nothing. */
export function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
