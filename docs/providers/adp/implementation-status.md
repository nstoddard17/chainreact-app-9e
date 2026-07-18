# ADP — Implementation Status (backend foundation)

**Date:** 2026-07-17
**Branch:** v2-main (local commits only — **nothing pushed**)
**Provider state:** **registered but DISABLED** (`isEnabled: false`, all capabilities false)
**Companion docs:** [`research.md`](./research.md) · [`infrastructure-plan.md`](./infrastructure-plan.md) · [`owner-report.md`](./owner-report.md)

This doc records what was actually built vs what remains, separating: (1) code-complete + tested, (2) mocked-boundary verification, (3) blocked on ADP access, (4) intentionally excluded, and (5) the exact live-certification steps. It supersedes the "nothing was implemented" state in `owner-report.md` §1.

---

## 1. Code-complete and tested (mocked ADP boundary only)

Built as provider-neutral shared infrastructure first, then ADP on top. Local commits:

| Commit | Slice | What |
|---|---|---|
| `771cc7642` | A | Reusable server-side **mTLS transport** (`services/http/mtls/`) — X.509 parse/validity/pairing, `node:https` client with https-only enforcement, cert-expiry precheck, hard timeout, bounded body, always-`rejectUnauthorized`, redacted `MtlsError` family, conservative retry. **24 tests incl. a real local mutual-TLS round-trip.** |
| `d306fb766` | B | **Account-scoped encrypted machine-credential store** — migration `account_machine_credentials` + `machine_credential_audit` (RLS + membership policy + service-role-only GRANTs), `repositories/machineCredentials/*`, `services/machineCredentials/store.ts` (validate→encrypt→persist; secret-omitting DTO; cached-token read/write). **16 tests.** |
| `b32ad90be` | B-fix | Split repo into subfolder to hold the 50-file leaf cap. |
| `b6ebdc0b4` | C | **Generic `client_credentials` token service** — Basic/body auth, mint over mTLS, DB-backed token cache, in-process single-flight, typed redacted errors, `withMachineToken` 401→re-mint. **9 tests.** |
| `5507c6f95` | D | **`machine_credentials` auth flow** — contract enum + manifest rules, `ProviderMachineAuth` contract + registry, connect/disconnect service, owner/admin-gated connect + disconnect routes. **13 tests.** |
| `37ac6d129` | E | **ADP provider foundation** — manifest (disabled), machine-auth config (registered), mTLS API client, `adpx-messageauthentication` webhook verifier, registry/credentialSharing/category wiring. **12 tests.** |

**Total: ~74 new passing tests.** Every secret path is no-leak (encrypted at rest; DTOs/audit/errors carry no client secret, private key, cert body, token, or provider error body).

### What an ADP call actually does once enabled + connected
`adpRequest` → load the account's encrypted ADP credential → `withMachineToken` mints/caches a Bearer token via `client_credentials` (presenting the WS cert at the TLS layer) → `mtlsRequest` performs the API call presenting **both** the WS client certificate (mutual TLS) **and** the Bearer token → 401 force-remints once and retries.

## 2. Verified only against a MOCKED ADP boundary

All tests mock the ADP network boundary (injected mTLS client / stubbed store) while exercising **real** ChainReact internals: encryption, repositories, token minting/caching, single-flight, the machine-credential connect service, and the ADP API client path. **No call has ever hit a real ADP endpoint** — no ADP credentials/certificate/sandbox exist yet. Nothing here is live-certified.

## 3. Blocked on ADP access (unchanged from `owner-report.md`)

- ADP Marketplace partnership / **API Central** purchase (Sales/Security/Legal review).
- ADP-issued **WS certificate + private key** and **client_id/secret** for **IAT (sandbox)** first, then production.
- Confirmation of target **product edition** (Workforce Now recommended) + enabled use cases.
- ADP **security certification** before production.
- Exact **prod/IAT hosts** (IAT hosts in `auth.ts` are marked assumption), exact **event ids/payloads**, and the **certificate validity/renewal** policy.

Until those exist, the manifest stays `isEnabled: false` (the connect route refuses a disabled provider), so no ADP credential can be stored.

## 4. Intentionally NOT built (and why)

| Not built | Why |
|---|---|
| Typed ADP **actions** (get_worker, list_workers, pay-data-input, …) | Their exact ADP request/response **shapes are unverifiable** without sandbox access. Shipping guessed schemas would be fabrication (explicitly prohibited). Manifest `actions:false` keeps it honest. This is the **sandbox-gated next slice**, built on the tested API client. |
| ADP **triggers** (worker_hired, …) | The webhook signature verifier IS built + tested (confirmed scheme), but the event **payload shapes + subscription/activation API** are portal-gated. `webhookTrigger:false` until verified. |
| Option **resolvers** (worker picker, etc.) | Depend on the Workers list endpoint shape (unverified) — ship with the actions slice. |
| React **Apps connect form** UI | Backend connect/disconnect routes + service are done (Marcus prioritized backend). The credential-entry form is a thin remaining UI piece; noted below. |
| Generic "call ADP API" action | Banned by V2 rule 2. |

## 5. Exact live-certification steps (run once owner setup is done)

0. **(Prereq) Apply + prove the store on an isolated local DB:** follow [`docs/runbooks/local-supabase-machine-credentials-rls.md`](../../runbooks/local-supabase-machine-credentials-rls.md) to stand up a throwaway local Supabase, apply migration `20260722000000`, and run the machine-credential RLS proof.
1. **Enable the provider:** flip `integrations/adp/manifest.ts` `isEnabled: true` (and set `actions`/`webhookTrigger` true only when those slices ship).
2. **Env + hosts:** confirm the IAT hosts in `integrations/adp/auth.ts` against the ADP portal; correct if needed.
3. **Connect (IAT):** owner/admin submits client_id / client_secret / WS cert / private key + environment `iat` to `POST /api/integrations/machine-credentials/adp/connect`. Confirm: the store validates the cert (pairing + validity), encrypts, and returns the safe DTO; an audit `created` row is written.
4. **Token mint (live):** trigger any ADP call; confirm `client_credentials` mint over mTLS succeeds against `accounts.adp.com` (audit `mint_succeeded`), and that a bad cert/expired cert fails clearly (redacted).
5. **Build + verify the actions slice** against IAT: implement typed actions from the now-observable real response shapes; live-smoke each (record request → ADP result → run result → read-back).
6. **Webhook:** register the ChainReact ADP receive URL + subscribe to events at ADP; confirm `adpx-messageauthentication` verifies against a real delivery; wire the trigger lifecycle + DB-backed dedup; live-test one real event → one run.
7. **Cert rotation:** confirm re-connect (rotation) replaces cert/secret, clears the cached token, and writes audit `rotated`.
8. **Save observed event/response shapes** into `research.md` and flip the remaining capability flags as each surface is verified.

---

## Owner action checklist (short form)
- [ ] Secure ADP Marketplace partnership / API Central + WS certificate + IAT creds.
- [ ] Confirm IAT/prod hosts; adjust `integrations/adp/auth.ts` if needed.
- [ ] Add `TOKEN_ENCRYPTION_KEY` is already set (reused); no new env var is required for the store.
- [ ] Enable the manifest; connect ADP (IAT) from the machine-credential connect route.
- [ ] Run the live-certification steps above; build the actions/triggers slice against verified shapes.

**Nothing was pushed or deployed. `db:push` was NOT run** — the migration is committed locally and must be applied (`npm run db:push`) before the store is usable in any environment.
