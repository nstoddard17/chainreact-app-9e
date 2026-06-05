"use client";

import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  listAccounts,
  setActiveAccount,
  type AccountSummary,
} from "@/lib/api/accounts";

/**
 * Workspace / account switcher (Slice 4.ACCOUNT-SWITCHER-1).
 *
 * Shows the caller's ACTIVE account (name + Personal/Team/Organization) and lets
 * them switch between accounts they're a member of. Switching writes through the
 * existing active-account mechanism (`POST /api/account/active` →
 * setActiveAccount), then reloads so SSR + client state both pick up the new
 * active account (account-scoped pages re-render from it).
 *
 * Self-fetches its data (`GET /api/accounts`) so no per-page wiring is needed;
 * a frozen account is shown disabled. NO new workspace-state system — this is a
 * thin control over the 11b/11d active-account model.
 */
const TYPE_LABEL: Record<AccountSummary["type"], string> = {
  personal: "Personal",
  team: "Team",
  organization: "Organization",
};

export function AccountSwitcher() {
  const [accounts, setAccounts] = useState<readonly AccountSummary[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
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
              {active ? TYPE_LABEL[active.type] : " "}
            </span>
          </span>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden className="ml-auto shrink-0 text-muted-foreground">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1" data-testid="account-switcher-menu">
        <p className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Workspaces
        </p>
        {accounts === null && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
        )}
        {accounts !== null && accounts.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">No workspaces.</p>
        )}
        {(accounts ?? []).map((a) => {
          const isActive = a.id === (activeId ?? active?.id);
          const frozen = a.deletionStatus !== "active";
          return (
            <button
              key={a.id}
              type="button"
              data-testid={`account-switcher-item-${a.id}`}
              aria-current={isActive}
              disabled={frozen || switching !== null}
              onClick={() => switchTo(a.id)}
              className={
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60 " +
                (isActive ? "bg-muted" : "hover:bg-muted")
              }
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/15 text-[11px] font-bold text-primary">
                {a.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-foreground">{a.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {TYPE_LABEL[a.type]}
                  {frozen ? " · pending deletion" : ""}
                </span>
              </span>
              {switching === a.id ? (
                <span className="text-[10px] text-muted-foreground">Switching…</span>
              ) : isActive ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="text-primary">
                  <path d="m3 8 3.5 3.5L13 5" />
                </svg>
              ) : null}
            </button>
          );
        })}
        {error && (
          <p role="alert" data-testid="account-switcher-error" className="px-2 py-1.5 text-[11px] text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
