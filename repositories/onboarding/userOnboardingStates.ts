import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * Repository for user_onboarding_states (5.ONBOARD-1 Batch 1).
 *
 * Server-side only; ALL writes are service-role (the table grants `authenticated`
 * SELECT only). NON-AUTHORIZING: callers must have resolved the (userId,
 * accountId) pair from the caller's own session (`requireUserWithAccount`)
 * before any call here — the hard eq predicates are the scope, not the authz.
 *
 * HONESTY CONTRACT: this table persists presentation state + two server-latched
 * timestamps. `completed_at` / `completion_workflow_id` are written ONLY by
 * `latchCompletionServiceRole`, only while `completed_at IS NULL` (single-winner
 * under concurrency), and never from any client-supplied value.
 */

export interface UserOnboardingStateRecord {
  userId: string;
  accountId: string;
  selectedWorkflowId: string | null;
  completionWorkflowId: string | null;
  firstShownAt: string | null;
  dismissedAt: string | null;
  minimized: boolean;
  videoWatchedAt: string | null;
  completedAt: string | null;
  celebratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserOnboardingStatesRow {
  user_id: string;
  account_id: string;
  selected_workflow_id: string | null;
  completion_workflow_id: string | null;
  first_shown_at: string | null;
  dismissed_at: string | null;
  minimized: boolean;
  video_watched_at: string | null;
  completed_at: string | null;
  celebrated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: UserOnboardingStatesRow): UserOnboardingStateRecord {
  return {
    userId: row.user_id,
    accountId: row.account_id,
    selectedWorkflowId: row.selected_workflow_id,
    completionWorkflowId: row.completion_workflow_id,
    firstShownAt: row.first_shown_at,
    dismissedAt: row.dismissed_at,
    minimized: row.minimized,
    videoWatchedAt: row.video_watched_at,
    completedAt: row.completed_at,
    celebratedAt: row.celebrated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getServiceRole(
  userId: string,
  accountId: string,
): Promise<UserOnboardingStateRecord | null> {
  const supabase = getServiceRoleClient(
    `onboarding: getServiceRole ${userId}/${accountId}`,
  );
  const { data, error } = await supabase
    .from("user_onboarding_states")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .maybeSingle<UserOnboardingStatesRow>();
  if (error) {
    throw new Error(`user_onboarding_states.get failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/** Ensure a row exists (no-op when present). Returns nothing; races are benign. */
async function ensureRow(userId: string, accountId: string): Promise<void> {
  const supabase = getServiceRoleClient(
    `onboarding: ensureRow ${userId}/${accountId}`,
  );
  const { error } = await supabase
    .from("user_onboarding_states")
    .upsert(
      { user_id: userId, account_id: accountId },
      { onConflict: "user_id,account_id", ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(`user_onboarding_states.ensureRow failed: ${error.message}`);
  }
}

/**
 * Client-writable presentation fields ONLY. Timestamps are set server-side from
 * the action verb — the client never supplies a timestamp value.
 */
export interface PresentationPatch {
  dismissedAt?: string | null;
  minimized?: boolean;
  videoWatchedAt?: string;
  celebratedAt?: string;
  selectedWorkflowId?: string;
}

export async function updatePresentationServiceRole(
  userId: string,
  accountId: string,
  patch: PresentationPatch,
): Promise<UserOnboardingStateRecord> {
  await ensureRow(userId, accountId);
  const supabase = getServiceRoleClient(
    `onboarding: updatePresentation ${userId}/${accountId}`,
  );
  const update: Record<string, unknown> = {};
  if (patch.dismissedAt !== undefined) update.dismissed_at = patch.dismissedAt;
  if (patch.minimized !== undefined) update.minimized = patch.minimized;
  if (patch.videoWatchedAt !== undefined) update.video_watched_at = patch.videoWatchedAt;
  if (patch.celebratedAt !== undefined) update.celebrated_at = patch.celebratedAt;
  if (patch.selectedWorkflowId !== undefined) {
    update.selected_workflow_id = patch.selectedWorkflowId;
  }
  const { data, error } = await supabase
    .from("user_onboarding_states")
    .update(update)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .select("*")
    .single<UserOnboardingStatesRow>();
  if (error) {
    throw new Error(
      `user_onboarding_states.updatePresentation failed: ${error.message}`,
    );
  }
  return rowToRecord(data);
}

/** Latch first_shown_at once (only while NULL). Benign under races. */
export async function latchFirstShownServiceRole(
  userId: string,
  accountId: string,
): Promise<void> {
  await ensureRow(userId, accountId);
  const supabase = getServiceRoleClient(
    `onboarding: latchFirstShown ${userId}/${accountId}`,
  );
  const { error } = await supabase
    .from("user_onboarding_states")
    .update({ first_shown_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .is("first_shown_at", null);
  if (error) {
    throw new Error(
      `user_onboarding_states.latchFirstShown failed: ${error.message}`,
    );
  }
}

/**
 * Latch overall completion — single-winner: the conditional
 * `completed_at IS NULL` predicate makes concurrent activations idempotent
 * (first writer wins; later calls update zero rows). Never replaces an
 * existing completion (provenance is immutable).
 *
 * `silent: true` also stamps celebrated_at so pre-existing-success accounts
 * (evidence observed at derivation time, checklist never/just shown) don't get
 * a first-time celebration.
 */
export async function latchCompletionServiceRole(input: {
  userId: string;
  accountId: string;
  workflowId: string;
  silent?: boolean;
}): Promise<void> {
  await ensureRow(input.userId, input.accountId);
  const supabase = getServiceRoleClient(
    `onboarding: latchCompletion ${input.userId}/${input.accountId}`,
  );
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("user_onboarding_states")
    .update({
      completed_at: now,
      completion_workflow_id: input.workflowId,
      ...(input.silent ? { celebrated_at: now } : {}),
    })
    .eq("user_id", input.userId)
    .eq("account_id", input.accountId)
    .is("completed_at", null);
  if (error) {
    throw new Error(
      `user_onboarding_states.latchCompletion failed: ${error.message}`,
    );
  }
}
