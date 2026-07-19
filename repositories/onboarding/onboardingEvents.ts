import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * onboarding_events repository (5.ONBOARD-1 Batch 4).
 *
 * Insert-only, service-role. The SERVICE layer
 * (services/onboarding/onboardingEvents.ts) owns sanitization + fail-open —
 * this layer just persists a pre-sanitized row. Content-free by schema: ids,
 * enum keys, and the allow-listed metadata object only.
 */

export type OnboardingEventType =
  | "onboarding_shown"
  | "onboarding_step_completed"
  | "onboarding_cta_clicked"
  | "onboarding_dismissed"
  | "onboarding_reopened"
  | "onboarding_minimized"
  | "onboarding_workflow_switched"
  | "onboarding_video_opened"
  | "onboarding_video_watched"
  | "onboarding_completed"
  // ── collaboration checklist funnel (5.ONBOARD-4) ──
  | "collab_onboarding_shown"
  | "collab_onboarding_cta_clicked"
  | "collab_onboarding_dismissed"
  | "collab_onboarding_reopened"
  | "collab_onboarding_minimized"
  | "collab_onboarding_completed"
  // ── member LEARNING EVIDENCE (5.ONBOARD-4) ──
  | CollaborationLearningEventType;

/**
 * The subset of events that COMPLETE a member checklist step.
 *
 * These are written ONLY by server code that has already authorized the read it is
 * recording (see services/collaborationOnboarding/learningEvents.ts). They are
 * deliberately absent from the client-postable schema in
 * app/api/onboarding/events/route.ts — widening that route to accept these would
 * make every member learning step forgeable with a single curl.
 */
export type CollaborationLearningEventType =
  | "collab_workspace_explored"
  | "collab_shared_workflow_opened"
  | "collab_apps_viewed"
  | "collab_team_viewed";

export interface OnboardingEventInsert {
  userId: string;
  accountId: string;
  eventType: OnboardingEventType;
  stepKey?: string;
  workflowId?: string;
  provider?: string;
  metadata?: Readonly<Record<string, string | number | boolean>>;
}

export async function insertServiceRole(event: OnboardingEventInsert): Promise<void> {
  const supabase = getServiceRoleClient(
    `onboarding: event ${event.eventType} ${event.accountId}`,
  );
  const { error } = await supabase.from("onboarding_events").insert({
    user_id: event.userId,
    account_id: event.accountId,
    event_type: event.eventType,
    step_key: event.stepKey ?? null,
    workflow_id: event.workflowId ?? null,
    provider: event.provider ?? null,
    metadata: event.metadata ?? {},
  });
  if (error) {
    throw new Error(`onboarding_events.insert failed: ${error.message}`);
  }
}

/**
 * Which of `types` this user has recorded in THIS account (5.ONBOARD-4).
 *
 * The read path for member learning evidence. Scoped hard by (user_id, account_id)
 * so evidence can never leak or transfer across accounts: a member who explored
 * account A's workspace has no progress in account B, and one member's evidence is
 * never visible to another.
 *
 * Returns a Set of the types actually present. Selects `event_type` ONLY — no
 * metadata, no workflow ids, no timestamps reach the caller, so this cannot become
 * an activity feed of what a co-member did.
 */
export async function findRecordedTypesServiceRole(input: {
  userId: string;
  accountId: string;
  types: readonly CollaborationLearningEventType[];
}): Promise<Set<CollaborationLearningEventType>> {
  if (input.types.length === 0) return new Set();
  const supabase = getServiceRoleClient(
    `onboarding: learning evidence ${input.userId}/${input.accountId}`,
  );
  const { data, error } = await supabase
    .from("onboarding_events")
    .select("event_type")
    .eq("user_id", input.userId)
    .eq("account_id", input.accountId)
    .in("event_type", input.types as string[]);
  if (error) {
    throw new Error(`onboarding_events.findRecordedTypes failed: ${error.message}`);
  }
  return new Set(
    (data ?? []).map(
      (r) => (r as { event_type: CollaborationLearningEventType }).event_type,
    ),
  );
}
