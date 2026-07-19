import * as eventsRepo from "@/repositories/onboarding/onboardingEvents";
import type { CollaborationLearningEventType } from "@/repositories/onboarding/onboardingEvents";
import { recordOnboardingEvent } from "@/services/onboarding/onboardingEvents";

export type { CollaborationLearningEventType };

/**
 * Member LEARNING-EVIDENCE recorder (5.ONBOARD-4).
 *
 * ── WHY THIS IS NOT FORGEABLE ─────────────────────────────────────────────────
 * Three member checklist steps are genuinely about VISITING or OPENING a shared
 * feature, and nothing else in the database changes when a member merely reads a
 * page — so the visit itself must be recorded. The integrity rule is WHERE it is
 * recorded: every call site is server-side code that has ALREADY authorized and
 * served the thing it is recording.
 *
 *   collab_workspace_explored     ← the active-account switch service, after it
 *                                   verified membership of the target account
 *   collab_shared_workflow_opened ← the workflow detail server component, after
 *                                   its own authz load succeeded
 *   collab_apps_viewed            ← the /apps page load
 *   collab_team_viewed            ← the /team page load
 *
 * These types are deliberately NOT accepted by /api/onboarding/events, which keeps
 * its own narrow client schema (cta_clicked | video_opened). If they were postable,
 * a member could curl three steps to green without visiting anything — the exact
 * "client-only state / forged completion" failure the design forbids. Do not widen
 * that route to these types.
 *
 * The fourth member step takes no event at all: "use a team workflow" reads a real
 * `workflow_runs` row (succeeded, triggered_by_user_id = the member), which is
 * stronger evidence than any recorded visit.
 *
 * ── FAIL-OPEN + WRITE-ONCE ────────────────────────────────────────────────────
 * Recording is best-effort at every call site: navigation must never break because
 * an analytics insert failed. It is also write-once per (user, account, type) —
 * these are "has this ever happened" facts, so re-inserting on every page view
 * would grow the ledger without adding information. A lost race inserts a harmless
 * duplicate; the read path is set-based.
 */
export async function recordCollaborationLearningEvent(input: {
  userId: string;
  accountId: string;
  eventType: CollaborationLearningEventType;
  /** Only set for collab_shared_workflow_opened. */
  workflowId?: string;
}): Promise<void> {
  try {
    const existing = await eventsRepo.findRecordedTypesServiceRole({
      userId: input.userId,
      accountId: input.accountId,
      types: [input.eventType],
    });
    if (existing.has(input.eventType)) return;
    await recordOnboardingEvent({
      userId: input.userId,
      accountId: input.accountId,
      eventType: input.eventType,
      ...(input.workflowId ? { workflowId: input.workflowId } : {}),
    });
  } catch (err) {
    // Never let a learning-evidence write interrupt navigation.
    console.error(
      "[collab-onboarding] learning event failed (navigation unaffected):",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
