"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getIntegrationWorkflowImpact,
  disconnectIntegration,
} from "@/lib/api/integrations";

/**
 * Disconnect confirmation dialog (Slice 4.APPS-DISCONNECT / CD-3).
 *
 * On open it fetches the advisory workflow-impact (GET …/workflow-impact) and
 * renders count-aware warning copy. Confirm calls DELETE …/integrations/[id].
 * On success it calls `onDisconnected()` (the card closes + refreshes + shows a
 * status line). All failures surface a SAFE generic message — never a raw
 * provider error, token, or workflow config (the client API already sanitizes;
 * the dialog adds a generic fallback on top).
 *
 * Modeled on FolderDeleteDialog: a plain overlay modal (no dialog lib in the
 * project) using the shared destructive Button.
 */
interface Props {
  accountId: string;
  integrationId: string;
  appName: string;
  accountLabel: string;
  onClose: () => void;
  onDisconnected: () => void;
}

type ImpactState =
  | { phase: "loading" }
  | { phase: "loaded"; affectedWorkflowCount: number }
  | { phase: "unavailable" };

export function DisconnectDialog({
  accountId,
  integrationId,
  appName,
  accountLabel,
  onClose,
  onDisconnected,
}: Props) {
  const [impact, setImpact] = useState<ImpactState>({ phase: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getIntegrationWorkflowImpact(accountId, integrationId)
      .then((res) => {
        if (!cancelled) {
          setImpact({ phase: "loaded", affectedWorkflowCount: res.affectedWorkflowCount });
        }
      })
      .catch(() => {
        // Advisory only — a failed impact check never blocks disconnect. Fall
        // back to neutral copy with no count (never the underlying error).
        if (!cancelled) setImpact({ phase: "unavailable" });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId, integrationId]);

  async function confirm() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await disconnectIntegration(accountId, integrationId);
      onDisconnected();
      onClose();
    } catch {
      // Generic, safe message only.
      setError("Couldn't disconnect this app. Please try again.");
      setPending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      data-testid="disconnect-overlay"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Disconnect ${appName}`}
        data-testid="disconnect-dialog"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl"
      >
        <h2 className="text-sm font-semibold text-foreground">
          Disconnect {appName}?
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">{accountLabel}</p>

        <div className="mt-3 text-xs text-muted-foreground" data-testid="disconnect-impact">
          {impact.phase === "loading" && (
            <p data-testid="disconnect-impact-loading">Checking which workflows use this connection…</p>
          )}

          {impact.phase === "loaded" && impact.affectedWorkflowCount === 0 && (
            <p data-testid="disconnect-impact-zero">
              No active or paused workflows are expected to be disabled by
              disconnecting this app. You can reconnect anytime.
            </p>
          )}

          {impact.phase === "loaded" && impact.affectedWorkflowCount > 0 && (
            <div data-testid="disconnect-impact-nonzero" className="flex flex-col gap-2">
              <p className="font-medium text-foreground">
                Disconnecting may disable{" "}
                <span data-testid="disconnect-impact-count">{impact.affectedWorkflowCount}</span>{" "}
                workflow{impact.affectedWorkflowCount === 1 ? "" : "s"} that depend on it.
              </p>
              <ul className="list-disc pl-4">
                <li>Disabled workflows will not resume automatically.</li>
                <li>
                  Reconnecting later can restore the connection, but those workflows
                  must still be resumed manually under the normal lifecycle rules.
                </li>
              </ul>
            </div>
          )}

          {impact.phase === "unavailable" && (
            <p data-testid="disconnect-impact-unavailable">
              Disconnecting may disable workflows that depend on this app. Disabled
              workflows will not resume automatically; reconnecting later still
              requires resuming them manually.
            </p>
          )}
        </div>

        {error && (
          <p
            role="alert"
            data-testid="disconnect-error"
            className="mt-2 text-xs text-destructive"
          >
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
            variant="destructive"
            disabled={pending}
            onClick={confirm}
            data-testid="disconnect-confirm"
          >
            {pending ? "Disconnecting…" : "Disconnect"}
          </Button>
        </div>
      </div>
    </div>
  );
}
