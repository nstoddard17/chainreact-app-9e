import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import { RoleBadge } from "@/features/team/RoleBadge";
import { accountTypeLabel } from "@/features/team/accountTypeLabel";
import type { AccountSummary } from "@/lib/api/accounts";
import { ChangePasswordForm } from "./ChangePasswordForm";

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

// (Profile is now a functional section — see ProfileSection.tsx.)

// (Notifications is now a functional section — see NotificationsSection.tsx.)

// ── Security & access (read-only — SEC-1) ────────────────────────────────────
// Per-user (NOT per-account): reflects the signed-in identity's credentials and
// renders identically for personal / Team / Business active accounts. Every row
// is a real read-only value or an honest "coming soon" — no toggles, no inputs,
// no fabricated "last changed" date. Password change / 2FA / sessions land later.
export function SecuritySection({
  email,
  emailVerified,
  signInMethod,
}: {
  email: string;
  emailVerified: boolean;
  signInMethod: string;
}) {
  return (
    <div data-testid="account-section-security" className="flex flex-col gap-5">
      <Panel title="Sign-in & security" desc="How you sign in to ChainReact.">
        <SettingRow label="Email address" desc="The address you use to sign in.">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{email || "—"}</span>
            {emailVerified ? (
              <span
                data-testid="security-email-status"
                className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
              >
                Verified
              </span>
            ) : (
              <span
                data-testid="security-email-status"
                className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
              >
                Unverified
              </span>
            )}
          </div>
        </SettingRow>

        <ReadOnlyRow
          label="Sign-in method"
          desc="How your account authenticates."
          value={<span data-testid="security-signin-method">{signInMethod}</span>}
        />

        <SettingRow label="Password" desc="Set a new password for your account." stacked>
          <div className="flex flex-col gap-2">
            <span data-testid="security-password-status" className="text-sm font-medium text-foreground">
              Set
            </span>
            <ChangePasswordForm />
          </div>
        </SettingRow>

        <ComingSoonRow
          label="Two-factor authentication"
          desc="Add an authenticator-app code — coming soon."
        />
        <ComingSoonRow label="Sessions & devices" desc="Review and revoke sessions — coming soon." />
        <ComingSoonRow
          label="Connected accounts"
          desc="Sign in with Google or GitHub — coming soon."
        />
      </Panel>
    </div>
  );
}

// ── Plan & billing (read-only — BILL-1) ──────────────────────────────────────
/** Account billing/limit facts the page resolves for the ACTIVE account. */
export interface AccountBillingView {
  /** Real task usage from `account_billing`, or null when unavailable. */
  usage: { tasksUsed: number; tasksLimit: number; periodStartedAt: string | null } | null;
  /** Total-member cap (team/business); null for personal / uncapped. */
  memberLimit: number | null;
  /** Current member count (team/business), or null when not loaded/applicable. */
  memberCount: number | null;
  /** Workflow-folder cap for the active account's tier. */
  folderLimit: number;
  /** True when the active account is pending deletion (frozen). */
  frozen: boolean;
}

/**
 * Billing tier label (NOT the account-type label): a personal account is the
 * **Free** tier until Pro plan metadata exists; team → Team; organization →
 * Business. Never surfaces the raw "Organization" word.
 */
function billingTierLabel(type: AccountSummary["type"]): string {
  if (type === "personal") return "Free";
  if (type === "organization") return "Business";
  return "Team";
}

export function BillingSection({
  active,
  billing,
}: {
  active: ActiveAccountView | null;
  billing: AccountBillingView;
}) {
  const isShared = active != null && active.type !== "personal";
  const tier = active ? billingTierLabel(active.type) : "—";
  const periodStart =
    billing.usage?.periodStartedAt != null
      ? new Date(billing.usage.periodStartedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })
      : null;

  return (
    <div data-testid="account-section-billing" className="flex flex-col gap-5">
      {billing.frozen && (
        <div
          data-testid="billing-frozen"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <p className="text-sm font-semibold text-foreground">
            This account is pending deletion.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Billing is read-only while the account is frozen.
          </p>
        </div>
      )}

      <Panel
        title="Plan & billing"
        desc="Paid plans and billing management are coming soon."
      >
        {active && (
          <ReadOnlyRow label="Account" value={active.name} />
        )}
        <SettingRow label="Plan" desc="Your current tier.">
          <span
            data-testid="billing-tier"
            className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
          >
            {tier}
          </span>
        </SettingRow>

        {billing.usage ? (
          <SettingRow
            label="Task usage"
            desc={periodStart ? `This period — since ${periodStart}.` : "This period."}
          >
            <span data-testid="billing-usage" className="text-sm font-medium text-foreground">
              {billing.usage.tasksUsed} / {billing.usage.tasksLimit} tasks
            </span>
          </SettingRow>
        ) : (
          <ReadOnlyRow
            label="Task usage"
            value={
              <span data-testid="billing-usage-unavailable" className="text-muted-foreground">
                Usage unavailable
              </span>
            }
          />
        )}

        {billing.memberLimit !== null && (
          <ReadOnlyRow
            label="Members"
            desc="Billed as one account with shared usage."
            value={
              <span data-testid="billing-members">
                {billing.memberCount != null ? `${billing.memberCount} of ` : "Up to "}
                {billing.memberLimit} members
              </span>
            }
          />
        )}

        <ReadOnlyRow
          label="Folders"
          value={<span data-testid="billing-folders">Up to {billing.folderLimit} folders</span>}
        />

        {isShared && (
          <SettingRow label="Seats" stacked>
            <p data-testid="billing-no-pro-copy" className="text-xs text-muted-foreground">
              Team and Business are billed as one account with shared usage —
              members don&apos;t need their own Pro.
            </p>
          </SettingRow>
        )}

        <ComingSoonRow label="Payment method" desc="Manage your card — coming soon." />
        <ComingSoonRow label="Invoices" desc="Download past invoices — coming soon." />
        {!billing.frozen && (
          <ComingSoonRow
            label="Upgrade or change plan"
            desc="Checkout and plan changes — coming soon."
          />
        )}
        <ComingSoonRow label="Next billing date" desc="Available once paid plans launch." />
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
