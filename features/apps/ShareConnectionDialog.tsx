"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setIntegrationSharing } from "@/lib/api/integrations";

/**
 * Share / Stop-sharing confirmation dialog (Slice 4.CONN-SHARE / CS-5a).
 *
 * `mode: "share"` calls the sharing route with `shared_with_account`; `mode:
 * "unshare"` with `private_to_connector`. On success it calls `onDone()` (the
 * card refreshes the server component so the new status renders). All failures —
 * including the flag-off `not_enabled` (which the route hides behind a typed
 * code) — surface a SAFE generic message; never a raw provider/DB error, token,
 * or identity. Modeled on DisconnectDialog (plain overlay modal).
 */
interface Props {
  accountId: string;
  integrationId: string;
  appName: string;
  accountLabel: string;
  mode: "share" | "unshare";
  onClose: () => void;
  onDone: () => void;
}

export function ShareConnectionDialog({
  accountId,
  integrationId,
  appName,
  accountLabel,
  mode,
  onClose,
  onDone,
}: Props) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sharing = mode === "share";

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await setIntegrationSharing(
        accountId,
        integrationId,
        sharing ? "shared_with_account" : "private_to_connector",
      );
      onDone();
      onClose();
    } catch {
      setError(
        sharing
          ? "Couldn't share this connection. Please try again."
          : "Couldn't stop sharing this connection. Please try again.",
      );
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="share-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${sharing ? "Share" : "Stop sharing"} ${appName}`}
        data-testid="share-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-foreground">
          {sharing ? `Share ${appName} with your team?` : `Stop sharing ${appName}?`}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{accountLabel}</p>

        <p className="mt-3 text-xs text-muted-foreground" data-testid="share-warning">
          {sharing
            ? "Team members will be able to run workflows using this connection."
            : "Team workflows using this connection may become creator-only again."}
        </p>

        {error && (
          <p role="alert" data-testid="share-error" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant={sharing ? "default" : "destructive"}
            disabled={pending}
            onClick={confirm}
            data-testid="share-confirm"
          >
            {pending
              ? sharing
                ? "Sharing…"
                : "Stopping…"
              : sharing
                ? "Share with team"
                : "Stop sharing"}
          </Button>
        </div>
      </div>
    </div>
  );
}
