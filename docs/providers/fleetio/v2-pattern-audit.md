# Fleetio — V2 Pattern Audit (FLEETIO-1, Slices 0–1)

What existing V2 patterns Fleetio reuses, what it extends, and every intentional divergence.
Scope of this audit: auth + connection shell (Slice 1). Action/trigger/resolver patterns will be
appended when Slices 2+ land.

## Patterns audited and REUSED verbatim

| Concern | Pattern source | Fleetio usage |
|---|---|---|
| Connect flow ownership | `services/oauth/dispatcher.ts` (`connect()` + signed single-use state, OAUTH-ACCT-BIND account binding, reconnect intent) | Fleetio connect flows through the SAME route + dispatcher; a new `credential_paste` branch mints state and redirects to the V2 credential form. Zero Apps-UI changes — `ConnectButton → startOAuth → {redirectUrl}` works unchanged |
| State validation ordering | Trello token-ingest (`handleTokenIngest`): consume-state-BEFORE-verify, provider/user cross-checks, freeze + membership + role completion re-checks, reconnect identity match | `handleCredentialIngest` mirrors it invariant-for-invariant (see dispatcher tests) |
| Persistence | `repositories/integrations.upsertActive` (service-role, identity proven out-of-band by signed state) | Same single canonical path; no new persistence route |
| Encryption | `core/encryption/tokens.ts` AES-256-GCM before write | API key → `access_token_encrypted`; Account-Token → new `extra_credentials_encrypted` (one ciphertext of `{accountToken}`) |
| Paste-form client rules | Eden token-paste page (`app/integrations/token-paste/[provider]/page.tsx`): no server-only imports, no telemetry, secrets only in state + one POST, humanized errors | `CredentialPasteForm` follows the same rules, plus per-field reveal toggles and metadata-driven fields |
| API wrapper shape | `integrations/trello/api/_request.ts` (thin per-resource wrappers over one HTTP helper; typed 401 mapping; no-token-in-errors) | `integrations/fleetio/api/_request.ts` (+ `Retry-After`-honoring bounded retry, 403 role error, pinned `X-Api-Version`) |
| 401 semantics | `Unauthorized401Error` → `refreshAndRetry` → reconnect prompt for non-refreshable providers | Same class thrown by the Fleetio wrapper |
| Credential-sharing class | Motive / QuickBooks `account` classification (owner/admin connect gate at route + completion re-check) | `fleetio: "account"` in `core/integrations/credentialSharing.ts` |
| Provider registration | Manifest-is-the-registry (`integrations/_registry.ts` hand-maintained) + `lib/apps/providerCategories.ts` + `public/integrations/<id>.svg` | Registered under `Fleet & Telematics` beside Motive |
| Experimental gating | Linear/Eden arc: `isExperimental: true` until Phase-13 live certification | Same |
| providerAccountId choice | QuickBooks realm posture (`tokenScope:"user"` + `accountIdField`), durable provider-issued id | Numeric Fleetio `Account.id` (never the mutable name, never the Account-Token) |

## Patterns EXTENDED (new shared, provider-neutral infrastructure)

1. **`authFlow: "credential_paste"`** (`contracts/integration.ts`) — the token-ingest rule doc's
   deferred "token-paste UI variant", generalized to N named fields. Manifest declares typed
   `credentialFields` (+ optional `credentialGuide`); a SHARED form renders them; a SEPARATE
   dispatcher op (`handleCredentialIngest`) + route (`credential-ingest`) processes them. Schema
   invariants: non-refreshable; fields required + unique; fields/guide forbidden outside the flow;
   scope-nonempty exemption (role-based access). Deliberately NOT a widening of `token_ingest`/
   `token_paste` — those contracts and their consumers (Trello, Eden) are byte-identical to before,
   and cross-path calls are rejected by both dispatcher ops (pinned by tests).
2. **`EncryptedTokens.extraCredentialsEncrypted`** + migration `20260727000000` — an explicit, typed,
   encrypted home for a multi-credential provider's non-primary secrets on the `integrations` row.
   Chosen over (a) JSON-in-access_token (contract abuse), (b) secrets in `account_metadata`
   (plaintext — forbidden), (c) a side table (duplicates the row's whole lifecycle/RLS for no gain).
   The refresh path only touches the column when explicitly carried; disconnect clears it.

## Intentional divergences

| Divergence | Why |
|---|---|
| No OAuth / no `oauth.ts` | Fleetio has no OAuth. The manifest still declares `capabilities.oauth: true` because a real user-facing connect dance exists (Eden precedent — "the paste flow IS the connect"), which keeps the Apps card + connect route generic |
| Empty `scopes.required` with `oauth: true` | Honest: Fleetio has no scope negotiation; access = the key's Fleetio user role. A contract exemption (credential_paste only) allows this; declaring a fake scope would pollute the `scopes` column |
| Signed state kept for a first-party form | The paste form POST is already session-authenticated (CSRF-safe), but state is NOT kept for CSRF: it carries the account binding resolved at connect-START (OAUTH-ACCT-BIND), single-use replay protection, and the reconnect intent — and it keeps the Apps UI 100% generic. Dropping it would need a parallel account-binding channel and special-case UI. Threat note: rule doc §"Credential-paste variant" |
| Field-set validation BEFORE state consume | Token flows consume state first; credential flows shape-check the submitted fields against the manifest first. A malformed set is a client bug/tamper — burning the nonce or probing the provider for it would be wrong. State consumption still precedes the PROVIDER verify call (the replay-relevant ordering, unchanged) |
| 403 gets its own typed error (`FleetioForbiddenError`) | Fleetio RBAC makes "role gap" a first-class, owner-fixable failure distinct from "dead key" |
| Method-aware bounded 429 retry in the wrapper | Fleetio advertises `Retry-After` explicitly; Trello's wrapper has no retry. **FLEETIO-3 write-safety:** only idempotent **GET** auto-retries once (≤10s); **writes (PATCH/POST/PUT/DELETE) never auto-replay** — they surface `FleetioRateLimitError` immediately so a mutation is never duplicated (Fleetio has no idempotency key for vehicle updates). Larger GET delays / a second GET 429 also surface the typed error. This is the durable write-safety policy every future Fleetio write inherits |
| Proactive health-check cron NOT added | Only Slack has a proactive health cron today (V2-READY-29). Fleetio declares `healthCheckIntervalMs` like every provider and relies on the same reactive machinery (verify-at-connect, 401→reconnect signal). A Fleetio-specific cron with no caller would be dead code — revisit when the provider family gets a generic health cron |
| Icon is a neutral letterform placeholder | No official brand asset in-repo; `public/integrations/fleetio.svg` is a simple F-mark consistent with the set (Apps/Builder fall back to initials if replaced/removed). Owner may swap in Fleetio's official mark before public visibility |

## Boundary compliance

- Route (`credential-ingest`) is thin: session check, strict body validation, dispatch, typed mapping.
- Client path: `CredentialPasteForm` (features/) → `lib/api/credentialPaste.ts` → route → dispatcher →
  repository. No client import of services/repositories (covered by structure tests).
- Server page (`app/integrations/credential-paste/[provider]/page.tsx`) reads the registry server-side
  and passes only serializable, non-secret metadata to the client form.
- No `if (provider === "fleetio")` in any shared dispatcher/route/form code — the manifest drives it.
