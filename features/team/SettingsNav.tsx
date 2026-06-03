"use client";

import type { ReactNode } from "react";
import type { TeamSection } from "./teamTypes";

/**
 * Settings sub-nav (Slice 4.TEAM-PAGE-4) — ports the design's grouped left
 * `SettingsNav`: a "Workspace" group of real, navigable sections and (for team
 * accounts) an "Account" group of disabled "coming soon" entries that convey
 * the settings-page structure without faking behavior.
 *
 * Only Overview / Members / Roles are navigable. The Account-group items render
 * disabled with a "Soon" tag — clicking them does nothing (no backend exists).
 * For a personal account only Overview shows (Members/Roles don't apply).
 */
interface Props {
  section: TeamSection;
  onSection: (s: TeamSection) => void;
  /** Members/Roles + the Account coming-soon group only show for a team/org. */
  isTeam: boolean;
  /** Badge count on the Members item. */
  memberCount: number;
}

function NavGlyph({ d }: { d: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

const GLYPH = {
  overview: "M4 5h16M4 12h16M4 19h10", // stacked rows
  members: "M9 7a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2",
  roles: "M12 3l8 4v5c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V7l8-4z", // shield
  billing: "M3 7h18v10H3zM3 11h18",
  security: "M6 11V8a6 6 0 1 1 12 0v3M5 11h14v9H5z",
  notifications: "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21h4",
} as const;

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      data-testid={`team-nav-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition " +
        (active
          ? "border-primary/25 bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground")
      }
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge != null && (
        <span
          className={
            "rounded-full border px-1.5 font-mono text-[10px] font-bold " +
            (active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-muted/50 text-muted-foreground")
          }
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function SoonItem({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      data-testid={`team-nav-soon-${label.toLowerCase()}`}
      aria-disabled
      className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground/60"
    >
      {icon}
      <span className="flex-1">{label}</span>
      <span className="rounded-full border border-dashed border-border px-1.5 text-[10px] font-semibold uppercase text-muted-foreground/70">
        Soon
      </span>
    </div>
  );
}

export function SettingsNav({ section, onSection, isTeam, memberCount }: Props) {
  return (
    <aside
      data-testid="team-settings-nav"
      aria-label="Team settings sections"
      className="flex shrink-0 flex-col gap-5 lg:sticky lg:top-6 lg:w-56"
    >
      <nav className="flex flex-col gap-0.5">
        <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
          Workspace
        </div>
        <NavButton
          active={section === "overview"}
          onClick={() => onSection("overview")}
          icon={<NavGlyph d={GLYPH.overview} />}
          label="Overview"
        />
        {isTeam && (
          <>
            <NavButton
              active={section === "members"}
              onClick={() => onSection("members")}
              icon={<NavGlyph d={GLYPH.members} />}
              label="Members"
              badge={memberCount}
            />
            <NavButton
              active={section === "roles"}
              onClick={() => onSection("roles")}
              icon={<NavGlyph d={GLYPH.roles} />}
              label="Roles & access"
            />
          </>
        )}
      </nav>

      {isTeam && (
        <nav className="flex flex-col gap-0.5">
          <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
            Account
          </div>
          <SoonItem icon={<NavGlyph d={GLYPH.billing} />} label="Billing" />
          <SoonItem icon={<NavGlyph d={GLYPH.security} />} label="Security" />
          <SoonItem icon={<NavGlyph d={GLYPH.notifications} />} label="Notifications" />
        </nav>
      )}
    </aside>
  );
}
