import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as integrationsRepo from "@/repositories/integrations";
import * as notificationsRepo from "@/repositories/notifications";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { ConnectionStatusBanner } from "@/features/integrations/ConnectionStatusBanner";
import { AppsDashboard } from "@/features/apps/AppsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";
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
  // Slice 4.ACCOUNT-MODEL-6: integrations are account-scoped. Until the
  // switcher slice ships, "this user's integrations" means their personal
  // account's integrations.
  const ownerAccount = await ensurePersonalAccount(user.id);
  const [records, unreadNotifications, recentNotificationRecords] =
    await Promise.all([
      integrationsRepo.listActiveByAccount(ownerAccount.id),
      notificationsRepo.countUnreadForUser(user.id),
      notificationsRepo.listForUser(user.id, {
        limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
      }),
    ]);
  const items = resolveAppCatalog(records);
  const categories = buildCategoryList(items);
  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={unreadNotifications}
      recentNotifications={recentNotifications}
    >
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 sm:p-8">
        <ConnectionStatusBanner searchParams={params} />
        <AppsDashboard items={items} categories={categories} />
      </main>
    </AppShell>
  );
}
