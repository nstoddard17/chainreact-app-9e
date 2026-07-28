import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Panel } from "@/features/team/Panel";
import { SettingRow } from "@/features/team/SettingRow";
import { RoleBadge } from "@/features/team/RoleBadge";
import { accountTypeLabel } from "@/features/team/accountTypeLabel";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { TwoFactorPanel } from "./TwoFactorPanel";
import { ApiKeysPanel } from "./ApiKeysPanel";
import { ApiDocsPanel } from "./ApiDocsPanel";
import {
  ComingSoonRow,
  ReadOnlyRow,
  type ActiveAccountView,
} from "./settingsRows";

/**
 * Account-settings section bodies (Slice 4.ACCOUNT-SETTINGS-2).
 *
 * The Account section carries real data (overview + Team pointer). Every other
 * non-deletion section is an HONEST placeholder: read-only values that are
 * safely available, plus "coming soon" rows — never a fake working toggle,
 * input, or fabricated key. No backend is added by any of these.
 *
 * The Plan & billing section lives in `./BillingSection.tsx`; the shared row
 * primitives + `ActiveAccountView` live in `./settingsRows.tsx`. Both are re-exported
 * below so existing `@/features/account/AccountSections` imports keep resolving
 * (4.ACCOUNT-SETTINGS-BILLING-REFACTOR-1 — extraction only, no behavior change).
 */

// Backward-compatible re-exports (consumers import these from AccountSections today).
export type { ActiveAccountView } from "./settingsRows";
export { BillingSection, type AccountBillingView } from "./BillingSection";

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

        <SettingRow
          label="Two-factor authentication"
          desc="Require a one-time code from an authenticator app at sign-in."
          stacked
        >
          <TwoFactorPanel />
        </SettingRow>

        <ComingSoonRow label="Sessions & devices" desc="Review and revoke sessions — coming soon." />
        <ComingSoonRow
          label="Connected accounts"
          desc="Sign in with Google or GitHub — coming soon."
        />
      </Panel>
    </div>
  );
}

// ── API & webhooks (API-KEYS-FOUNDATION-4 / FK-3) ────────────────────────────
// Account-scoped (like Plan & billing): the section reflects the ACTIVE account.
// The API keys panel is REAL for owner/admin (list / create with one-time reveal /
// revoke, via the FK-2 management routes); members see a read-only note. The
// Webhooks panel stays an honest "coming soon" (Phase D) — no fake endpoints or
// delivery logs. The provider webhooks under `app/api/webhooks/<provider>` are a
// separate internal concern (they power triggers) and are deliberately NOT shown.
// See docs/slices/phase-4/api-keys-foundation-plan.md.
export function ApiSection({
  active,
  accountId,
  frozen,
}: {
  active: ActiveAccountView | null;
  /** The active account's id (needed for the management routes). */
  accountId: string | null;
  /** True when the active account is pending deletion (read-only). */
  frozen: boolean;
}) {
  const canManage = active?.role === "owner" || active?.role === "admin";

  return (
    <div data-testid="account-section-api" className="flex flex-col gap-5">
      <Panel
        title="API keys"
        desc="Programmatic, account-scoped access to ChainReact's own API."
      >
        {active && (
          <SettingRow label="Account" desc="Developer access is scoped to this account.">
            <span className="flex items-center gap-2">
              <span
                data-testid="api-account-name"
                className="text-sm font-medium text-foreground"
              >
                {active.name}
              </span>
              <span
                data-testid="api-account-type"
                className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary"
              >
                {accountTypeLabel(active.type)}
              </span>
            </span>
          </SettingRow>
        )}

        <SettingRow label="Developer access" stacked>
          {canManage && accountId ? (
            <ApiKeysPanel accountId={accountId} frozen={frozen} />
          ) : (
            <p data-testid="api-keys-member-note" className="max-w-4xl text-xs text-muted-foreground">
              {accountId ? (
                <>Owners and admins manage this account&apos;s API keys.</>
              ) : (
                <>API keys are managed per account — there&apos;s no active account to manage.</>
              )}{" "}
              Keys give programmatic access to trigger this account&apos;s workflows and{" "}
              <span className="font-medium text-foreground">
                never expose your connected app or OAuth tokens
              </span>
              .
            </p>
          )}
        </SettingRow>
      </Panel>

      <Panel
        title="Using the API"
        desc="Trigger workflows programmatically with an API key."
      >
        <ApiDocsPanel />
      </Panel>

      <Panel title="Webhooks" desc="Event webhooks to your URLs — coming soon.">
        <SettingRow label="Outbound webhooks" stacked>
          <p data-testid="api-webhooks-copy" className="max-w-4xl text-xs text-muted-foreground">
            Webhooks will let ChainReact send your account&apos;s events — like a
            failed run — to your own URLs. This is separate from the provider
            webhooks that already power your triggers internally; those connect your
            apps and aren&apos;t part of this feature. Outbound delivery needs
            signing, retries, and a delivery log before it can launch.
          </p>
        </SettingRow>

        <ComingSoonRow
          label="Add a webhook endpoint"
          desc="Signed event delivery to your URLs — coming soon."
        />
      </Panel>
    </div>
  );
}
