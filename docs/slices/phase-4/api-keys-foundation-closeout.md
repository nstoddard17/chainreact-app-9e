# 4.API-KEYS-FOUNDATION-CLOSEOUT — API Keys Foundation Closeout

**Type:** Docs-only closeout / handoff. No source, migrations, tests, or UI changes.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`
**Arc:** API-KEYS-FOUNDATION plan → FK-1 → FK-2 → FK-3 → FK-4 (all shipped) → **this closeout**.

---

## 1. Summary

Account-scoped API keys are now supported end-to-end: **schema + crypto helpers +
service-role repository + owner/admin management routes + Account Settings UI + a
public workflow trigger endpoint**.

- Public API-key triggering is behind **`ENABLE_PUBLIC_API_KEYS` (default OFF)**.
- Keys are **owner/admin-managed** (an API key acts as the whole account).
- Keys are **trigger-only at launch** — the single launch-enabled scope is
  `workflows:trigger`.
- Raw keys are **shown exactly once** (at creation) and **never stored**.
- Only the **`key_hash` (SHA-256) + a display `prefix`** are persisted.
- **No OAuth/integration tokens** are ever read, returned, or decrypted.
- **No workflow management API** (read/list/update/delete) was added.
- **No outbound webhooks** were added.

---

## 2. Completed commit chain

| Slice | Commit | What it landed |
|---|---|---|
| Plan | `9cb225b1c` | API keys foundation implementation plan (`docs/slices/phase-4/api-keys-foundation-plan.md`). |
| Docs fix | `2cfd3f335` | Corrected `20260605000002` migration status (applied, not unapplied). |
| FK-1 | `a02f4f790` | `account_api_keys` schema (RLS/GRANTs/indexes), `core/apiKeys` crypto + scopes, service-role repository, `ENABLE_PUBLIC_API_KEYS` flag helper. |
| FK-2 | `085e1976e` | Owner/admin management routes — `GET`/`POST /api/accounts/[id]/api-keys`, `DELETE …/[keyId]` (one-time reveal, soft revoke, freeze reject, idempotent/no-leak). |
| FK-3 | `6207b9030` | Account Settings API keys UI — real list/create/reveal/revoke for owner/admin; member + frozen read-only states; webhooks stays coming-soon. |
| FK-4 | `10873e15a` | Public API-key workflow trigger endpoint — `POST /api/v1/workflows/[workflowId]/trigger`, flag-gated default OFF, verify primitive, rate-limit seam. |

---

## 3. Current behavior

**Data**
- `account_api_keys` stores account-scoped API-key **metadata** (name, prefix,
  `key_hash`, scopes, `last_used_at`, `expires_at`, `revoked_at`, timestamps).
- `key_hash` is **not client-readable** — the table grants `authenticated` nothing;
  all reads go through a service-role projection that structurally omits the hash.
- Authenticated users **never query the table directly**.

**Management (owner/admin)**
- list key metadata
- create a key
- see the raw key **once** (create response only)
- revoke a key (soft revoke; revoked keys stay listed with `revoked` status)

**Account Settings API keys panel**
- list
- create
- one-time reveal (copy + "won't see it again" warning; discarded on dismiss)
- revoke (inline confirmation)
- **frozen account** → read-only (list visible; create/revoke hidden)
- **member (non-owner/admin)** → read-only note, no list fetch

**Public endpoint**
- `POST /api/v1/workflows/[workflowId]/trigger`
- requires `ENABLE_PUBLIC_API_KEYS=true` (else 404, before any key lookup)
- requires `Authorization: Bearer crk_...`
- requires the `workflows:trigger` scope
- the workflow must **belong to the key's account**
- **no active-account / session auth** — API key only
- returns **`202 { ok, runId, enqueuedAt }`** on success

---

## 4. Security model

- Raw key is **never persisted** (only `key_hash` + `prefix`).
- **SHA-256 at rest** — correct for high-entropy generated keys (no bcrypt/argon2,
  no new dependency).
- Verification = **prefix lookup → timing-safe hash compare** (`timingSafeEqualHex`).
- Missing / malformed / invalid / revoked / expired key all collapse to an
  **opaque 401** (no existence/active oracle).
- Cross-account workflow access collapses to a **generic 404** (no existence leak).
- **Frozen** (pending-deletion) account is **rejected**.
- **Wrong scope** is rejected (403 `insufficient_scope`).
- **No `key_hash`** appears in any response.
- **No raw key** appears in any log.
- **No OAuth/integration tokens** are touched.
- **No workflow existence leak** across accounts.

---

## 5. Rate-limit status

- A `rateLimitApiKeyTrigger` **seam** exists (`services/apiKeys/rateLimit.ts`).
- The current implementation is **permissive/default** and **explicitly NOT
  production-grade** (documented in-file).
- The endpoint **remains default-OFF** until a durable limiter is chosen.
- **Before enabling `ENABLE_PUBLIC_API_KEYS` in production, replace the seam with a
  durable limiter** (per-key + per-account window + failure lockout).
- Candidate backends:
  - Upstash Redis (durable, multi-instance)
  - Postgres token bucket
  - platform/edge rate limiter
- The existing **execution billing gate** is an **economic backstop** (caps cost
  per run), **not** a traffic-control substitute (does not cap request rate).

---

## 6. Billing / run behavior

- The public trigger uses the **same `enqueueRun` path as run-now**.
- It enqueues **real, billable runs** (no test mode on the public endpoint).
- The route **does not deduct tasks directly** — billing is enforced **in-engine**
  (`executionBillingGate`) after enqueue, to avoid **double billing**. Frozen
  accounts are refused up-front; task-limit refusals surface via
  `workflow_runs.status`.
- `triggeredByUserId` is **null** (no human actor).
- `triggeredBy` remains **`manual`** for now — a dedicated `api_key` source requires
  a migration + a `workflow_runs` CHECK-constraint update (the source is a closed
  union).
- **Future migration opportunity:** add `triggered_by = 'api_key'` for clearer run
  history / observability.

---

## 7. Deferred / known limitations

- **Durable rate limiter not implemented** (seam only).
- **`ENABLE_PUBLIC_API_KEYS` must remain OFF** until a limiter is installed.
- No public workflow **management/read/list/update/delete** API.
- No **outbound webhooks**.
- No **API-key audit notification** enum entries (create/revoke emit structured ops
  logs only; the `notification_type` enum extension was deferred in FK-2).
- No **API docs / developer docs page**.
- No **per-key generated endpoint URLs** (the UI shows the single static path only).
- No **live/test key separation** beyond the `crk_<env>_` prefix support (launch
  mints `live` only).
- No **trigger payload schema/UI** beyond a capped JSON body passed through as
  manual trigger input (`{ inputs }`).
- No dedicated **`api_key` run source** yet (see §6).

---

## 8. Verification baseline (as of FK-4, `10873e15a`)

- Full Jest: **16,017 passed / 0 failed** (121 skipped).
- `npm run typecheck` — clean.
- `npm run lint` — **0 errors** (pre-existing warnings only).
- `npm run lint:migrations` — OK.
- `npm run lint:structure` — OK.
- FK-1 / FK-2 / FK-3 and run-now suites — green.
- `db:push` was **not** run across the arc beyond FK-1's schema migration; FK-2–FK-4
  added no migrations.

---

## 9. Recommended next tracks

- **A. Durable rate limiter for public API keys** — replace the `rateLimitApiKeyTrigger`
  seam with a per-key/per-account durable limiter; hard prerequisite for flipping
  `ENABLE_PUBLIC_API_KEYS` ON.
- **B. `triggered_by = 'api_key'` migration** — distinguish API-key runs from human
  manual runs in run history (`workflow_runs` enum/CHECK + engine source value).
- **C. API docs / developer docs page** — document the public endpoint, auth, scope,
  and response envelope.
- **D. API-key audit notifications** — `notification_type` enum entries
  (`api_key_created` / `api_key_revoked`) + delivery, replacing the interim ops logs.
- **E. Outbound webhooks** — planning/implementation (Phase D of the parent API &
  webhooks plan).
- **F. Plan metadata / Stripe billing planning** — paid plans + monetization.

**Suggested priority (by goal):**
- Enabling public API keys → **A (durable rate limiter) first.**
- Observability → **B (`triggered_by = api_key`).**
- Developer UX → **C (API docs page).**
- Monetization → **F (plan metadata / Stripe billing).**

---

## Report summary

- **Arc complete:** account-scoped, owner/admin-managed, `workflows:trigger`-only API
  keys — schema + crypto + repo (FK-1), management routes (FK-2), Account Settings UI
  (FK-3), public trigger endpoint (FK-4). Public triggering is flag-gated default OFF.
- **Security:** raw key shown once / never stored; SHA-256 + prefix at rest;
  prefix-lookup + timing-safe compare; opaque 401 / generic 404 / scope 403 / freeze
  reject; no token exposure; no cross-account leak.
- **Gating blocker:** a durable rate limiter must replace the permissive seam before
  `ENABLE_PUBLIC_API_KEYS` is turned ON in production.
- **Recommended next track:** **A — durable rate limiter** (the single prerequisite to
  make the public endpoint usable in production).
