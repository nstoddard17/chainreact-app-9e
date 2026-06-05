"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AccountSwitcherList } from "./AccountSwitcherList";
import { TYPE_LABEL, useAccountSwitcher } from "./useAccountSwitcher";

/**
 * Workspace / account switcher (Slice 4.ACCOUNT-SWITCHER-1; shared-state refit
 * in 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * Desktop top-bar control. Shows the caller's ACTIVE account (name +
 * Personal/Team/Organization) and lets them switch between accounts they're a
 * member of. State + switching live in the shared `useAccountSwitcher` hook so
 * the mobile-drawer switcher reuses the exact same fetch + switch path (no
 * second workspace-state system); the per-account row markup lives in the shared
 * `AccountSwitcherList`. Switching writes through `POST /api/account/active` then
 * reloads so SSR + client state both pick up the new active account.
 *
 * Self-fetches its data (`GET /api/accounts`); a frozen account is shown
 * disabled. A thin control over the 11b/11d active-account model — never touches
 * the foreground-gate-only resolver (11c guard).
 */
export function AccountSwitcher() {
  const { accounts, activeId, active, switching, error, switchTo } =
    useAccountSwitcher();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="account-switcher-trigger"
          aria-label="Switch workspace"
          className="flex max-w-[220px] items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-left hover:border-foreground/30"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-primary">
            {(active?.name ?? "?").slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span
              data-testid="account-switcher-active-name"
              className="block truncate text-xs font-semibold text-foreground"
            >
              {active ? active.name : accounts === null ? "Loading…" : "Workspace"}
            </span>
            <span className="block text-[10px] text-muted-foreground">
              {active ? TYPE_LABEL[active.type] : " "}
            </span>
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="ml-auto shrink-0 text-muted-foreground">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" data-testid="account-switcher-menu">
        <AccountSwitcherList
          accounts={accounts}
          activeId={activeId}
          active={active}
          switching={switching}
          error={error}
          switchTo={switchTo}
          testIdPrefix="account-switcher"
        />
      </PopoverContent>
    </Popover>
  );
}
