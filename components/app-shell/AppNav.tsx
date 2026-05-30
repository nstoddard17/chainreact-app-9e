"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_SHELL_NAV_ITEMS, isNavItemActive } from "./navItems";

/**
 * Desktop primary nav for the authenticated app shell
 * (Slice 4.APP-SHELL-1).
 *
 * Hidden below `md` (640px) — the `AppMobileNav` popover takes over
 * there with the same item set. `usePathname()` drives the active
 * highlight; `aria-current="page"` is set on the active link for
 * accessibility-tree consumers (screen readers, automation tooling).
 */
export function AppNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      data-testid="app-shell-nav"
      aria-label="Primary"
      className="hidden items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5 md:flex"
    >
      {APP_SHELL_NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item.href, pathname);
        return (
          <Link
            key={item.id}
            href={item.href}
            data-testid={`app-shell-nav-${item.id}`}
            aria-current={active ? "page" : undefined}
            className={
              "rounded px-3 py-1 text-xs font-medium transition " +
              (active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
