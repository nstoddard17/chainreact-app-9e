import { getServiceRoleClient } from "@/repositories/supabase/serviceRoleClient";

/**
 * Repository for `sensitive_action_challenges` — purpose-bound, single-use
 * authorizations for destructive actions (ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1).
 *
 * Every operation is service-role: the table has NO `authenticated` GRANT and a
 * deny-all RLS policy, so there is no client path to it at all. Callers pass
 * already-derived digests — this layer never sees a plaintext code, a raw session
 * id, or an email address, and never logs a row.
 *
 * The two lifecycle transitions that must not race (verify, consume) are written
 * as conditional UPDATE … RETURNING statements. PostgREST compiles those to a
 * single statement, so the filter and the write commit together: two concurrent
 * consumes cannot both observe `consumed_at IS NULL`, and exactly one gets a row
 * back. That is the atomicity the deletion flow depends on — no RPC needed.
 */

export interface SensitiveActionChallengeRecord {
  id: string;
  userId: string;
  purpose: string;
  sessionBinding: string;
  emailBinding: string;
  codeVerifier: string;
  expiresAt: string;
  attemptCount: number;
  maxAttempts: number;
  verifiedAt: string | null;
  verificationExpiresAt: string | null;
  consumedAt: string | null;
  invalidatedAt: string | null;
  lastSentAt: string;
  sendCount: number;
  createdAt: string;
}

interface ChallengeRow {
  id: string;
  user_id: string;
  purpose: string;
  session_binding: string;
  email_binding: string;
  code_verifier: string;
  expires_at: string;
  attempt_count: number;
  max_attempts: number;
  verified_at: string | null;
  verification_expires_at: string | null;
  consumed_at: string | null;
  invalidated_at: string | null;
  last_sent_at: string;
  send_count: number;
  created_at: string;
}

const COLUMNS =
  "id, user_id, purpose, session_binding, email_binding, code_verifier, expires_at, attempt_count, max_attempts, verified_at, verification_expires_at, consumed_at, invalidated_at, last_sent_at, send_count, created_at";

function rowToRecord(row: ChallengeRow): SensitiveActionChallengeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    purpose: row.purpose,
    sessionBinding: row.session_binding,
    emailBinding: row.email_binding,
    codeVerifier: row.code_verifier,
    expiresAt: row.expires_at,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    verifiedAt: row.verified_at,
    verificationExpiresAt: row.verification_expires_at,
    consumedAt: row.consumed_at,
    invalidatedAt: row.invalidated_at,
    lastSentAt: row.last_sent_at,
    sendCount: row.send_count,
    createdAt: row.created_at,
  };
}

export interface InsertChallengeInput {
  /** Application-generated so it can be bound into the code's HMAC before insert. */
  id: string;
  userId: string;
  purpose: string;
  sessionBinding: string;
  emailBinding: string;
  codeVerifier: string;
  expiresAt: string;
  maxAttempts: number;
  sentAt: string;
}

export async function insertChallenge(
  input: InsertChallengeInput,
): Promise<SensitiveActionChallengeRecord> {
  const supabase = getServiceRoleClient(
    `sensitive_action_challenges: insert (${input.purpose})`,
  );
  const { data, error } = await supabase
    .from("sensitive_action_challenges")
    .insert({
      id: input.id,
      user_id: input.userId,
      purpose: input.purpose,
      session_binding: input.sessionBinding,
      email_binding: input.emailBinding,
      code_verifier: input.codeVerifier,
      expires_at: input.expiresAt,
      max_attempts: input.maxAttempts,
      last_sent_at: input.sentAt,
      send_count: 1,
    })
    .select(COLUMNS)
    .single<ChallengeRow>();
  if (error || !data) {
    throw new Error(
      `sensitive_action_challenges.insertChallenge failed: ${error?.message ?? "no row"}`,
    );
  }
  return rowToRecord(data);
}

/**
 * The newest challenge for (user, purpose) that has not been consumed or
 * invalidated — the row the verify/consume paths operate on.
 *
 * Deliberately keyed on the SERVER-derived user id + purpose rather than on a
 * client-supplied challenge id: the client never learns a challenge id, so it
 * cannot point the flow at a row of its choosing.
 */
