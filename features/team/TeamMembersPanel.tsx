"use client";

import { useMemo, useState } from "react";
import type { AccountSummary } from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";
import type { TeamInvitationView, TeamMemberView } from "./teamTypes";
import { InviteBar } from "./InviteBar";
import { MembersTable } from "./MembersTable";
import { PendingInvites } from "./PendingInvites";

/**
 * Members management for the active team account (Slice 4.TEAM-PAGE-1).
 *
 * Composes the limit banner + invite bar (copy-link) + roster + pending invites.
 * Owner/admin (`canManage`) see the invite bar, role controls, remove actions,
 * and pending invites; plain members see a read-only roster.
 *
 * Limit messaging: a Team holds up to `teamMaxMembers` total (incl. owner). At
 * the cap, inviting is disabled and an Organization-upgrade-coming-soon note
 * shows — we never implement the upgrade, only surface the deferred path.
 */
interface Props {
  account: AccountSummary;
  members: readonly TeamMemberView[];
  invitations: readonly TeamInvitationView[];
  canManage: boolean;
  /** Total-member cap for this account type, or null when uncapped (org). */
  memberCap: number | null;
  teamMaxMembers: number;
  onChanged: () => void;
}

export function TeamMembersPanel({
  account,
  members,
  invitations,
  canManage,
  memberCap,
  teamMaxMembers,
  onChanged,
}: Props) {
  const [query, setQuery] = useState("");

  // Seats used = accepted members + pending invites (mirrors the server cap math).
  const pendingCount = invitations.filter((iv) => iv.status === "pending").length;
  const seatsUsed = members.length + pendingCount;
  const atLimit = memberCap !== null && seatsUsed >= memberCap;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return members;
    return members.filter(
      (m) =>
        m.userId.toLowerCase().includes(q) || m.role.toLowerCase().includes(q),
    );
  }, [members, query]);

  const isTeam = account.type === "team";

  return (
    <section
      data-testid="team-members-panel"
      aria-label="Team members"
      className="flex flex-col gap-4"
    >
      {/* Plan / limit banner */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {members.length} member{members.length === 1 ? "" : "s"}
            <Badge variant="outline" className="border-primary/30 text-primary">
              {isTeam ? "Team" : "Organization"} plan
            </Badge>
          </div>
          <p className="max-w-xl text-xs text-muted-foreground">
            Billed as one account with shared usage — no per-member charge.
            {isTeam
              ? ` Teams support up to ${teamMaxMembers} members (including the owner).`
              : " Organizations support larger teams."}
          </p>
        </div>
        {memberCap !== null && (
          <div
            data-testid="team-seat-count"
            className="shrink-0 text-right text-xs text-muted-foreground"
          >
            <span className="font-mono text-sm font-semibold text-foreground">
              {seatsUsed}
            </span>{" "}
            / {memberCap} used
            {pendingCount > 0 && (
              <span className="block">({pendingCount} pending)</span>
            )}
          </div>
        )}
      </div>

      {atLimit && (
        <div
          role="status"
          data-testid="team-limit-notice"
          className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning/10 p-4"
        >
          <p className="text-sm font-semibold text-foreground">
            This team is at its {memberCap}-member limit.
          </p>
          <p className="text-xs text-muted-foreground">
            Revoke a pending invite or remove a member to free a seat.
            Organization accounts support larger teams —{" "}
            <span className="font-medium text-foreground">coming soon.</span>
          </p>
        </div>
      )}

      {canManage && (
        <InviteBar
          accountId={account.id}
          disabled={atLimit}
          onChanged={onChanged}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <input
            type="search"
            aria-label="Search members"
            placeholder="Search by member or role…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtered.length} member{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <MembersTable
        accountId={account.id}
        members={filtered}
        canManage={canManage}
        onChanged={onChanged}
      />

      {canManage && invitations.length > 0 && (
        <PendingInvites
          accountId={account.id}
          invitations={invitations}
          onChanged={onChanged}
        />
      )}
    </section>
  );
}
