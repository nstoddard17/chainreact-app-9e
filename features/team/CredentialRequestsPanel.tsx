"use client";

import { useEffect, useRef, useState } from "react";
import {
  AccountApiError,
  acceptCredentialRequest,
  declineCredentialRequest,
  listCredentialRequests,
  type CredentialRequestView,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Panel } from "./Panel";

/**
 * Credential reassignment consent inbox (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-
 * SHARING-8 / CS-7).
 *
 * Self-contained Team-page surface that lets a target member discover + respond
 * to pending requests to run a workflow step under their connected app. It
 * fetches its own data (no new server props) and renders NOTHING while loading or
 * when there are no requests — so the page is unchanged for everyone else and
 * when the feature flag is off (the endpoint returns an empty list).
 *
 * Accept / Decline call the existing CS-3 per-node routes; on success the item is
 * removed locally. No provider account label / email / token / scope is shown —
 * only the workflow name, the prettified provider TYPE, and the requester's
 * account display name.
 */
interface Props {
  accountId: string;
}

/** `gmail` → "Gmail", `microsoft-outlook` → "Microsoft Outlook". Display only. */
function prettyProvider(provider: string): string {
  return provider
    .split(/[-_]/)
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function keyOf(r: CredentialRequestView): string {
  return `${r.workflowId}:${r.nodeId}`;
}

export function CredentialRequestsPanel({ accountId }: Props) {
  const [requests, setRequests] = useState<readonly CredentialRequestView[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    if (fetchedFor.current === accountId) return;
    fetchedFor.current = accountId;
    let cancelled = false;
    // Best-effort: a failure leaves the panel hidden — it must never block the page.
    listCredentialRequests(accountId)
      .then((rs) => {
        if (!cancelled) setRequests(rs);
      })
      .catch(() => {
        if (!cancelled) setRequests([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  async function respond(
    r: CredentialRequestView,
    action: (workflowId: string, nodeId: string) => Promise<void>,
  ) {
    const k = keyOf(r);
    setBusyKey(k);
    setError(null);
    try {
      await action(r.workflowId, r.nodeId);
      setRequests((prev) => (prev ? prev.filter((x) => keyOf(x) !== k) : prev));
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "That action failed. Try again.",
      );
    } finally {
      setBusyKey(null);
    }
  }

  // Unobtrusive: nothing while loading or when there are no pending requests.
  if (!requests || requests.length === 0) return null;

  return (
    <Panel
      title="Credential requests"
      desc="Teammates have asked to run a workflow step under one of your connected apps."
    >
      <ul data-testid="credential-requests" className="flex flex-col gap-3">
        {requests.map((r) => {
          const k = keyOf(r);
          const busy = busyKey === k;
          const provider = prettyProvider(r.provider);
          return (
            <li
              key={k}
              data-testid={`credential-request-${k}`}
              className="flex flex-col gap-2 rounded-xl border border-border bg-background/40 p-4"
            >
              <p className="text-sm text-foreground">
                <span className="font-medium">{r.requestedByLabel}</span> wants the{" "}
                <span className="font-medium">{provider}</span> step in{" "}
                <span className="font-medium">{r.workflowName}</span> to run under your
                connection.
              </p>
              <p className="text-xs text-muted-foreground">
                Accepting lets that workflow step act using your connected {provider}{" "}
                account. You can change this later.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  data-testid={`credential-request-accept-${k}`}
                  disabled={busy}
                  onClick={() => respond(r, acceptCredentialRequest)}
                >
                  {busy ? "…" : "Accept"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid={`credential-request-decline-${k}`}
                  disabled={busy}
                  onClick={() => respond(r, declineCredentialRequest)}
                >
                  Decline
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p
          role="alert"
          data-testid="credential-requests-error"
          className="text-xs text-destructive"
        >
          {error}
        </p>
      )}
    </Panel>
  );
}
