import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as integrationsRepo from "@/repositories/integrations";
import * as notificationsRepo from "@/repositories/notifications";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { getRole } from "@/repositories/accountMemberships";
import { ConnectionStatusBanner } from "@/features/integrations/ConnectionStatusBanner";
import { AppsDashboard } from "@/features/apps/AppsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import { buildCategoryList, resolveAppCatalog } from "./_shared";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Apps dashboard route (Slice 4.APPS-PAGE-1).
 *
 * Thin server component: auth gate → parallel fetch (provider catalog is a
 * pure registry read, no I/O; integrations is one user-scoped query) →
 * project to the route-safe `AppCatalogItem[]` shape → render the client
 * `AppsDashboard`. The page reuses the existing `ConnectionStatusBanner`
 * so the post-OAuth toast keeps working at the new route.
 *
 * The OAuth callback (`/api/integrations/oauth/[provider]/callback`) was
 * updated in this slice to redirect to `/apps?integration=connected&
 * provider=<id>` so this banner is the right home for that toast.
 */
export default async function AppsPage({ searchParams }: Props) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const params = await searchParams;
  // 4.ACCOUNT-SWITCHER-1: integrations are account-scoped — list the caller's
  // ACTIVE account's connections (the same account the OAuth-connect APIs write
  // to via requireUserWithAccount). Falls back to the personal floor if the
  // active account can't be resolved (e.g. frozen).
  const resolved = await resolveActiveAccount(user.id);
  const ownerAccount = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);
  // 4.APPS-DISCONNECT / CD-3: the caller's role on the active account drives the
  // per-account `canDisconnect` flag (session-client, RLS-self).
  // V2-READY-47D: this role lookup is ALSO the explicit membership gate for the
  // integrations read. `listActiveByAccount` now reads via service-role (direct
  // authenticated SELECT was revoked), so RLS no longer scopes it — we read ONLY
  // when the caller is a member of `ownerAccount` (`callerRole !== null`).
  // `resolveActiveAccount` already returns a member account and the personal
  // fallback is the caller's own account, so this is non-null in every normal
  // path; the gate is defense-in-depth so a service-role read can never surface a
  // non-member account's connections.
  const callerRole = await getRole(ownerAccount.id, user.id);
  const [records, unreadNotifications, recentNotificationRecords] =
    await Promise.all([
      callerRole !== null
        ? integrationsRepo.listActiveByAccount(ownerAccount.id)
        : Promise.resolve([] as const),
      notificationsRepo.countUnreadForUser(user.id),
      notificationsRepo.listForUser(user.id, {
        limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
      }),
    ]);
  const items = resolveAppCatalog(records, {
    callerUserId: user.id,
    callerRole,
  });
  const categories = buildCategoryList(items);
  // 5.ONBOARD-1 Batch 3 — validated `?highlight=<provider>` deep link (used by
  // the onboarding checklist's Connect CTA). Only a provider key that exists in
  // THIS caller's rendered catalog passes; anything else is silently ignored.
  // Attention-only: the dashboard scrolls + rings the card — Connect/Reconnect
  // remain explicit, permission-gated clicks.
  const rawHighlight = Array.isArray(params.highlight)
    ? params.highlight[0]
    : params.highlight;
  const highlightProvider =
    typeof rawHighlight === "string" &&
    items.some((i) => i.providerId === rawHighlight)
      ? rawHighlight
      : null;
  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);
  // CS-8: surface pending credential-reassignment requests in the bell.
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotifications,
  );

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <main className="flex w-full flex-col gap-6 p-6 sm:p-8">
        <ConnectionStatusBanner searchParams={params} />
        <AppsDashboard
          items={items}
          categories={categories}
          accountId={ownerAccount.id}
          highlightProvider={highlightProvider}
        />
      </main>
    </AppShell>
  );
}
