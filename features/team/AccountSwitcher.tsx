"use client";

import { useState, type FormEvent } from "react";
import type { AccountSummary } from "@/lib/api/accounts";
import {
  AccountApiError,
  createTeam,
  setActiveAccount,
} from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountTypeLabel } from "./accountTypeLabel";

/**
 * Account switcher (Slice 4.TEAM-PAGE-1).
 *
 * Lists the caller's accounts (Personal first, then Teams) with the active one
 * marked, lets them switch the active account, and create a new Team inline.
 * Wraps the typed `lib/api/accounts` client; on success it calls `onChanged`
 * (a `router.refresh()`) so the server component re-reads the new active context.
 *
 * Frozen accounts (`pending_deletion`) render disabled — the set-active route
 * refuses them, so we never offer the switch.
 */
interface Props {
  accounts: readonly AccountSummary[];
  activeAccountId: string | null;
  onChanged: () => void;
}

export function AccountSwitcher({ accounts, activeAccountId, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);

  async function handleSwitch(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await setActiveAccount(id);
      onChanged();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setCreateError("Enter a team name.");
      return;
    }
    setCreatePending(true);
    setCreateError(null);
    try {
      await createTeam(trimmed);
      setName("");
      setCreating(false);
      onChanged(); // new team auto-activates server-side
    } catch (err) {
      setCreateError(messageFor(err));
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <section
      data-testid="team-account-switcher"
      aria-label="Your accounts"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-foreground">Your accounts</h2>
          <p className="text-xs text-muted-foreground">
            Switch the active account or create a new team.
          </p>
        </div>
        {!creating && (
          <Button
            type="button"
            size="sm"
            data-testid="team-create-toggle"
            onClick={() => {
              setCreating(true);
              setCreateError(null);
            }}
          >
            New team
          </Button>
        )}
      </div>

      {creating && (
        <form
          onSubmit={handleCreate}
          data-testid="team-create-form"
          className="flex flex-col gap-2 rounded-lg border border-border bg-background/40 p-3 sm:flex-row sm:items-center"
        >
          <Input
            aria-label="Team name"
            placeholder="Team name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={createPending}>
              {createPending ? "Creating…" : "Create team"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setName("");
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {createError && (
        <p role="alert" className="text-xs text-destructive">
          {createError}
        </p>
      )}

      <ul className="flex flex-col gap-2" data-testid="team-account-list">
        {accounts.map((acct) => {
          const isActive = acct.id === activeAccountId;
          const frozen = acct.deletionStatus === "pending_deletion";
          return (
            <li
              key={acct.id}
              data-testid={`team-account-${acct.id}`}
              className={
                "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 " +
                (isActive
                  ? "border-primary/40 bg-primary/5"
                  : "border-border bg-background/40")
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold uppercase text-primary"
                >
                  {acct.name.slice(0, 2)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {acct.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {accountTypeLabel(acct.type)} · {acct.role}
                    {frozen && (
                      <Badge variant="outline" className="border-warning/40 text-warning">
                        Pending deletion
                      </Badge>
                    )}
                  </span>
                </div>
              </div>
              {isActive ? (
                <Badge variant="success" data-testid="team-active-badge">
                  Active
                </Badge>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid={`team-switch-${acct.id}`}
                  disabled={frozen || busyId !== null}
                  onClick={() => handleSwitch(acct.id)}
                >
                  {busyId === acct.id ? "Switching…" : "Switch"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function messageFor(err: unknown): string {
  if (err instanceof AccountApiError) return err.message;
  return "Something went wrong. Please try again.";
}
