import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { listUserAccountSummaries } from "@/services/accounts/accountList";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { getDisplayName } from "@/repositories/userProfiles";
import { getUsage } from "@/repositories/accountBilling";
import { getAiCreditUsage } from "@/repositories/accountBillingAiCredits";
import { isBusinessDowngradeEnabled } from "@/services/billing/billingFeatureFlags";
import { listMembers } from "@/services/accounts/membership";
import { memberLimitFor } from "@/services/accounts/memberLimits";
import { folderLimitForAccount } from "@/services/workflowFolders/folderLimits";
import { AppShell } from "@/components/app-shell/AppShell";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import { AccountSettings } from "@/features/account/AccountSettings";
import type { AccountBillingView } from "@/features/account/AccountSections";
import { resolveAccountSection } from "@/features/account/accountNav";
import { getSecurityAccessSummary } from "@/features/account/securitySummary";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Account settings route (Slice 4.ACCOUNT-SETTINGS-1).
 *
 * Thin server component: auth gate → resolve the caller's accounts + active
 * pointer + their PERSONAL account record (for the deletion lifecycle state) →
 * render the client `AccountSettings`.
 *
 * Backend-truth scope (the `Account Settings.html` design, trimmed to what V2
 * actually supports today):
 *   - Account overview (active account name / type label / role).
 *   - Personal-account deletion request + cancel → /api/account/delete[/cancel]
 *     (typed phrase + password re-auth; reversible freeze, not a hard delete).
 *   - Owned-Team/Business remediation blocker (ACCOUNT_HAS_OWNED_TEAMS).
 *   - Pointer to /team for shared-account lifecycle (transfer / leave / members).
 *
 * Deliberately NOT here (no backend / out of scope): profile edit, avatar,
 * email/password change, 2FA, sessions, notification prefs, billing, API keys,
 * data export, and account deactivation. Team/Business deletion is not exposed —
 * shared accounts are managed from the Team page.
 *
 * Auth + scoping mirror the sibling `/team` route: `auth.getUser()` gate, then
 * service reads.
 */
export default async function AccountPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const params = await searchParams;
  const sectionParam = typeof params.section === "string" ? params.section : undefined;
  const initialSection = resolveAccountSection(sectionParam);

  const [
    { accounts, activeAccountId },
    unreadNotifications,
    recentRecords,
    personal,
    displayName,
  ] = await Promise.all([
    listUserAccountSummaries(user.id),
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, {
      limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
    }),
    ensurePersonalAccount(user.id),
    getDisplayName(user.id),
  ]);

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const isPersonal = active?.type === "personal";
  const recentNotifications = recentRecords.map(toNotificationPreview);
  // CS-8: surface pending credential-reassignment requests in the bell.
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotifications,
  );

  // Security & access is per-USER (not per-account): derive read-only sign-in
  // facts from the verified session user. `app_metadata.providers` is the
  // supabase provider list (['email'] today — no OAuth wired yet).
  const security = getSecurityAccessSummary({
    email: user.email ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    providers:
      (user.app_metadata?.providers as string[] | undefined) ??
      (typeof user.app_metadata?.provider === "string"
        ? [user.app_metadata.provider]
        : undefined),
  });

  // BILL-1: read-only billing/limit facts for the ACTIVE account. Usage comes
  // from the real `account_billing` row (null → "unavailable", never faked); the
  // member count is loaded only for shared (team/business) accounts. Limits come
  // from the central member/folder helpers. No Stripe / plan-metadata reads.
  const frozen = active?.deletionStatus === "pending_deletion";
  let billing: AccountBillingView = {
    usage: null,
    memberLimit: null,
    memberCount: null,
    folderLimit: 0,
    frozen,
  };
  if (active) {
    const [usage, memberCount, aiCreditUsage] = await Promise.all([
      getUsage(active.id).catch(() => null),
      active.type !== "personal"
        ? listMembers(active.id)
            .then((m) => m.length)
            .catch(() => null)
        : Promise.resolve<number | null>(null),
      // AI credits are a separate, account-owned billing dimension (same RLS-scoped read).
      getAiCreditUsage(active.id).catch(() => null),
    ]);
    billing = {
      usage,
      // null when no billing row → "unavailable" row; never faked.
      aiCredits: aiCreditUsage
        ? {
            used: aiCreditUsage.aiCreditsUsed,
            limit: aiCreditUsage.aiCreditsLimit,
            periodStartedAt: aiCreditUsage.aiCreditsPeriodStartedAt,
          }
        : null,
      memberLimit: memberLimitFor(active.type),
      memberCount,
      // Plan-aware folder cap (PRICING-LOCK): a personal Pro account shows 25, not 10. Falls
      // back to the account-type default when the stored plan is absent/unreadable.
      folderLimit: folderLimitForAccount(usage?.plan ?? null, active.type),
      frozen,
      // CS-1: explicit billing tier from account_billing (null → type-default label).
      plan: usage?.plan ?? null,
      // CS-5: lifecycle facts for the warning banner / period-end row (non-secret).
      planStatus: usage?.planStatus ?? null,
      currentPeriodEnd: usage?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: usage?.cancelAtPeriodEnd ?? null,
      // CS-BD-3: dark-launch gate for the destructive Business → Team downgrade affordance.
      businessDowngradeEnabled: isBusinessDowngradeEnabled(),
      // BU-4: the viewer's personal account id, so a Team→Business upgrade can run the
      // Personal-Pro choice dialog. Always available via ensurePersonalAccount.
      personalAccountId: personal.id,
    };
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <main className="flex w-full flex-col p-6 sm:p-8">
        <AccountSettings
          active={
            active
              ? { name: active.name, type: active.type, role: active.role }
              : null
          }
          activeAccountId={active?.id ?? null}
          isPersonal={Boolean(isPersonal)}
          deletionStatus={personal.deletionStatus}
          purgeAfter={personal.purgeAfter}
          userEmail={user.email ?? ""}
          displayName={displayName}
          emailVerified={security.emailVerified}
          signInMethod={security.signInMethod}
          billing={billing}
          initialSection={initialSection}
        />
      </main>
    </AppShell>
  );
}
