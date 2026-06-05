"use client";

import { AccountSwitcherList } from "./AccountSwitcherList";
import { useAccountSwitcher } from "./useAccountSwitcher";

/**
 * Mobile workspace switcher (Slice 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * The mobile counterpart of the desktop top-bar `AccountSwitcher`. Rendered
 * INLINE inside the mobile nav drawer (`AppMobileNav`) rather than as its own
 * popover — below `md` the drawer is the one place every desktop top-bar
 * affordance is reachable, and a nested popover-in-popover would fight the
 * portal/scope rules. Space in `AppMobileBar` is constrained, so the switcher
 * lives here instead of being forced into the thin bar.
 *
 * Reuses the shared `useAccountSwitcher` hook + `AccountSwitcherList` so there is
 * exactly ONE active-workspace state path and ONE row layout across desktop and
 * mobile. Switching reloads (handled by the hook), which also dismisses the
 * drawer; a frozen account is disabled; the active account is checkmarked.
 */
export function AppMobileAccountSwitcher() {
  const { accounts, activeId, active, switching, error, switchTo } =
    useAccountSwitcher();

  return (
    <div
      data-testid="app-shell-mobile-account-switcher"
      className="flex flex-col gap-0.5"
    >
      <AccountSwitcherList
        accounts={accounts}
        activeId={activeId}
        active={active}
        switching={switching}
        error={error}
        switchTo={switchTo}
        testIdPrefix="app-shell-mobile-account"
      />
    </div>
  );
}
