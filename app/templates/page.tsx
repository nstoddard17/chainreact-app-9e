import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import {
  listMarketplaceTemplates,
  listAccountTemplates,
} from "@/services/workflows/templateManagement";
import * as notificationsRepo from "@/repositories/notifications";
import { AppShell } from "@/components/app-shell/AppShell";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import { TemplatesDashboard } from "@/features/templates/TemplatesDashboard";
import { toMyTemplateItem } from "@/features/templates/types";

/**
 * Templates marketplace route (Slice 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 / CS-XT-7A).
 *
 * Thin server component: auth gate → resolve the active account → parallel-fetch the public
 * marketplace + the account's own templates server-side via the templateManagement service,
 * then render the client `TemplatesDashboard`.
 *
 * No-leak: the marketplace summaries omit account_id / created_by_user_id; account templates are
 * mapped to `MyTemplateItem` (creator id dropped, replaced by a `canManage` boolean) before they
 * reach the client. No definition / credential / Stripe id is ever passed down.
 */
export default async function TemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const [unread, recentRecords] = await Promise.all([
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, { limit: NOTIFICATION_BELL_PREVIEW_LIMIT }),
  ]);
  const recentNotifications = recentRecords.map(toNotificationPreview);

  const resolved = await resolveActiveAccount(user.id);
  const account = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);

  const [marketplace, mineRecords] = await Promise.all([
    listMarketplaceTemplates(),
    listAccountTemplates(account.id),
  ]);
  const mine = mineRecords.map((r) => toMyTemplateItem(r, user.id));

  return (
    <AppShell userEmail={user.email ?? ""} unreadNotifications={unread} recentNotifications={recentNotifications}>
      <main className="flex w-full flex-col gap-6 p-6 sm:p-8">
        <TemplatesDashboard
          accountId={account.id}
          currentUserId={user.id}
          initialMarketplace={marketplace}
          initialMine={mine}
        />
      </main>
    </AppShell>
  );
}
