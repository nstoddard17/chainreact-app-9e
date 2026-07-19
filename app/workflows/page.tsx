import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as workflowsRepo from "@/repositories/workflows";
import * as workflowRunStatsRepo from "@/repositories/workflowRunStats";
import * as notificationsRepo from "@/repositories/notifications";
import * as foldersRepo from "@/repositories/workflowFolders";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { folderLimitForAccount } from "@/services/workflowFolders/folderLimits";
import { resolveAccountPlan } from "@/services/billing/planCapabilities";
import { computeViewerCanRunEditBatch, toWorkflowListItem } from "@/app/api/workflows/_shared";
import { toWorkflowFolder } from "@/app/api/folders/_shared";
import { WorkflowsDashboard } from "@/features/workflows/WorkflowsDashboard";
import { AppShell } from "@/components/app-shell/AppShell";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import type { OnboardingChecklistDTO } from "@/contracts/onboarding";
import { getOnboardingChecklist } from "@/services/onboarding/checklistState";
import { getOnboardingVideoConfig } from "@/services/onboarding/onboardingVideo";

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

  // Resolve the caller's ACTIVE account — the same chokepoint the /api/workflows
  // + /api/folders routes use via requireUserWithAccount (explicit → stored
  // active_account_id → personal fallback). The page MUST read from the same
  // account the client APIs mutate, otherwise (e.g. when a Team account is
  // active) the server-rendered list shows the personal account's folders /
  // workflows while create/move/delete operate on the active account — folders
  // appear empty yet collide on create. `resolveActiveAccount` ensures the
  // personal account exists internally; on the rare frozen-active case we fall
  // back to the personal floor for display.
  const resolved = await resolveActiveAccount(user.id);
  const ownerAccount = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);
  const [
    records,
    runStats,
    folderRecords,
    unreadNotifications,
    recentNotificationRecords,
    planResolution,
  ] = await Promise.all([
    workflowsRepo.listByAccount(ownerAccount.id),
    // 4.ACCOUNT-SWITCHER-1: run stats scoped to the active account (matches
    // the workflows + folders lists above).
    workflowRunStatsRepo.getStatsForAccount(ownerAccount.id),
    // 4.WORKFLOW-FOLDERS-6 / WF-5 — live folders for the dashboard folder tree.
    foldersRepo.listByAccount(ownerAccount.id),
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, {
      limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
    }),
    // PRICING-LOCK: plan-aware folder cap so the create-folder affordance honors Pro's 25
    // (not the personal-type default of 10). Fails closed to "free" inside the resolver.
    resolveAccountPlan(ownerAccount.id),
  ]);
  // CS-5b — accurate per-row run/edit eligibility in bounded queries (flag OFF → conservative, no DB).
  const viewerCanRunEdit = await computeViewerCanRunEditBatch(records, user.id);
  const workflows = records.map((r) => toWorkflowListItem(r, runStats, user.id, viewerCanRunEdit));
  const folders = folderRecords.map(toWorkflowFolder);
  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);
  // CS-8: surface pending credential-reassignment requests in the bell (derived,
  // count-only, flag-gated, fail-quiet).
  const bell = await applyCredentialRequestNotice(
    user.id,
    unreadNotifications,
    recentNotifications,
  );

  // 5.ONBOARD-1 — server-fetched first-workflow checklist so the card renders
  // without a loading flash. Fail-open: any derivation error → null → the
  // dashboard renders nothing onboarding-related and stays fully functional.
  let onboarding: OnboardingChecklistDTO | null = null;
  try {
    onboarding = await getOnboardingChecklist({
      userId: user.id,
      accountId: ownerAccount.id,
    });
  } catch (err) {
    console.error(
      "[onboarding] dashboard checklist fetch failed:",
      err instanceof Error ? err.message : "unknown error",
    );
  }

  return (
    <AppShell
      userEmail={user.email ?? ""}
      unreadNotifications={bell.unreadNotifications}
      recentNotifications={bell.recentNotifications}
    >
      <main className="flex w-full flex-col p-6 sm:p-8">
        {/* HERMES-AGENT-GUIDED-PREVIEW-SETUP-ASYNC-OPTIONS-AND-DASHBOARD-CLEANUP — the dashboard
            "Build with me" card was removed. The single AI build surface is the builder's left React
            Agent rail (BuilderGuidanceRail). /workflows is the workflow list/metrics/folders surface,
            not an AI composer. WorkflowGuidancePanel still exists — the builder rail renders it. */}
        <WorkflowsDashboard
          initialWorkflows={workflows}
          initialFolders={folders}
          folderLimit={folderLimitForAccount(planResolution.plan, ownerAccount.type)}
          initialOnboarding={onboarding}
          onboardingVideo={onboarding ? getOnboardingVideoConfig() : null}
        />
      </main>
    </AppShell>
  );
}
