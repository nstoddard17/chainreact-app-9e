# 4.API-KEYS-FOUNDATION-CLOSEOUT — API Keys Foundation Closeout

**Type:** Docs-only closeout / handoff. No source, migrations, tests, or UI changes.
**Date:** 2026-06-05 (updated 2026-06-05 — RATE-LIMIT-1 durable limiter)
**Branch:** `builder-ui-v1-audit-1`
**Arc:** API-KEYS-FOUNDATION plan → FK-1 → FK-2 → FK-3 → FK-4 → RATE-LIMIT-1
(all shipped) → **this closeout**.

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
| RATE-LIMIT-1 | `f332dd240` | Durable Postgres rate limiter — replaces the permissive seam; `api_key_rate_limits` table + atomic increment RPC, per-key/workflow/account windows, route returns 429 + `Retry-After`. |

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
- now enforces a **durable Postgres-backed rate limiter** (RATE-LIMIT-1) — see §5
- the limiter runs **after** key / scope / account-ownership / freeze / state checks
  and **before** enqueue
- a rate-limited request returns **`429` with a `Retry-After` header**
- a rate-limited request does **not** enqueue a run, bill / touch task usage, or
  update `last_used_at`

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

- A **durable Postgres-backed limiter is implemented** (RATE-LIMIT-1, `f332dd240`) —
  it replaces the original permissive seam. `rateLimitApiKeyTrigger`
  (`services/apiKeys/rateLimit.ts`) now performs an atomic multi-dimension
  fixed-window increment via the `increment_api_key_rate_limits` RPC against the
  service-role-only `api_key_rate_limits` table, then maps the post-increment counts
  to allow/deny using the centralized policy (`core/apiKeys/rateLimitPolicy.ts`).
- **Limits (per-minute window):** per key **60/min**, per workflow **30/min**, per
  account **300/min**. Centralized + easy to tune.
- Cross-instance safe (the RPC's UPSERT row lock serializes same-bucket writers).
  Bucket keys derive from key id / account id / workflow id — **never** a raw key.
- **Migration `20260608000000_api_key_rate_limits.sql` exists** (table + RPC,
  service-role only). It **must be applied** (`supabase db push`) in any target
  environment **before enabling `ENABLE_PUBLIC_API_KEYS`** — the limiter RPC must
  exist or the trigger route will error.
- **`ENABLE_PUBLIC_API_KEYS` remains default OFF.**
- The existing **execution billing gate** remains an **economic backstop** (caps cost
  per run), complementary to the limiter's **traffic** cap (request rate).

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

- **Rate-limit migration not applied in this local report** — `db:push` was NOT run;
  `20260608000000_api_key_rate_limits.sql` must be applied in the target environment
  before the limiter RPC works (and before `ENABLE_PUBLIC_API_KEYS` is turned on).
- **`ENABLE_PUBLIC_API_KEYS` remains default OFF** — flip it only after the limiter
  migration is applied in that environment.
- **Rate-limit tuning** is a future task — the per-key/workflow/account constants are
  launch defaults (centralized in `core/apiKeys/rateLimitPolicy.ts`) and may need
  adjustment under real traffic.
- **No per-IP rate-limit dimension** — could be added later if/when reliable,
  testable client-IP extraction exists (the current limiter is per key / workflow /
  account only).
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

## 8. Verification baseline (as of RATE-LIMIT-1, `f332dd240`)

- Full Jest: **16,049 passed / 0 failed** (121 skipped).
- `npm run typecheck` — clean.
- `npm run lint` — **0 errors** (pre-existing warnings only).
- `npm run lint:migrations` — OK.
- `npm run lint:structure` — OK.

- FK-1 / FK-2 / FK-3 / FK-4 / RATE-LIMIT-1 and run-now suites — green.
- `db:push` was **not** run in this local report. Migrations authored across the arc:
  FK-1's `account_api_keys` schema and RATE-LIMIT-1's `api_key_rate_limits` table +
  RPC (FK-2–FK-4 added none). Both must be applied in the target environment.

_(Prior baseline at FK-4 `10873e15a`: 16,017 passed / 0 failed.)_

### Structure-guard note (RATE-LIMIT-1)

Adding `20260608000000_api_key_rate_limits.sql` pushed `supabase/migrations` past the
50-file leaf-folder cap (`scripts/check-leaf-folder-counts.mjs`). Because Supabase
applies a **flat, append-only** migrations directory (the CLI does not recurse
subfolders), the "split the folder" remedy cannot apply, and the cap is documented
as tunable. The check now **exempts `supabase/migrations`** from the leaf count; all
other leaves remain capped at 50.

---

## 9. Recommended next tracks

- **A. Durable rate limiter for public API keys** — ✅ **SHIPPED** (RATE-LIMIT-1,
  `f332dd240`). Remaining op step before flipping `ENABLE_PUBLIC_API_KEYS` ON: apply
  `20260608000000_api_key_rate_limits.sql` (`db:push`) in the target environment.
- **B. `triggered_by = 'api_key'` migration** — distinguish API-key runs from human
  manual runs in run history (`workflow_runs` CHECK + engine source value). Planned in
  [api-keys-run-history-plan.md](./api-keys-run-history-plan.md) (4.API-KEYS-RUN-HISTORY-1).
- **C. API docs / developer docs page** — document the public endpoint, auth, scope,
  and response envelope.
- **D. API-key audit notifications** — `notification_type` enum entries
  (`api_key_created` / `api_key_revoked`) + delivery, replacing the interim ops logs.
- **E. Outbound webhooks** — planning/implementation (Phase D of the parent API &
  webhooks plan).
- **F. Plan metadata / Stripe billing planning** — paid plans + monetization.

**Suggested priority (by goal):**
- Enabling public API keys → **A is done**; apply the limiter migration, then flip
  `ENABLE_PUBLIC_API_KEYS` ON.
- Observability → **B (`triggered_by = api_key`)** — now the top open track.
- Developer UX → **C (API docs page).**
- Monetization → **F (plan metadata / Stripe billing).**

---

## Report summary

- **Arc complete:** account-scoped, owner/admin-managed, `workflows:trigger`-only API
  keys — schema + crypto + repo (FK-1), management routes (FK-2), Account Settings UI
  (FK-3), public trigger endpoint (FK-4), durable Postgres rate limiter (RATE-LIMIT-1).
  Public triggering is flag-gated default OFF.
- **Security:** raw key shown once / never stored; SHA-256 + prefix at rest;
  prefix-lookup + timing-safe compare; opaque 401 / generic 404 / scope 403 / freeze
  reject; no token exposure; no cross-account leak. Rate-limit bucket keys derive from
  ids only — never a raw key.
- **Gating step:** apply the limiter migration `20260608000000_api_key_rate_limits.sql`
  (`db:push`) in the target environment before `ENABLE_PUBLIC_API_KEYS` is turned ON.
- **Recommended next track:** **B — `triggered_by = 'api_key'`** run-history
  observability (planned in `api-keys-run-history-plan.md`), now that the rate-limiter
  prerequisite (A) is shipped.
