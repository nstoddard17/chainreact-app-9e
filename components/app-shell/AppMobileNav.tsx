"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppMobileAccountSwitcher } from "./AppMobileAccountSwitcher";
import { APP_SHELL_NAV_ITEMS, isNavItemActive } from "./navItems";

/**
 * Mobile primary-nav popover (Slice 4.APP-SHELL-1; workspace switcher
 * added in 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * Renders below `md` (≤ 640px) — the hamburger button + popover replace
 * the inline `AppNav`. The drawer carries two sections: the workspace
 * switcher (so the active account is visible + switchable on mobile, the
 * counterpart of the desktop top-bar `AccountSwitcher`) and the primary
 * nav items, which match `AppNav` exactly (single source of truth:
 * `APP_SHELL_NAV_ITEMS`). Clicking a nav item closes the popover so the
 * user lands on the destination without lingering chrome.
 *
 * `usePathname()` drives the active highlight, identical semantics to
 * the desktop nav.
 */
export function AppMobileNav() {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="app-shell-mobile-trigger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <HamburgerIcon open={open} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-64 p-1"
          // Pinned dark scope — see UserMenu.tsx note about the
          // portaled-popover scope problem.
          data-app-surface="dark"
          data-testid="app-shell-mobile-content"
        >
          <AppMobileAccountSwitcher />
          <div className="my-1 h-px bg-border" aria-hidden />
          <ul className="flex flex-col gap-0.5" role="menu">
            {APP_SHELL_NAV_ITEMS.map((item) => {
              const active = isNavItemActive(item.href, pathname);
              return (
                <li key={item.id} role="none">
                  <Link
                    href={item.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    data-testid={`app-shell-mobile-nav-${item.id}`}
                    className={
                      "block rounded-sm px-2.5 py-1.5 text-sm " +
                      (active
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground hover:bg-muted")
                    }
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden
      >
        <line x1="4" y1="4" x2="12" y2="12" />
        <line x1="12" y1="4" x2="4" y2="12" />
      </svg>
    );
  }
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <line x1="3" y1="5" x2="13" y2="5" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="11" x2="13" y2="11" />
    </svg>
  );
}
