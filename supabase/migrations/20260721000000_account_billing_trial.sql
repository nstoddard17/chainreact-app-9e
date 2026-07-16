-- ChainReactV2 — account_billing free-trial state + atomic one-trial claim
-- (Slice PRO-TEAM-TRIAL-ENFORCEMENT-1).
--
-- Adds the ACCOUNT-scoped, permanent record of the account's ONE free trial (across Pro and
-- Team) plus the atomic claim primitive that guarantees it can be consumed at most once. The
-- trial belongs to the canonical `account_id` — NOT to a plan / price / product / subscription /
-- interval / user. The application DB (this table) is the authoritative source of whether an
-- account has consumed its trial; Stripe only EXECUTES the trial ChainReact approved.
--
-- Columns (all nullable; unset = "trial never used / eligible"):
--   - trial_consumed_at  : the PERMANENT marker. Set exactly once, when the account first begins
--                          an approved Pro/Team trial checkout. Never cleared by cancellation,
--                          subscription deletion, downgrade, webhook, or return-to-Free — only the
--                          claim RPC ever writes it, and only NULL→now(). This is THE field the
--                          one-trial rule keys on.
--   - trial_started_at   : when the trial began (mirrors consumed_at at claim time; reconciled
--                          from Stripe `trial_start` by the webhook for observability).
--   - trial_ends_at      : the trial end. Seeded at claim (now + approved days) and reconciled to
--                          Stripe's authoritative `trial_end` by the webhook. Preserving THIS value
--                          across a Pro↔Team / interval change is what "never restart/extend the
--                          trial" means; Stripe preserves it natively on in-place subscription
--                          updates, and the webhook only mirrors it (never pushes it forward here).
--   - trial_origin_plan  : which plan the one trial began on ('pro' | 'team'). Observability ONLY —
--                          it MUST NOT control whether another trial is allowed (consumed_at does).
--
-- Trial-eligibility (Pro/Team only; Business/Enterprise/Free/unknown never) lives in
-- core/billing/trialPolicy.ts (server-owned allowlist); the effective trial LENGTH is config
-- (services/billing/platformTrialPolicy.resolveTrialPeriodDays, dark default 0). This migration
-- stores state + the claim primitive; it grants no trial and turns nothing on.
--
-- RLS / GRANTs: UNCHANGED. account_billing already has a membership-gated SELECT policy +
-- table-level `GRANT SELECT TO authenticated` and NO client write policy (writes are service-role
-- only). The new columns inherit that posture exactly like the CS-2 Stripe id columns:
--   * Writes stay service-role only — the atomic claim RPC below is the ONLY writer of
--     trial_consumed_at / trial_origin_plan; a member has no write path and cannot self-grant or
--     reset a trial.
--   * These are NON-secret account-own state (booleans/timestamps), not credentials. A member may
--     read their OWN account's row (table grant + RLS), but non-members / anon get 0 rows (RLS), so
--     account isolation holds. The client-facing surfaces use a sanitized derived boolean
--     (services/billing/platformTrialPolicy.resolveTrialOffer), never the raw timestamps. A
--     column-level REVOKE was considered and rejected for the same reason as CS-2 (ineffective
--     against the table-level SELECT grant in Postgres).
--
-- BACKFILL POLICY (deliberate): existing rows are left with trial_consumed_at = NULL (all
-- accounts remain eligible for their one trial). This is the strongest EVIDENCE-based choice:
-- trials never existed before this slice (platform billing shipped with trials explicitly out of
-- scope), so NO account has ever consumed one — marking any account consumed would be fabricating
-- history. It cannot grant a REPEAT trial to anyone (there are no prior trials). Business/
-- Enterprise subscription history is NOT treated as trial usage (those plans never had a trial).
-- If, before go-live, the owner wants currently-paying Pro/Team accounts to NOT be offered a
-- trial, run a scoped one-off UPDATE (documented in the owner report) — it is intentionally not
-- baked in here.
--
-- ROLLBACK (pre-go-live; no trials granted yet):
--   DROP FUNCTION IF EXISTS public.claim_account_trial(uuid, text, timestamptz);
--   ALTER TABLE public.account_billing
--     DROP COLUMN trial_origin_plan,
--     DROP COLUMN trial_ends_at,
--     DROP COLUMN trial_started_at,
--     DROP COLUMN trial_consumed_at;

