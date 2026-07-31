import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import * as notificationsRepo from "@/repositories/notifications";
import * as workflowRunsRepo from "@/repositories/workflowRuns";
import * as workflowsRepo from "@/repositories/workflows";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { resolveActiveAccount } from "@/services/accounts/activeAccount";
import { AppShell } from "@/components/app-shell/AppShell";
import { AppPageContainer } from "@/components/app-shell/AppPageContainer";
import { applyCredentialRequestNotice } from "@/app/notifications/credentialRequestNotice";
import { RunsDashboard } from "@/features/runs/RunsDashboard";
import {
  NOTIFICATION_BELL_PREVIEW_LIMIT,
  toNotificationPreview,
} from "@/app/notifications/notificationPreview";
import { RUN_LIST_DEFAULT_LIMIT, lookupLiveTestRunIds, toRunListItem } from "./_shared";

/**
 * Runs dashboard route (Slice 4.RUNS-PAGE-1).
 *
 * Thin server component: auth gate + parallel server-side fetch
 * (recent runs + workflow-name join + unread / recent notifications
 * for the top-bar bell) → map → render the client `RunsDashboard`.
 *
 * Read-only — no mutation actions, no run retry/replay/cancel CTAs
 * (no real APIs exist yet). The Workflows page is the canonical entry
 * point for retrying via Run-Now from the builder.
 *
 * Per CLAUDE.md / data-security: every read is user-scoped.
 *   - `workflowRunsRepo.listByUserForDisplay` selects only safe
 *     columns (see the repo helper's comment block).
 *   - `workflowsRepo.listNamesByIds` selects `(id, name)` only — no
 *     `draft_definition` blob.
 *   - Both go through the SSR-cookie Supabase client; RLS gates rows
 *     by account membership (4.ACCOUNT-MODEL-8).
 *   - No per-row N+1: the name join is one IN-list query.
 *
 * **Account-ownership (4.ACCOUNT-MODEL-8; active-scoped in 4.ACCOUNT-SWITCHER-1):**
 * the run scope is "runs across the caller's ACTIVE account" — resolved at page
 * entry via `resolveActiveAccount` (the same chokepoint the APIs use) and
 * threaded to the repository's account_id WHERE predicate. The route DTO + UI
 * components stay shape-stable.
 */
export default async function RunsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const resolved = await resolveActiveAccount(user.id);
  const account = resolved.ok ? resolved.account : await ensurePersonalAccount(user.id);
  const [
    runRecords,
    unreadNotifications,
    recentNotificationRecords,
  ] = await Promise.all([
    workflowRunsRepo.listByAccountForDisplay(account.id, {
      limit: RUN_LIST_DEFAULT_LIMIT,
    }),
    notificationsRepo.countUnreadForUser(user.id),
    notificationsRepo.listForUser(user.id, {
      limit: NOTIFICATION_BELL_PREVIEW_LIMIT,
    }),
  ]);

  const workflowIds = Array.from(new Set(runRecords.map((r) => r.workflowId)));
  const [nameRows, liveTestRunIds] = await Promise.all([
    workflowsRepo.listNamesByIds(workflowIds),
    lookupLiveTestRunIds(runRecords),
  ]);
  const workflowNameById = new Map(nameRows.map((w) => [w.id, w.name]));
  const runs = runRecords.map((r) => toRunListItem(r, workflowNameById, liveTestRunIds));
  const recentNotifications = recentNotificationRecords.map(toNotificationPreview);
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
      {/* RESPONSIVE-PAGES-2 — `content` preserves this page's deliberate 1152px
          reading width (was max-w-6xl) while gaining the fluid gutter + min-w-0. */}
      <AppPageContainer width="content" className="py-6 sm:py-8">
        <RunsDashboard initialRuns={runs} />
      </AppPageContainer>
    </AppShell>
  );
}
