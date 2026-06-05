"use client";

import { useState } from "react";
import { SectionHeading } from "@/features/team/SectionHeading";
import {
  ACCOUNT_NAV_GROUPS,
  ACCOUNT_SECTION_HEADINGS,
  DEFAULT_ACCOUNT_SECTION,
  type AccountSection,
} from "./accountNav";
import {
  AccountOverview,
  ApiSection,
  BillingSection,
  NotificationsSection,
  SecuritySection,
  type ActiveAccountView,
} from "./AccountSections";
import { ProfileSection } from "./ProfileSection";
import { AccountDeletionCard } from "./AccountDeletionCard";

/**
 * Account settings shell (Slice 4.ACCOUNT-SETTINGS-1; design-faithful settings
 * shell + left sub-nav added in 4.ACCOUNT-SETTINGS-2).
 *
 * Ports the `Account Settings.html` layout: a grouped left sub-nav
 * (Personal / Workspace / Account control) driving a single content column —
 * mirroring the Team page's settings shell (same `flex-col lg:flex-row`
 * responsive idiom; the nav stacks above content on narrow viewports). Only the
 * Account + Danger-zone sections carry real behavior; the rest are honest
 * "coming soon" placeholders. The personal-deletion flow from
 * 4.ACCOUNT-SETTINGS-1 is preserved verbatim under Danger zone.
 *
 * Section state is client-side; an optional `initialSection` (from the page's
 * `?section=` query) deep-links to a section without overbuilding routing.
 */
interface Props {
  active: ActiveAccountView | null;
  /** True when the active account is the caller's personal account. */
  isPersonal: boolean;
  /** The caller's PERSONAL account deletion lifecycle state. */
  deletionStatus: "active" | "pending_deletion";
  purgeAfter: string | null;
  userEmail: string;
  /** The caller's stored display name (`user_profiles.display_name`), or null. */
  displayName: string | null;
  initialSection?: AccountSection;
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

export function AccountSettings({
  active,
  isPersonal,
  deletionStatus,
  purgeAfter,
  userEmail,
  displayName,
  initialSection,
}: Props) {
  const [section, setSection] = useState<AccountSection>(
    initialSection ?? DEFAULT_ACCOUNT_SECTION,
  );
  const heading = ACCOUNT_SECTION_HEADINGS[section];
  const crumbRoot = active?.name ?? "Personal";

  return (
    <section
      data-testid="account-settings"
      aria-label="Account settings"
      className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10"
    >
      {/* Left sub-nav — sidebar on lg+, stacked above content on mobile. */}
      <aside
        data-testid="account-settings-nav"
        aria-label="Account settings sections"
        className="flex shrink-0 flex-col gap-5 lg:sticky lg:top-6 lg:w-56"
      >
        {ACCOUNT_NAV_GROUPS.map((group) => (
          <nav key={group.head} className="flex flex-col gap-0.5">
            <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              {group.head}
            </div>
            {group.items.map((item) => {
              const isActive = section === item.id;
              const danger = item.tone === "danger";
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`account-nav-${item.id}`}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => setSection(item.id)}
                  className={
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm font-medium transition " +
                    (isActive
                      ? danger
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-primary/25 bg-primary/10 text-primary"
                      : danger
                        ? "border-transparent text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground")
                  }
                >
                  <NavGlyph d={item.glyph} />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            })}
          </nav>
        ))}
      </aside>

      {/* Content column. */}
      <div className="min-w-0 flex-1">
        <SectionHeading
          crumbRoot={crumbRoot}
          crumb={heading.title}
          title={heading.title}
          sub={heading.sub}
        />

        {section === "account" && (
          <AccountOverview active={active} isPersonal={isPersonal} />
        )}
        {section === "profile" && (
          <ProfileSection
            email={userEmail}
            role={active?.role ?? null}
            initialDisplayName={displayName}
          />
        )}
        {section === "notifications" && <NotificationsSection />}
        {section === "security" && <SecuritySection email={userEmail} />}
        {section === "billing" && <BillingSection active={active} />}
        {section === "api" && <ApiSection />}
        {section === "danger-zone" &&
          (isPersonal ? (
            <AccountDeletionCard
              initialStatus={deletionStatus}
              initialPurgeAfter={purgeAfter}
            />
          ) : (
            <NonPersonalDangerNote />
          ))}
      </div>
    </section>
  );
}

/**
 * Danger-zone content when a Team/Business account is active: personal-account
 * deletion targets the personal account, so we don't expose the destructive
 * form here — we explain how to reach it. No shared-account delete exists.
 */
function NonPersonalDangerNote() {
  return (
    <div
      data-testid="account-danger-non-personal"
      className="rounded-xl border border-border bg-card p-5"
    >
      <p className="text-sm font-medium text-foreground">
        Switch to your personal account to manage its deletion.
      </p>
      <p className="mt-1 max-w-xl text-xs text-muted-foreground">
        Account deletion applies to your personal account. Team and Business
        accounts are managed from the Team page — there's no delete here.
      </p>
    </div>
  );
}
