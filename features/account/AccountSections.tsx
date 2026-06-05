import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import { RoleBadge } from "@/features/team/RoleBadge";
import { accountTypeLabel } from "@/features/team/accountTypeLabel";
import type { AccountSummary } from "@/lib/api/accounts";

/**
 * Account-settings section bodies (Slice 4.ACCOUNT-SETTINGS-2).
 *
 * The Account section carries real data (overview + Team pointer). Every other
 * non-deletion section is an HONEST placeholder: read-only values that are
 * safely available, plus "coming soon" rows — never a fake working toggle,
 * input, or fabricated key. No backend is added by any of these.
 */

export interface ActiveAccountView {
  name: string;
  type: AccountSummary["type"];
  role: AccountSummary["role"];
}

/** A non-interactive "coming soon" pill used to mark deferred controls. */
function ComingSoon() {
  return (
    <span
      data-testid="account-coming-soon"
      className="inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
    >
      Coming soon
    </span>
  );
}

/** A read-only setting row whose control slot is a coming-soon marker. */
function ComingSoonRow({ label, desc }: { label: string; desc?: string }) {
  return (
    <SettingRow label={label} desc={desc}>
      <ComingSoon />
    </SettingRow>
  );
}

/** A read-only value row (no edit affordance). */
function ReadOnlyRow({
  label,
  desc,
  value,
}: {
  label: string;
  desc?: string;
  value: ReactNode;
}) {
  return (
    <SettingRow label={label} desc={desc}>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </SettingRow>
  );
}

// ── Account (real) ───────────────────────────────────────────────────────────
export function AccountOverview({
  active,
  isPersonal,
}: {
  active: ActiveAccountView | null;
  isPersonal: boolean;
}) {
  return (
    <div data-testid="account-section-account" className="flex flex-col gap-5">
      {active && (
        <Panel title="Account overview" desc="The workspace you're currently working in.">
          <SettingRow label="Account name">
            <span className="text-sm font-medium text-foreground">{active.name}</span>
          </SettingRow>
          <SettingRow label="Account type">
            <span
              data-testid="account-type-label"
              className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
            >
              {accountTypeLabel(active.type)}
            </span>
          </SettingRow>
          <SettingRow label="Your role">
            <RoleBadge role={active.role} />
          </SettingRow>
        </Panel>
      )}

      {!isPersonal && active && <TeamPointerCard accountName={active.name} />}
    </div>
  );
}

function TeamPointerCard({ accountName }: { accountName: string }) {
  return (
    <Panel title="Team & Business accounts" desc="Shared accounts are managed from the Team page.">
      <div
        data-testid="account-team-pointer"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="max-w-xl text-sm text-muted-foreground">
          Manage members, ownership transfer, and leave team from the Team page.
          To delete <span className="font-medium text-foreground">{accountName}</span>,
          transfer or remove its members there first.
        </p>
        <Button asChild size="sm" variant="outline" className="shrink-0">
          <Link href="/team" data-testid="account-team-link">
            Go to Team page
          </Link>
        </Button>
      </div>
    </Panel>
  );
}

// ── Profile (placeholder) ────────────────────────────────────────────────────
export function ProfileSection({
  email,
  role,
}: {
  email: string;
  role: AccountSummary["role"] | null;
}) {
  return (
    <div data-testid="account-section-profile" className="flex flex-col gap-5">
      <Panel title="Profile" desc="How you appear across ChainReact.">
        <ReadOnlyRow
          label="Email"
          desc="The address you sign in with."
          value={email || "—"}
        />
        {role && (
          <SettingRow label="Role on this account">
            <RoleBadge role={role} />
          </SettingRow>
        )}
        <ComingSoonRow
          label="Display name & avatar"
          desc="Profile editing coming soon."
        />
      </Panel>
    </div>
  );
}

// ── Notifications (placeholder) ──────────────────────────────────────────────
export function NotificationsSection() {
  return (
    <div data-testid="account-section-notifications" className="flex flex-col gap-5">
      <Panel
        title="Notifications"
        desc="Notification preferences aren't configurable yet — coming soon."
      >
        <ComingSoonRow label="Product updates" desc="News and changes to ChainReact." />
        <ComingSoonRow label="Workflow alerts" desc="When a workflow run fails or needs attention." />
        <ComingSoonRow label="Team & member activity" desc="Invites, joins, and role changes." />
      </Panel>
    </div>
  );
}

// ── Security & access (placeholder) ──────────────────────────────────────────
export function SecuritySection({ email }: { email: string }) {
  return (
    <div data-testid="account-section-security" className="flex flex-col gap-5">
      <Panel title="Sign-in & security" desc="The email you use to access your account.">
        <ReadOnlyRow label="Email address" value={email || "—"} />
        <ComingSoonRow label="Password" desc="Change your password — coming soon." />
        <ComingSoonRow
          label="Two-factor authentication"
          desc="Add an authenticator-app code — coming soon."
        />
        <ComingSoonRow label="Active sessions" desc="Review and revoke sessions — coming soon." />
      </Panel>
    </div>
  );
}

// ── Plan & billing (placeholder) ─────────────────────────────────────────────
export function BillingSection({ active }: { active: ActiveAccountView | null }) {
  const planLabel = active ? `${accountTypeLabel(active.type)} plan` : "—";
  return (
    <div data-testid="account-section-billing" className="flex flex-col gap-5">
      <Panel
        title="Plan & billing"
        desc="Billing management coming soon. Teams and Business accounts are billed as one account with shared usage."
      >
        <ReadOnlyRow
          label="Current plan"
          desc="Based on your active account type."
          value={planLabel}
        />
        <ComingSoonRow label="Payment method" desc="Manage your card — coming soon." />
        <ComingSoonRow label="Invoices" desc="Download past invoices — coming soon." />
      </Panel>
    </div>
  );
}

// ── API & webhooks (placeholder) ─────────────────────────────────────────────
export function ApiSection() {
  return (
    <div data-testid="account-section-api" className="flex flex-col gap-5">
      <Panel title="API & webhooks">
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="text-sm font-medium text-foreground">No API access yet</p>
          <p className="max-w-md text-xs text-muted-foreground">
            Programmatic access — API keys and event webhooks — isn't available
            yet. <span className="font-medium text-foreground">Coming soon.</span>
          </p>
          <ComingSoon />
        </div>
      </Panel>
    </div>
  );
}
