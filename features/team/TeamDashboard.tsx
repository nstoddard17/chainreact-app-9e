"use client";

import { useRouter } from "next/navigation";
import type { AccountSummary } from "@/lib/api/accounts";
import { AccountSwitcher } from "./AccountSwitcher";
import { TeamMembersPanel } from "./TeamMembersPanel";
import type { TeamInvitationView, TeamMemberView } from "./teamTypes";

/**
 * Team page top-level client orchestrator (Slice 4.TEAM-PAGE-1).
 *
 * Receives the server-resolved account list + active-account context and renders
 * the account switcher plus, when the active account is a team/org, the members
 * panel. Every mutation (switch, create, invite, revoke, role change, remove)
 * goes through the typed `lib/api/accounts` client inside the child components;
 * on success they call `refresh()` here, which re-runs the server component so
 * the new active context + roster re-render from source-of-truth.
 *
 * No optimistic local mutation of the lists — the server read is authoritative
 * (mirrors the Apps page's "full refetch on change" stance).
 */
interface Props {
  accounts: readonly AccountSummary[];
  activeAccountId: string | null;
  currentUserEmail: string;
  members: readonly TeamMemberView[];
  invitations: readonly TeamInvitationView[];
  canManage: boolean;
  memberCap: number | null;
  teamMaxMembers: number;
}

export function TeamDashboard({
  accounts,
  activeAccountId,
  currentUserEmail,
  members,
  invitations,
  canManage,
  memberCap,
  teamMaxMembers,
}: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const activeIsTeam =
    active !== null &&
    (active.type === "team" || active.type === "organization") &&
    active.deletionStatus === "active";

  return (
    <section
      data-testid="team-dashboard"
      aria-label="Team"
      className="flex flex-col gap-6"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Team</h1>
        <p className="text-sm text-muted-foreground">
          Manage your accounts and team members. Signed in as{" "}
          <span className="font-medium text-foreground">{currentUserEmail}</span>.
        </p>
      </header>

      <AccountSwitcher
        accounts={accounts}
        activeAccountId={activeAccountId}
        onChanged={refresh}
      />

      {activeIsTeam && active ? (
        <TeamMembersPanel
          account={active}
          members={members}
          invitations={invitations}
          canManage={canManage}
          memberCap={memberCap}
          teamMaxMembers={teamMaxMembers}
          onChanged={refresh}
        />
      ) : (
        <div
          data-testid="team-personal-notice"
          className="flex flex-col gap-1 rounded-xl border border-border bg-card p-5"
        >
          <h2 className="text-sm font-semibold text-foreground">
            You&apos;re on a personal account
          </h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            Personal accounts are just for you. Create a team above to invite
            members and share automations — Teams support up to {teamMaxMembers}{" "}
            members, billed as one account with shared usage.
          </p>
        </div>
      )}
    </section>
  );
}
