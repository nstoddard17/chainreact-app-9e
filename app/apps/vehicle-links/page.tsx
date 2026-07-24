import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { getRole } from "@/repositories/accountMemberships";
import * as notificationsRepo from "@/repositories/notifications";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import { AppShell } from "@/components/app-shell/AppShell";
import { VehicleLinksDashboard } from "@/features/apps/vehicleLinks/VehicleLinksDashboard";
import { isResourceLinksUiEnabled } from "@/services/resourceLinks/flags";
import {
  listVehicleLinks,
  unlinkedVehicles,
} from "@/services/resourceLinks/vehicleLinkService";
import {
  loadMotiveInventory,
  loadFleetioInventory,
} from "@/services/resourceLinks/vehicleInventory";
import {
  listVehicleSuggestions,
  assessVehicleLinkHealth,
} from "@/services/resourceLinks/vehicleSuggestions";

/**
 * `/apps/vehicle-links` — the Vehicle Links management screen
 * (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Thin server component, mirroring `app/apps/page.tsx`: flag → auth gate →
 * active account → membership gate → parallel service reads → render the
 * client dashboard. No repository call and no authorization decision is made
 * here; both belong to the service.
 *
 * FLAG OFF ⇒ `notFound()`. Deliberately a 404 rather than a redirect or an
 * "unavailable" page: while the feature is dark the route must not exist at
 * all, and a 404 leaks nothing about the account or the feature.
 *
 * The Motive list is loaded SERVER-side because the Unlinked section is a set
 * difference against it — computing it on the client would mean rendering a
 * misleading "everything is unlinked" flash first. The Fleetio picker loads on
 * the client (one page per row-open, searchable), which is where its loading
 * and error states live.
 */
export default async function VehicleLinksPage() {
  if (!isResourceLinksUiEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const resolved = await resolveActiveAccount(user.id);
  const account = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);

  // Explicit membership gate before any account-scoped read (the /apps
  // precedent). `resolveActiveAccount` already returns a member account and the
  // personal fallback is the caller's own, so this is non-null on every normal
  // path — it is defense-in-depth so a service-role read can never surface a
  // non-member account's links.
  const callerRole = await getRole(account.id, user.id);
  if (callerRole === null) notFound();

  // CS-5 — the two provider lists are loaded ONCE and reused by all three
  // sections (Unlinked, Suggested, and stale-link health), so opening this page
  // costs exactly one Motive call and one Fleetio call regardless of how much it
  // renders. `listVehicleSuggestions` reloads them internally for the suggestion
  // set; the health pass reuses these.
  const [
    linksResult,
    motiveInventory,
    fleetioInventory,
    suggestionsResult,
    unreadNotifications,
    recentNotificationRecords,
  ] = await Promise.all([
    listVehicleLinks({ accountId: account.id, actingUserId: user.id }),
    loadMotiveInventory({ accountId: account.id }),
    loadFleetioInventory({ accountId: account.id }),
    listVehicleSuggestions({ accountId: account.id, actingUserId: user.id }),
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, { limit: NOTIFICATION_BELL_PREVIEW_LIMIT }),
  ]);
  const links = linksResult.ok ? linksResult.links : [];
  const health = await assessVehicleLinkHealth({
    links,
    motive: motiveInventory,
    fleetio: fleetioInventory,
  });
  // Option-shaped view of the Motive inventory for the Unlinked set difference.
  const motiveOptions = motiveInventory.vehicles.map((v) => ({
    value: v.identity.vehicleId,
    label: v.label,
  }));
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotificationRecords.map(toNotificationPreview),
  );

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <main className="flex w-full flex-col gap-6 p-6 sm:p-8">
        {/*
         * Back to the Apps page. Server-rendered plain link (no client JS) so it
         * always points at a real destination rather than depending on browser
         * history — a user who deep-links straight here still has a way back.
         * Mirrors the "‹ All workflows" affordance on the builder header.
         */}
        <Link
          href="/apps"
          data-testid="back-to-apps"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          <span aria-hidden>←</span> Back to Apps
        </Link>
        <VehicleLinksDashboard
          accountId={account.id}
          canManage={callerRole === "owner" || callerRole === "admin"}
          links={links}
          motiveStatus={motiveInventory.status}
          motiveHasMore={motiveInventory.hasMore}
          unlinked={unlinkedVehicles(motiveOptions, links)}
          {...(suggestionsResult.ok ? { suggestions: suggestionsResult.view } : {})}
          health={health}
        />
      </main>
    </AppShell>
  );
}
