# DEV-CONNECTION-TRANSPLANT-UTILITY-1 — audit, classification & design

Owner-operated utility that copies **explicitly selected** integration
credentials from an old ChainReact test account in the **production** database
into a designated account in the **hosted development** database
(`chainreact-dev`), so Gmail/Slack/Microsoft/Google/etc. don't have to be
reconnected by hand for development and React Agent certification.

Not a customer-data migration tool. Source is strictly read-only; destination
is strictly the dev project; every check fails closed.

- Code: [`scripts/integrations-transplant/`](../../../../scripts/integrations-transplant/)
- Runbook: [`docs/runbooks/integration-transplant.md`](../../../runbooks/integration-transplant.md)
- Tests: `tests/unit/scripts/integrationsTransplant/` + `tests/unit/core/encryption/tokens-explicit-key.test.ts`

## Phase 1 — integration persistence audit (verified 2026-08-04)

Verified against migrations, `types/database.types.ts`, and the live repository
code. Key contract facts:

- `integrations` columns: `id`, `account_id` (NOT NULL, owner), `connected_by_user_id`
  (nullable provenance), `provider`, `provider_account_id` (NOT NULL multi-account
  discriminator), `display_name`, `access_token_encrypted` (NOT NULL),
  `refresh_token_encrypted`, `access_token_expires_at`,
  `extra_credentials_encrypted` (credential_paste blob), `scopes text[]`,
  `account_metadata jsonb`, `disconnected_at`, `integration_sharing_scope`,
  `needs_reconnect_at`, `refresh_claim_id`/`refresh_claimed_at`, timestamps.
- Unique: `(account_id, provider, provider_account_id) WHERE disconnected_at IS NULL`
  (`integrations_account_active_unique`).
- **`authenticated` has ZERO grants on `integrations`** — every read/write is
  service-role. Canonical write: `repositories/integrations.upsertActive`
  (INSERT, or **in-place UPDATE** of the same active tuple = the canonical
  reconnect behavior; `connected_by_user_id` preserved on update).
- Encryption: `core/encryption/tokens.ts`, AES-256-GCM,
  `base64(iv‖tag‖ciphertext)`, single env key `TOKEN_ENCRYPTION_KEY`, **no
  version byte, no rotation support** — a cross-environment ciphertext copy is
  undecryptable by design (each environment has its own key).
- **No table has a foreign key to `integrations`.** `trigger_resources`
  (per-workflow trigger lifecycle; its `account_id` is a TEXT provider scope,
  not V2 accounts), `webhook_event_dedup`, and `oauth_states` are fully
  separate — copying an integration row cannot drag trigger/webhook/OAuth
  state along, and the utility never touches those tables (structure-tested).
- Env guard: `scripts/lib/env-target.mjs` — hardcoded production ref denylist,
  two-declaration agreement via `CHAINREACT_DB_TARGET`; the dev lane's vars are
  `SUPABASE_DEV_PROJECT_REF` / `SUPABASE_DEV_URL` / `SUPABASE_DEV_SERVICE_ROLE_KEY`
  in gitignored `.env.development.local`.

### Concern table

