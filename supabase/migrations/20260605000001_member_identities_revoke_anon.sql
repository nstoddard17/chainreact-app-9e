-- ChainReactV2 — least-privilege: drop anon EXECUTE on get_account_member_identities
-- (Slice 4.SECURITY-RPC-EXECUTE-AUDIT-FIX).
--
-- The RPC-execute audit (docs/slices/phase-4/security-rpc-execute-audit.md) found
-- get_account_member_identities reachable by `anon`: its defining migration
-- (20260602000000 / ...001) revoked only FROM PUBLIC and granted authenticated, so
-- this project's default privileges (GRANT EXECUTE ON FUNCTIONS TO anon, authenticated,
-- service_role) left the per-role anon grant in place. The function already self-gates
-- (RAISE 42501 unless public.is_account_member(p_account_id)), and an anon caller has no
-- auth.uid() membership, so this was NOT a live data leak — purely a least-privilege gap.
--
-- This migration revokes anon explicitly and re-asserts the intended grants. It does NOT
-- touch the function body, the Team roster behavior, or any RLS policy. Idempotent
-- (REVOKE of an unheld privilege is a no-op; GRANT is repeatable).

REVOKE ALL ON FUNCTION public.get_account_member_identities(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_account_member_identities(uuid) TO authenticated, service_role;
