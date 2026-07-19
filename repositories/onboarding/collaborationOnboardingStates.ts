import type { CollaborationTrack } from "@/contracts/collaborationOnboarding";
import { getServiceRoleClient } from "../supabase/serviceRoleClient";

/**
 * Repository for collaboration_onboarding_states (5.ONBOARD-4).
 *
 * Server-side only; ALL writes are service-role (the table grants `authenticated`
 * SELECT only). NON-AUTHORIZING: callers must have resolved (userId, accountId)
 * from the caller's own session and derived `track` from live account state
 * BEFORE calling here — the hard eq predicates are the scope, not the authz. In
 * particular `track` must never come from client input; a client that could choose
 * its own track could read/write another role's progress record.
 *
 * HONESTY CONTRACT: presentation state + a server-latched `completed_at` only.
 * `CollaborationPresentationPatch` has no field that can reach `completed_at`, so
 * the presentation route physically cannot forge completion. Step completion is
 * always re-derived from live account facts.
 *
 * PROGRESS ISOLATION: every function takes `track` and every predicate includes it,
 * so the owner/admin/member records for the same (user, account) are independent
 * rows that can never overwrite one another.
 */

export interface CollaborationOnboardingStateRecord {
  userId: string;
  accountId: string;
  track: CollaborationTrack;
  firstShownAt: string | null;
  dismissedAt: string | null;
  minimized: boolean;
  completedAt: string | null;
  celebratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CollaborationOnboardingStatesRow {
  user_id: string;
  account_id: string;
  track: CollaborationTrack;
  first_shown_at: string | null;
  dismissed_at: string | null;
  minimized: boolean;
  completed_at: string | null;
  celebrated_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(
  row: CollaborationOnboardingStatesRow,
): CollaborationOnboardingStateRecord {
  return {
    userId: row.user_id,
    accountId: row.account_id,
    track: row.track,
    firstShownAt: row.first_shown_at,
    dismissedAt: row.dismissed_at,
    minimized: row.minimized,
    completedAt: row.completed_at,
    celebratedAt: row.celebrated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getServiceRole(
  userId: string,
  accountId: string,
  track: CollaborationTrack,
): Promise<CollaborationOnboardingStateRecord | null> {
  const supabase = getServiceRoleClient(
    `collabOnboarding: get ${userId}/${accountId}/${track}`,
  );
  const { data, error } = await supabase
    .from("collaboration_onboarding_states")
    .select("*")
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("track", track)
    .maybeSingle<CollaborationOnboardingStatesRow>();
  if (error) {
    throw new Error(`collaboration_onboarding_states.get failed: ${error.message}`);
  }
  return data ? rowToRecord(data) : null;
}

/** Ensure a row exists (no-op when present). Returns nothing; races are benign. */
async function ensureRow(
  userId: string,
  accountId: string,
  track: CollaborationTrack,
): Promise<void> {
  const supabase = getServiceRoleClient(
    `collabOnboarding: ensureRow ${userId}/${accountId}/${track}`,
  );
  const { error } = await supabase
    .from("collaboration_onboarding_states")
    .upsert(
      { user_id: userId, account_id: accountId, track },
      { onConflict: "user_id,account_id,track", ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(
      `collaboration_onboarding_states.ensureRow failed: ${error.message}`,
    );
  }
}

/**
 * Client-writable presentation fields ONLY. Timestamps are set server-side from
 * the action verb — the client never supplies a timestamp value.
 */
export interface CollaborationPresentationPatch {
  dismissedAt?: string | null;
  minimized?: boolean;
  celebratedAt?: string;
}

export async function updatePresentationServiceRole(
  userId: string,
  accountId: string,
  track: CollaborationTrack,
  patch: CollaborationPresentationPatch,
): Promise<CollaborationOnboardingStateRecord> {
  await ensureRow(userId, accountId, track);
  const supabase = getServiceRoleClient(
    `collabOnboarding: updatePresentation ${userId}/${accountId}/${track}`,
  );
  const update: Record<string, unknown> = {};
  if (patch.dismissedAt !== undefined) update.dismissed_at = patch.dismissedAt;
  if (patch.minimized !== undefined) update.minimized = patch.minimized;
  if (patch.celebratedAt !== undefined) update.celebrated_at = patch.celebratedAt;
  const { data, error } = await supabase
    .from("collaboration_onboarding_states")
    .update(update)
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("track", track)
    .select("*")
    .single<CollaborationOnboardingStatesRow>();
  if (error) {
    throw new Error(
      `collaboration_onboarding_states.updatePresentation failed: ${error.message}`,
    );
  }
  return rowToRecord(data);
}

/** Latch first_shown_at once (only while NULL). Benign under races. */
export async function latchFirstShownServiceRole(
  userId: string,
  accountId: string,
  track: CollaborationTrack,
): Promise<void> {
  await ensureRow(userId, accountId, track);
  const supabase = getServiceRoleClient(
    `collabOnboarding: latchFirstShown ${userId}/${accountId}/${track}`,
  );
  const { error } = await supabase
    .from("collaboration_onboarding_states")
    .update({ first_shown_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("account_id", accountId)
    .eq("track", track)
    .is("first_shown_at", null);
  if (error) {
    throw new Error(
      `collaboration_onboarding_states.latchFirstShown failed: ${error.message}`,
    );
  }
}

/**
 * Latch track completion — single-winner: the conditional `completed_at IS NULL`
 * predicate makes concurrent loads idempotent (first writer wins; later calls
 * update zero rows). Never replaces an existing completion.
 *
 * Deliberately NOT read-then-write: a read of "still incomplete?" followed by an
 * unconditional update would let two concurrent requests both pass the read and
 * both stamp a completion, double-emitting the analytics event.
 *
 * `silent: true` also stamps celebrated_at, so an account whose owner setup was
 * ALREADY fully done before this checklist shipped completes historically without
 * a celebration for work they did not just do.
 *
 * Returns true only when THIS call won the update.
 */
export async function latchCompletionServiceRole(input: {
  userId: string;
  accountId: string;
  track: CollaborationTrack;
  silent?: boolean;
}): Promise<boolean> {
  await ensureRow(input.userId, input.accountId, input.track);
  const supabase = getServiceRoleClient(
    `collabOnboarding: latchCompletion ${input.userId}/${input.accountId}/${input.track}`,
  );
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("collaboration_onboarding_states")
    .update({
      completed_at: now,
      ...(input.silent ? { celebrated_at: now } : {}),
    })
    .eq("user_id", input.userId)
    .eq("account_id", input.accountId)
    .eq("track", input.track)
    .is("completed_at", null)
    .select("user_id");
  if (error) {
    throw new Error(
      `collaboration_onboarding_states.latchCompletion failed: ${error.message}`,
    );
  }
  return (data ?? []).length > 0;
}
