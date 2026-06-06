# 4.API-KEYS-FOUNDATION-1 — API Keys Foundation Implementation Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, API-key
route, public-trigger route, billing/Stripe, or outbound-webhook implementation in
this slice. Nothing pushed.**
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`
**Parent plan:** [account-settings-api-webhooks-plan.md](./account-settings-api-webhooks-plan.md)
(this doc is the concrete **Phase B / API-KEYS-FOUNDATION** design the parent
deferred).

**Source of truth (verified current state):**
[run-now route](../../../app/api/workflows/[id]/run-now/route.ts) ·
[enqueueRun](../../../services/execution/enqueue.ts) ·
[executionBillingGate](../../../services/billing/executionBillingGate.ts) ·
[cron bearer guard](../../../services/cron/auth.ts) ·
[requireAccountRole](../../../services/accounts/accountAuthz.ts) ·
[requireAuthedUserId](../../../app/api/account/_shared.ts) ·
[accountFreeze](../../../services/accounts/accountFreeze.ts) ·
[invitations hashing](../../../services/accounts/invitations.ts) (`hashInviteToken`, `randomBytes`) ·
[serviceRoleClient](../../../repositories/supabase/serviceRoleClient.ts) ·
[workflows.getByIdServiceRole](../../../repositories/workflows.ts) ·
[notifications repo](../../../repositories/notifications.ts) ·
[ApiSection UI](../../../features/account/AccountSections.tsx) ·
[github inbound verifier (template)](../../../integrations/_shared/github/webhooks/signature.ts) ·
[workflow_node_credentials migration (RLS/GRANT template)](../../../supabase/migrations/20260606000000_workflow_node_credentials.sql) ·
[account_invitations migration (one-time-secret template)](../../../supabase/migrations/20260531000011_account_invitations.sql).

> **Headline:** Build the **first real API-keys slice** exactly to the parent
> plan's locked model — **account-scoped, owner/admin-managed, `workflows:trigger`-
> only** keys, stored as a **one-way SHA-256 hash + display prefix**, revealed
> **once**, soft-revocable, last-used-tracked. The management plane (create / list /
> revoke + Account Settings UI) ships first; the **public trigger endpoint**
> (`POST /api/v1/workflows/[id]/trigger`) ships **behind a default-OFF flag**
> (`ENABLE_PUBLIC_API_KEYS`) and is not enabled until a rate limiter lands — the
> existing **execution billing gate** is the economic backstop in the interim. A
> key authenticates **as the account**, runs the same `enqueueRun` path as
> `run-now`, and has **no code path that reads, returns, or decrypts any
> OAuth/integration token**. Outbound webhooks, read/list data APIs, and workflow
> management APIs are explicitly out of this slice.

---

## 1. Context

The parent [API & webhooks plan](./account-settings-api-webhooks-plan.md) locked the
product/security model and a phased breakdown (A read-only "coming soon" → **B API
keys + trigger** → C inbound-trigger keys → D outbound webhooks). Phase A (the
honest read-only `ApiSection`) is reflected in the current Account Settings surface
(`8b73f5608`). This doc is the **implementation design for Phase B** — the narrowest
useful real capability: **trigger a workflow with an account-scoped API key.**

The area is security-sensitive (bearer credentials + an unauthenticated public
ingress that starts billable runs). This plan fixes the data model, hashing /
verification, routes, role gating, rate-limit sequencing, billing interaction,
audit, UI, and the no-leak guarantees **before** any code, so the implementer does
not (a) leak an OAuth token through a generic "API key", (b) expose `key_hash` to
clients, (c) ship a public trigger endpoint with no throttle, or (d) entangle this
with the provider-webhook trigger pipeline.

**Hard scope of *this* slice: planning only** (no source / migrations / tests / UI /
routes / billing / push).

---

## 2. Current codebase findings (verified)

- **No API-key table, no public API, no per-account bearer auth.** The only bearer
  auth is the single shared `CRON_SECRET` guard
  ([services/cron/auth.ts](../../../services/cron/auth.ts)): parses
  `Authorization: Bearer <secret>`, compares with `crypto.timingSafeEqual` + a length
  guard, fails closed (500) on a missing secret. This is the **bearer-parse + compare
  template** to mirror per-account.
- **Account-scoped management pattern:** `requireAccountRole(userId, accountId,
  allowed) → { ok:true, role } | { ok:false, reason:"not_member"|"forbidden" }`
  ([accountAuthz.ts](../../../services/accounts/accountAuthz.ts)); routes like
  `/api/accounts/[id]/members` and `/api/accounts/[id]/credential-requests` funnel
  through it. Self-scoped routes use `requireAuthedUserId`
  ([app/api/account/_shared.ts](../../../app/api/account/_shared.ts)).
- **One-time-secret precedent:** `account_invitations` stores `token_hash` (SHA-256),
  never the raw token; raw is `randomBytes(32).toString("base64url")` and returned
  once. `hashInviteToken = createHash("sha256").update(raw).digest("hex")`
  ([services/accounts/invitations.ts](../../../services/accounts/invitations.ts)). Node
  `crypto` only — **no bcrypt/argon2 dependency and none needed** for high-entropy keys.
- **Run path:** `POST /api/workflows/[id]/run-now`
  ([route](../../../app/api/workflows/[id]/run-now/route.ts)) → `requireUser` +
  `requireWorkflowAccountMember` → `enqueueRun({ workflowId, triggerNodeId, event,
  triggeredBy?, triggeredByUserId? }) → { runId, enqueuedAt }`
  ([enqueue.ts](../../../services/execution/enqueue.ts)). The engine applies
  `executionBillingGate(accountId)`
  ([billing gate](../../../services/billing/executionBillingGate.ts)) — checks
  `isAccountFrozen` first, skips test-mode, else deducts 1 task; outcome
  `{ ok:true, used, limit } | { ok:true, skipped, reason:"test_mode" } | { ok:false,
  reason:"limit_reached"|"account_frozen", used, limit }`. **Billing attributes to the
  workflow's owning account, never the actor.**
- **RLS / GRANT convention** (template: `workflow_node_credentials`
  [migration](../../../supabase/migrations/20260606000000_workflow_node_credentials.sql)):
  `ENABLE ROW LEVEL SECURITY` + membership-+-freeze SELECT policy + **explicit Data
  API GRANTs** (`authenticated` SELECT / `service_role` all); **writes service-role
  only** (no client write policy). Member-identity reads that must hide a column are
  served via a SECURITY DEFINER RPC (`get_account_member_identities`) that **omits**
  the sensitive column.
- **Freeze guard:** `isAccountFrozen(accountId)` /
  `getDeletionStatusServiceRole` ([accountFreeze.ts](../../../services/accounts/accountFreeze.ts)).
- **Public/unauth route template:** `app/api/webhooks/<provider>/route.ts` read raw
  request → verify signature (HMAC-SHA256 + `timingSafeEqual`) → dispatch, **no
  Supabase cookie session**. This is the structural template for the public trigger
  endpoint (swap signature verification for API-key verification).
- **Audit surface:** the `notifications` table (service-role `create`, user-scoped
  RLS, `type` enum + narrow `metadata`). **No dedicated audit-log table.** Append-only
  ledgers (`task_usage_events`, `ai_cost_events`) are the precedent for high-volume
  events. The notification enum migration `20260605000002` is **still unapplied** —
  extending the enum must sequence after it (parent §16).
- **No rate-limiter anywhere** (zero `ratelimit`/`upstash`/`throttle`). Must be built
  (or the public endpoint flag-gated OFF) before public exposure.
- **Anti-pattern not to replicate:** inbound webhook signing secrets are stored
  **plaintext** in `trigger_resources.config`. New key material is **hashed** (keys)
  or **encrypted** (future webhook secrets), never plaintext jsonb.

---

## 3. API key product scope (locked)

- **What a key is:** a bearer credential to **ChainReact's own public API**, acting
  **as the account**, gated by least-privilege scopes. It is **not** a slot for a
  third-party key and **never** a handle to a stored OAuth/integration token. (Q ‑ "is
  this credential sharing": **no** — §14.)
- **Launch capability — `workflows:trigger` only:** the programmatic twin of
  `run-now` ("POST to start this account's workflow"). Read/list, workflow management,
  and full account APIs are **reserved scope values, disabled at launch** (§12 scope
  model). (Qs on scope / narrowest slice.)
- **Why trigger-first:** highest-demand, maps onto the existing `enqueueRun` path,
  **smallest blast radius** — a leaked trigger-only key can start runs (cost/abuse,
  bounded by the billing gate + a future limiter) but cannot read data or mutate
  config.
- **Managed by owner/admin; account-scoped; one-time reveal; SHA-256 hash at rest;
  prefix shown; soft revoke; optional expiry; last-used tracked; rate-limited before
  broad exposure; never exposes OAuth tokens; not credential sharing** — the parent's
  locked bullets, made concrete below.

---

## 4. Data model — `account_api_keys` (Q5)

Membership-RLS SELECT, **writes service-role-only**, explicit Data API GRANTs,
freeze-aware. Finalize exact column order in the migration slice (FK-1).

```sql
CREATE TABLE public.account_api_keys (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- provenance
  name                text NOT NULL,                 -- human label, e.g. "CI deploy trigger"
  prefix              text NOT NULL,                 -- DISPLAY only, e.g. "crk_live_ab12…wxyz"
  key_hash            text NOT NULL UNIQUE,          -- sha256(raw key) hex; raw NEVER stored
  scopes              text[] NOT NULL DEFAULT '{}',  -- launch: ARRAY['workflows:trigger']
  last_used_at        timestamptz,                   -- best-effort, throttled (§7)
  expires_at          timestamptz,                   -- nullable = no expiry (Q13)
  revoked_at          timestamptz,                   -- soft revoke (Q14)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX account_api_keys_key_hash_idx ON public.account_api_keys (key_hash);
CREATE INDEX account_api_keys_account_idx ON public.account_api_keys (account_id);

CREATE TRIGGER account_api_keys_set_updated_at
  BEFORE UPDATE ON public.account_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**Decisions in this shape:**
- **`key_hash` is the lookup key** (UNIQUE, indexed) — verification is an **O(1)
  exact-match** `WHERE key_hash = sha256(presented)` (see §6/Q12), **not** a
  prefix-scan. The `prefix` column is **display-only**; it carries no secret and is
  never used to authenticate.
- **`scopes text[]`** (not a DB enum) so new scopes don't need a migration; an
  application allowlist validates values (§12).
- **No `key_hash` in any client-readable projection** (§5).

---

## 5. RLS / GRANT model (Q7, Q8)

```sql
ALTER TABLE public.account_api_keys ENABLE ROW LEVEL SECURITY;

-- Data API access (post-Oct-2026 GRANT rule). NOTE: NO authenticated SELECT —
-- clients never read this table directly (key_hash must never be SELECTable).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_api_keys TO service_role;

-- Defense-in-depth RLS (even though authenticated has no GRANT): if a future read
-- path ever grants SELECT, it is still membership + freeze gated.
CREATE POLICY account_api_keys_select_account_member
  ON public.account_api_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.account_memberships am
      JOIN public.accounts a ON a.id = am.account_id
      WHERE am.account_id = account_api_keys.account_id
        AND am.user_id = auth.uid()
        AND a.deletion_status = 'active'
    )
  );
-- No INSERT/UPDATE/DELETE policy → all writes are service-role only.
```

- **Reads are service-role + projected DTO** — mirror `get_account_member_identities`:
  the repo reads service-role and returns a `ApiKeyMetadata` DTO that **structurally
  omits `key_hash`** (id, name, prefix, scopes, last_used_at, expires_at, status,
  created_by, created_at). There is **no route or RPC that returns `key_hash` or the
  raw key**. (Q6: yes — `key_hash` is hidden behind a service-role projection, never a
  SELECTable client column.)
- **Writes service-role only** (Q8: yes) — create/revoke/last-used go through the
  service-role repo behind `requireAccountRole`, never a client write policy.

---

## 6. Key generation / hashing / verification (Q9, Q10, Q11, Q12)

**Format (Q9):** `crk_<env>_<48-char base64url>` where `<env>` ∈ `live | test`, and
the random tail is `randomBytes(36).toString("base64url")` (≈288 bits entropy).
Recognizable, secret-scanner-friendly prefix (`crk_`), env-segmented so a test key
can never trigger a live run path. The **whole string** is the credential.

**Generation (FK-1 lib `core/apiKeys/`):**
```ts
const raw = `crk_${env}_${randomBytes(36).toString("base64url")}`;
const key_hash = createHash("sha256").update(raw).digest("hex");
const prefix = `${raw.slice(0, 12)}…${raw.slice(-4)}`;  // display only
// store { key_hash, prefix, ... }; return raw ONCE in the create response.
```

**Hashing (Q10):** plain unsalted **SHA-256** — correct for a **high-entropy** key
(bcrypt/argon2 are for low-entropy passwords; **no new dependency**, per parent §16).

**Verification (Q11, Q12) — hash-lookup, not prefix-scan:**
```ts
// 1. parse "Authorization: Bearer crk_..." (reject non-crk / malformed → 401)
// 2. presentedHash = sha256(presented)
// 3. row = serviceRole.from('account_api_keys')
//          .select('id, account_id, scopes, revoked_at, expires_at')
//          .eq('key_hash', presentedHash).maybeSingle()   // O(1), unique index
// 4. if !row → 401 (no oracle: same 401 as malformed)
// 5. timingSafeEqual(presentedHash, row-implied hash)  // defense-in-depth
// 6. if revoked_at != null → 401; if expires_at && expires_at < now → 401
// 7. resolve { accountId, scopes }
```
- **Why hash-lookup beats prefix-lookup (Q11):** SHA-256 is deterministic, so the
  presented key's hash is an **exact, indexed** lookup — no table scan, no prefix
  collisions, and the comparison happens in Postgres on a 256-bit value. The `prefix`
  column stays purely cosmetic (UI identification). `timingSafeEqual` is retained as
  belt-and-suspenders, mirroring `requireCronAuth` discipline.
- **Fail-closed:** malformed header, unknown hash, revoked, and expired all collapse
  to the **same opaque 401** (no existence/active oracle).

**`core/apiKeys/` proposed surface (FK-1):** `generateApiKey(env)`,
`hashApiKey(raw)`, `parseBearer(header)`, `verifyApiKey(raw) → { ok, accountId,
scopes, keyId } | { ok:false }`, `requireApiKeyScope(scopes, "workflows:trigger")`.

---

## 7. Management routes (Q1, Q3) — account-scoped, owner/admin

Under **`/api/accounts/[id]/api-keys`** (Q3: yes — mirrors `members` /
`credential-requests`; cookie-auth + `requireAccountRole`).

| Route | Method | Gate | Behavior |
|---|---|---|---|
| `/api/accounts/[id]/api-keys` | `GET` | owner/admin | List **metadata DTOs** (no hash, no raw). |
| `/api/accounts/[id]/api-keys` | `POST` | owner/admin | Create; body `{ name, scopes?, expiresAt? }`. **Raw key returned exactly once** in the response; never again. |
| `/api/accounts/[id]/api-keys/[keyId]` | `DELETE` | owner/admin | **Soft revoke** (`revoked_at = now()`); idempotent. |
| `/api/accounts/[id]/api-keys/[keyId]` | `PATCH` *(optional, FK-2b)* | owner/admin | Rename only. **No rotate at launch** (revoke + create is the rotation path). |

- All gate with `requireAccountRole(userId, accountId, ["owner","admin"])`; member →
  403 `FORBIDDEN`, non-member → 403 `NOT_ACCOUNT_MEMBER`, **frozen account → rejected**
  (`account_frozen`, reuse the freeze guard) — no minting on an account on its way out
  (Q19).
- **`last_used_at` is NOT settable via any management route** — only the verify path
  touches it (§9/Q15).

**`POST` create response (one-time reveal):**
```json
{ "id": "...", "name": "...", "prefix": "crk_live_ab12…wxyz",
  "scopes": ["workflows:trigger"], "key": "crk_live_<raw>", "expiresAt": null }
```
`key` is present **only** here; `GET` never includes it.

---

## 8. Public trigger route (Q2, Q4) — `POST /api/v1/workflows/[id]/trigger`

The programmatic twin of `run-now`, **key-authenticated, no cookie session** (Q4:
yes — `/api/v1/...` versioned public namespace, separate from the cookie-gated
`/api/workflows/...`). **Ships behind `ENABLE_PUBLIC_API_KEYS` (default OFF)** until a
rate limiter lands (§10).

**Handler order (mirrors the webhook-route template, swapping signature for key
auth):**
1. `verifyApiKey(bearer)` → `{ accountId, scopes }` or **401** (opaque).
2. `requireApiKeyScope(scopes, "workflows:trigger")` → else **403 `insufficient_scope`**.
3. `workflowsRepo.getByIdServiceRole(id)`; **404** if missing/`state==='deleted'`
   (no existence oracle), **409 `workflow_not_active`** if not `active`.
4. **`workflow.accountId === key.accountId`** — else **404** (a key can only trigger
   **its own account's** workflows; never another account's). This is the core
   ownership invariant.
5. Freeze + billing: run through the **same `enqueueRun` + `executionBillingGate`**
   path the engine already applies (§11) — **402 `limit_reached`** /
   **403 `account_frozen`** mapped from the gate outcome.
6. `enqueueRun({ workflowId, triggerNodeId: <resolved trigger>, event, triggeredBy:
   "api_key", triggeredByUserId: null })` → **202** `{ runId, enqueuedAt }`.
- **`triggeredBy: "api_key"`** distinguishes API-triggered runs in run history /
  ledger without leaking which key.
- **Trigger node resolution:** the workflow's entry/manual-trigger node id (the
  `run-now` route already resolves this; reuse that logic).
