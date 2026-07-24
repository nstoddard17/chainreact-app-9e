import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import { loadVehicleBridgeSummary } from "@/services/resourceLinks/vehicleBridgeSummary";
import * as integrationsRepo from "@/repositories/integrations";
import * as notificationsRepo from "@/repositories/notifications";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { getRole } from "@/repositories/accountMemberships";
import { ConnectionStatusBanner } from "@/features/integrations/ConnectionStatusBanner";
import { AppsDashboard } from "@/features/apps/AppsDashboard";
import type { AppsBridgeView } from "@/features/apps/AppsBridge";
import { AppShell } from "@/components/app-shell/AppShell";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import { recordCollaborationLearningEvent } from "@/services/collaborationOnboarding/learningEvents";
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
  // 5.ONBOARD-4 — member learning evidence. Recorded HERE, after the membership
  // gate above (`callerRole !== null`) has already authorized and served this
  // account's app catalog, so the event can only exist because the caller really
  // did view the shared Apps page. Not client-postable; fail-open inside.
  if (callerRole !== null) {
    await recordCollaborationLearningEvent({
      userId: user.id,
      accountId: ownerAccount.id,
      eventType: "collab_apps_viewed",
    });
  }
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

  // APPS-VL-DESIGN-1 — the Motive⇄Fleetio "Bridge" summary + the per-card
  // Vehicle-links chip. Both gated on the Vehicle-Links surface flag; the bridge
  // additionally needs at least one of the two fleet apps connected, so it never
  // advertises a relationship this account can't act on. The one added provider
  // call (`loadVehicleBridgeSummary` → one Motive list) fires ONLY when BOTH are
  // connected — the both-connected state is the only one that shows real counts.
  const flagOn = isResourceLinksUiEnabled();
  const vehicleLinksHref = flagOn ? "/apps/vehicle-links" : null;
  const motiveConnected = items.some(
    (i) => i.providerId === "motive" && i.isConnected,
  );
  const fleetioConnected = items.some(
    (i) => i.providerId === "fleetio" && i.isConnected,
  );
  let bridge: AppsBridgeView | null = null;
  if (flagOn && callerRole !== null && (motiveConnected || fleetioConnected)) {
    if (motiveConnected && fleetioConnected) {
      const summary = await loadVehicleBridgeSummary({
        accountId: ownerAccount.id,
        actingUserId: user.id,
      });
      bridge = {
        kind: "paired",
        pairedCount: summary.pairedCount,
        unpairedCount: summary.unpairedCount,
        totalCount: summary.totalCount,
        motiveOk: summary.motiveOk,
        partialInventory: summary.partialInventory,
        vehicleLinksHref: "/apps/vehicle-links",
      };
    } else if (motiveConnected) {
      bridge = { kind: "connect", missing: "fleetio", highlightHref: "/apps?highlight=fleetio" };
    } else {
      bridge = { kind: "connect", missing: "motive", highlightHref: "/apps?highlight=motive" };
    }
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <main className="flex w-full flex-col gap-6 p-6 sm:p-8">
        <ConnectionStatusBanner searchParams={params} />
        {/*
         * 5.TRUCK-BRIDGE-1 CS-4 / APPS-VL-DESIGN-1 — the entry point the
         * unmapped-vehicle run error names ("Link it in Apps → Vehicle Links").
         * The plain text link was replaced by the richer Bridge panel + the
         * per-card "Vehicle links" chip (rendered inside AppsDashboard). Both are
         * gated on `RESOURCE_LINKS_UI` via `vehicleLinksHref`/`bridge` being null
         * while the flag is off, so nothing ever points at a 404. The run-error
         * CTA itself links straight to `/apps/vehicle-links`, independent of this
         * page's affordances.
         */}
        <AppsDashboard
          items={items}
          categories={categories}
          accountId={ownerAccount.id}
          highlightProvider={highlightProvider}
          bridge={bridge}
          vehicleLinksHref={vehicleLinksHref}
        />
      </main>
    </AppShell>
  );
}
