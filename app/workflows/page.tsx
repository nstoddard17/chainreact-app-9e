import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunStatsRepo from "@/repositories/workflowRunStats";
import * as notificationsRepo from "@/repositories/notifications";
import { toWorkflowListItem } from "@/app/api/workflows/_shared";
import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";

/**
 * Workflows dashboard route (Slice 4.WORKFLOWS-PAGE-1).
 *
 * Thin server component: auth gate + server-side fetch of the enriched list
 * (workflows + lifetime run aggregates in parallel) → pass to the client
 * `WorkflowsDashboard`. The dashboard owns client interactivity (search,
 * status filter, list/grid view, non-optimistic status toggle + refresh).
 *
 * Per CLAUDE.md / data-security: both reads are user-scoped (workflows by
 * user_id; run stats via the `workflow_run_stats` view's security_invoker +
 * underlying `workflow_runs` RLS). No per-row N+1, no client detail fetches,
 * no raw definition / config exposure (the route mapping emits only provider
 * id/label/iconUrl + counts + numeric run stats).
 */
export default async function WorkflowsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const [records, runStats, unreadNotifications] = await Promise.all([
    workflowsRepo.listByUser(user.id),
    workflowRunStatsRepo.getStatsForUser(user.id),
    notificationsRepo.countUnreadForUser(user.id),
  ]);
  const workflows = records.map((r) => toWorkflowListItem(r, runStats));

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={unreadNotifications}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col p-6 sm:p-8">
        <WorkflowsDashboard initialWorkflows={workflows} />
      </main>
    </AppShell>
  );
}