- **No request body required** beyond an optional JSON `event` payload passed as
  trigger input (size-capped; never logged with secrets).

---

## 9. Role / authorization model (Q20, Q21)

- **Management = owner + admin only** (`requireAccountRole(…, ["owner","admin"])`).
  Plain **members cannot create, revoke, or list** keys at launch — a key acts as the
  whole account, so issuing one is an administrative act (parent §6; member-listing is
  an open decision §17, recommend owner/admin-only for symmetry).
- **Key scopes are the orthogonal axis:** role gates *who manages keys*; scopes gate
  *what a key can do*. Launch scope set = `['workflows:trigger']` only.
- **Public trigger authorization = the key itself** (no user session): scope check +
  the `workflow.accountId === key.accountId` ownership invariant (§8). A key can never
  act outside its account.
- **Frozen / pending-deletion accounts:** management routes reject; the public trigger
  refuses via the billing gate's `account_frozen` outcome (Q19).

---

## 10. Rate limiting strategy (Q16)

- **No limiter exists** → it is a **hard prerequisite** before the public trigger is
  enabled. Sequencing: **ship keys + management + the public route behind
  `ENABLE_PUBLIC_API_KEYS` (default OFF)**; flip ON only once a limiter lands.
- **Interim economic backstop:** the **execution billing gate** already deducts a task
  per run and refuses on exhaustion, so even pre-limiter a leaked key's abuse is
  bounded to the account's task budget (cost-capped, not request-capped).
