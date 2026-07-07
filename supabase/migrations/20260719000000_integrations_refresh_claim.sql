-- ChainReactV2 — cross-instance OAuth refresh claim on integrations
-- (Phase 8 / OAUTH-REFRESH-RELIABILITY-1).
--
-- Additive, null-safe SCHEMA ONLY. Two nullable columns implementing a
-- short-lived per-row claim so that ONLY ONE serverless instance performs a
-- provider token refresh for a given integration at a time. The in-process
-- single-flight lock (services/oauth/refreshLock.ts) cannot coordinate across
-- Vercel instances; for providers with SINGLE-USE ROTATING refresh tokens
-- (Airtable, Calendly, Typeform; Microsoft rotates too) a concurrent double
-- refresh kills the grant server-side (invalid_grant) or lets a stale loser
-- overwrite the winner's rotated refresh token. Design + audit:
-- docs/slices/phase-8/oauth-refresh-reliability-audit.md.
--
-- Meaning:
--   - refresh_claim_id   = random UUID minted by the instance holding the claim.
--                          NULL when no refresh is in flight.
--   - refresh_claimed_at = when the claim was taken. A claim older than the TTL
--                          (60 s, enforced in code) is stealable — protects
--                          against a crashed holder.
--
-- Writers (services/oauth/refreshWithClaim.ts via repositories/integrations):
--   - claimRefresh: conditional UPDATE (claim NULL or stale) sets both columns.
--   - releaseRefreshClaim: clears both, guarded by refresh_claim_id = own id so
--     a TTL-stolen claim is never released by the previous holder.
--
-- No token material, no provider data — a UUID + timestamp only.
--
-- No RLS change — `integrations` already enforces its existing posture (direct
-- authenticated access revoked in 20260628000000; all access is service-role
-- via gated repository methods) and additive columns inherit it. No new GRANT —
-- existing (grandfathered) table.
--
-- ROLLBACK:
--   ALTER TABLE public.integrations DROP COLUMN refresh_claim_id;
--   ALTER TABLE public.integrations DROP COLUMN refresh_claimed_at;

ALTER TABLE public.integrations
  ADD COLUMN refresh_claim_id uuid,
  ADD COLUMN refresh_claimed_at timestamptz;
