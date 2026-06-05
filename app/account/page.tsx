import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { listUserAccountSummaries } from "@/services/accounts/accountList";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { getDisplayName } from "@/repositories/userProfiles";
import { AppShell } from "@/components/app-shell/AppShell";
import { AccountSettings } from "@/features/account/AccountSettings";
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

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={unreadNotifications}
      recentNotifications={recentNotifications}
    >
      <main className="flex w-full flex-col p-6 sm:p-8">
        <AccountSettings
          active={
            active
              ? { name: active.name, type: active.type, role: active.role }
              : null
          }
          isPersonal={Boolean(isPersonal)}
          deletionStatus={personal.deletionStatus}
          purgeAfter={personal.purgeAfter}
          userEmail={user.email ?? ""}
          displayName={displayName}
          emailVerified={security.emailVerified}
          signInMethod={security.signInMethod}
          initialSection={initialSection}
        />
      </main>
    </AppShell>
  );
}
