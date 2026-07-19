import { latchCompletionServiceRole } from "@/repositories/onboarding/userOnboardingStates";
import { recordOnboardingEvent } from "./onboardingEvents";

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
 * completion provenance (id + name snapshot) is never replaced.
 *
 * PROVENANCE SNAPSHOT: `workflowName` is passed from the ACTIVATED record the
 * route already holds, so the stored name is the name at the moment onboarding
 * completed. It is never re-read or refreshed later — a rename after completion
 * must not rewrite history, and the value must outlive the workflow row.
 */
export async function latchOnboardingCompletionOnActivation(input: {
  userId: string;
  accountId: string;
  workflowId: string;
  workflowName?: string | null;
}): Promise<void> {
  try {
    const won = await latchCompletionServiceRole({
      userId: input.userId,
      accountId: input.accountId,
      workflowId: input.workflowId,
      workflowName: input.workflowName ?? null,
    });
    if (won) {
      // One-time funnel event (fail-open inside the recorder).
      await recordOnboardingEvent({
        userId: input.userId,
        accountId: input.accountId,
        eventType: "onboarding_completed",
        workflowId: input.workflowId,
        metadata: { silent: false },
      });
    }
  } catch (err) {
    console.error(
      "[onboarding] completion latch failed (activation unaffected):",
      err instanceof Error ? err.message : "unknown error",
    );
  }
}
