-- ChainReactV2 — purpose-bound sensitive-action challenges.
-- system-table: sensitive_action_challenges — server-issued destructive-action
-- authorization challenges; service-role only, never readable by a client.
--
-- ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1.
--
-- WHY THIS EXISTS
-- Account deletion used to require the caller's ChainReact PASSWORD as its
-- step-up. That is impossible to satisfy for a user who signed up with Google,
-- with an email OTP, or (later) with SSO — those accounts may have no password
-- at all, so the only irreversible action in the product was unreachable for
-- them. This table backs the replacement: ONE universal flow in which every
-- authenticated user confirms a destructive action with a short-lived numeric
-- code emailed to the verified address already on their auth identity.
--
-- It is deliberately generic in shape (a `purpose` column) but closed in fact:
-- the CHECK allows exactly one purpose today. A future destructive action reuses
-- the table by extending the CHECK — it must never reuse an EXISTING purpose,
-- because a challenge authorizes precisely the action it was minted for.
--
-- WHAT IS AND IS NOT STORED
--   - NEVER the plaintext code. `code_verifier` is
--     HMAC-SHA256(server pepper, "<purpose>:<user>:<challenge id>:<code>") in hex
--     (core/security/sensitiveActionChallenge.ts). A six-digit code has ~20 bits
--     of entropy, so a plain unsalted SHA-256 would be trivially reversible from
--     a database leak; the server-only pepper (SENSITIVE_ACTION_CHALLENGE_KEY,
--     which never touches the database) is what makes the digest safe to store.
--   - NEVER the destination email or the raw session id. Both are stored as
--     keyed digests, so the row proves "same address / same session" without
--     holding a live session identifier or PII.
--
-- ACCESS
-- Service-role only. There is NO `authenticated` GRANT, and the RLS policy denies
-- every client operation outright, so a stolen anon key cannot read attempt
-- counts, enumerate outstanding challenges, or observe that a deletion is being
-- attempted. All reads/writes flow through repositories/sensitiveActionChallenges.ts.
--
-- CLEANUP
-- Opportunistic: the create path deletes the calling user's own expired/settled
-- rows. No cron — the table is tiny, bounded by the per-user send cap, and a
-- stale row is inert (every consume re-checks expiry).
--
-- ROLLBACK (additive, nothing reads it until the app deploys):
--   DROP TABLE public.sensitive_action_challenges;

CREATE TABLE public.sensitive_action_challenges (
  -- Opaque challenge id. Supplied by the application (crypto.randomUUID) rather
  -- than defaulted, because the id is an INPUT to the code verifier's HMAC — it
  -- must be known before the digest is computed.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The authenticated user this challenge belongs to. CASCADE: a challenge has
  -- no meaning without its user, and the account purge deletes auth.users last.
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- The single action this challenge may authorize. A verified `delete_account`
  -- challenge authorizes account deletion and nothing else.
  purpose text NOT NULL
    CONSTRAINT sensitive_action_challenges_purpose_known CHECK (
      purpose IN ('delete_account')
    ),

  -- Keyed digest of the auth session id the challenge was issued to. A code
  -- requested in one session cannot authorize the action from another session.
  session_binding text NOT NULL,

  -- Keyed digest of the verified account email the code was SENT to. Re-derived
  -- at verify/consume time: if the user's primary email changed in between, the
  -- digests disagree and the challenge is refused.
  email_binding text NOT NULL,

  -- HMAC of the code (see header). Never a plaintext code, never a bare SHA-256.
  code_verifier text NOT NULL,

  expires_at timestamptz NOT NULL,

  -- Online-guessing cap. `attempt_count` is incremented on every WRONG code;
  -- reaching `max_attempts` locks the challenge permanently (a new code must be
  -- requested). max_attempts is a column, not a constant, so the policy that was
  -- in force for a given challenge stays visible in the row.
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5
    CONSTRAINT sensitive_action_challenges_max_attempts_positive CHECK (max_attempts > 0),

  -- Set once when the correct code is submitted, together with the short window
  -- during which the resulting authorization may be spent.
  verified_at timestamptz,
  verification_expires_at timestamptz,

  -- Set when the authorization is SPENT. The atomic compare-and-set on this
  -- column (UPDATE … WHERE consumed_at IS NULL) is what makes a challenge
  -- single-use and makes a replay fail.
  consumed_at timestamptz,

  -- Set when a challenge is superseded (a newer code was requested) or when its
  -- email could not be delivered. An invalidated row can never be verified or
  -- consumed — this is how "requesting a new code invalidates the previous one"
  -- and "a failed send creates no usable authorization" are enforced durably.
  invalidated_at timestamptz,

  -- Resend throttling + the durable per-user send cap.
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  send_count integer NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- A verification window only exists once verification happened.
  CONSTRAINT sensitive_action_challenges_verification_window_paired CHECK (
    (verified_at IS NULL AND verification_expires_at IS NULL)
    OR (verified_at IS NOT NULL AND verification_expires_at IS NOT NULL)
  )
);

-- The hot lookup: the newest still-open challenge for (user, purpose). Also the
-- index the durable send-rate query and the opportunistic cleanup ride on.
CREATE INDEX sensitive_action_challenges_user_purpose_idx
  ON public.sensitive_action_challenges (user_id, purpose, created_at DESC);

CREATE INDEX sensitive_action_challenges_expires_idx
  ON public.sensitive_action_challenges (expires_at);

CREATE TRIGGER sensitive_action_challenges_set_updated_at
  BEFORE UPDATE ON public.sensitive_action_challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Deny-all for every Data API role; service_role (which bypasses RLS) is the
-- only accessor. Even the subject user must not read their own challenge row:
-- it carries the attempt count and lifecycle of an in-flight destructive-action
-- authorization, and there is no product reason for a client to see it.

ALTER TABLE public.sensitive_action_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY sensitive_action_challenges_no_client_access
  ON public.sensitive_action_challenges
  FOR ALL USING (false) WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.sensitive_action_challenges TO service_role;
