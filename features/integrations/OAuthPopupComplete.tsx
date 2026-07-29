"use client";

import { useEffect } from "react";
import type { OAuthPopupMessage } from "@/core/integrations/oauthPopupBridge";

/**
 * Client half of the OAuth popup completion bridge (REACT-AGENT-GUIDED-BUILD-1).
 *
 * Runs inside the POPUP window on the fixed completion page. On mount it posts
 * the already-sanitized completion message to `window.opener` with an explicit
 * SAME-ORIGIN targetOrigin (never `*`), then tries to close the window after a
 * short beat. The builder opener independently validates the event's origin +
 * nonce before trusting it, and ALSO refreshes connection readiness when the
 * popup closes — so a missed message degrades to a refresh, never a wrong state.
 *
 * Renders only fixed copy + the provider slug / stable error code. No token,
 * credential, account id, or raw provider error can reach this component — the
 * server page already collapsed anything malformed to `null`.
 */

export interface OAuthPopupCompleteProps {
  /** Sanitized completion result, or null when the URL params were invalid. */
  readonly result: OAuthPopupMessage | null;
}

export function OAuthPopupComplete({ result }: OAuthPopupCompleteProps) {
  useEffect(() => {
    if (!result) return;
    try {
      // Same-origin only: the builder opener lives on this deployment's origin.
      window.opener?.postMessage(result, window.location.origin);
    } catch {
      // No opener (page opened directly) — nothing to notify; the note below
      // still tells the user what happened.
    }
    const timer = window.setTimeout(() => {
      window.close();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [result]);

  if (!result) {
    return (
      <div data-testid="oauth-popup-complete-invalid">
        <h1 className="text-lg font-semibold text-foreground">Connection window</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This window can be closed. You can manage app connections from the Apps page.
        </p>
      </div>
    );
  }

  if (result.status === "connected") {
    return (
      <div data-testid="oauth-popup-complete-connected">
        <h1 className="text-lg font-semibold text-foreground">Connected</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Returning you to the builder… You can close this window.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="oauth-popup-complete-error">
      <h1 className="text-lg font-semibold text-foreground">Connection didn&apos;t finish</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can close this window and try connecting again from the builder.
      </p>
    </div>
  );
}
