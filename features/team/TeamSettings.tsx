"use client";

import type { ReactNode } from "react";
import type { AccountSummary } from "@/lib/api/accounts";
import { Badge } from "@/components/ui/badge";

/**
 * Team / account settings shell (Slice 4.TEAM-PAGE-3).
 *
 * Honest, read-only summary of what the backend supports today: account name
 * (read-only — no rename API), type, the caller's role, and the plan / member
 * limit. Deferred capabilities are listed as secondary, control-free
 * "coming soon" rows so the page sets expectations without faking actions.
 *
 * Intentionally NOT here (no backend / out of scope): billing & Stripe, org
 * upgrade, ownership transfer, leave team, team rename, email invites, SSO /
 * sessions, account URLs, notification prefs. None render an active control.
 */
interface Props {
  account: AccountSummary;
  /** Seats consumed = accepted members + pending invites. */
  seatsUsed: number;
  memberCap: number | null;
  teamMaxMembers: number;
}

const COMING_SOON: ReadonlyArray<{ title: string; desc: string }> = [
  { title: "Billing & usage", desc: "Plans, invoices, and shared usage limits." },
  {
    title: "Organization upgrade",
    desc: `For teams larger than ${"{cap}"} members.`,
  },
  { title: "Transfer ownership", desc: "Hand the owner role to another member." },
  { title: "Leave team", desc: "Remove yourself from this team." },
  { title: "Email invites", desc: "Send invitations by email instead of a link." },
];

function typeLabel(type: AccountSummary["type"]): string {
  if (type === "organization") return "Organization";
  if (type === "personal") return "Personal";
  return "Team";
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-b-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export function TeamSettings({ account, seatsUsed, memberCap, teamMaxMembers }: Props) {
  const planLine =
    memberCap !== null
      ? `${typeLabel(account.type)} plan · ${seatsUsed} of ${memberCap} members`
      : `${typeLabel(account.type)} plan`;

  return (
    <section
      data-testid="team-settings"
      aria-label="Team settings"
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Team settings</h2>
        <p className="text-xs text-muted-foreground">
          Account details and what each member can do. Manage people in the
          members list above.
        </p>
      </div>

      {/* Supported, truthful summary */}
      <div data-testid="team-settings-summary" className="flex flex-col">
        <SummaryRow label="Account name">{account.name}</SummaryRow>
        <SummaryRow label="Account type">
          <Badge variant="outline" className="border-primary/30 capitalize text-primary">
            {typeLabel(account.type)}
          </Badge>
        </SummaryRow>
        <SummaryRow label="Your role">
          <Badge variant="outline" className="capitalize">
            {account.role}
          </Badge>
        </SummaryRow>
        <SummaryRow label="Plan">{planLine}</SummaryRow>
      </div>
      <p className="text-xs text-muted-foreground">
        Billed as one account with shared usage — no per-member charge.
        {memberCap !== null &&
          ` Teams support up to ${teamMaxMembers} members (including the owner).`}
      </p>

      {/* Deferred — secondary, no active controls */}
      <div data-testid="team-settings-coming-soon" className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Coming soon</span>
        <ul className="grid gap-2 sm:grid-cols-2">
          {COMING_SOON.map((item) => (
            <li
              key={item.title}
              className="flex items-start justify-between gap-2 rounded-lg border border-dashed border-border bg-background/40 p-3 opacity-80"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium text-foreground">{item.title}</div>
                <div className="text-xs text-muted-foreground">
                  {item.desc.replace("{cap}", String(teamMaxMembers))}
                </div>
              </div>
              <Badge variant="outline" className="shrink-0 text-muted-foreground">
                Soon
              </Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
