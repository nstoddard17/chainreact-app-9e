"use client";

import { usePathname } from "next/navigation";
import { APP_SHELL_NAV_ITEMS, isNavItemActive } from "./navItems";

/**
 * Page-context label for the authenticated app-shell top bar
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Renders the label of the currently active primary nav item — derived
 * from `usePathname()` via the same `isNavItemActive` predicate the rail
 * uses, so the label can never drift out of sync with the highlight on
 * the rail. Used in both the desktop `AppTopBar` and the mobile bar.
 *
 * Renders nothing if no registered nav item matches — better empty than
 * a fabricated breadcrumb (e.g. workspace label) we can't substantiate.
 */
export function AppPageContext() {
  const pathname = usePathname() ?? "";
  const active = APP_SHELL_NAV_ITEMS.find((item) =>
    isNavItemActive(item.href, pathname),
  );
  if (!active) return null;
  return (
    <span
      data-testid="app-shell-page-context"
      className="truncate text-sm font-semibold text-foreground"
    >
      {active.label}
    </span>
  );
}
