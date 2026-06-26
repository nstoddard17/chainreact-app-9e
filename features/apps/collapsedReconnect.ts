import type { AppAccountSummary } from "@/contracts/apps";

/**
 * Collapsed-card reconnect discoverability (Slice 4.CS-APPS-RECOVERY-2).
 *
 * Per-row Reconnect already lives in the EXPANDED account list (gated by
 * `acc.canReconnect`). This pure helper decides what — if anything — the
 * COLLAPSED card should surface so a broken connection is recoverable without the
 * user first having to discover the expand chevron. It creates NO new reconnect
 * semantics: a direct action reuses the exact per-row reconnect flow (one opaque
 * `integrationId`), and the "review" action only expands the card.
 *
 * Decision (deliberately conservative — never guess which identity to re-auth):
 *   - `none`          — no active row needs reconnect, OR the only rows that need
 *                       reconnect are ones the caller CANNOT reconnect (the status
 *                       pill already shows "Reconnect needed"; no actionable button).
 *   - `reconnect-one` — EXACTLY ONE row needs reconnect AND the caller may
 *                       reconnect it → offer a direct Reconnect for that row.
 *   - `review`        — more than one row needs reconnect (or a mix of
 *                       reconnectable + blocked) with at least one reconnectable →
 *                       don't guess; expand so each flagged row's own
 *                       Reconnect / blocked-status is visible.
 */
export type CollapsedReconnectAction =
  | { readonly kind: "none" }
  | { readonly kind: "reconnect-one"; readonly integrationId: string }
  | { readonly kind: "review" };

export function deriveCollapsedReconnect(
  accounts: readonly AppAccountSummary[],
): CollapsedReconnectAction {
  const needing = accounts.filter((a) => a.needsReconnect);
  if (needing.length === 0) return { kind: "none" };

  const reconnectable = needing.filter((a) => a.canReconnect);
  // No reconnectable row → nothing actionable (e.g. a member who isn't the
  // connector of a flagged personal connection). The status pill still warns.
  if (reconnectable.length === 0) return { kind: "none" };

  // Exactly one connection needs reconnect overall AND it's reconnectable →
  // a single, unambiguous direct action.
  if (needing.length === 1) {
    return { kind: "reconnect-one", integrationId: needing[0]!.id };
  }

  // Multiple rows need reconnect (possibly a mix of reconnectable + blocked) →
  // expand rather than pick one for the user.
  return { kind: "review" };
}
