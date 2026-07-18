import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { requireAccountRole } from "@/services/accounts/accountAuthz";
import { getActiveForExecution } from "@/repositories/integrations";
import { listOrSeedDashboards } from "@/services/analytics/dashboards";
import { getAnalyticsOverview } from "@/services/analytics/analyticsOverview";
import { AppShell } from "@/components/app-shell/AppShell";
import { isOnboardingChecklistEnabled } from "@/services/onboarding/onboardingFlags";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import { AnalyticsDashboard } from "@/features/analytics/AnalyticsDashboard";
import { exposedConnectedAppSources } from "@/features/analytics/connectedAppSources";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";

/**
 * Analytics dashboard route (Slice ANALYTICS-1).
 *
 * Thin server component: auth gate → resolve the caller's ACTIVE account (the
 * same chokepoint the APIs use) → parallel server-side fetch (saved dashboards,
 * seeded on first access; the default-range analytics overview; notification
 * bell) → render the client `AnalyticsDashboard`.
 *
 * Account-scoped end to end: dashboards are read RLS-authorizing for the active
 * account; the overview's run/workflow/integration reads are all account-filtered
 * and surface only aggregate counts + safe names — no run payloads, tokens, or
 * provider account identifiers.
 */

const DEFAULT_RANGE = "7d" as const;

/**
 * For each connected-app provider EXPOSED in the widget UI, resolve whether it's
 * connected so the config panel can show a connect note. Account-shared providers
 * (e.g. Slack) check the ACCOUNT'S connection; personal providers check THIS
 * viewer's own connection (never another member's) — matching the credential
 * visibility declared in the descriptor.
 */
async function resolveConnectedProviders(
  accountId: string,
  userId: string,
): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    exposedConnectedAppSources().map(async (source) => {
      const integration = await getActiveForExecution(
        accountId,
        source.provider,
        null,
        source.visibility === "personal" ? { connectedByUserId: userId } : undefined,
      );
      return [source.provider, integration !== null] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const resolved = await resolveActiveAccount(user.id);
  const account = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);

  const [
    dashboards,
    overview,
    authorRole,
    connectedProviders,
    unreadNotifications,
    recentNotificationRecords,
  ] = await Promise.all([
    listOrSeedDashboards(account.id, user.id),
    getAnalyticsOverview(account.id, DEFAULT_RANGE),
    // Dashboards are shared account objects: only owner/admin may author them
    // (a personal owner qualifies). Members get a clean read-only view. The
    // server routes are the real enforcement; this only drives control visibility.
    requireAccountRole(user.id, account.id, ["owner", "admin"]),
    // Connection status for each exposed connected-app provider (drives the
    // config panel's connect note). Account vs personal pin per descriptor.
    resolveConnectedProviders(account.id, user.id),
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, { limit: NOTIFICATION_BELL_PREVIEW_LIMIT }),
  ]);
  const canManage = authorRole.ok;

  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotifications,
  );

  return (
    <AppShell
      gettingStartedEnabled={isOnboardingChecklistEnabled()}
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <AnalyticsDashboard
        accountName={account.name}
        canManage={canManage}
        connectedProviders={connectedProviders}
        initialDashboards={dashboards}
        initialOverview={overview}
        initialRange={DEFAULT_RANGE}
      />
    </AppShell>
  );
}
