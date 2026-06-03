"use client";

import type { AccountSummary } from "@/lib/api/accounts";
import { AccountSwitcher } from "./AccountSwitcher";
import { Panel } from "./Panel";
import { SectionHeading } from "./SectionHeading";
import { SettingRow } from "./SettingRow";
import { RoleBadge } from "./RoleBadge";

/**
 * Overview section (Slice 4.TEAM-PAGE-4) — the settings landing surface.
 *
 * Always shows the account switcher (your accounts + switch + create team).
 * For a team/org active account it adds a read-only "Account" Panel
 * (name / type / your role / plan) using the design's Panel + SettingRow +
 * RoleBadge. Account name is plain text — there is no rename backend. For a
 * personal account it shows the create-a-team nudge instead.
 *
 * No active controls beyond switch/create (which already exist) — billing,
 * rename, transfer, etc. are NOT here (see the disabled nav + Roles footer).
 */
interface Props {
  accounts: readonly AccountSummary[];
  activeAccountId: string | null;
  active: AccountSummary | null;
  isTeam: boolean;
  seatsUsed: number;
  memberCap: number | null;
  teamMaxMembers: number;
  onChanged: () => void;
}

function typeLabel(type: AccountSummary["type"]): string {
  if (type === "organization") return "Organization";
  if (type === "personal") return "Personal";
  return "Team";
}

export function OverviewSection({
  accounts,
  activeAccountId,
  active,
  isTeam,
  seatsUsed,
  memberCap,
  teamMaxMembers,
  onChanged,
}: Props) {
  const crumbRoot = active?.name ?? "Personal";
  const planLine =
    active && memberCap !== null
      ? `${typeLabel(active.type)} plan · ${seatsUsed} of ${memberCap} members`
      : active
        ? `${typeLabel(active.type)} plan`
        : "";

  return (
    <div data-testid="team-overview" className="flex flex-col gap-5">
      <SectionHeading
        crumbRoot={crumbRoot}
        crumb="Overview"
        title="Overview"
        sub="Your accounts and a summary of the active workspace."
      />

      <AccountSwitcher
        accounts={accounts}
        activeAccountId={activeAccountId}
        onChanged={onChanged}
      />

      {isTeam && active ? (
        <Panel
          title="Account"
          desc="How this workspace is identified and billed. Manage people in Members."
        >
          <SettingRow label="Account name" desc="Shown across ChainReact. Renaming is coming later.">
            <span className="text-sm font-medium text-foreground">{active.name}</span>
          </SettingRow>
          <SettingRow label="Account type">
            <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {typeLabel(active.type)}
            </span>
          </SettingRow>
          <SettingRow label="Your role">
            <RoleBadge role={active.role} />
          </SettingRow>
          <SettingRow
            label="Plan"
            desc="Billed as one account with shared usage — no per-member charge."
          >
            <span className="text-sm font-medium text-foreground">{planLine}</span>
          </SettingRow>
        </Panel>
      ) : (
        <Panel title="You're on a personal account">
          <p className="max-w-xl text-sm text-muted-foreground">
            Personal accounts are just for you. Create a team above to invite
            members and share automations — Teams support up to {teamMaxMembers}{" "}
            members, billed as one account with shared usage.
          </p>
        </Panel>
      )}
    </div>
  );
}
