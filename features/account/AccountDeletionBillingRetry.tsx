"use client";

import { Button } from "@/components/ui/button";

/**
 * Partial-failure banner for a deletion request whose FREEZE committed but whose
 * subscription cancellation did not (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1).
 *
 * Both facts are true and the user is told both: the account IS frozen and scheduled for
 * deletion, AND the subscription may still renew. It offers the retry behind the same
 * password step-up the original request used — the security control is preserved; only the
 * typed confirmation phrase is re-supplied by the caller (the destructive decision was
 * already made and confirmed, and the retry cannot cause a new destructive transition).
 *
 * Presentational: all state and the retry action live in `AccountDeletionCard`.
 */
export function AccountDeletionBillingRetry({
  retryOpen,
  password,
  busy,
  onOpen,
  onPasswordChange,
  onRetry,
  onDismiss,
}: {
  retryOpen: boolean;
  password: string;
  busy: boolean;
  onOpen: () => void;
  onPasswordChange: (value: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      data-testid="account-deletion-billing-failed"
      className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <p className="text-sm font-semibold text-destructive">
        We couldn&apos;t cancel your subscription.
      </p>
      <p className="text-xs text-muted-foreground">
        Your account is frozen and scheduled for deletion, but your ChainReact subscription
        may still renew. Retry below. Your account will not be permanently deleted while a
        subscription is still active.
      </p>

      {!retryOpen ? (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="account-billing-retry-open"
            onClick={onOpen}
          >
            Retry cancelling subscription
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground">
            Confirm your password to retry
            <input
              type="password"
              aria-label="Password"
              data-testid="account-billing-retry-password"
              value={password}
              disabled={busy}
              autoComplete="current-password"
              onChange={(e) => onPasswordChange(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              data-testid="account-billing-retry-confirm"
              disabled={busy || password.length === 0}
              onClick={onRetry}
            >
              {busy ? "Retrying…" : "Retry"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              data-testid="account-billing-retry-dismiss"
              disabled={busy}
              onClick={onDismiss}
            >
              Not now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
