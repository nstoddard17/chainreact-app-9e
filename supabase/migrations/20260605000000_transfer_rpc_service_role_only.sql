-- ChainReactV2 — lock transfer_account_ownership to service_role only
-- (Slice 4.ACCOUNT-MODEL-TRANSFER-LEAVE-2 / TL-1 security follow-up).
--
-- The TL-1 migration (20260604000001) revoked EXECUTE from PUBLIC and granted it
-- to service_role, intending the RPC to be service-role-only. But this Supabase
-- project's default privileges (ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT
-- EXECUTE ON FUNCTIONS TO anon, authenticated, service_role) grant EXECUTE to
-- anon + authenticated on every NEW public function at creation time — and
-- `REVOKE ... FROM PUBLIC` does NOT remove those explicit per-role grants. The
-- TL-1 gated DB test caught that an authenticated (Data API) session could still
-- call transfer_account_ownership. That bypasses the route's owner + step-up
-- gate, because the SECURITY DEFINER function trusts its arguments and does not
-- check auth.uid() (by design — the trusted server service is the only intended
-- caller).
--
-- Fix: explicitly REVOKE from anon + authenticated (in addition to PUBLIC) so the
-- swap is reachable ONLY by service_role. REVOKE of an unheld privilege is a
-- harmless no-op, so this is idempotent and safe to re-run. No behavior change
-- beyond the privilege lock-down; no table / policy / data change.

REVOKE ALL ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_account_ownership(uuid, uuid, uuid) TO service_role;