ALTER TABLE public.account_billing
  ADD COLUMN trial_consumed_at timestamptz,
  ADD COLUMN trial_started_at  timestamptz,
  ADD COLUMN trial_ends_at     timestamptz,
  ADD COLUMN trial_origin_plan text
    CONSTRAINT account_billing_trial_origin_plan_known
    CHECK (trial_origin_plan IS NULL OR trial_origin_plan IN ('pro', 'team'));

COMMENT ON COLUMN public.account_billing.trial_consumed_at IS
  'Permanent one-trial marker (account-scoped). NULL = eligible. Written only by claim_account_trial NULL->now(); never cleared.';

-- ─── Atomic one-trial claim ──────────────────────────────────────────────────────────────────
--
-- Compare-and-set: consume the account's single trial ONLY when it is currently unconsumed. The
-- `WHERE trial_consumed_at IS NULL` guard + row lock makes concurrent requests / duplicate
-- checkout submissions / retries race-safe: exactly one caller observes NULL and wins
-- (claimed=true); every other caller matches 0 rows (claimed=false) and must proceed WITHOUT a
-- trial. This is deliberately NOT a read-then-write — there is no window between the check and the
-- update.
--
-- Restricted to a server-validated Pro/Team origin plan (defense in depth: the only callers pass
-- 'pro'/'team', and the RPC RAISES on anything else so a bug can never consume a trial for an
-- ineligible plan). Business/Enterprise/Free never reach this function.
--
-- SECURITY: SECURITY DEFINER + fixed search_path; service-role ONLY (REVOKE public/anon/
-- authenticated, GRANT service_role) — mirrors the existing billing RPCs. There is no client
-- claim path.
CREATE OR REPLACE FUNCTION public.claim_account_trial(
  p_account_id uuid,
  p_origin_plan text,
  p_trial_ends_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.account_billing%ROWTYPE;
BEGIN
  -- Only Pro/Team may ever claim a trial. Fail loud on anything else (never silently no-op into
  -- a state that looks like "already consumed").
  IF p_origin_plan IS NULL OR p_origin_plan NOT IN ('pro', 'team') THEN
    RAISE EXCEPTION 'claim_account_trial: ineligible origin plan %', p_origin_plan;
  END IF;

  -- Atomic compare-and-set. Row lock via the UPDATE guarantees a single winner under
  -- concurrency; a second caller re-evaluates the guard against the just-consumed row and
  -- matches nothing.
  UPDATE public.account_billing
     SET trial_consumed_at = now(),
         trial_started_at  = now(),
         trial_ends_at     = p_trial_ends_at,
         trial_origin_plan = p_origin_plan
   WHERE account_id = p_account_id
     AND trial_consumed_at IS NULL
  RETURNING * INTO v_row;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'claimed', true,
      'trial_consumed_at', v_row.trial_consumed_at,
      'trial_ends_at', v_row.trial_ends_at,
      'trial_origin_plan', v_row.trial_origin_plan
    );
  END IF;

  -- Either the account already consumed its trial, or it has no billing row. Both → not claimed;
  -- the caller proceeds WITHOUT a trial (subscribe immediately). Re-read the existing end so an
  -- already-consumed account's original trial end is reported (never advanced).
  SELECT * INTO v_row FROM public.account_billing WHERE account_id = p_account_id;
  RETURN jsonb_build_object(
    'claimed', false,
    'trial_consumed_at', v_row.trial_consumed_at,
    'trial_ends_at', v_row.trial_ends_at,
    'trial_origin_plan', v_row.trial_origin_plan
  );
END;
$$;

-- Service-role only — never PUBLIC / anon / authenticated. The claim is a server-side chokepoint
-- (checkout), unreachable from the Data API.
REVOKE ALL ON FUNCTION public.claim_account_trial(uuid, text, timestamptz) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_account_trial(uuid, text, timestamptz) TO service_role;
