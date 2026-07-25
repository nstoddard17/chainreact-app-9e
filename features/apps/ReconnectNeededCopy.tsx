import Link from "next/link";
import { resolveHelpLink } from "@/features/marketing/help/contextualHelp";

/**
 * CS-APPS-RECOVERY-COPY — user-facing reconnect-needed help text for the Apps card.
 *
 * Extracted from AppCard so the card stays under its line cap and the recovery
 * wording lives in one place. Safe copy only — no provider error, token, scope, or
 * account identity. No behavior; purely presentational.
 *
 * HELP-CENTER-CONTEXTUAL-1: reconnect-needed rows also carry a secondary
 * "How to reconnect" link to the Help Center's disconnected-app article,
 * resolved through the central contextual-help resolver (never a hardcoded
 * slug). The link renders only when the resolver returns a valid article,
 * and it never replaces the primary Reconnect action (which lives beside
 * the row in AppCard).
 */

const CONNECTION_HELP = resolveHelpLink({ type: "connection_problem" });

function ConnectionHelpLink() {
  if (!CONNECTION_HELP) return null;
  return (
    <Link
      href={CONNECTION_HELP.href}
      data-testid="app-card-reconnect-help-link"
      className="w-fit text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:no-underline hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {CONNECTION_HELP.label}
    </Link>
  );
}

/**
 * Per-row explanation shown under a reconnect-needed account. Branches on whether the
 * VIEWER may reconnect this row:
 *   - Reconnectable → lead with WHY it's worth doing ("keep workflows running") and
 *     reassure that it's a low-stakes refresh of THIS account only (not a destructive
 *     disconnect, not a provider-wide change) — CS-APPS-RECOVERY-FINAL-1.
 *   - Not reconnectable → the person who originally connected it must (a permission
 *     rule on personal credentials, not an error); no actionable copy / no dead button.
 *     The Help Center link still renders — the article explains exactly this rule.
 * Keeps the existing `app-card-reconnect-needed-copy` testid.
 */
export function ReconnectRowCopy({ canReconnect }: { canReconnect: boolean }) {
  if (!canReconnect) {
    return (
      <span
        data-testid="app-card-reconnect-needed-copy"
        className="flex flex-col gap-0.5 text-[11px]"
      >
        <span className="text-amber-700 dark:text-amber-400">
          This account needs reconnecting. The person who connected it must reconnect it.
        </span>
        <ConnectionHelpLink />
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
      <ConnectionHelpLink />
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
