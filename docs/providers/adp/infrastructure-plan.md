# ADP — Required Shared ChainReact Infrastructure & Implementation Plan

**Status:** Design only. **No code exists.** This documents the net-new, cross-cutting V2 infrastructure ADP requires *before* an ADP provider can be built, plus a sliced implementation estimate. Companion to [`research.md`](./research.md) and [`owner-report.md`](./owner-report.md).
**Date:** 2026-07-17

> Per CLAUDE.md, shared-infrastructure work needs a written plan and Marcus's explicit approval before implementation. This is that plan. It has **not** been approved or built.

---

## 1. Codebase audit — what V2 has vs what ADP needs

Audit performed against the current `v2-main` working tree (file:line citations). Ground truth, not aspiration.

| ADP requirement | V2 today | Gap |
|---|---|---|
| OAuth `client_credentials` (server-to-server, no user redirect) | `AuthFlowSchema = ["code_callback","token_ingest","token_paste"]` ([contracts/integration.ts:56](../../../contracts/integration.ts#L56)); `ProviderOAuth` is `buildAuthUrl → handleCallback(code) → refreshToken` ([contracts/integration.ts:256-338](../../../contracts/integration.ts#L256-L338)); dispatcher requires a `userId` + browser redirect ([services/oauth/dispatcher.ts:307-455](../../../services/oauth/dispatcher.ts#L307)). **Zero** providers use `client_credentials`. | **New 4th auth flow + token-minting path.** |
| mTLS client certificate on every call | No `https.Agent` / `pfx` / `.p12` / cert injection anywhere; every provider call is bare global `fetch` with method/headers/body only. `.pem/.p12/.pfx` are **denylisted as secrets** (`scripts/mcp/security/paths.ts:38-41`). `refreshAndRetry` threads a decrypted **string** bearer token only ([services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts)). | **New mTLS transport seam** (undici `Agent`/`node:https`) threaded through the API-call layer. |
| Encrypted storage of cert + private key + client_id/secret | `encryptToken(string)` → single `access_token_encrypted` string column; `refresh_token_encrypted` nullable; `account_metadata` is **plaintext jsonb** ([repositories/integrations.ts:33-34,91-95](../../../repositories/integrations.ts#L33), [core/encryption/tokens.ts](../../../core/encryption/tokens.ts)). No multi-secret encrypted store. | **New encrypted multi-secret credential store** (or a serialization convention + schema) for {client_id, client_secret, cert PEM, key PEM}. |
| Webhook signature `adpx-messageauthentication` (HMAC-SHA256, key=client secret) | V2 has per-provider webhook signature verification patterns (e.g. Stripe/GitHub/Slack styles). | **Reusable pattern** — new verifier, but fits existing webhook infra. Low risk. |
| HR/payroll same-family provider to copy | None (no Gusto/BambooHR/Workday/Rippling/Paychex). Closest: QuickBooks, Motive — both plain `authorization_code`. | **No pattern donor** for the domain; must design node UX from scratch. |

**Conclusion:** three of the five gaps are genuine cross-cutting infrastructure (auth flow, mTLS transport, secret storage). These are shared changes that touch contracts, the OAuth dispatcher, the credential repository, and the API-call/retry seam — not provider-local code.

---

## 2. Infra piece A — `client_credentials` auth flow

**Goal:** a server-to-server auth flow that mints Bearer tokens with no user redirect and no refresh token.

Design sketch:
- Add a 4th `AuthFlow` value (e.g. `machine_credentials`) to `AuthFlowSchema` and the discriminated-union handling around it. Keep it additive; do not weaken the existing three flows.
- New contract hook set (parallel to `ProviderOAuth`), e.g. `ProviderMachineAuth`: `mintToken(ctx) → { accessToken, expiresAt }`, `verifyConnection(ctx)`. No `buildAuthUrl`/`handleCallback`.
- Dispatcher branch: "connect" for this flow is **not** a redirect — it validates supplied credentials (client_id/secret + cert/key) by minting a token once, then persists the encrypted credential set and marks the integration connected. The Apps "Connect" UX becomes a **credential-entry form** (like `token_paste`/Eden), not an OAuth pop-up.
- Token caching: store the short-lived access token (encrypted) with its expiry; re-mint on expiry or 401. Reuse `refreshAndRetry`'s 401→retry shape but swap "refresh" for "re-mint via client_credentials."

**Risk:** medium. Additive to a central enum + dispatcher. Needs tests that the existing three flows are unchanged.

---

## 3. Infra piece B — mTLS transport seam

**Goal:** attach a client certificate + private key to the TLS handshake for the token call *and* every API call, per tenant.

Design sketch:
- V2 uses global `fetch` (undici). mTLS requires an **undici `Agent` with a `connect: { cert, key }`** option (or `node:https` agent), passed as the `dispatcher` on the fetch call. This is the mechanism the egress-hardening backlog already identifies (`integrations/native/actions/httpRequestEgress.ts:48-51`) but which is **not implemented**.
- Introduce a small shared transport helper, e.g. `services/http/mtlsAgent.ts`: given decrypted `{cert, key}`, build (and cache by cert fingerprint) an undici `Agent`. Never log cert/key. Zeroize where practical.
- Thread an optional `dispatcher`/agent through the ADP API wrapper and the token-mint call. Keep this **opt-in** so no existing provider changes behavior.
- **Cert rotation:** cache keyed by fingerprint so a rotated cert produces a fresh agent; old agents dr0p out. Design for zero-downtime rotation (accept a new cert, mint succeeds, retire old).

**Risk:** medium-high. TLS material handling is security-sensitive; must guarantee the private key never reaches logs, client, resolver output, or AI-visible flags. Needs a focused security review (the `chainreactv2-security-review` skill).

---

## 4. Infra piece C — encrypted multi-secret credential store

**Goal:** store, per ADP integration, an encrypted bundle: `{ client_id, client_secret, cert_pem, key_pem }` (+ cached access token/expiry).

Design options (pick in the slice):
1. **Serialize + reuse `encryptToken`:** JSON-encode the bundle, `encryptToken(json)` into a single encrypted column (e.g. a new `credentials_encrypted` column or the existing `access_token_encrypted` used as an opaque blob). Simplest; least schema churn. Must ensure nothing lands in plaintext `account_metadata`.
2. **New encrypted columns / table:** explicit `adp_credentials` with per-field encryption. Cleaner, but adds a migration + repository surface.

Recommendation: **option 1** first (a serialized encrypted bundle) to avoid a migration, unless the security review prefers explicit columns. Either way: private key is decrypted only in the transport helper, held in memory only as long as needed, never serialized to logs/telemetry.

**Risk:** medium. Encryption is proven; the risk is discipline (no plaintext leakage) + not breaking the existing single-token assumptions in the integration repository.

---

## 5. Security implications (must pass a security review before ship)

- **Highest-value secret set in the app.** A leaked ADP key/secret = access to a customer's entire HR/payroll dataset (SSNs, pay, addresses). Treat as crown-jewel.
- **No plaintext anywhere:** not in logs, not in `account_metadata`, not in option-resolver responses, not in AI-visible capability flags, not in error messages, not in workflow variables/outputs.
- **Webhook trust:** verify `adpx-messageauthentication` HMAC-SHA256 (key = client secret) before acting on any event. Route secrecy ≠ verification.
- **Bounded, PII-safe outputs:** ADP responses must be projected to a fixed key set (rule 5); never spread raw responses; dedup keys avoid raw PII (rule 13); no SSNs in workflow variables unless explicitly required and gated.
- **Per-tenant isolation:** one ChainReact integration row ↔ one ADP org's credential set. No cross-tenant credential fallback; no co-member reuse (personal-credential fallback ban applies doubly here).
- **Credential class:** ADP is `account` (a shared business/payroll account, not a single human). Add to `core/integrations/credentialSharing.ts` when built.

---

## 6. Implementation slices (estimate — contingent on ADP access existing)

> Ordering matters: infra (S1–S3) is a prerequisite and is valuable on its own only if another `client_credentials`/mTLS provider is ever wanted. **If ADP never gets approved, S1–S3 should not be built speculatively.**

| Slice | Scope | Depends on | Rough size |
|---|---|---|---|
| **S0** | This research + plan (done). Owner decision gate. | — | ✅ done |
| **S1** | Infra A: `client_credentials`/`machine_credentials` auth flow — contract, dispatcher branch, credential-entry connect UX, token cache. Tests: existing 3 flows unchanged. | Marcus approval | Large |
| **S2** | Infra B: mTLS transport seam (undici Agent from decrypted cert/key) + security review. | S1 | Large |
| **S3** | Infra C: encrypted multi-secret credential store + repository support. | S1 | Medium |
| **S4** | ADP provider skeleton: manifest, credential class, Apps catalog entry, auth wiring on S1–S3; connect + `verifyConnection` against **sandbox/IAT**. | S1–S3 + **ADP sandbox creds + WS cert** | Medium |
| **S5** | ADP read actions (`get_worker`, `list_workers`, `get_pay_statement`) + typed wrappers + bounded outputs + resolvers (worker picker). | S4 + verified endpoint shapes | Large |
| **S6** | ADP write action (`submit_pay_data_input`) with Q11 required fields + strong guards; `update_worker_business_comm`. | S5 + product write entitlement | Medium |
| **S7** | ADP triggers: `worker_hired`/`worker_terminated`/`worker_updated` via webhook (signature verify) + polling fallback; DB-backed dedup. | S4 + verified event shapes | Large |
| **S8** | Setup/Advanced UX, node summaries, builder + resolver + runtime tests, smoke fixtures. | S5–S7 | Large |
| **S9** | Live certification (skill "Phase 13") against real ADP tenant; ADP security certification for Marketplace. | all above + **ADP prod approval + cert** | External-gated |

**Bottom line on effort:** even after ADP access is secured, this is a **multi-slice, multi-week** effort dominated by (a) net-new shared auth/transport infra and (b) live verification per product edition — not a typical "copy an existing provider" build.

---

## 7. Hard prerequisites before *any* of S1–S9 is worth starting

1. **ADP partner approval or API Central purchase** (external, ADP-controlled). Without it there is no sandbox and no way to verify endpoint shapes.
2. **WS certificate + client_id/secret** for at least the **IAT/sandbox** environment.
3. **Marcus's explicit go-ahead** to build the shared infra (S1–S3), which is a strategic investment that only pays off for ADP (and any future mTLS/client_credentials provider).

See [`owner-report.md`](./owner-report.md) for the full owner action list and the decision gate.
