-- ChainReactV2 — public MCP request audit log (Slice 4.PUBLIC-MCP-2).
--
-- A durable, append-only record of every request handled by the public MCP server
-- (app/mcp/route.ts). One row per request: which token (by id + non-secret prefix
-- snapshot), which account, the JSON-RPC method, the tool name (for tools/call),
-- the outcome, and a short non-secret reason. It is the security-audit trail for a
-- public, internet-facing surface — "who used which token to do what, and was it
-- allowed?".
--
-- NO-LEAK INVARIANT: this table stores IDENTIFIERS + OUTCOMES ONLY. It never stores
-- tool arguments, tool results, raw tokens, token hashes, OAuth/integration tokens,
-- provider payloads, or any row content from workflows/runs/integrations. The
-- recorder (services/mcp/audit.ts) is the only writer and only passes the bounded
-- fields below.
--
-- `token_prefix` is a non-secret snapshot that SURVIVES the token being revoked /
-- deleted (the token_id FK is ON DELETE SET NULL), so the audit trail stays
-- attributable after cleanup.
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.mcp_request_audit.

CREATE TABLE public.mcp_request_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account (the token's account). ON DELETE CASCADE with the account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The MCP token used. SET NULL so the audit row outlives token revocation/delete;
  -- `token_prefix` keeps it attributable.
  token_id uuid REFERENCES public.account_mcp_tokens(id) ON DELETE SET NULL,

  -- Non-secret display prefix snapshot (e.g. 'crmcp_AbCd1234'). Never the raw token.
  token_prefix text,

  -- JSON-RPC method, e.g. 'tools/call', 'tools/list', 'initialize'.
  method text NOT NULL,

  -- Tool name for a tools/call (e.g. 'list_workflows'); NULL for non-tool methods.
  tool text,

  -- Coarse outcome. Bounded set; the CHECK keeps it stable + greppable.
  outcome text NOT NULL CONSTRAINT mcp_request_audit_outcome_known CHECK (
    outcome IN ('ok', 'denied', 'not_found', 'rate_limited', 'error', 'unauthorized')
  ),

  -- Short, non-secret machine reason (e.g. 'insufficient_scope', 'unknown_tool').
  -- NEVER a raw provider error, stack trace, token, or row content.
  reason text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Account-scoped, newest-first reads (a future "recent MCP activity" panel).
CREATE INDEX mcp_request_audit_account_idx
  ON public.mcp_request_audit (account_id, created_at DESC);

ALTER TABLE public.mcp_request_audit ENABLE ROW LEVEL SECURITY;

-- Members may READ their account's audit log (display-only fields). Writes are
-- service-role only (the public route has no user session). Required Data API
-- GRANTs.
GRANT SELECT ON public.mcp_request_audit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_request_audit TO service_role;

CREATE POLICY mcp_request_audit_select_account_member
  ON public.mcp_request_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = mcp_request_audit.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
