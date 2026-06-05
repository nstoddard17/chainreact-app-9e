"use client";

import { TYPE_LABEL, type UseAccountSwitcher } from "./useAccountSwitcher";

/**
 * Presentational workspace list (Slice 4.ACCOUNT-SWITCHER-MOBILE-1).
 *
 * Shared by the desktop popover (`AccountSwitcher`) and the mobile drawer
 * section (`AppMobileAccountSwitcher`) so both render the SAME list — header,
 * per-account row (avatar + name + Personal/Team/Business + pending-deletion
 * note), active checkmark, "Switching…" affordance, frozen-disabled state, and
 * error line. The two surfaces differ only in their chrome (popover vs. inline
 * drawer block) and `testIdPrefix`.
 */
type Props = Pick<
  UseAccountSwitcher,
  "accounts" | "activeId" | "active" | "switching" | "error" | "switchTo"
> & {
  /** Test-id namespace, e.g. "account-switcher" or "app-shell-mobile-account". */
  testIdPrefix: string;
};

export function AccountSwitcherList({
  accounts,
  activeId,
  active,
  switching,
  error,
  switchTo,
  testIdPrefix,
}: Props) {
  return (
    <>
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
            data-testid={`${testIdPrefix}-item-${a.id}`}
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
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
                className="text-primary"
              >
                <path d="m3 8 3.5 3.5L13 5" />
              </svg>
            ) : null}
          </button>
        );
      })}
      {error && (
        <p
          role="alert"
          data-testid={`${testIdPrefix}-error`}
          className="px-2 py-1.5 text-[11px] text-destructive"
        >
          {error}
        </p>
      )}
    </>
  );
}