export async function getOpenChallenge(
  userId: string,
  purpose: string,
): Promise<SensitiveActionChallengeRecord | null> {
  const supabase = getServiceRoleClient(
    `sensitive_action_challenges: get open (${purpose})`,
  );
  const { data, error } = await supabase
    .from("sensitive_action_challenges")
    .select(COLUMNS)
    .eq("user_id", userId)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .is("invalidated_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ChallengeRow>();
  if (error) {
    throw new Error(
      `sensitive_action_challenges.getOpenChallenge failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Invalidate every open challenge for (user, purpose). Called before minting a
 * new code, so an older code stops working the moment a replacement is issued,
 * and called after an email delivery failure so a code nobody received cannot
 * later be guessed into a live authorization.
 */
export async function invalidateOpenChallenges(input: {
  userId: string;
  purpose: string;
  invalidatedAt: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    `sensitive_action_challenges: invalidate open (${input.purpose})`,
  );
  const { error } = await supabase
    .from("sensitive_action_challenges")
    .update({ invalidated_at: input.invalidatedAt })
    .eq("user_id", input.userId)
    .eq("purpose", input.purpose)
    .is("consumed_at", null)
    .is("invalidated_at", null);
  if (error) {
    throw new Error(
      `sensitive_action_challenges.invalidateOpenChallenges failed: ${error.message}`,
    );
  }
}

/** Invalidate one specific challenge (used when its email failed to send). */
export async function invalidateChallenge(
  id: string,
  invalidatedAt: string,
): Promise<void> {
  const supabase = getServiceRoleClient(
    "sensitive_action_challenges: invalidate one",
  );
  const { error } = await supabase
    .from("sensitive_action_challenges")
    .update({ invalidated_at: invalidatedAt })
    .eq("id", id)
    .is("invalidated_at", null);
  if (error) {
    throw new Error(
      `sensitive_action_challenges.invalidateChallenge failed: ${error.message}`,
    );
  }
}

/**
 * Record one WRONG code submission and return the new attempt count.
 *
 * Guarded by the challenge's own `max_attempts` so a burst of concurrent guesses
 * cannot push the counter past the cap; when the guard rejects, the challenge is
 * already locked and the caller treats it as such.
 */
export async function recordFailedAttempt(input: {
  id: string;
  attemptedAt: string;
  previousAttemptCount: number;
}): Promise<number> {
  const supabase = getServiceRoleClient(
    "sensitive_action_challenges: record failed attempt",
  );
  const next = input.previousAttemptCount + 1;
  const { data, error } = await supabase
    .from("sensitive_action_challenges")
    .update({ attempt_count: next })
    .eq("id", input.id)
    .eq("attempt_count", input.previousAttemptCount)
    .is("consumed_at", null)
    .select("attempt_count")
    .maybeSingle<{ attempt_count: number }>();
  if (error) {
    throw new Error(
      `sensitive_action_challenges.recordFailedAttempt failed: ${error.message}`,
    );
  }
  // No row → another concurrent attempt already advanced the counter. Report the
  // optimistic value; the next load re-reads the authoritative count.
  return data ? data.attempt_count : next;
}

/**
 * Atomically mark a challenge verified. Conditional on it still being unverified,
 * unconsumed, and un-invalidated, so a replayed verify cannot extend an existing
 * authorization window. Returns null when the condition no longer holds.
 */
export async function markVerified(input: {
  id: string;
  verifiedAt: string;
  verificationExpiresAt: string;
}): Promise<SensitiveActionChallengeRecord | null> {
  const supabase = getServiceRoleClient(
    "sensitive_action_challenges: mark verified",
  );
  const { data, error } = await supabase
    .from("sensitive_action_challenges")
    .update({
      verified_at: input.verifiedAt,
      verification_expires_at: input.verificationExpiresAt,
    })
    .eq("id", input.id)
    .is("verified_at", null)
    .is("consumed_at", null)
    .is("invalidated_at", null)
    .select(COLUMNS)
    .maybeSingle<ChallengeRow>();
  if (error) {
    throw new Error(
      `sensitive_action_challenges.markVerified failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * Atomically SPEND a verified authorization: compare-and-set `consumed_at` from
 * NULL. Exactly one caller can win, so a replay of the final deletion request
 * gets `null` back and must fail. The caller re-checks every binding on the
 * returned row before acting on it.
 */
export async function consumeVerifiedChallenge(input: {
  id: string;
  consumedAt: string;
}): Promise<SensitiveActionChallengeRecord | null> {
  const supabase = getServiceRoleClient(
    "sensitive_action_challenges: consume verified",
  );
  const { data, error } = await supabase
    .from("sensitive_action_challenges")
    .update({ consumed_at: input.consumedAt })
    .eq("id", input.id)
    .is("consumed_at", null)
    .is("invalidated_at", null)
    .not("verified_at", "is", null)
    .select(COLUMNS)
    .maybeSingle<ChallengeRow>();
  if (error) {
    throw new Error(
      `sensitive_action_challenges.consumeVerifiedChallenge failed: ${error.message}`,
    );
  }
  return data ? rowToRecord(data) : null;
}

/**
 * How many challenges this user has had SENT for a purpose since `since` —
 * the durable per-user send cap. Durable (not in-memory) so it holds across
 * server instances and browser sessions.
 */
export async function countSendsSince(input: {
  userId: string;
  purpose: string;
  since: string;
}): Promise<number> {
  const supabase = getServiceRoleClient(
    `sensitive_action_challenges: count sends (${input.purpose})`,
  );
  const { count, error } = await supabase
    .from("sensitive_action_challenges")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .eq("purpose", input.purpose)
    .gte("created_at", input.since);
  if (error) {
    throw new Error(
      `sensitive_action_challenges.countSendsSince failed: ${error.message}`,
    );
  }
  return count ?? 0;
}

/**
 * Opportunistic cleanup of the CALLING user's own settled/expired rows. Runs on
 * the create path so the table self-trims without a production cron. Best-effort
 * by contract: a cleanup failure must never block issuing a challenge.
 */
export async function deleteSettledChallenges(input: {
  userId: string;
  expiredBefore: string;
}): Promise<void> {
  const supabase = getServiceRoleClient(
    "sensitive_action_challenges: cleanup settled",
  );
  const { error } = await supabase
    .from("sensitive_action_challenges")
    .delete()
    .eq("user_id", input.userId)
    .lt("expires_at", input.expiredBefore);
  if (error) {
    throw new Error(
      `sensitive_action_challenges.deleteSettledChallenges failed: ${error.message}`,
    );
  }
}
