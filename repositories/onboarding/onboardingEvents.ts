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
  | "onboarding_completed";

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
