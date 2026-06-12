import { NextResponse } from "next/server";
import type { SetSharingFailureReason } from "@/services/integrations/connectionSharing";

/**
 * Shared route-layer helper for the connection-sharing route
 * (Slice 4.CONN-SHARE / CS-2). Underscore-prefixed: not a route.
 *
 * Maps the service's typed reason → a generic, no-leak HTTP response:
 *   - `not_enabled` ⇒ 404 CONNECTION_SHARING_NOT_ENABLED. The feature is behind a
 *     temporary dev guard; a uniform response to every caller (the service does
 *     zero I/O when OFF) leaks nothing about the row or membership.
 *   - `not_found` ⇒ 404 INTEGRATION_NOT_FOUND. Covers cross-account, unknown id,
 *     non-member, AND disconnected row uniformly — existence/ownership/state
 *     never leak.
 *   - `account_frozen` ⇒ 403 ACCOUNT_PENDING_DELETION (mirrors disconnect).
 *   - `forbidden` ⇒ 403 FORBIDDEN (a member who lacks permission for THIS action —
 *     e.g. a non-connector trying to share, or a plain member trying to unshare).
 *   - `account_provider_not_shareable` ⇒ 422 ACCOUNT_PROVIDER_NOT_SHAREABLE
 *     (account/service providers are already account-shared by classification).
 *
 * No raw provider/DB/token detail ever appears here — only typed codes.
 */
export function sharingFailureResponse(reason: SetSharingFailureReason): NextResponse {
  switch (reason) {
    case "not_enabled":
      return NextResponse.json(
        { error: "Connection sharing is not available.", code: "CONNECTION_SHARING_NOT_ENABLED" },
        { status: 404 },
      );
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
    case "account_provider_not_shareable":
      return NextResponse.json(
        {
          error: "This provider is already shared with the account and cannot be shared individually.",
          code: "ACCOUNT_PROVIDER_NOT_SHAREABLE",
        },
        { status: 422 },
      );
  }
}