- **Limiter design (deferred to a sub-slice / open decision §17):** per-key **and**
  per-account sliding-window request ceilings + short-lived failure lockout on
  repeated bad auth. **Backend choice deferred** — Upstash Redis (durable, multi-
  instance) vs. in-memory (single-instance only) vs. Postgres token-bucket. Recommend
  deciding when FK-4 is scheduled, not here.

---

## 11. Billing / task-usage interaction (Q17)

- The public trigger **reuses the engine's `executionBillingGate(accountId)`
  unchanged** — same deduction, same `limit_reached` / `account_frozen` outcomes,
  **billed to the workflow's owning account** (never an actor; there is no actor).
  No new billing code, no Stripe.
- Test-mode is **not** exposed on the public endpoint at launch (keys are `live`;
  `test` keys are reserved for a future sandbox) — every API-triggered run is a real,
  billable run.
- Mapping: gate `ok` → 202; `limit_reached` → **402** `{ error, used, limit }`;
  `account_frozen` → **403**. This makes the billing ceiling the primary abuse bound
  until the limiter ships.

---

## 12. Scope model (Q6, Q13)

- **Storage:** `scopes text[]`. **Launch allowlist (application-validated):**
  `workflows:trigger` is the **only** accepted/enabled value. Create rejects unknown
  or not-yet-enabled scopes with `400 invalid_scope`.
