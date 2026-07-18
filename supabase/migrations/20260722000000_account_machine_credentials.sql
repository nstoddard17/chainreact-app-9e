-- ChainReactV2 — account-scoped machine (client_credentials + mTLS) credentials.
--
-- Provider-neutral storage for the net-new "machine credential" auth flow: a
-- server-to-server OAuth 2.0 client_credentials grant whose token endpoint AND
-- API endpoints require a client certificate at the TLS layer (mutual TLS).
-- First consumer: ADP (ADP Marketplace / API Central). NO provider is wired to
-- this table yet — it is inert infrastructure until the ADP provider ships and
-- is enabled.
--
-- Why a NEW table rather than reusing `integrations`:
--   - `integrations` stores ONE encrypted access token (+ optional refresh token)
--     issued by a user-redirect OAuth flow. Machine credentials are a DIFFERENT
--     secret set — client_id, client_secret, a client certificate, AND its private
--     key — plus a short-lived minted token cache. That does not fit the single
--     `access_token_encrypted` column, and mixing them would weaken the very clear
--     `integrations` contract the whole app depends on.
--   - Rotation/replacement of the certificate + secret is a first-class need here
--     (WS certificates expire); `integrations` has no rotation/audit surface.
--
-- Secret handling (mirrors `account_mcp_tokens`): every secret column holds an
-- AES-256-GCM ciphertext produced by core/encryption/tokens.ts BEFORE it reaches
-- the DB. There is NO `authenticated` GRANT on this table — a client SELECT
-- returns 42501 — so an encrypted secret can never transit the Data API. All
-- access flows through the service-role repository, which returns hash/secret-
-- omitting metadata DTOs to any client surface. The membership SELECT policy is
-- retained as defense-in-depth.
--
-- ROLLBACK (pre-launch, no prod data):
--   DROP TABLE public.machine_credential_audit;
--   DROP TABLE public.account_machine_credentials;

CREATE TABLE public.account_machine_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owning account. ON DELETE CASCADE: a credential has no meaning without it.
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The human who connected/last-rotated the credential. Provenance only (this is
  -- an ACCOUNT/service credential — usable account-wide, unlike a personal token).
  -- SET NULL on user deletion.
  connected_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Provider id (e.g. 'adp'). Matches integrations.provider naming.
  provider text NOT NULL,

  -- Optional human label, e.g. 'ADP Workforce Now (production)'.
  label text,

  -- ── Encrypted secret material (AES-256-GCM ciphertext; never plaintext) ──────
  -- client_id is not always strictly secret, but is encrypted uniformly so no
  -- credential component is ever stored in the clear.
  client_id_encrypted text NOT NULL,
  client_secret_encrypted text NOT NULL,
  cert_pem_encrypted text NOT NULL,
  key_pem_encrypted text NOT NULL,

  -- Short-lived minted access-token cache (DB-backed, not in-memory). Re-minted on
  -- expiry / 401. Nullable: empty until the first successful mint.
  cached_access_token_encrypted text,
  cached_token_expires_at timestamptz,

  -- ── Non-secret certificate metadata (display / audit / rotation detection) ───
  -- Safe to store in the clear and to surface in a DTO.
  cert_fingerprint256 text NOT NULL,
  cert_subject text,
  cert_not_after timestamptz NOT NULL,

  -- Non-secret provider config (base API url, token url, environment 'iat'|'prod',
  -- product edition). NEVER holds a secret — enforced by the repository/service.
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  disconnected_at timestamptz,        -- soft disconnect
  rotated_at timestamptz,             -- last cert/secret rotation

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- At most one ACTIVE credential per (account, provider).
CREATE UNIQUE INDEX account_machine_credentials_active_unique
  ON public.account_machine_credentials (account_id, provider)
  WHERE disconnected_at IS NULL;

CREATE INDEX account_machine_credentials_account_idx
  ON public.account_machine_credentials (account_id);

CREATE TRIGGER account_machine_credentials_set_updated_at
  BEFORE UPDATE ON public.account_machine_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Audit trail ──────────────────────────────────────────────────────────────
-- Append-only record of credential lifecycle + token-mint outcomes. Carries NO
-- secret material — only ids, a bounded event label, and a non-secret `detail`
-- jsonb (fingerprint, cert expiry, redacted error code, environment).

CREATE TABLE public.machine_credential_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,

  -- The credential this event concerns. SET NULL if the credential row is later
  -- hard-deleted (audit outlives the row).
  credential_id uuid REFERENCES public.account_machine_credentials(id) ON DELETE SET NULL,

  provider text NOT NULL,

  -- Who acted; NULL for system/engine-initiated events (e.g. a token re-mint
  -- during a workflow run).
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  event text NOT NULL
    CONSTRAINT machine_credential_audit_event_known CHECK (
      event IN (
        'created',
        'rotated',
        'disconnected',
        'mint_succeeded',
        'mint_failed',
        'validation_failed'
      )
    ),

  -- Non-secret context only. Repository/service guarantee no secret lands here.
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX machine_credential_audit_account_idx
  ON public.machine_credential_audit (account_id, created_at DESC);

CREATE INDEX machine_credential_audit_credential_idx
  ON public.machine_credential_audit (credential_id);

-- ── RLS + GRANTs ─────────────────────────────────────────────────────────────
-- Both tables: service_role owns all access; authenticated is granted NOTHING at
-- the Data API layer (no secret/audit leakage path). Membership SELECT policies
-- are retained as defense-in-depth (identical rationale to account_mcp_tokens).

ALTER TABLE public.account_machine_credentials ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_machine_credentials TO service_role;

CREATE POLICY account_machine_credentials_select_account_member
  ON public.account_machine_credentials
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_machine_credentials.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );

ALTER TABLE public.machine_credential_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.machine_credential_audit TO service_role;

CREATE POLICY machine_credential_audit_select_account_member
  ON public.machine_credential_audit
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = machine_credential_audit.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
