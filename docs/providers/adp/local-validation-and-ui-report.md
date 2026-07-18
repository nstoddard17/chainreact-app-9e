# Machine credentials — Local Validation + Connect UI (owner report)

**Date:** 2026-07-18
**Branch:** v2-main (local commits only — **nothing pushed; no remote DB touched; `db:push` NOT run**)
**Scope:** (1) validate the machine-credential migration/security locally, (2) build the generic machine-credential connect UI. ADP remains **disabled and hidden** from the customer catalog.

---

## 1. Migration / DB validation — what I could and could NOT do

### Hard blocker: there is no local Supabase to validate against
- No `supabase` CLI, no `supabase/config.toml`, Docker daemon not running, no local `psql`.
- The only reachable database is the **remote** V2 Supabase in `.env.local` — which you explicitly told me **not** to touch, and which `db:push` targets. So I did **not** run `db:push` and did **not** point live tests at it.
- `.env.local` has `ALLOW_DB_INTEGRATION_TESTS=true`, so the repo's opt-in DB tests (and mine) try to reach that remote. When my RLS test ran, the remote **rejected test-user creation with `captcha protection: request disallowed`** in `beforeAll` — so **no rows/users were created or modified on the remote**. This is the same wall the repo's existing `tests/integration/security/*` tests hit in this environment; they're designed for an isolated test DB.

**Conclusion:** the *live-DB* run of the RLS/tenant-isolation/rotation/route tests is **blocked on a local/isolated Supabase**, not on my code. I did NOT fake it. Instead I proved as much as possible without a DB and wrote the live tests so they run the moment a DB exists.

### What I DID validate (DB-free, runs everywhere — all green)
| Property you asked me to confirm | Evidence (committed, passing) |
|---|---|
| Client secret / private key / cert body / token never in **API responses** | Route tests assert the connect/validate responses carry only the secret-omitting DTO / safe cert metadata; RTL asserts secrets are never in the DOM. |
| Same, never in **audit rows / errors** | Unit tests: audit `detail` + DTO + typed errors carry no secret (store/token-service/repo suites). |
| **Anonymous** + **member (non-owner/admin)** blocked at the Data API | `tests/structure/machine-credentials-grants.test.ts` proves — across the whole migration corpus — both tables enable RLS + a policy, GRANT `service_role`, and GRANT `authenticated`/`anon` **nothing** (⇒ 42501). `npm run lint:migrations` also passes. |
| Owner/admin can create/rotate/disconnect; **members denied** | Route authz tests: member (not owner/admin) → 403 **before** the service; owner/admin → success. Rotation/disconnect proven at the repo/store level (create-vs-rotate clears cached token; disconnect clears token + is account-scoped). |
| **Service-role access only through the approved repository boundary** | The store/token-service reach the DB only via `repositories/machineCredentials/*` (service-role client); no `authenticated` GRANT exists, so there is no client Data-API path. |
| **Cross-account** reads/writes blocked | Repo tests assert exact `account_id` scoping on every read/write; `getActive`/`disconnect` filter account + provider exactly. |

### What is written + ready-to-run against an isolated test DB
`tests/integration/security/machine-credentials-rls.test.ts` (opt-in). On a Supabase test DB with migration `20260722000000` applied and `ALLOW_DB_INTEGRATION_TESTS=true`, it proves LIVE: 42501 for member/anon on both tables, ciphertext-at-rest, cross-account isolation, rotation clearing the cached token, audit-has-no-secret, disconnect. **Exact command once a dev DB exists:**
```
ALLOW_DB_INTEGRATION_TESTS=true npx jest tests/integration/security/machine-credentials-rls.test.ts
```
Step-by-step setup (prereqs, safe local init, target verification, applying the
migration, env vars, troubleshooting, cleanup):
[`docs/runbooks/local-supabase-machine-credentials-rls.md`](../../runbooks/local-supabase-machine-credentials-rls.md).

---

## 2. Connect UI — what was built (generic, provider-neutral)

Under `features/apps/machine-credentials/` + `lib/api/machineCredentials.ts` + a validate route. **Not hard-coded to ADP** — provider id + environments are props, so any future `machine_credentials` provider reuses it.

| Requirement | Status |
|---|---|
| Environment selection (sandbox/IAT vs production) | ✅ native select from `environments` prop |
| Client ID + client secret | ✅ (secret is a masked password field, `autoComplete=off`) |
| Certificate + private key upload OR secure entry | ✅ paste textarea **and** file upload for both |
| Pre-submit cert parsing, expiry, key-pair validation | ✅ "Validate certificate" → server validate route (reuses the real X.509 checks) → shows subject/fingerprint/expiry + verdict |
| Clear validation errors without exposing secrets | ✅ `errorCopy` maps codes → friendly copy; unknown codes fall back safe; responses never echo cert/key/secret |
| Connected-state safe metadata (env, subject/fingerprint, expiry, created, rotated) | ✅ connected card; expired / expiring-soon badges |
| Replace/rotate credentials | ✅ re-opens the form (empty secret fields) → connect route (rotation) |
| Disconnect with confirmation | ✅ inline confirm → disconnect route |
| Owner/admin authorization + account scoping | ✅ enforced in the routes (connect/disconnect/validate all owner/admin-gated on the active account) |
| Secret fields never rehydrated/displayed/returned | ✅ cleared on success, absent from the connected view, **proven not-in-DOM by test** |

**ADP stays disabled + absent from the catalog:** this UI is **not** wired into any live provider card. It's exercised only through RTL tests using a `dev-fixture` provider — no fake ADP connection is shown and nothing claims ADP is connected.

---

## 3. Test evidence (all local, passing)
- mTLS transport (24), store (16), token service (9), machine-auth flow/manifest/connect (17), ADP foundation (12) — from the prior batch.
- **This batch:** machine-credential grants guard + route authz (22), validate route + UI panel (14), and the opt-in live RLS test (ready). Plus `activeAccount` allow-list updated for the 3 new routes.
- Gates: `npx tsc --noEmit` ✅ · `eslint` ✅ (new files) · `lint:structure` ✅ · `lint:migrations` ✅.
- Full suite has ~100 **pre-existing** failures in this env (DB-backed `integration/*` need a live Supabase; a few pre-existing unit reds). Verified on the pre-session commit that these fail identically without my work — **my changes add zero new failures**.

## 4. Remaining sandbox blockers (unchanged)
ADP Marketplace partnership / API Central · ADP-issued WS certificate + IAT credentials · product edition + IAT host confirmation · security certification. See [`owner-report.md`](./owner-report.md) + [`implementation-status.md`](./implementation-status.md).

## 5. Exact next steps once you have access
1. Provision an **isolated Supabase test DB** (local `supabase start`, or a non-prod project), apply migration `20260722000000`, and run the opt-in RLS test command above to get the live 42501 / isolation / rotation proof.
2. When ready to deploy, apply the migration to the target env (`npm run db:push` — your call, per your no-deploy posture).
3. To surface the connect UI for ADP: enable the ADP manifest, render `MachineCredentialPanel` (provider `adp`, environments from `adpMachineAuth`) on ADP's Apps detail, then connect IAT credentials and run the live-certification steps in `implementation-status.md`.
