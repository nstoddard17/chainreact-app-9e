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
import { AccountDeletionBillingRetry } from "./AccountDeletionBillingRetry";

/**
 * Personal-account danger zone (Slice 4.ACCOUNT-SETTINGS-1; relocated under the
 * Danger-zone settings section in 4.ACCOUNT-SETTINGS-2; billing consequences added in
 * 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Explains the freeze/grace/purge flow, then either (a) the request form behind
 * a typed phrase + password, (b) the owned-Team/Business blocker, or (c) the
 * pending/scheduled state with a cancel. Deletion always targets the caller's
 * OWN personal account; the shell only renders this when that account is active.
 *
 * This is DELETE MY ACCOUNT — deliberately distinct from "Cancel subscription", which lives
 * in Plan & billing and keeps the account. The confirmation here states every consequence
 * up front, including that the personal account's ChainReact subscription is cancelled, that
 * Team/Business data is not the individual's to delete, and that cancelling the deletion
 * restores the account on Free rather than silently restarting a paid plan.
 *
 * Partial-failure honesty: if the freeze succeeded but the subscription could not be
 * cancelled, the route answers 502 `BILLING_CANCELLATION_FAILED`. The card must then show
 * BOTH facts — deletion is scheduled AND billing cancellation needs a retry — instead of a
 * plain success or a plain error.
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
  // True when the freeze committed but the subscription cancellation did not. Shown ON TOP
  // of the pending state — both facts are true and the user must be told both.
  const [billingFailed, setBillingFailed] = useState(false);

  // request-form state
  const [formOpen, setFormOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<readonly OwnedAccountSummary[] | null>(
    null,
  );
  const [retryOpen, setRetryOpen] = useState(false);

  const phraseOK = confirmText.trim().toLowerCase() === CONFIRM_PHRASE;
  const purgeDate = formatPurgeDate(purgeAfter);

  function applyResult(result: DeletionStatusResult) {
    setStatus(result.deletionStatus);
    setPurgeAfter(result.purgeAfter);
    setBillingFailed(result.billingCancellation === "failed");
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
        } else if (err.code === "BILLING_CANCELLATION_FAILED" && err.deletionState) {
          // Partial success: the account IS frozen. Move to the pending state so the user
          // sees the truth, and keep the billing warning + retry visible there.
          setFormOpen(false);
          applyResult(err.deletionState);
          setError(err.message);
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

  /**
   * Retry ONLY the subscription cancellation after a partial failure.
   *
   * Re-POSTs the deletion request: the account is already `pending_deletion`, so the
   * service's idempotent path performs NO second lifecycle transition and simply re-attempts
   * the (idempotent) Stripe cancellation. The password step-up is still required — it is the
   * real security control. The typed phrase is supplied programmatically because the user
   * already typed it to reach this state and this call cannot cause a new destructive
   * transition; re-typing it would only add friction to recovering from OUR failure.
   */
  async function retryBillingCancellation() {
    if (password.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await requestAccountDeletion({
        password,
        confirmText: CONFIRM_PHRASE,
      });
      applyResult(result);
      setRetryOpen(false);
      setPassword("");
    } catch (err) {
      if (err instanceof AccountDeletionError) {
        if (err.code === "BILLING_CANCELLATION_FAILED" && err.deletionState) {
          // Still failing — keep the honest banner up rather than clearing it.
          applyResult(err.deletionState);
        }
        setError(err.message);
      } else {
        setError("Couldn't cancel the subscription. Try again.");
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
                ? `It stays recoverable until ${purgeDate}. Cancel any time before then to restore your data — your account comes back on the Free plan.`
                : "It stays recoverable during the grace window. Cancel any time before then to restore your data — your account comes back on the Free plan."}
            </p>
          </div>

          {/* Partial-failure banner: the freeze is real, the cancellation is not (yet). */}
          {billingFailed && (
            <AccountDeletionBillingRetry
              retryOpen={retryOpen}
              password={password}
              busy={busy}
              onOpen={() => {
                setPassword("");
                setError(null);
                setRetryOpen(true);
              }}
              onPasswordChange={setPassword}
              onRetry={retryBillingCancellation}
              onDismiss={() => setRetryOpen(false)}
            />
          )}

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

          {/* Four DIFFERENT actions get confused here constantly. Name each one, say what it
              does and does not do, and never imply that a cheaper action substitutes for
              deleting the account. */}
          <div
            data-testid="account-blocked-options"
            className="rounded-xl border border-border bg-background/40 p-4"
          >
            <p className="text-xs font-medium text-foreground">
              These are four different things:
            </p>
            <ul className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">
                  Cancel your personal subscription
                </span>{" "}
                — stops billing for your personal account only. It does not cancel a Team or
                Business plan, does not delete anything, and does not remove you from these
                accounts.
              </li>
              <li>
                <span className="font-medium text-foreground">Transfer ownership</span> —
                hands a Team or Business account to another member. Its workflows,
                integrations, members, and subscription stay exactly as they are.
              </li>
              <li>
                <span className="font-medium text-foreground">Leave a team</span> — removes
                your membership. The account, its data, and its billing continue without you.
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Delete your personal account
                </span>{" "}
                — only available once you no longer own the accounts above. It never deletes
                Team or Business data, which belongs to those accounts and not to you
                individually.
              </li>
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
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">Delete my ChainReact account</p>
          <p className="max-w-xl text-xs text-muted-foreground">
            This deletes your personal account and its information. It is not the same as
            cancelling your plan — if you only want to stop paying,{" "}
            <span className="font-medium text-foreground">
              use &ldquo;Cancel subscription&rdquo; under Plan &amp; billing
            </span>{" "}
            and keep your account.
          </p>
          <ul
            data-testid="account-delete-consequences"
            className="max-w-xl list-disc space-y-1 pl-4 text-xs text-muted-foreground"
          >
            <li>Your access is frozen immediately and your automations stop running.</li>
            <li>
              Your personal account&apos;s ChainReact subscription is cancelled and will not
              renew.
            </li>
            <li>
              Your personal workflows, runs, integrations, files, AI conversations, and
              account information are scheduled for permanent deletion after a 30-day grace
              period.
            </li>
            <li>
              Some anonymized billing and security records are kept for the period required
              for accounting, fraud prevention, and legal purposes.
            </li>
            <li>
              Team and Business information does not belong to you individually — those
              accounts, their data, and their subscriptions stay with them.
            </li>
            <li>
              Any Team or Business account you own must be transferred or deleted first.
            </li>
            <li>
              Cancelling the deletion restores your account on the{" "}
              <span className="font-medium text-foreground">Free plan</span> — it does not
              restart billing. You can subscribe again whenever you want.
            </li>
          </ul>
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
              Your data stays recoverable for 30 days — sign in any time before then to
              cancel. Your subscription is cancelled right away and is not restored by
              cancelling the deletion.
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
