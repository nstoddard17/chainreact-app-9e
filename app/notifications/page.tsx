import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { NotificationsList } from "@/features/notifications/NotificationsList";
import { AppShell } from "@/components/app-shell/AppShell";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";

/**
 * Full notifications list route. Kept as a fallback / deep-link target
 * for emails + the top-bar bell popover's "View all" link. NOT
 * surfaced in the primary side rail — the bell is the canonical entry
 * point (Slice 4.NOTIFICATIONS-POPOVER-1).
 */
export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // Single `listForUser` fetch covers both surfaces: the full page
  // renders all notifications (default limit = 50), and the bell
  // popover slices the first `NOTIFICATION_BELL_PREVIEW_LIMIT` rows.
  const [notifications, unreadNotifications] = await Promise.all([
    notificationsRepo.listForUser(user.id),
    notificationsRepo.countUnreadForUser(user.id),
  ]);
  const recentNotifications = notifications
    .slice(0, NOTIFICATION_BELL_PREVIEW_LIMIT)
    .map(toNotificationPreview);
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
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Notifications
        </h1>
        <NotificationsList notifications={notifications} />
      </main>
    </AppShell>
  );
}
