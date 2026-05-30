import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import { NotificationsList } from "@/features/notifications/NotificationsList";
import { AppShell } from "@/components/app-shell/AppShell";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const notifications = await notificationsRepo.listForUser(user.id);

  return (
    <AppShell userEmail={user.email ?? ""}>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6 sm:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Notifications
        </h1>
        <NotificationsList notifications={notifications} />
      </main>
    </AppShell>
  );
}
