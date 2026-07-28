"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AccountSummary } from "@/lib/api/accounts";
import { SettingsNav } from "./SettingsNav";
import { OverviewSection } from "./OverviewSection";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { SectionHeading } from "./SectionHeading";
import { RolesTable } from "./RolesTable";
import type { TeamInvitationView, TeamMemberView, TeamSection } from "./teamTypes";

/**
 * Team page top-level client orchestrator (Slice 4.TEAM-PAGE-1; rebuilt as a
 * settings surface in 4.TEAM-PAGE-4 to match the Teams.html layout).
 *
 * Layout: a design-style two-column settings shell — a left `SettingsNav`
 * (Overview / Members / Roles, plus disabled "coming soon" Account items) and a
 * content column that renders the active section. Members and Roles only exist
 * for a team/org active account; a personal account shows just Overview
 * (switcher + create-a-team nudge).
 *
 * TEAM-HEADER-DEDUPE-1: there is deliberately NO page-level "Team" header here.
 * The shell's top bar already labels the page "Team", and each section's
 * `SectionHeading` is the page `h1` — the old header + breadcrumb stack printed
 * "Team" twice and the section name three times.
 *
 * Every mutation (switch, create, invite, revoke, role change, remove) goes
 * through the typed `lib/api/accounts` client inside the section components; on
 * success they call `refresh()` (a `router.refresh()`) so the server component
 * re-reads the authoritative active context. No optimistic local mutation.
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
  const [section, setSection] = useState<TeamSection>("overview");

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const isTeam =
    active !== null &&
    (active.type === "team" || active.type === "organization") &&
    active.deletionStatus === "active";

  // Members/Roles only exist for a team — never strand the view on them.
  const effectiveSection: TeamSection = isTeam ? section : "overview";

  const seatsUsed =
    members.length + invitations.filter((iv) => iv.status === "pending").length;

  return (
    <section
      data-testid="team-dashboard"
      aria-label="Team"
      className="flex flex-col gap-6"
    >
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
        <SettingsNav
          section={effectiveSection}
          onSection={setSection}
          isTeam={isTeam}
          memberCount={members.length}
        />

        <div className="min-w-0 flex-1">
          {effectiveSection === "overview" && (
            <OverviewSection
              accounts={accounts}
              activeAccountId={activeAccountId}
              active={active}
              isTeam={isTeam}
              members={members}
              seatsUsed={seatsUsed}
              memberCap={memberCap}
              teamMaxMembers={teamMaxMembers}
              currentUserEmail={currentUserEmail}
              onChanged={refresh}
            />
          )}

          {effectiveSection === "members" && isTeam && active && (
            <TeamMembersPanel
              account={active}
              members={members}
              invitations={invitations}
              canManage={canManage}
              memberCap={memberCap}
              onChanged={refresh}
            />
          )}

          {effectiveSection === "roles" && isTeam && active && (
            <div data-testid="team-roles-section">
              <SectionHeading
                title="Roles & access"
                sub="What each role can do across this team. Assign roles per member in Members."
              />
              <RolesTable />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
