-- ChainReactV2 — FLEETIO-1 / credential_paste: named extra credentials on integrations.
--
-- Additive nullable column for multi-credential providers (`authFlow:
-- "credential_paste"` — inaugural consumer: Fleetio, whose wire auth is TWO
-- user-entered secrets: `Authorization: Token <apiKey>` + `Account-Token`).
--
-- Semantics (contract: contracts/integration.ts `EncryptedTokens.extraCredentialsEncrypted`):
--   - The provider-designated PRIMARY credential stays in `access_token_encrypted`
--     exactly as before (for Fleetio: the API key — literally the Authorization
--     header token). That column's single-credential contract is unchanged.
--   - EVERY other named credential the user entered lives here as ONE
--     application-layer AES-256-GCM ciphertext (core/encryption/tokens.ts) of the
--     JSON object `{ [credentialFieldId]: plaintextValue }`. Never plaintext,
--     never a per-field mix of encrypted and clear values.
--   - NULL for every OAuth / token-ingest / token-paste provider — existing rows
--     and providers are untouched.
--
-- Why a column here and not a new table: the value shares the integration row's
-- entire lifecycle (upsert on connect/reconnect, cleared on disconnect, gone on
-- purge/cascade), its RLS posture (membership SELECT policy; authenticated
-- Data-API SELECT already revoked by 20260628000000 — V2-READY-47D — so the
-- ciphertext can never transit PostgREST), and its access path (service-role
-- repository only). A side table would duplicate all of that for no gain.
--
-- No RLS / GRANT changes: the table already has RLS enabled with policies, and
-- this migration creates no table. The new column inherits the existing posture.
--
-- ROLLBACK (pre-launch, no dependent data):
--   ALTER TABLE public.integrations DROP COLUMN extra_credentials_encrypted;

ALTER TABLE public.integrations
  ADD COLUMN extra_credentials_encrypted text;

COMMENT ON COLUMN public.integrations.extra_credentials_encrypted IS
  'AES-256-GCM ciphertext (app layer) of JSON {credentialFieldId: value} holding a credential_paste provider''s non-primary named credentials. NULL for single-credential providers.';
