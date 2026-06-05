"use client";

import { useMemo, useState } from "react";
import type { AccountSummary } from "@/lib/api/accounts";
import type { TeamInvitationView, TeamMemberView } from "./teamTypes";
import { SectionHeading } from "./SectionHeading";
import { InviteBar } from "./InviteBar";
import { MembersTable } from "./MembersTable";
import { PendingInvites } from "./PendingInvites";

/**
 * Members section for the active team account (Slice 4.TEAM-PAGE-1; restyled as
 * a settings section in 4.TEAM-PAGE-4).
 *
 * Composes the section heading + invite bar (copy-link) + roster + pending
 * invites. Owner/admin (`canManage`) see the invite bar, role controls, remove
 * actions, and pending invites; plain members see a read-only roster.
 *
 * The account / plan summary lives in Overview; the role matrix lives in
 * Roles & access. This section keeps the at-limit notice because it gates
 * inviting — at the cap, inviting is disabled and the Organization-upgrade-
 * coming-soon note shows (we never implement the upgrade).
 */
interface Props {
  account: AccountSummary;
  members: readonly TeamMemberView[];
  invitations: readonly TeamInvitationView[];
  canManage: boolean;
  /** Total-member cap for this account type, or null when uncapped (org). */
  memberCap: number | null;
  onChanged: () => void;
}

export function TeamMembersPanel({
  account,
  members,
  invitations,
  canManage,
  memberCap,
  onChanged,
}: Props) {
  const [query, setQuery] = useState("");

  // Seats used = accepted members + pending invites (mirrors the server cap math).
  const pendingCount = invitations.filter((iv) => iv.status === "pending").length;
  const seatsUsed = members.length + pendingCount;
  const atLimit = memberCap !== null && seatsUsed >= memberCap;
  const isTeam = account.type === "team";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return members;
    return members.filter((m) =>
      [m.displayName, m.email, m.userId, m.role].some(
        (field) => field != null && field.toLowerCase().includes(q),
      ),
    );
  }, [members, query]);

  const capSub =
    memberCap !== null
      ? `${seatsUsed} of ${memberCap} ${isTeam ? "Team " : ""}seats used${
          pendingCount > 0 ? ` · ${pendingCount} pending` : ""
        }. Billed as one account with shared usage.`
      : "Billed as one account with shared usage — no per-member charge.";

  return (
    <section
      data-testid="team-members-panel"
      aria-label="Team members"
      className="flex flex-col gap-4"
    >
      <SectionHeading
        crumbRoot={account.name}
        crumb="Members"
        title="Members"
        sub={capSub}
      />

      {atLimit && (
        <div
          role="status"
          data-testid="team-limit-notice"
          className="flex flex-col gap-1 rounded-xl border border-warning/40 bg-warning/10 p-4"
        >
          <p className="text-sm font-semibold text-foreground">
            This {isTeam ? "team" : "workspace"} is at its {memberCap}-member limit.
          </p>
          <p className="text-xs text-muted-foreground">
            Revoke a pending invite or remove a member to free a seat.
            {isTeam && (
              <>
                {" "}Business accounts support up to 25 members —{" "}
                <span className="font-medium text-foreground">coming soon.</span>
              </>
            )}
          </p>
        </div>
      )}

      {canManage && (
        <InviteBar accountId={account.id} disabled={atLimit} onChanged={onChanged} />
      )}

      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <input
            type="search"
            aria-label="Search members"
            placeholder="Search by name, email, or role…"
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
