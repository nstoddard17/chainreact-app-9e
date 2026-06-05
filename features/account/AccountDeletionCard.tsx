"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AccountDeletionError,
  cancelAccountDeletion,
  requestAccountDeletion,
  type DeletionStatusResult,
  type OwnedAccountSummary,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";

/**
 * Personal-account danger zone (Slice 4.ACCOUNT-SETTINGS-1; relocated under the
 * Danger-zone settings section in 4.ACCOUNT-SETTINGS-2 — behavior unchanged).
 *
 * Explains the freeze/grace/purge flow, then either (a) the request form behind
 * a typed phrase + password, (b) the owned-Team/Business blocker, or (c) the
 * pending/scheduled state with a cancel. Deletion always targets the caller's
 * OWN personal account; the shell only renders this when that account is active.
 */

/** Typed confirmation phrase — mirrors the backend `DELETION_CONFIRM_PHRASE`. */
const CONFIRM_PHRASE = "delete my account";

function formatPurgeDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function AccountDeletionCard({
  initialStatus,
  initialPurgeAfter,
}: {
  initialStatus: "active" | "pending_deletion";
  initialPurgeAfter: string | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [purgeAfter, setPurgeAfter] = useState(initialPurgeAfter);

  // request-form state
  const [formOpen, setFormOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<readonly OwnedAccountSummary[] | null>(
    null,
  );

  const phraseOK = confirmText.trim().toLowerCase() === CONFIRM_PHRASE;
  const purgeDate = formatPurgeDate(purgeAfter);

  function applyResult(result: DeletionStatusResult) {
    setStatus(result.deletionStatus);
    setPurgeAfter(result.purgeAfter);
  }

  function openForm() {
    setError(null);
    setBlocked(null);
    setConfirmText("");
    setPassword("");
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setError(null);
  }

  async function submitDelete() {
    if (!phraseOK || password.length === 0) return;
    setBusy(true);
    setError(null);
    setBlocked(null);
    try {
      const result = await requestAccountDeletion({ password, confirmText });
      setFormOpen(false);
      applyResult(result);
    } catch (err) {
      if (err instanceof AccountDeletionError) {
        if (err.code === "ACCOUNT_HAS_OWNED_TEAMS") {
          setFormOpen(false);
          setBlocked(err.ownedAccounts ?? []);
        } else {
          setError(err.message);
        }
      } else {
        setError("Couldn't request deletion. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function doCancel() {
    setBusy(true);
    setError(null);
    try {
      const result = await cancelAccountDeletion();
      applyResult(result);
    } catch (err) {
      setError(
        err instanceof AccountDeletionError
          ? err.message
          : "Couldn't cancel deletion. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Pending / scheduled state ──────────────────────────────────────────────
  if (status === "pending_deletion") {
    return (
      <Panel title="Account deletion" desc="Your personal account is scheduled for deletion.">
        <div data-testid="account-deletion-pending" className="flex flex-col gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-foreground">
              Pending deletion — your account is frozen.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {purgeDate
                ? `It stays recoverable until ${purgeDate}. Cancel any time before then to restore full access.`
                : "It stays recoverable during the grace window. Cancel any time before then to restore full access."}
            </p>
          </div>

          {error && (
            <p role="alert" data-testid="account-deletion-error" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <div>
            <Button
              type="button"
              size="sm"
              data-testid="account-deletion-cancel"
              disabled={busy}
              onClick={doCancel}
            >
              {busy ? "Cancelling…" : "Cancel deletion"}
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  // ── Owned Team/Business blocker ────────────────────────────────────────────
  if (blocked) {
    return (
      <Panel title="Account deletion" desc="Resolve your owned accounts first.">
        <div data-testid="account-deletion-blocked" className="flex flex-col gap-3">
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-semibold text-foreground">
              Transfer ownership or delete these accounts before deleting your
              personal account.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {blocked.map((a) => (
                <li
                  key={a.id}
                  data-testid={`account-owned-${a.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
                >
                  <span className="truncate text-sm font-medium text-foreground">
                    {a.name}
                  </span>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                    {a.typeLabel}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/team" data-testid="account-blocked-team-link">
                Go to Team page
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="account-blocked-dismiss"
              onClick={() => setBlocked(null)}
            >
              Back
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  // ── Active state: explanation + request form ───────────────────────────────
  return (
    <Panel title="Danger zone" desc="Irreversible once the grace window ends. Please be certain.">
      <div data-testid="account-deletion-card" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-foreground">Delete personal account</p>
          <p className="max-w-xl text-xs text-muted-foreground">
            Deleting your account starts a 30-day grace period — your account is
            frozen immediately and your automations stop running. It stays
            reversible during that window; the final, permanent purge happens
            after it ends.
          </p>
        </div>

        {!formOpen ? (
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="account-delete-open"
              onClick={openForm}
              className="text-destructive hover:text-destructive"
            >
              Delete account
            </Button>
          </div>
        ) : (
          <div
            data-testid="account-delete-form"
            className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Type <span className="font-mono text-destructive">{CONFIRM_PHRASE}</span> to confirm
              <input
                type="text"
                aria-label="Confirmation phrase"
                data-testid="account-delete-confirm-input"
                value={confirmText}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => setConfirmText(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
              Enter your password
              <input
                type="password"
                aria-label="Password"
                data-testid="account-delete-password"
                value={password}
                disabled={busy}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              />
            </label>

            <p className="text-xs text-muted-foreground">
              Your account stays recoverable for 30 days. Sign in any time before
              then to cancel.
            </p>

            {error && (
              <p role="alert" data-testid="account-deletion-error" className="text-xs text-destructive">
                {error}
              </p>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                data-testid="account-delete-confirm"
                disabled={busy || !phraseOK || password.length === 0}
                onClick={submitDelete}
              >
                {busy ? "Scheduling…" : "Delete account"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                data-testid="account-delete-cancel"
                disabled={busy}
                onClick={cancelForm}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
