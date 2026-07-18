import { latchCompletionServiceRole } from "@/repositories/onboarding/userOnboardingStates";
import { isOnboardingChecklistEnabled } from "./onboardingFlags";

/**
 * Activation-time onboarding completion latch (5.ONBOARD-1, locked decisions
 * #5–#7).
 *
 * Called from the activate route's SUCCESS callback only — i.e. strictly after
 * readiness passed, trigger registration succeeded, and the lifecycle
 * transition persisted. Never called on failed/blocked activations, and never
 * driven by client input.
 *
 * BEST-EFFORT AND SUBORDINATE: workflow activation is the product event;
 * onboarding persistence is bookkeeping. Any failure here is swallowed after a
 * safe server-side log line (message text only — no workflow definition,
 * config, tokens, or provider data ever reaches the log call). The route's
 * successful activation response is never altered by this function.
 *
 * Latch semantics live in the repository: `completed_at IS NULL` conditional
 * update — first activation wins, concurrent/later activations are no-ops, and
 * completion provenance (completion_workflow_id) is never replaced.
 */
export async function latchOnboardingCompletionOnActivation(input: {
  userId: string;
  accountId: string;
  workflowId: string;
}): Promise<void> {
  if (!isOnboardingChecklistEnabled()) return;
  try {
    await latchCompletionServiceRole({
      userId: input.userId,
      accountId: input.accountId,
      workflowId: input.workflowId,
    });
  } catch (err) {
    console.error(
      "[onboarding] completion latch failed (activation unaffected):",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
