"use client";

import { Button } from "@/components/ui/button";

/**
 * Partial-failure banner for a deletion request whose FREEZE committed but whose
 * subscription cancellation did not (Slice 4.ACCOUNT-BILLING-LIFECYCLE-1;
 * step-up removed in ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Both facts are true and the user is told both: the account IS frozen and scheduled for
 * deletion, AND the subscription may still renew.
 *
 * NO password and NO verification code. The retry hits
 * `/api/account/delete/retry-billing`, which refuses unless the account is already
 * `pending_deletion` and performs no lifecycle transition — it only re-runs the
 * idempotent Stripe cancellation. There is no destructive decision left to
 * authorize, so demanding a fresh emailed code to recover from OUR failure would
 * be friction with no security value.
 *
 * Presentational: all state and the retry action live in `AccountDeletionCard`.
 */
export function AccountDeletionBillingRetry({
  busy,
  onRetry,
}: {
  busy: boolean;
  onRetry: () => void;
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

      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="account-billing-retry-confirm"
          disabled={busy}
          onClick={onRetry}
        >
          {busy ? "Retrying…" : "Retry cancelling subscription"}
        </Button>
      </div>
    </div>
  );
}
