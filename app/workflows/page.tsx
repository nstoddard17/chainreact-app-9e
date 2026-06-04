import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunStatsRepo from "@/repositories/workflowRunStats";
import * as notificationsRepo from "@/repositories/notifications";
import * as foldersRepo from "@/repositories/workflowFolders";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { folderLimitFor } from "@/services/workflowFolders/folderLimits";
import { toWorkflowListItem } from "@/app/api/workflows/_shared";
import { toWorkflowFolder } from "@/app/api/folders/_shared";
import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";

/**
 * Workflows dashboard route (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Thin server component: auth gate + server-side fetch of the enriched list
 * (workflows + lifetime run aggregates in parallel) → pass to the client
 * `WorkflowsDashboard`. The dashboard owns client interactivity (search,
 * status filter, list/grid view, non-optimistic status toggle + refresh).
 *
 * Per CLAUDE.md / data-security: workflows are account-scoped
 * (4.ACCOUNT-MODEL-7 — listed by the caller's account); run stats stay
 * user-scoped via the `workflow_run_stats` view's security_invoker +
 * underlying `workflow_runs` RLS (workflow_runs is slice -8). For a
 * single-user personal account the two key off the same workflows. No
 * per-row N+1, no client detail fetches, no raw definition / config exposure
 * (the route mapping emits only provider id/label/iconUrl + counts +
 * numeric run stats).
 */
export default async function WorkflowsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // 4.ACCOUNT-MODEL-7: resolve the caller's account before the parallel
  // fetch — workflows are now listed by account. Personal account until the
  // switcher slice ships.
  const ownerAccount = await ensurePersonalAccount(user.id);
  const [records, runStats, folderRecords, unreadNotifications, recentNotificationRecords] =
    await Promise.all([
      workflowsRepo.listByAccount(ownerAccount.id),
      workflowRunStatsRepo.getStatsForUser(user.id),
      // 4.WORKFLOW-FOLDERS-6 / WF-5 — live folders for the dashboard folder tree.
      foldersRepo.listByAccount(ownerAccount.id),
      notificationsRepo.countUnreadForUser(user.id),
      notificationsRepo.listForUser(user.id, {
        limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
      }),
    ]);
  const workflows = records.map((r) => toWorkflowListItem(r, runStats));
  const folders = folderRecords.map(toWorkflowFolder);
  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={unreadNotifications}
      recentNotifications={recentNotifications}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col p-6 sm:p-8">
        <WorkflowsDashboard
          initialWorkflows={workflows}
          initialFolders={folders}
          folderLimit={folderLimitFor(ownerAccount.type)}
        />
      </main>
    </AppShell>
  );
}
