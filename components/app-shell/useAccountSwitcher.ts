"use client";

import { useEffect, useState } from "react";
import {
  listAccounts,
  setActiveAccount,
  type AccountSummary,
} from "@/lib/api/accounts";

/**
 * Shared account-switcher state (Slice 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * Single source of truth for BOTH the desktop top-bar `AccountSwitcher` and the
 * mobile-drawer `AppMobileAccountSwitcher`. Extracted from the original desktop
 * component so the two surfaces share ONE fetch + ONE switch path — there is no
 * second mobile-only active-workspace state system.
 *
 * Behavior (unchanged from the desktop original):
 *   - self-fetches the caller's accounts + effective active id (`GET /api/accounts`),
 *   - `switchTo` writes through the existing active-account mechanism
 *     (`POST /api/account/active` → setActiveAccount) and reloads so SSR + client
 *     state both pick up the new active account,
 *   - a frozen (pending-deletion) account is surfaced via `deletionStatus` so the
 *     UI can disable it.
 *
 * This is a thin control over the 11b/11d active-account model — it never touches
 * the foreground-gate-only active-account resolver (11c guard).
 */
/**
 * User-facing tier labels for the account switcher (desktop + mobile via
 * `AccountSwitcherList`). The internal type stays `organization`, but the product
 * surfaces it as **Business** — never the raw "Organization" word. Mirrors the
 * canonical `features/team/accountTypeLabel.ts` mapping (kept in sync by hand;
 * this lives in `components/` to avoid a component→feature import).
 */
export const TYPE_LABEL: Record<AccountSummary["type"], string> = {
  personal: "Personal",
  team: "Team",
  organization: "Business",
};

export interface UseAccountSwitcher {
  /** null while the first fetch is in flight; [] on failure or genuinely empty. */
  accounts: readonly AccountSummary[] | null;
  /** Effective active account id from the server. */
  activeId: string | null;
  /** Resolved active account record (by id, then by isActive flag). */
  active: AccountSummary | null;
  /** Id currently mid-switch, or null. */
  switching: string | null;
  /** User-facing switch error, or null. */
  error: string | null;
  /** Switch to `id`; no-op if it's already active or a switch is in flight. */
  switchTo: (id: string) => Promise<void>;
}

export function useAccountSwitcher(): UseAccountSwitcher {
  const [accounts, setAccounts] = useState<readonly AccountSummary[] | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAccounts()
      .then((r) => {
        if (!alive) return;
        setAccounts(r.accounts);
        setActiveId(r.activeAccountId);
      })
      .catch(() => {
        if (alive) setAccounts([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const active =
    accounts?.find((a) => a.id === activeId) ??
    accounts?.find((a) => a.isActive) ??
    null;

  async function switchTo(id: string) {
    if (id === activeId || switching) return;
    setSwitching(id);
    setError(null);
    try {
      await setActiveAccount(id);
      // Reload so SSR (active-account-scoped pages) + client state agree.
      window.location.reload();
    } catch {
      setError("Couldn't switch account. Please try again.");
      setSwitching(null);
    }
  }

  return { accounts, activeId, active, switching, error, switchTo };
}