| Concern | Canonical owner | Source fields | Destination behavior | Transplant risk |
|---|---|---|---|---|
| Account ownership | `integrations.account_id` | read for ownership check only | destination account id (config) | copying source id would corrupt dev ownership — never copied |
| Connect provenance | `connected_by_user_id` | read only | destination user id (config) | source user does not exist in dev — never copied |
| Primary key | `id` | read for selection/reporting | new dev-generated uuid via canonical insert | copying would collide/leak — never copied |
| Credentials | `access_token_encrypted`, `refresh_token_encrypted`, `extra_credentials_encrypted` | decrypted in memory with SOURCE key | re-encrypted with DEV key via explicit-key seam | ciphertext copy would be undecryptable; plaintext handled memory-only |
| Scopes / expiry / metadata / label | `scopes`, `access_token_expires_at`, `account_metadata`, `display_name`, `provider_account_id` | copied | copied verbatim (identity + viability data) | low — no secrets by contract (`account_metadata` is token-free per token-ingest rule doc) |
| Health / lifecycle | `disconnected_at`, `needs_reconnect_at`, refresh-claim cols | filtered (active only) | column defaults (NULL) | copying would import stale prod health — never copied |
| Sharing scope | `integration_sharing_scope` | not read | default NULL (private) | dev decides sharing fresh |
| Trigger state | `trigger_resources`, `webhook_event_dedup` | never read | never written; dev workflows re-activate fresh | copying would point dev at prod webhooks/cursors — banned + structure-tested |
| OAuth state / PKCE | `oauth_states` | never read | never written | n/a |
| Timestamps | `created_at` / `updated_at` | not copied | dev-generated | audit honesty |

## Phase 2 — provider transplant classification

Encoded in [`classification.ts`](../../../../scripts/integrations-transplant/classification.ts)
(the runtime source of truth — unknown providers fail closed as unsupported).
Grounding facts from the code audit:

1. **Every OAuth provider reads one flat `<PROVIDER>_CLIENT_ID`/`_CLIENT_SECRET`
   env pair at call time — zero per-environment branching** (`_shared/google/oauth.ts`,
   `_shared/microsoft/oauth.ts`, etc.). Whether dev refreshes a prod-minted
   refresh token therefore depends ONLY on whether the dev deployment is
   configured with the same OAuth app. The utility cannot read Vercel env
   config, so this is an **owner attestation** (`sharedOAuthClientProviders`)
   — without it, an OAuth transplant caps at `refresh_unverified`.
2. **Rotating refresh tokens** (single-use or rolling): the first dev refresh
   can invalidate the token the production row still holds — a provider-side
   effect on the source account. These providers require the explicit
   `acknowledgeRotationRiskProviders` config gate.
3. The refresh path (`services/oauth/dispatcher.refresh` → provider
   `refreshToken(refreshTokenPlaintext)`) has no per-row client selection —
   an incompatible-client transplant fails with `invalid_grant` →
   `needs_reconnect_at` in dev, exactly the honest outcome.

| Provider | Auth type | Refreshable | OAuth-client bound | Rotating refresh | Multi-account risk | Verification method | Class | Reason (short) |
|---|---|---|---|---|---|---|---|---|
| fleetio | credential_paste | no | no | no | no | GET /accounts + Account-Token match | **A** | standalone key pair |
| github | oauth | no | no | no | no | GET /user | **A** | non-expiring standalone token |
| notion | oauth | no | no | no | no | GET /v1/users/me | **A** | standalone workspace token |
| shopify | oauth | no | no | no | no | GET shop.json | **A** | shop-bound offline token |
| mailchimp | oauth | no | no | no | no | oauth2/metadata + API root | **A** | non-expiring token |
| facebook | oauth | no | no | no | no | GET /me | **A** | long-lived (~60d) token |
| eden | token_paste | no | no | no | **yes** (constant id) | none (MCP handshake only) | **A**\* | pasted PAT; no lightweight probe → lenient mode only |
| gmail + 5 google-* | oauth | yes | **yes** (shared `GOOGLE_CLIENT_ID`) | no | no | gmail profile / OIDC userinfo | **B** | client-bound refresh |
| microsoft-* (7) | oauth | yes | **yes** (shared `MICROSOFT_CLIENT_ID`) | **yes** | no | Graph /me (powerbi: token-acceptance only) | **B** | client-bound rotating refresh |
| slack | oauth | yes | yes | opt-in per app | no | auth.test (team_id) | **B** | app-bound tokens |
| hubspot / monday / dropbox / asana / stripe | oauth | yes | yes | no | no | introspection / me endpoints | **B** | client-bound refresh |
| airtable / typeform / calendly / quickbooks / motive / linear / discord | oauth | yes | yes | **yes** (single-use/rolling) | no | whoami / me / companyinfo / viewer | **B** | rotation risk gate required |
| trello | token_ingest | no | **yes** (key+token pair on every call) | no | no | GET /1/members/me | **B** | needs same `TRELLO_CLIENT_ID` in dev |
| adp | machine_credentials | no | yes | no | no | none | **D** | mTLS cert+key in `account_machine_credentials`, outside the integrations contract — manual dev onboarding only |

