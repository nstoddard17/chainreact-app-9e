-- ChainReactV2 — non-expiring team invitations (TEAM-INVITATION-LIFECYCLE-2).
--
-- Locked product rule: a pending invitation stays active until it is accepted,
-- canceled (revoked), or replaced by an email change. The seven-day automatic
-- expiry is removed.
--
--   1. `expires_at` becomes NULLABLE; NULL = never expires. The column is kept
--      (not dropped) so historical accepted/revoked/expired rows retain their
--      original recorded expiry for audit purposes.
--   2. Existing PENDING rows are set to NULL so no in-flight invite can lapse.
--      Historical rows (accepted/expired/revoked) are untouched — an 'expired'
--      row stays 'expired' and is never reactivated (the accept path still
--      refuses any non-pending status).
--
-- No RLS/GRANT changes: same table, same policies, writes remain service-role
-- only. Forward-only; data-safe (widens a constraint, nulls only pending rows).
--
-- ROLLBACK (would re-tighten; only valid after backfilling values):
--   UPDATE public.account_invitations SET expires_at = now() + interval '7 days' WHERE expires_at IS NULL;
--   ALTER TABLE public.account_invitations ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.account_invitations
  ALTER COLUMN expires_at DROP NOT NULL;

UPDATE public.account_invitations
  SET expires_at = NULL
  WHERE status = 'pending';
