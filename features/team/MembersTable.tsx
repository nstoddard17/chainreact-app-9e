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
 * Members roster table (Slice 4.TEAM-PAGE-1; identity added in 4.TEAM-PAGE-2).
 *
 * Display identity comes from the co-member-only `get_account_member_identities`
 * RPC. The fallback chain is name → email → short user id, and the signed-in
 * user always carries a "You" badge. We never invent identity we don't have.
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

/**
 * Resolve the two display lines + avatar seed for a member.
 *
 * Preferred shape: NAME on top (next to the "You" pill), EMAIL underneath.
 * The raw user id is only ever shown as a last resort when we have neither a
 * name nor an email — once an email exists it always wins the bottom line over
 * the id.
 *   - name + email → name / email
 *   - name only    → name / (nothing)
 *   - email only   → email / (nothing — no id)
 *   - neither      → "You" | "Team member" / short id
 */
function memberIdentity(m: TeamMemberView): {
  primary: string;
  secondary: string | null;
  avatar: string;
} {
  const name = m.displayName?.trim() || "";
  const email = m.email?.trim() || "";
  if (name) {
    return { primary: name, secondary: email || null, avatar: name };
  }
  if (email) {
    return { primary: email, secondary: null, avatar: email };
  }
  return {
    primary: m.isYou ? "You" : "Team member",
    secondary: shortId(m.userId),
    avatar: m.userId,
  };
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
          const identity = memberIdentity(m);
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
                  {identity.avatar.slice(0, 2)}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-2 truncate text-sm font-medium text-foreground">
                    {identity.primary}
                    {m.isYou && (
                      <Badge variant="outline" className="border-primary/30 text-primary">
                        You
                      </Badge>
                    )}
                  </span>
                  {identity.secondary && (
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {identity.secondary}
                    </span>
                  )}
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
