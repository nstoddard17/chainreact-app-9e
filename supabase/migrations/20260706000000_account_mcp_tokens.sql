-- ChainReactV2 — public MCP access tokens (Slice 4.PUBLIC-MCP-1).
--
-- Storage for the customer-facing MCP server (https://mcp.chainreact.app/mcp).
-- A token is the SOLE credential a customer's MCP-compatible LLM client presents
-- as `Authorization: Bearer crmcp_…`. It is account-scoped (one account_id), is
-- minted by an owner/admin, and is REVEALED EXACTLY ONCE at creation — only its
-- one-way SHA-256 hash (`token_hash`) + a non-secret display `prefix` are stored.
--
-- This table is deliberately SEPARATE from `account_api_keys`: that is the
-- workflow-TRIGGER credential (`crk_…`, scope `workflows:trigger`); this is the
-- read-only MCP product surface (`crmcp_…`, `*:read` scopes). Keeping them apart
-- means an MCP read token can never trigger a workflow and a trigger key can never
-- be presented to the MCP endpoint — the verify paths look up DIFFERENT tables.
--
-- `token_hash` must NEVER be client-readable, so — exactly like account_api_keys —
-- there is NO `authenticated` GRANT on this table. All reads flow through the
-- service-role repository (repositories/accountMcpTokens.ts) as hash-omitting
-- metadata DTOs. Writes are service-role only. The membership SELECT policy is
-- retained as defense-in-depth.
--
-- `created_by_user_id` is NOT just provenance here — the MCP verify path re-checks
-- that this user is STILL a member of `account_id` on every request (rule c). When
-- the minting user is removed from the account, the token stops working even
-- before it is explicitly revoked. ON DELETE SET NULL: a deleted user nulls the
-- column, and a null minter also fails the membership re-check (token goes dead).
--
-- ROLLBACK (pre-launch, no prod data): DROP TABLE public.account_mcp_tokens.

CREATE TABLE public.account_mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account. ON DELETE CASCADE: a token has no meaning without its account.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The user who minted the token. Provenance AND the per-request membership
  -- anchor (verify re-checks this user's membership of account_id). SET NULL on
  -- user deletion — a null minter fails the membership re-check, so the token dies.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Human label, e.g. 'Claude Desktop'.
  name text NOT NULL,

  -- DISPLAY identifier only (e.g. 'crmcp_AbCd1234'): the non-secret leading segment
  -- of the raw token. Indexed for verification narrowing; carries no authority.
  prefix text NOT NULL,

  -- sha256(raw token), hex. The raw token is NEVER stored. UNIQUE so verification
  -- is an O(1) exact-match lookup. NEVER granted to authenticated (see GRANTs).
  token_hash text NOT NULL,

  -- Least-privilege read scopes. The DB constrains values to the KNOWN set; the
  -- enabled subset is enforced in code (core/mcp/scopes.ts). All launch scopes are
  -- read-only — no scope here can mutate, trigger, or expose secrets.
  scopes text[] NOT NULL
    CONSTRAINT account_mcp_tokens_scopes_nonempty CHECK (array_length(scopes, 1) >= 1)
    CONSTRAINT account_mcp_tokens_scopes_known CHECK (
      scopes <@ ARRAY[
        'accounts:read',
        'workflows:read',
        'runs:read',
        'integrations:read'
      ]::text[]
    ),

  last_used_at timestamptz,   -- best-effort, throttled (repo touchLastUsed)
  expires_at timestamptz,     -- nullable = no expiry by default
  revoked_at timestamptz,     -- soft revoke; the verify path rejects revoked tokens

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Exact-match verification key. A sha256 collision (astronomically unlikely)
  -- would reject the second insert — acceptable; regenerate.
  CONSTRAINT account_mcp_tokens_token_hash_unique UNIQUE (token_hash)
);

-- List an account's tokens (management read path).
CREATE INDEX account_mcp_tokens_account_idx ON public.account_mcp_tokens (account_id);

-- Prefix lookup for the verify path (the prefix is non-secret).
CREATE INDEX account_mcp_tokens_prefix_idx ON public.account_mcp_tokens (prefix);

-- "Active tokens for an account" — the common management + verify filter.
CREATE INDEX account_mcp_tokens_active_idx
  ON public.account_mcp_tokens (account_id)
  WHERE revoked_at IS NULL;

CREATE TRIGGER account_mcp_tokens_set_updated_at
  BEFORE UPDATE ON public.account_mcp_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
--
-- token_hash must NEVER be client-readable, so there is NO `authenticated` GRANT
-- on this table — a SELECT as authenticated returns 42501. All reads flow through
-- the service-role repository which returns hash-omitting metadata DTOs. Writes are
-- service-role only (the owner/admin management routes call the repo). The
-- membership SELECT policy is retained as defense-in-depth.

ALTER TABLE public.account_mcp_tokens ENABLE ROW LEVEL SECURITY;

-- Data API access (explicit GRANTs required after Supabase removes implicit grants
-- on public tables, Oct 30 2026). service_role owns all access; authenticated is
-- granted NOTHING — there is no token_hash leakage path.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_mcp_tokens TO service_role;

CREATE POLICY account_mcp_tokens_select_account_member
  ON public.account_mcp_tokens
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_mcp_tokens.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
