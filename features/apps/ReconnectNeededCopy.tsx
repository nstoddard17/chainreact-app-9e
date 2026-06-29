/**
 * CS-APPS-RECOVERY-COPY — user-facing reconnect-needed help text for the Apps card.
 *
 * Extracted from AppCard so the card stays under its line cap and the recovery
 * wording lives in one place. Safe copy only — no provider error, token, scope, or
 * account identity. No behavior; purely presentational.
 */

/**
 * Per-row explanation shown under a reconnect-needed account. Branches on whether the
 * VIEWER may reconnect this row:
 *   - Reconnectable → lead with WHY it's worth doing ("keep workflows running") and
 *     reassure that it's a low-stakes refresh of THIS account only (not a destructive
 *     disconnect, not a provider-wide change) — CS-APPS-RECOVERY-FINAL-1.
 *   - Not reconnectable → the person who originally connected it must (a permission
 *     rule on personal credentials, not an error); no actionable copy / no dead button.
 * Keeps the existing `app-card-reconnect-needed-copy` testid.
 */
export function ReconnectRowCopy({ canReconnect }: { canReconnect: boolean }) {
  if (!canReconnect) {
    return (
      <span
        data-testid="app-card-reconnect-needed-copy"
        className="text-[11px] text-amber-700 dark:text-amber-400"
      >
        This account needs reconnecting. The person who connected it must reconnect it.
      </span>
    );
  }
  return (
    <span
      data-testid="app-card-reconnect-needed-copy"
      className="flex flex-col gap-0.5 text-[11px]"
    >
      <span className="text-amber-700 dark:text-amber-400">
        Reconnect this app to keep workflows running.
      </span>
      <span className="text-muted-foreground">
        {"Reconnect only refreshes this account's connection."}
      </span>
    </span>
  );
}

/**
 * Card-level reassurance shown only when this provider holds multiple accounts and at
 * least one is healthy while another needs reconnecting — so a single broken account
 * doesn't read as a total outage of the app.
 */
export function OtherAccountsActiveNote() {
  return (
    <p
      data-testid="app-card-others-active-note"
      className="mb-2 text-[11px] text-muted-foreground"
    >
      Only the flagged account needs reconnecting — your other connected accounts are
      still active.
    </p>
  );
}
