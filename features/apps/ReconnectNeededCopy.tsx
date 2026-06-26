/**
 * CS-APPS-RECOVERY-COPY — user-facing reconnect-needed help text for the Apps card.
 *
 * Extracted from AppCard so the card stays under its line cap and the recovery
 * wording lives in one place. Safe copy only — no provider error, token, scope, or
 * account identity. No behavior; purely presentational.
 */

/**
 * Per-row explanation shown under a reconnect-needed account. Branches on whether the
 * VIEWER may reconnect this row: if they can, they fix it directly; if not, the person
 * who originally connected it must (a permission rule on personal credentials, not an
 * error). Keeps the existing `app-card-reconnect-needed-copy` testid.
 */
export function ReconnectRowCopy({ canReconnect }: { canReconnect: boolean }) {
  return (
    <span
      data-testid="app-card-reconnect-needed-copy"
      className="text-[11px] text-amber-700 dark:text-amber-400"
    >
      {canReconnect
        ? "This account needs reconnecting. Use Reconnect to restore it."
        : "This account needs reconnecting. The person who connected it must reconnect it."}
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