\* Category C (webhook/polling lifecycle state exists) is an overlay flag
(`hasTriggerLifecycleState`) on the providers above — credentials-only
transplant is the ONLY mode for everyone; dev trigger resources are created by
normal workflow activation, never copied.

## Design decisions (why it's shaped this way)

1. **One production-detection system.** The CLI injects `resolveDbTarget` /
   `PRODUCTION_PROJECT_REF` / `PROTECTED_REFS` from `scripts/lib/env-target.mjs`
   (typed via new `.d.mts` declarations). The transplant adds only the
   composition "dest = guarded development, source = exactly the approved
   production ref, source ≠ dest" — plus a belt-and-braces production check
   that holds even if the injected guard were permissive (tested).
2. **Global env is pinned to dev.** After the pure-env preflight, the process
   globals (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `TOKEN_ENCRYPTION_KEY`) are set ONCE to verified dev values. The canonical
   repositories — the only write path — can therefore only reach dev, and the
   canonical `decryptToken` is literally the dev-runtime read path used for
   post-write verification. Production exists only inside the read-only source
   adapter (a Proxy that structurally denies insert/update/delete/upsert/rpc/
   auth/storage, including on chained builders).
3. **Explicit-key crypto seam, no second implementation.**
   `core/encryption/tokens.ts` gained pure `encryptTokenWithKey` /
   `decryptTokenWithKey` / `parseTokenEncryptionKey`; the env-bound functions
   delegate to them unchanged (existing suites untouched and green). Source
   decrypt uses the source key Buffer; dest encrypt uses the dev key Buffer;
   no `process.env` flip-flopping.
4. **Conflicts fail closed.** Default strategy `fail`; `skip` and
   `replace-after-verification` are explicit. Replace = the canonical
   same-tuple in-place UPDATE (ids and workflow references survive), with the
   prior row snapshot restored on rollback. Multi-account-ambiguity (e.g.
   eden's constant provider id) always refuses.
5. **Dry-run is mandatory and bound by fingerprint.** Apply requires the
   reviewed dry-run artifact; the sha256 plan fingerprint (config + per-item
   plan) must match the freshly rebuilt plan or apply refuses.
6. **Honest verification vocabulary.** `verified` requires probe-confirmed
   identity AND a durable refresh story (standalone token, or owner-attested
   shared OAuth client). Expired-access-with-refresh rows skip the probe (it
   would 401 by construction; refreshing is banned here) and cap at
   `refresh_unverified` — a temporary access-token success is never dressed up
   as a durable transplant.
7. **No-leak by construction and by proof.** Reports/logs/errors carry typed
   codes + redacted labels; every serialized artifact is scanned against the
   run's observed secrets (plaintexts, BOTH ciphertexts, keys, raw labels) and
   emission refuses on a hit — the guard itself is tested non-vacuously, and
   key suites were verified to fail against sabotaged (ciphertext-copy,
   rollback-disabled) behavior.

## What this slice deliberately does NOT do

- No migration (none needed — the schema already supports everything).
- No token refresh, revocation, webhook creation, workflow activation, or any
  provider write (probes are the narrowest read-only identity endpoints).
- No copying of trigger resources, polling cursors, dedup history, OAuth
  state, workflow/run data, billing state, or timestamps.
- No real production read/decrypt/apply was performed in this batch —
  synthetic keys + in-memory stores only. The first real dry-run requires the
  explicit owner inputs listed in the runbook.