- **Reserved (modeled, disabled):** `workflows:read`, `workflows:manage`,
  `account:read` — recognized by the allowlist as *known but disabled* so the enum is
  forward-stable without a migration when enabled later.
- **Expiry (Q13):** **optional** (`expires_at` nullable, default no expiry).
  Recommend optional at launch (developer convenience); the create UI may offer
  presets (30/90/365 days / never).

---

## 13. Audit / notification model (Q18)

- **Reuse `notifications`** — extend `notification_type` with **`api_key_created`** and
  **`api_key_revoked`** (a small enum-`ALTER` migration in FK-2, **sequenced after the
  unapplied `20260605000002`** notification migration — parent §16). Write via
  `notificationsRepo.create()` (service-role, user-scoped) to the **acting
  owner/admin**, with **narrow metadata**: `{ keyId, prefix, actorUserId, accountId }`
  — **never** the raw key, `key_hash`, or full key.
- **Structured ops logs** (`console.info(JSON.stringify({ event, … }))`, no secrets):
  `api_key.created`, `api_key.revoked`, and on the verify path
  `api_key.auth_failed` (reason: `unknown | revoked | expired | bad_scope`) +
  `api_key.trigger_enqueued`. **Use failures are logged, not notified at launch** —
  a `notification` on repeated auth failures (possible key leak) is a **deferred**
  enhancement (needs the limiter's failure counter; §17).
- **No dedicated audit-log table** and **no cross-account/admin audit dashboard**
  (consistent with the parent + Security plan).

---

## 14. Security / no-leak guarantees (Q22)

- **Never exposes OAuth/integration tokens.** The key-auth path resolves only
  `{ accountId, scopes }`; it has **no code path** that reads `integrations.*_encrypted`
  or calls `decryptToken`. A negative test asserts the verify lib + trigger handler
  import/exercise **no** integration-token reader. **A key is not credential sharing**
  — it acts as the account within its own data, exactly the actions the app already
  allows; it cannot read another member's connection or another account's anything.
- **Raw key shown once**, in the `POST` create response only; **`key_hash` is never
  returned by any route/RPC** and never SELECTable by `authenticated` (§5).
- **Hash at rest** (SHA-256), **soft revoke** invalidates the hash match immediately,
  **expiry** enforced on verify, **opaque 401** on every failure mode (no oracle).
- **Account isolation:** `workflow.accountId === key.accountId` is mandatory on the
  trigger path; a key can never trigger another account's workflow.
- **Fail-closed config:** a missing required env (service-role key) hard-errors, never
  silently accepts (mirrors `requireCronAuth`).
- **Provider-webhook isolation:** shares **no** table, route, or secret with
  `app/api/webhooks/<provider>` or `trigger_resources`.

---

## 15. Account Settings UI expectations (Q23)

`ApiSection` ([AccountSections.tsx](../../../features/account/AccountSections.tsx))
evolves from the Phase-A "coming soon" panel to a **real, owner/admin-only** key
manager (active-account scoped, like Billing):
- **Key list:** name · `prefix` · scopes · `last_used_at` (relative) · status
  (active / expired / revoked). **Never** the raw key or hash.
- **Create flow:** name + optional scopes (only `workflows:trigger` selectable at
  launch) + optional expiry → **one-time reveal modal** ("copy now; you won't see this
  again") showing the raw key + a copy button.
- **Revoke:** confirm → soft revoke; the row flips to "revoked".
- **Role gating:** members see a read-only/empty state (or owner/admin-only section);
  no create/revoke affordance for members or on frozen accounts.
- **Webhooks half stays `ComingSoon`** (Phase D). **No fake delivery logs.**
- Reuses `Panel` / `SettingRow` / one-time-reveal modal primitives; honest-UI house
  rule (no fabricated keys) preserved.

---

## 16. Implementation slice breakdown

Land the **management plane before the public surface**; keep the public route dark
(flag OFF) until the limiter exists.

- **FK-1 — schema + crypto lib + repo (no routes, no behavior).**
  `account_api_keys` migration (RLS, GRANTs, indexes, trigger); `core/apiKeys/`
  (generate / hash / parse / verify / scope-check); service-role repo
  (`create`, `listMetadataByAccount`, `getByHash`, `revoke`, `touchLastUsed`) returning
  **hash-omitting DTOs**. Scope allowlist. Unit tests only.
- **FK-2 — management routes + audit.** `GET/POST /api/accounts/[id]/api-keys`,
  `DELETE …/[keyId]`; `requireAccountRole(["owner","admin"])` + freeze reject;
  one-time-reveal create; `notification_type` enum `ALTER` (sequenced after
  `20260605000002`) + `api_key_created/revoked` writes. (Optional FK-2b: `PATCH`
  rename.)
- **FK-3 — Account Settings UI.** Real key list + create-reveal modal + revoke;
  owner/admin gating; webhooks stays coming-soon.
- **FK-4 — public trigger endpoint (flag-gated OFF).**
  `POST /api/v1/workflows/[id]/trigger` + key-auth guard + scope/ownership/freeze +
  `enqueueRun` + billing-gate mapping + `last_used_at` throttled update. **Sub-prereq:
  rate limiter** (its own decision/sub-slice) before `ENABLE_PUBLIC_API_KEYS` flips ON.
- **Out of this arc:** outbound webhooks (Phase D), read/list & workflow-management
  scopes, per-workflow trigger secrets, the rate-limiter backend choice, any Stripe /
  plan work, and migrating the plaintext `trigger_resources.config` secrets.

> Ship FK-1→FK-3 to make keys real and manageable with **zero public exposure**;
> FK-4 turns on the ingress only once throttled.

### `last_used_at` safe update (Q15)
Best-effort, **non-blocking, throttled**: after a successful enqueue, fire a
service-role `UPDATE … SET last_used_at = now() WHERE id = $1 AND (last_used_at IS
NULL OR last_used_at < now() - interval '60 seconds')` **without awaiting** the
trigger response and **swallowing errors** — it must never delay or fail a run. The
60s throttle avoids a write per request.

---

## 17. Test plan (for the implementation slices)

**FK-1 (lib + repo):**
- `generateApiKey` → `crk_<env>_…`; `hashApiKey` deterministic; round-trip
  `verifyApiKey(generated.raw)` resolves the right `{ accountId, scopes }`.
- `verifyApiKey` rejects: malformed header, unknown hash, revoked, expired — **all
  opaque** (same negative result).
- `key_hash`/raw **never** appear in any DTO (`listMetadataByAccount` shape test).
- `requireApiKeyScope` passes only when `workflows:trigger` present; unknown scope
  rejected at create.

**FK-2 (management):**
- Create returns the raw key **exactly once**; `GET` exposes only `prefix`/metadata,
  never hash/raw.
- `requireAccountRole(["owner","admin"])`: member → 403; non-member →
  `NOT_ACCOUNT_MEMBER`; **frozen account → rejected**; revoke is idempotent + soft.
- Audit: create/revoke write `api_key_created`/`api_key_revoked` with **masked
  metadata only** (no raw/hash).

**FK-4 (public trigger):**
- Valid key + `workflows:trigger` + active workflow in the key's account → **202**
  `{ runId }` via `enqueueRun`.
- **Cross-account:** key for account A triggering account B's workflow → **404**.
- Missing/wrong scope → 403 `insufficient_scope`; revoked/expired/unknown key → 401.
- Billing: `limit_reached` → 402, `account_frozen` → 403; a real run **deducts a task**.
- **No-leak (load-bearing):** the trigger path **never** reads/returns/decrypts any
  `integrations.*_encrypted` token (negative import/behavior test); response carries
  `runId` only.
- (When the limiter lands) abusive bursts are throttled; flag OFF → endpoint 404.

**RLS (gated DB harness):** `authenticated` cannot SELECT `key_hash`; writes are
service-role only; SELECT policy is membership + freeze gated.

---

## 18. Risks / open questions

- **Rate-limit backend (Q16):** Upstash vs. in-memory vs. Postgres token-bucket —
  **must be chosen before `ENABLE_PUBLIC_API_KEYS` flips ON.** Recommend deciding at
  FK-4 scheduling.
- **Member visibility of key metadata (Q20/Q21):** owner/admin-only listing
  (recommended) vs. all-members-read for transparency.
- **Notification enum sequencing:** `api_key_created/revoked` depend on the
  **unapplied `20260605000002`** notification migration — apply/sequence first.
- **Public-API contract:** `/api/v1` versioning, the error envelope (`{ error, code }`
  shape used elsewhere), and pagination conventions for future list endpoints —
  settle the envelope at FK-4 (the first public route).
- **`live` vs `test` key semantics:** launch ships `live` only; define `test`-key
  behavior (sandbox runs?) before enabling that env segment.
- **Trigger input payload limits:** size cap + schema for the optional `event` body;
  ensure it never lands in logs alongside the bearer.
- **Repeated-auth-failure lockout / leak alerting:** deferred until the limiter's
  failure counter exists (§13).
- **Inbound-trigger-keys vs per-workflow secret (parent Q19):** this slice makes the
  API key *the* trigger credential; revisit per-workflow secrets only if demand
  appears.

---

## 19. Acceptance criteria (for this planning slice)

- A committed planning doc at `docs/slices/phase-4/api-keys-foundation-plan.md`; **no**
  source, migrations, tests, UI, API-key route, public-trigger route, billing/Stripe,
  rate-limit, or outbound-webhook implementation; nothing pushed.
- Aligns with and refines the parent [API & webhooks plan](./account-settings-api-webhooks-plan.md)
  Phase B without contradicting it.
- Answers all 23 planning questions with concrete, codebase-grounded decisions:
  account-scoped `account_api_keys` (hash + prefix, `key_hash` never client-SELECTable),
  owner/admin-managed routes under `/api/accounts/[id]/api-keys`, public trigger
  `POST /api/v1/workflows/[id]/trigger` behind `ENABLE_PUBLIC_API_KEYS` (default OFF),
  SHA-256 + `timingSafeEqual` hash-lookup verification, `workflows:trigger`-only scope,
  optional expiry, soft revoke, throttled `last_used_at`, billing-gate reuse,
  `notifications` audit, frozen-account rejection, and the no-OAuth-token / no-
  credential-sharing guarantees.
- Gives a concrete FK-1→FK-4 slice breakdown (management plane before public ingress;
  public route flag-gated until a limiter lands), a test plan, and the open decisions.

---

## Report summary

- **This is the Phase-B implementation design** for the parent API & webhooks plan:
  account-scoped, owner/admin-managed, `workflows:trigger`-only API keys.
- **Data:** `account_api_keys` — `key_hash` (SHA-256, UNIQUE-indexed, the O(1) lookup
  key), display `prefix`, `scopes text[]`, optional `expires_at`, soft `revoked_at`,
  throttled `last_used_at`; **service-role writes only, `key_hash` never client-
  SELECTable** (reads via hash-omitting DTOs, member-identity-RPC style).
- **Crypto:** `crk_<env>_<base64url>`; SHA-256 (no bcrypt/argon2, no new dep);
  verify = hash-lookup + `timingSafeEqual` + revoked/expired/scope checks; opaque 401.
- **Routes:** management `GET/POST /api/accounts/[id]/api-keys` + `DELETE …/[keyId]`
  (owner/admin, freeze-reject, one-time reveal); public `POST /api/v1/workflows/[id]/
  trigger` (key-auth, scope `workflows:trigger`, `accountId` ownership invariant,
  `enqueueRun` + billing gate, 202), **flag-gated OFF until a rate limiter ships**.
- **Billing/abuse:** reuse `executionBillingGate` (bills the workflow's account,
  refuses on frozen/limit) as the interim economic backstop; per-key/per-account
  limiter deferred (backend = open decision).
- **Audit:** `notifications` `api_key_created/revoked` (masked metadata) + structured
  ops logs; enum extension sequenced after the unapplied `20260605000002`.
- **UI:** `ApiSection` → real owner/admin key list + create-reveal modal + revoke;
  webhooks stays coming-soon.
- **No-leak:** keys never read/return/decrypt OAuth tokens, are not credential sharing,
  can only trigger their own account's workflows; raw shown once; hash never exposed.
- **Slices:** FK-1 schema+lib+repo → FK-2 management+audit → FK-3 UI → FK-4 public
  trigger (flag-gated, limiter prereq).
- **Open decisions:** rate-limit backend, member key-metadata visibility, notification-
  enum sequencing, `/api/v1` error/version/pagination contract, `live`/`test`
  semantics, trigger-payload limits, failure-lockout alerting.
