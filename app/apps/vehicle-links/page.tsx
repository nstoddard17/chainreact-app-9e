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
import { listVehicleOptions } from "@/services/resourceLinks/vehicleOptions";

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

  const [linksResult, motiveVehicles, unreadNotifications, recentNotificationRecords] =
    await Promise.all([
      listVehicleLinks({ accountId: account.id, actingUserId: user.id }),
      listVehicleOptions({ accountId: account.id, userId: user.id, side: "motive" }),
      notificationsRepo.countUnreadForUser(user.id),
      notificationsRepo.listForUser(user.id, { limit: NOTIFICATION_BELL_PREVIEW_LIMIT }),
    ]);
  const links = linksResult.ok ? linksResult.links : [];
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
        <VehicleLinksDashboard
          accountId={account.id}
          canManage={callerRole === "owner" || callerRole === "admin"}
          links={links}
          motiveStatus={motiveVehicles.status}
          motiveHasMore={motiveVehicles.hasMore}
          unlinked={unlinkedVehicles(motiveVehicles.items, links)}
        />
      </main>
    </AppShell>
  );
}
