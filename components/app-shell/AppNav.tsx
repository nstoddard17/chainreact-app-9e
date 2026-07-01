"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  APP_SHELL_ADMIN_NAV_ITEMS,
  APP_SHELL_NAV_ITEMS,
  isNavItemActive,
  type AppShellNavItem,
} from "./navItems";
import { useIsInternalAdmin } from "./useIsInternalAdmin";

/**
 * Desktop vertical icon rail nav for the authenticated app shell
 * (Slice 4.APP-SHELL-1; rewritten as a vertical icon rail in
 * 4.APP-SHELL-DARK-DESIGN-PARITY-1 to match the design `Sidebar` in
 * `workflows-page.jsx:4-119`).
 *
 * Icon-forward — each item renders just the glyph; the human label is
 * exposed via `aria-label` (for AT) and a tooltip on hover (for sighted
 * users). Active state uses `aria-current="page"` + a primary-tinted
 * background tile.
 *
 * Hidden below `md` — the `AppMobileNav` popover replaces it there
 * with the same item set + full labels.
 */
export function AppNav() {
  const pathname = usePathname() ?? "";
  const isInternalAdmin = useIsInternalAdmin();

  const renderItem = (item: AppShellNavItem) => {
    const active = isNavItemActive(item.href, pathname);
    return (
      <Link
        key={item.id}
        href={item.href}
        data-testid={`app-shell-nav-${item.id}`}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
        className={
          "group relative inline-flex h-10 w-10 items-center justify-center rounded-lg border transition " +
          (active
            ? "border-primary/30 bg-primary/10 text-primary"
            : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground")
        }
      >
        {item.icon}
        <span
          role="tooltip"
          className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <nav
      data-testid="app-shell-nav"
      aria-label="Primary"
      className="hidden flex-col items-center gap-1 md:flex"
    >
      {APP_SHELL_NAV_ITEMS.map(renderItem)}
      {isInternalAdmin && (
        <>
          <div className="my-1 h-px w-8 bg-border" aria-hidden />
          {APP_SHELL_ADMIN_NAV_ITEMS.map(renderItem)}
        </>
      )}
    </nav>
  );
}
