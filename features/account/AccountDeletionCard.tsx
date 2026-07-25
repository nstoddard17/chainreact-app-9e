"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AccountDeletionError,
  cancelAccountDeletion,
  retryAccountDeletionBilling,
  type DeletionStatusResult,
  type OwnedAccountSummary,
} from "@/lib/api/accounts";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";
import { AccountDeletionBillingRetry } from "./AccountDeletionBillingRetry";
import { AccountDeletionVerification } from "./AccountDeletionVerification";

/**
 * Personal-account danger zone (Slice 4.ACCOUNT-SETTINGS-1; relocated under the
 * Danger-zone settings section in 4.ACCOUNT-SETTINGS-2; billing consequences added in
 * 4.ACCOUNT-BILLING-LIFECYCLE-1; confirmation made universal in
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Explains the freeze/grace/purge flow, then either (a) the emailed-code
 * confirmation flow, (b) the owned-Team/Business blocker, or (c) the
 * pending/scheduled state with a cancel. Deletion always targets the caller's
 * OWN personal account; the shell only renders this when that account is active.
 *
 * NO PASSWORD FIELD — for any auth provider. Confirmation is a one-time code sent
 * to the account's verified email (see `AccountDeletionVerification`), so users
 * who signed up with Google or an email OTP can delete their account too. This
 * card contains no notion of "how did this user sign in".
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<readonly OwnedAccountSummary[] | null>(
    null,
  );

  const purgeDate = formatPurgeDate(purgeAfter);

  function applyResult(result: DeletionStatusResult) {
    setStatus(result.deletionStatus);
    setPurgeAfter(result.purgeAfter);
    setBillingFailed(result.billingCancellation === "failed");
  }

  function openForm() {
    setError(null);
    setBlocked(null);
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setError(null);
  }

  /** Deletion scheduled — possibly with a billing cancellation that failed. */
  function handleDeleted(result: DeletionStatusResult, billingError: string | null) {
    setFormOpen(false);
    applyResult(result);
    setError(billingError);
  }

  function handleBlocked(accounts: readonly OwnedAccountSummary[]) {
    setFormOpen(false);
    setBlocked(accounts);
  }

  /**
   * Retry ONLY the subscription cancellation after a partial failure.
   *
   * Hits the dedicated retry route, which refuses unless the account is already
   * `pending_deletion` and performs NO lifecycle transition — it just re-runs the
   * idempotent Stripe cancellation. No password and no verification code: there is
   * no destructive decision left to authorize, and demanding a fresh emailed code
   * to recover from OUR failure would be friction with no security value.
   */
  async function retryBillingCancellation() {
    setBusy(true);
    setError(null);
    try {
      const result = await retryAccountDeletionBilling();
      applyResult(result);
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
              busy={busy}
              onRetry={retryBillingCancellation}
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
          <>
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
            {error && (
              <p
                role="alert"
                data-testid="account-deletion-error"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </>
        ) : (
          <AccountDeletionVerification
            onDeleted={handleDeleted}
            onBlocked={handleBlocked}
            onCancel={cancelForm}
          />
        )}
      </div>
    </Panel>
  );
}
