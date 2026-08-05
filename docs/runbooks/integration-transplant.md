# Integration credential transplant (prod test account → dev) — operator runbook

**DEV-CONNECTION-TRANSPLANT-UTILITY-1.** Copies explicitly selected
integration credentials from an old ChainReact **test** account in production
into a designated account in the hosted **development** project, so dev /
React Agent certification doesn't require manually reconnecting every
provider.

Design + provider classification:
[`docs/slices/phase-5/dev-connection-transplant/dev-connection-transplant-utility.md`](../slices/phase-5/dev-connection-transplant/dev-connection-transplant-utility.md).

## Guarantees

- **Source (production) is read-only.** The only production access is a
  mutation-denying read adapter (SELECTs on `accounts` + `integrations` only).
  No repository write path, no token refresh, no health/audit mutation, no
  OAuth-state consumption can reach it (structure- and behavior-tested).
- **Destination is the development project only.** The canonical env-target
  guard (`scripts/lib/env-target.mjs`) resolves the destination; the
  production ref is denylisted twice (guard + utility's own check). The
  process-global Supabase env is pinned to the verified dev project before
  any write-capable module runs.
- **Ciphertext never crosses environments.** Credentials are decrypted with
  the source `TOKEN_ENCRYPTION_KEY`, held in memory only, and re-encrypted
  with the dev key (explicit-key seam in `core/encryption/tokens.ts`).
- **Nothing but credentials moves.** No trigger resources, webhook
  subscriptions, polling cursors, dedup history, OAuth state, workflows,
  runs, timestamps, or health state — dev workflows create fresh trigger
  state through normal activation.
- **Reports are redacted.** Console output and JSON artifacts carry counts,
  typed statuses, and redacted labels only; every artifact is scanned against
  the run's observed secrets before it is written.

## Explicit non-goals

General customer-data migration; bulk account cloning; refreshing/revoking
tokens; verifying by side effect (sending mail/messages, creating records or
webhooks); transplanting ADP machine credentials (mTLS certs — Category D,
manual re-onboarding only).

## Environment variables

| Var | Where | Meaning |
|---|---|---|
| `CHAINREACT_DB_TARGET=development` | command line | the operator's half of the two-declaration guard |
| `SUPABASE_DEV_PROJECT_REF` / `SUPABASE_DEV_URL` / `SUPABASE_DEV_SERVICE_ROLE_KEY` | `.env.development.local` (gitignored) | destination (dev) identity + service key |
| `TRANSPLANT_SOURCE_SUPABASE_URL` | `.env.transplant.local` (gitignored) | `https://<prod-ref>.supabase.co` — must parse to the approved production ref |
| `TRANSPLANT_SOURCE_SERVICE_ROLE_KEY` | `.env.transplant.local` | production service-role key (read-only usage enforced by the adapter) |
| `TRANSPLANT_SOURCE_TOKEN_ENCRYPTION_KEY` | `.env.transplant.local` | production `TOKEN_ENCRYPTION_KEY` |
| `TRANSPLANT_DEST_TOKEN_ENCRYPTION_KEY` | `.env.transplant.local` | the DEV `TOKEN_ENCRYPTION_KEY` (must differ from the source key — identical keys refuse) |

`.env.local` is **never** loaded by this utility. Secrets never appear on the
command line or in the config file. Delete `.env.transplant.local` when done.

## Config file (gitignored, non-secret)

Create the template, then fill it in:

```
npm run integrations:transplant -- --init
# writes scripts/integrations-transplant/transplant.config.local.json
```

Fields: `sourceProjectRef`, `destProjectRef`, `sourceAccountId`,
`destAccountId`, `destConnectedByUserId`, `providerAllowlist`,
optional `sourceIntegrationIds`, `conflictStrategy`
(`fail` default · `skip` · `replace-after-verification`), `verificationMode`
(`strict` default · `lenient`), `sharedOAuthClientProviders` (owner
attestation that dev uses the SAME provider OAuth app — required for
`verified` on OAuth providers), `acknowledgeRotationRiskProviders` (required
for rotating-refresh providers), and `ownerConfirmation` — an exact typed
sentence; run once and the refusal message shows the required text. Unknown
keys and secret-shaped values are refused.

## Commands

```
# 1. Dry-run (mandatory; performs NO writes, NO decryption, NO provider calls)
CHAINREACT_DB_TARGET=development npm run integrations:transplant -- \
  --config scripts/integrations-transplant/transplant.config.local.json --dry-run

# 2. Review the artifact under artifacts/transplant/dryrun-<fp>.json

# 3. Apply (requires the reviewed dry-run artifact; plan must still match)
CHAINREACT_DB_TARGET=development npm run integrations:transplant -- \
  --config scripts/integrations-transplant/transplant.config.local.json \
  --apply --dry-run-report artifacts/transplant/dryrun-<fp>.json
```

Apply is fail-fast: the first failure rolls back that row (fresh inserts are
deleted; approved replacements restore the prior row byte-for-byte) and skips
the rest. The source row is re-read afterward and reported
`sourceUnchanged: true/false`.

## Reading the report

Per item: provider, redacted label, classification (A/B/C-overlay/D),
intended action, conflict status, and a final status:

| Status | Meaning |
|---|---|
| `verified` | probe-confirmed identity AND durable refresh story (standalone token, or attested shared OAuth client) |
| `refresh_unverified` | written + usable, but refresh/client compatibility not proven (expired access token skipped the probe, or no attestation) — first dev use will refresh; `invalid_grant` marks the row needs-reconnect honestly |
| `reconnect_required` | not written: missing required scopes, or expired with no refresh token — reconnect in dev normally |
| `conflict` / `skipped` | destination conflict under `fail` / `skip` |
| `unsupported` | Category D or unknown provider |
| `verification_failed` | probe rejected or identity mismatched; write rolled back |

## OAuth client compatibility (why `verified` needs attestation)

Every provider reads one flat `<PROVIDER>_CLIENT_ID`/`_CLIENT_SECRET` env
pair — refresh works in dev **only if dev runs the same provider OAuth app**
as production. The utility cannot inspect the dev deployment's env, so the
owner attests per provider via `sharedOAuthClientProviders`. Rotating-refresh
providers (Microsoft, airtable, calendly, quickbooks, motive, typeform,
linear, discord) additionally need `acknowledgeRotationRiskProviders`: the
first dev refresh may invalidate the refresh token the production row still
holds.

## Why webhook / polling state is never copied

Trigger lifecycle state (`trigger_resources`, dedup, watch channels, cursors)
is environment-bound: prod subscriptions point at prod callback URLs, and
cursors/baselines encode prod history. Dev workflows must create fresh state
through normal activation (baseline-first polling seeds on activate). The
utility never reads or writes those tables — structure-tested.

## Afterward

- Verify in dev: open Apps, run a workflow, or use the connection
  diagnostics; first use of an OAuth row exercises the refresh path.
- Remove transplanted rows: disconnect normally in the dev UI (soft
  disconnect), or delete the rows in the dev project directly.
- Rotate/revoke after testing: revoke from the provider's own security page
  (Google account access, Slack app management, etc.) — the utility never
  revokes anything.

## Authorization requirement

Every run against the real production source requires Marcus's explicit
per-run authorization: approved source account, destination account,
destination user, provider allowlist, conflict strategy, a reviewed dry-run
report, and a separate explicit instruction for `--apply`. Implementation
testing used synthetic fixtures only.
