"use client";

import { useState } from "react";
import {
  AccountApiError,
  changeMemberRole,
  removeMember,
  type TeamManageableRole,
} from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TeamMemberView } from "./teamTypes";
import { formatTeamDate } from "./formatTeamDate";

/**
 * Members roster table (Slice 4.TEAM-PAGE-1).
 *
 * Identity honesty: the `/members` API returns only `userId`, so we show the
 * signed-in user's row as "You" and everyone else as a team member identified
 * by role + joined date + a short id. We do NOT invent names/emails.
 *
 * Manager controls (owner/admin): the owner row is fixed (no controls — owner
 * transfer is deferred). For non-owner, non-self rows, a role select
 * (admin↔member) + Remove are shown. The server still enforces the fine-grained
 * rules (admins can't manage other admins, etc.); we surface its errors inline.
 */
interface Props {
  accountId: string;
  members: readonly TeamMemberView[];
  canManage: boolean;
  onChanged: () => void;
}

function shortId(userId: string): string {
  return userId.length > 8 ? `${userId.slice(0, 8)}…` : userId;
}

export function MembersTable({ accountId, members, canManage, onChanged }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withBusy(userId: string, fn: () => Promise<void>) {
    setBusyId(userId);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(
        err instanceof AccountApiError ? err.message : "That action failed. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      data-testid="team-members-table"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid grid-cols-[2.4fr_1.2fr_1fr_auto] gap-3 border-b border-border bg-background/40 px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span>Member</span>
        <span>Role</span>
        <span>Joined</span>
        <span className="sr-only">Actions</span>
      </div>

      {members.length === 0 && (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          No members match your search.
        </p>
      )}

      <ul>
        {members.map((m) => {
          const isOwner = m.role === "owner";
          const manageable = canManage && !isOwner && !m.isYou;
          const rowBusy = busyId === m.userId;
          return (
            <li
              key={m.userId}
              data-testid={`team-member-${m.userId}`}
              className="grid grid-cols-[2.4fr_1.2fr_1fr_auto] items-center gap-3 border-t border-border px-4 py-3 first:border-t-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary"
                >
                  {m.userId.slice(0, 2)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {m.isYou ? "You" : "Team member"}
                    {m.isYou && (
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        You
                      </Badge>
                    )}
                  </span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {shortId(m.userId)}
                  </span>
                </div>
              </div>

              <div>
                {manageable ? (
                  <select
                    aria-label="Member role"
                    value={m.role}
                    disabled={rowBusy}
                    onChange={(e) =>
                      withBusy(m.userId, () =>
                        changeMemberRole(
                          accountId,
                          m.userId,
                          e.target.value as TeamManageableRole,
                        ),
                      )
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                  </select>
                ) : (
                  <Badge variant={isOwner ? "default" : "outline"} className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </div>

              <span className="text-xs text-muted-foreground">
                {formatTeamDate(m.joinedAt)}
              </span>

              <div className="flex justify-end">
                {manageable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid={`team-remove-${m.userId}`}
                    disabled={rowBusy}
                    onClick={() =>
                      withBusy(m.userId, () => removeMember(accountId, m.userId))
                    }
                    className="text-destructive hover:text-destructive"
                  >
                    {rowBusy ? "…" : "Remove"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
