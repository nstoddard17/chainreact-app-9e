# 4.ACCOUNT-SETTINGS-API-WEBHOOKS-1 — API Keys + Webhooks Settings Plan

**Type:** Planning / design only. No source, migrations, tests, Stripe, API-key,
webhook, or UI implementation in this slice.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state):**
[features/account/AccountSections.tsx](../../../features/account/AccountSections.tsx) (`ApiSection`, lines 329-345) ·
[features/account/accountNav.ts](../../../features/account/accountNav.ts) (`api` section) ·
[services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts) (`requireAccountRole`) ·
[services/accounts/activeAccount.ts](../../../services/accounts/activeAccount.ts) (`resolveActiveAccount`) ·
[app/api/accounts/[id]/members/route.ts](../../../app/api/accounts/[id]/members/route.ts) (account-scoped route pattern) ·
[services/cron/auth.ts](../../../services/cron/auth.ts) (`requireCronAuth` — the only bearer-token auth today) ·
[services/triggers/dispatch.ts](../../../services/triggers/dispatch.ts) (inbound webhook dispatcher) ·
[supabase/migrations/20260507000000_trigger_resources_and_dedup.sql](../../../supabase/migrations/20260507000000_trigger_resources_and_dedup.sql) (`trigger_resources`, `webhook_event_dedup`) ·
[integrations/_shared/github/webhooks/signature.ts](../../../integrations/_shared/github/webhooks/signature.ts) (HMAC verify template) ·
[core/encryption/tokens.ts](../../../core/encryption/tokens.ts) (`encryptToken` / `decryptToken`) ·
[repositories/notifications.ts](../../../repositories/notifications.ts) (`create`) ·
[contracts/accounts.ts](../../../contracts/accounts.ts) (`AccountType`, `MembershipRole`) ·
[docs/slices/phase-4/account-settings-plan-billing-plan.md](./account-settings-plan-billing-plan.md) ·
[docs/slices/phase-4/account-settings-security-access-plan.md](./account-settings-security-access-plan.md).

> **Headline:** ChainReactV2 has **no public API and no customer-facing webhooks
> today.** The "API & webhooks" settings section is an honest "No API access yet —
> Coming soon" placeholder. Everything that looks webhook-shaped in the repo is
> **inbound provider webhooks** (Stripe/GitHub/Shopify/… → trigger a workflow),
> which are OAuth-/integration-bound and live entirely behind the trigger
> lifecycle — they are **not** a customer developer surface and must stay separate.
> There is **no API-key table, no bearer-token auth except the single `CRON_SECRET`
> cron guard, no outbound webhook delivery system, no rate limiting, and no audit
> log table.** Recommendation: ship a **truthful, read-only, "coming soon"** API &
> webhooks surface now (Phase A), then build **account-scoped, owner/admin-managed,
> least-privilege API keys** that authenticate ChainReact's *own* public API
> (starting with **manual workflow trigger only**) — storing **only a one-way hash**
> of each key, revealed once. Defer outbound webhooks (Phase D) until a delivery
> queue + retry + signing + audit exist. **No API key ever exposes an OAuth token
> or becomes a credential-sharing shortcut.**

---

## 1. Context

Account Settings is now functional through Profile basics, Notification
preferences, Security & access + password change, Plan & billing (read-only), and
the Danger zone / personal-deletion UI. The one remaining visible placeholder is
**API & webhooks** ([`ApiSection`](../../../features/account/AccountSections.tsx),
lines 329-345): a centered "No API access yet … Coming soon" panel with a
`ComingSoon` pill — no props, no backend, no data.

This area is **security-sensitive**: API keys and webhooks are bearer credentials
and outbound network egress. Building them wrong invites token leakage,
credential-sharing back-doors, replayable webhooks, and unauthenticated workflow
triggering. This plan locks the product definition, scoping, storage, and security
model **before** any implementation, so the first implementer does not (a) leak
OAuth tokens through a generic "API key", (b) entangle customer webhooks with the
provider-webhook trigger pipeline, or (c) ship a public key with no rate limiting.

Hard scope of *this* slice: **planning only.** No source, migrations, tests,
Stripe, API-key code, webhook code, UI behavior, or push.

---

## 2. Current codebase findings (verified)

### 2.1 Account model, roles, RLS

- **Roles** ([contracts/accounts.ts](../../../contracts/accounts.ts)): `MembershipRole = "owner" | "admin" | "member"`.
  **Account types**: `AccountType = "personal" | "team" | "organization"` (UI label
  `organization → "Business"`; never show "Organization").
- **Authorization chokepoint** ([services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts)):
  `requireAccountRole(userId, accountId, allowed: readonly MembershipRole[]) →
  { ok:true, role } | { ok:false, reason:"not_member"|"forbidden" }`. Every
  account-scoped management route funnels through it.
- **Active account** ([services/accounts/activeAccount.ts](../../../services/accounts/activeAccount.ts)):
  `resolveActiveAccount(userId, { explicitAccountId? })` resolves explicit → stored
  pointer (`user_profiles.active_account_id`) → personal fallback; returns
  `account_frozen` for pending-deletion personal accounts.
- **Membership-RLS pattern**: account-scoped tables gate SELECT on
  `EXISTS(account_memberships am JOIN accounts a … WHERE am.user_id = auth.uid()
  AND a.deletion_status = 'active')`, or via the SECURITY DEFINER RPC
  `is_account_member(account_id)`. **Writes are deliberately service-role / RPC-only**
  (no session-client write policy).
- **Data API GRANT convention** (mandatory for new public tables): explicit
  `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated` + `… TO service_role`
  alongside `ENABLE ROW LEVEL SECURITY` + policies.

### 2.2 Route authentication

- Canonical auth is **Supabase SSR cookie-based**:
  `requireAuthedUserId()` ([app/api/account/_shared.ts](../../../app/api/account/_shared.ts))
  for self-scoped routes; `requireUserWithAccount(explicitAccountId?)`
  ([app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts)) for
  account-scoped (chains `requireUser` → `resolveActiveAccount`, 403 on frozen /
  non-member). **There is no `getAuthHeader()` / app-issued token concept.**
- The **only** bearer-token auth today is the cron guard
  ([services/cron/auth.ts](../../../services/cron/auth.ts)): `requireCronAuth(req)`
  compares `Authorization: Bearer $CRON_SECRET` with `timingSafeEqual`, fail-closed
  on a missing secret. This is the closest *precedent* for API-key bearer auth, but
  it is a single shared secret, not a per-account user-issued key.
- `middleware.ts` only **refreshes** the session (`supabase.auth.getUser()` per
  request); it enforces **no** auth/role gates. All gates are at the route layer.
- **No rate limiting exists anywhere** — zero matches for `ratelimit`/`upstash`/
  limiter. It must be built before any public key is exposed.

### 2.3 Webhook + trigger infrastructure (inbound, provider-bound)

- ~20 inbound provider webhook routes under
  [app/api/webhooks/<provider>/route.ts](../../../app/api/webhooks). Flow:
  read raw body → verify provider signature → `dispatchTriggerEvent()`
  ([services/triggers/dispatch.ts](../../../services/triggers/dispatch.ts)) → dedup
  (`webhook_event_dedup`, first-writer-wins) → look up matching active workflows in
  `trigger_resources(provider, event_type)` → enqueue runs.
- Tables ([20260507000000](../../../supabase/migrations/20260507000000_trigger_resources_and_dedup.sql)):
  **`trigger_resources`** (one row per `(workflow_id, node_id)`; stores provider,
  event_type, and a `config` jsonb holding the per-trigger webhook endpoint id +
  signing secret) and **`webhook_event_dedup`** (deny-all RLS; system-only
  idempotency store, 7-day TTL).
- **Trigger lifecycle**: activation hooks create the provider-side subscription
  (e.g. `webhookEndpointsCreate` for Stripe) and persist its secret; deactivation
  hooks delete it. Routed through `services/triggers/{activation,deactivation}Registry`.
- **No generic customer-facing inbound trigger URL exists.** Every inbound webhook
  is registered *on the provider's side* against an OAuth/integration connection.
  The only customer-initiated run path is the **auth-gated**
  `POST /api/workflows/[id]/run-now` ([route](../../../app/api/workflows/[id]/run-now/route.ts)),
  which requires a logged-in session — not a programmatic key.
- **No outbound webhook delivery system exists** — no delivery queue, retry, or
  delivery-log table. (`native:http_request` is a *within-workflow action*, not an
  event-driven delivery service.)

### 2.4 Signature / HMAC verification

- **11 provider-specific** verifiers at
  `integrations/_shared/<provider>/webhooks/signature.ts`. They are **not shared** —
  each reimplements the primitive. Predominant pattern: **HMAC-SHA256 +
  `timingSafeEqual`** with a length-guard before compare (template:
  [github/webhooks/signature.ts](../../../integrations/_shared/github/webhooks/signature.ts)).
  Outliers: Discord (Ed25519), Trello (HMAC-SHA1), Mailchimp (no signature — URL
  secrecy only).
- **No outbound signing helper exists.** The only outbound HMAC is the internal
  OAuth state token (`services/oauth/state.ts:156`, `createHmac("sha256",…).digest("base64url")`).
  A **customer webhook signer must be built fresh**, though the inbound pattern is a
  clean template to mirror.

### 2.5 Encryption / secret storage

- **AES-256-GCM** at [core/encryption/tokens.ts](../../../core/encryption/tokens.ts):
  `encryptToken(plaintext) → base64(iv‖tag‖ciphertext)`, `decryptToken(packed)`,
  keyed by env `TOKEN_ENCRYPTION_KEY` (base64 32 bytes). Decryption failure is fatal.
- Integration OAuth tokens are stored encrypted in
  `integrations.access_token_encrypted` / `refresh_token_encrypted` (caller encrypts
  before write).
- **No bcrypt / argon2 dependency, and none is needed** (see §7) — the repo's only
  hashing is HMAC-SHA256 for signatures. Node's `crypto.createHash("sha256")` is
  available and is the correct primitive for hashing a *high-entropy* API key.
- ⚠ **Anti-pattern to NOT replicate:** inbound webhook signing secrets are currently
  stored **plaintext** in `trigger_resources.config` (jsonb), protected only by RLS.
  New API-key/webhook secrets must use encrypted columns or one-way hashes, never
  plaintext jsonb. (Migrating the existing plaintext trigger secrets to encrypted is
  a separate hygiene item — flagged in §16, out of scope here.)

### 2.6 Audit logging / notifications

- **No dedicated `audit_log` table and no admin/cross-tenant audit dashboard.** The
  `notifications` table ([20260507000004](../../../supabase/migrations/20260507000004_notifications.sql))
  is reused as the user-facing audit surface (enum `type`, `severity`, `metadata`
  jsonb; user-scoped RLS; service-role writes via
  [repositories/notifications.ts](../../../repositories/notifications.ts) `create`).
  High-risk workflow events already piggyback on it
  (`workflow_high_risk_activated/run`).
- **Server logging** is `console.info(JSON.stringify({ event, …fields }))` —
  structured JSON, no logger library, no log levels, never logs secrets/tokens.
- Append-only **ledger** precedent for high-volume events: `task_usage_events`,
  `ai_cost_events` (service-role writes, redacted metadata, account-scoped RLS).

### 2.7 Settings UI conventions

- Reusable primitives: `Panel`, `SettingRow`, plus `ComingSoon` pill /
  `ComingSoonRow` / `ReadOnlyRow` in
  [AccountSections.tsx](../../../features/account/AccountSections.tsx). House rule:
  *every non-deletion placeholder is honest — read-only values + "coming soon" pills,
  never a fake working toggle, input, or fabricated key.*
- Account-scoped sections (like `BillingSection`) receive `active: ActiveAccountView
  | null` ({ name, type, role }) as **props** and re-render when the active account
  switches; per-user sections (like `SecuritySection`) take no account prop.

---

## 3. Product definition: API keys

**What "API keys" means for ChainReactV2:** a bearer credential that authenticates a
caller to **ChainReact's own (future) public API** — *not* a place to paste a
third-party service key, and *never* a handle to a stored OAuth/integration token.

- **Hard line (non-negotiable):** an API key authorizes actions **the account can
  already do through the app**, executed *as the account*, gated by least-privilege
  scopes. It does **not** read, return, decrypt, or proxy any provider OAuth token,
  and it is **not** a credential-sharing mechanism between users or accounts.
- **Launch capability (narrowest useful slice): trigger a workflow.** The first real
  key scope is the programmatic equivalent of the authenticated `run-now`: "POST to
  start this account's workflow." Workflow *management* (create/edit/delete),
  read/list APIs, and full account API are **deferred** scopes — modeled in the scope
  enum from day one but not enabled at launch.
- **Why trigger-first:** it is the highest-demand developer use case, it maps onto an
  existing enqueue path, and it has the **smallest blast radius** — a leaked
  trigger-only key can start runs (cost/abuse, mitigated by rate limits) but cannot
  exfiltrate data or mutate configuration.

Answers to the planning questions on keys: keys are for **calling ChainReact's API**
(Q1/Q2), **account-scoped** (Q3), **owner/admin-managed** (Q4/Q5),
**least-privilege / trigger-only at launch** (Q6/Q7), **one-time visible** (Q8),
**one-way hashed at rest** (Q9), **prefix stored + displayed** (Q10), **optional
expiry** (Q11), **last-used tracked** (Q12), **revoke = soft-revoke flag** (Q13),
**rate-limited before public exposure** (Q14), **audited via notifications + a key
ledger** (Q15).

---

## 4. Product definition: Webhooks

"Webhooks" is overloaded in this codebase; the plan **disambiguates three distinct
things** and assigns each a lane (Q16/Q17):

1. **Inbound provider webhooks (EXIST — out of scope for this feature).** Provider →
   ChainReact, OAuth-bound, managed by the trigger lifecycle. **Keep entirely
   separate** from the customer developer surface; do not surface them in Account
   Settings (Q in "keep provider receivers separate").
2. **Inbound customer trigger URLs/keys (do not exist — Phase C, optional).** A
   generic endpoint a customer's external system can POST to in order to trigger a
   workflow, authenticated by an API key (or a per-workflow trigger secret). This is
   *auth for triggering*, so it is tightly coupled to the **API-key** model (Q19) and
   may fold into Phase B rather than being a separate webhook system.
3. **Outbound webhooks (do not exist — Phase D, heaviest).** ChainReact → customer
   URL on account events (e.g. `run.failed`, `run.succeeded`, `integration.disconnected`).
   These require infrastructure that does not exist: a **delivery queue, retry with
   backoff, signing, and a delivery-attempt log** (Q24/Q25). Deferred until that
   infra is built.

**Launch recommendation for the "Webhooks" half of the settings section:**
**coming-soon only.** No fake endpoints, no fake delivery logs. The first events to
support *when* outbound ships (Q18) should be the run-lifecycle events the
notifications system already models internally (`run.failed` first — it reuses the
existing failure-classification payload), then `run.succeeded`. Webhook **signing**
(Q22) = HMAC-SHA256 over the raw body with a per-endpoint secret, mirroring the
inbound verifier pattern but as a new outbound signer. Webhook secrets are
**one-time visible** (Q23) and, because outbound signing needs the *raw* value at
delivery time, stored **encrypted** via `encryptToken` (not hashed). Delivery
attempts/retries are **stored** in an append-only `webhook_deliveries` ledger
(Q24); exhausted-retry failures surface via a `webhook_delivery_failed` notification
(Q25).

---

## 5. Account / user scoping recommendation

**Account-scoped, not user-global** (Q3/Q20) — recommended, matches the locked
account-ownership model ("the account owns workflows / integrations / runs /
billing"). Concretely:

- Keys and webhook endpoints belong to an **account** (`account_id` FK), created in
  the context of the **active account**, resolved with `resolveActiveAccount`.
- A key authenticates **as the account** and can only act within that account's
  workflows/data. Switching the active account in the switcher changes what the API &
  webhooks section shows (same UX contract as Billing).
- This avoids the credential-sharing trap: a user-global key that implicitly spans
  every account the user belongs to would be exactly the cross-account back-door we
  must avoid. Account-scoping keeps blast radius inside one account.
- New tables follow the **membership-RLS + freeze-join + Data API GRANT** convention;
  **writes are service-role/RPC-only**; raw key material is **never** selectable by
  the `authenticated` role (see §7).

---

## 6. Role / permission model

- **Management (create / revoke / rotate) = owner + admin only at launch** (Q4/Q5/Q21),
  enforced with `requireAccountRole(userId, accountId, ["owner","admin"])`. Plain
  **members cannot** mint or revoke account credentials — a key acts as the whole
  account, so issuing one is an administrative act.
- **Listing** keys/endpoints (metadata only — name, prefix, scopes, last-used,
  created-by, status) **may** be visible to all members for transparency, or
  restricted to owner/admin; **recommend owner/admin-only at launch** for symmetry,
  revisit later (open decision §16).
- **Raw secret reveal** happens exactly once, in the create response, to the
  owner/admin who created it. It is never retrievable again from any route.
- **Frozen / pending-deletion accounts**: management routes reject (reuse the
  `account_frozen` outcome) — no minting credentials on an account on its way out.
- The **key's own scopes** are a second, orthogonal axis (least-privilege; §3). Role
  gates *who can manage keys*; scopes gate *what a key can do*.

---

## 7. Key / secret storage model

Two different secret classes need two different storage strategies:

| Secret | Needs raw value later? | Storage | Reuse |
|---|---|---|---|
| **API key** | No — only verify a presented key | **One-way hash** (`sha256` of the raw key) + stored `prefix` | `crypto.createHash` (built-in) |
| **Outbound webhook signing secret** | **Yes** — needed to sign each delivery | **Encrypted at rest** (`encryptToken`) | [core/encryption/tokens.ts](../../../core/encryption/tokens.ts) |

- **API keys → hash, do not encrypt** (Q9). A key is **high-entropy** (≥256 bits
  random), so a plain unsalted `SHA-256` is sufficient and correct; bcrypt/argon2 are
  for *low-entropy passwords* and are **not** needed here (this corrects the
  investigation's "must add a hashing library" note — no new dependency is required).
  Store only `key_hash` + a displayable `prefix` (e.g. first 8 + last 4 chars). The
  raw key is shown **once** at creation and never persisted.
- **Key format** (Q10): a recognizable, secret-scanner-friendly prefix, e.g.
  `crk_live_<random>` / `crk_test_<random>`. The prefix segment is stored and shown
  in the UI for identification; the random tail is what gets hashed.
- **Verification path**: incoming `Authorization: Bearer crk_…` → parse prefix →
  `sha256(presented)` → constant-time match against `key_hash` for that account →
  check `revoked_at IS NULL` and `expires_at` (Q11). Mirror `requireCronAuth`'s
  `timingSafeEqual` discipline.
- **Webhook secrets → encrypt** (Q23) because the outbound signer needs the raw value
  at send time. Reuse `encryptToken`/`decryptToken` and the existing
  `TOKEN_ENCRYPTION_KEY`. Store in an **encrypted column**, never plaintext jsonb
  (do not repeat the `trigger_resources.config` anti-pattern, §2.5).
- **No OAuth-token exposure, ever**: API-key auth resolves an account/scope context
  only; it has no code path that reads `integrations.*_encrypted`.

---

## 8. Security model

- **Bearer over TLS**, parsed exactly like `requireCronAuth` but per-account: prefix
  lookup → hash compare (`timingSafeEqual`) → scope check → freeze check.
- **Least privilege** (Q6/Q7): launch scope set is intentionally tiny —
  `workflows:trigger` only. `workflows:read`, `workflows:manage`, `account:read` are
  reserved enum values, disabled at launch.
- **One-time reveal** (Q8/Q23) for both keys and webhook secrets; irreversible
  storage (hash) for keys.
- **Revocation is immediate** (Q13): soft `revoked_at` timestamp; the verify path
  rejects revoked/expired keys. (No raw value to "delete" — revocation invalidates the
  hash match.)
- **Provider-webhook isolation**: the customer webhook system shares **no** secret,
  table, or route with `app/api/webhooks/<provider>` or `trigger_resources`. Inbound
  provider verification stays exactly where it is.
- **Outbound egress safety** (Phase D): sign every delivery (HMAC-SHA256 +
  timestamp, Stripe-style, to allow replay windows on the customer's side); restrict
  destinations to `https://`; consider SSRF guards (block internal/loopback/link-local
  ranges) before allowing arbitrary customer URLs.
- **Fail-closed config**: like `requireCronAuth`, a missing `TOKEN_ENCRYPTION_KEY`
  must hard-error, never silently accept.

---

## 9. Rate limiting / abuse controls

- **None exists today** (§2.2) — building it is a **hard prerequisite** before any
  public API key is exposed (Q14). A leaked trigger key with no throttle is a runaway
  billing/abuse vector.
- Recommended layers: **per-key** and **per-account** request ceilings (sliding
  window), plus reuse of the **existing execution billing gate**
  ([services/billing/executionBillingGate.ts](../../../services/billing/executionBillingGate.ts))
  as the economic backstop — a triggered run still deducts tasks and is refused on
  exhaustion, so abuse is bounded even before a dedicated limiter lands.
- Backend choice is an **open decision** (§16): Upstash Redis (durable, multi-instance),
  an in-memory limiter (simplest, single-instance only), or a Postgres token-bucket.
  Recommend deciding this in the Phase B design, not here.
- Defense-in-depth: short-lived per-key failure lockout on repeated bad auth (same
  concern flagged in the Security plan's password re-auth section).

---

## 10. Audit logging

- **Reuse the `notifications` table** (Q15) as the user-facing audit surface — no new
  audit infra at launch. Extend the `notification_type` enum with
  `api_key_created`, `api_key_revoked`, and (Phase D) `webhook_delivery_failed`, and
  write via `notificationsRepo.create()` (service-role, user-scoped). Metadata follows
  the **`buildHighRiskAuditPayload` discipline**: explicit, narrow projection — key
  id + masked prefix + actor + account + timestamp; **never** the raw key, hash, or
  secret.
- **Structured logs** for ops: `console.info(JSON.stringify({ event:"api_key.created",
  accountId, keyId, actorUserId, … }))`; for Phase D delivery, log every attempt
  (`webhook.delivery_attempt` with status, latency, retry, next-retry) — **no secrets,
  no bodies**.
- **High-volume delivery history** (Phase D) belongs in an append-only
  `webhook_deliveries` ledger (the `task_usage_events`/`ai_cost_events` pattern), not
  the notifications feed.
- A cross-account/admin audit dashboard remains **explicitly out of scope** (consistent
  with the Security plan).

---

## 11. API surface (future — none built this slice)

All routes account-scoped, owner/admin-gated via `requireAccountRole`, freeze-aware.

**Phase B — API keys (management plane):**
- `GET /api/accounts/[id]/api-keys` — list metadata (name, prefix, scopes, last_used_at, created_by, status). No secret.
- `POST /api/accounts/[id]/api-keys` — create; response is the **only** time the raw key is returned.
- `DELETE /api/accounts/[id]/api-keys/[keyId]` — revoke (soft).
- *(optional)* `PATCH /api/accounts/[id]/api-keys/[keyId]` — rename / rotate.

**Phase B/C — public API (data plane, key-authenticated):**
- `POST /api/v1/workflows/[id]/trigger` — bearer `crk_…`, scope `workflows:trigger`;
  the programmatic twin of `run-now`. Behind a new key-auth guard (parse → hash →
  scope → freeze → rate limit → enqueue).

**Phase D — outbound webhooks:**
- `GET/POST /api/accounts/[id]/webhooks`, `DELETE …/[endpointId]` — manage endpoints;
  POST returns the signing secret once.
- `POST …/[endpointId]/test` — send a signed test event.
- Internal delivery worker + `POST /api/cron/dispatch-webhook-deliveries` (bearer
  `CRON_SECRET`) draining the delivery queue with retry/backoff.

---

## 12. Data model (future — no migrations this slice)

Sketches only; numbers/columns finalized in the implementation slice. All tables:
membership-RLS SELECT, **writes service-role/RPC-only**, explicit Data API GRANTs,
freeze-aware joins.

**`account_api_keys`**
```
id uuid PK
account_id uuid NOT NULL → accounts(id) ON DELETE CASCADE
created_by_user_id uuid → auth.users(id) ON DELETE SET NULL   -- provenance
name text NOT NULL
prefix text NOT NULL            -- displayable identifier (e.g. crk_live_ab12…wxyz)
key_hash text NOT NULL          -- sha256(raw key); raw never stored
scopes text[] NOT NULL          -- launch: ['workflows:trigger']
last_used_at timestamptz
expires_at timestamptz          -- nullable (no expiry by default)
revoked_at timestamptz          -- soft revoke
created_at timestamptz, updated_at timestamptz
```
> ⚠ `key_hash` must **not** be granted to `authenticated` SELECT — expose key
> metadata to clients through a **view or RPC that omits `key_hash`**, or keep all
> reads service-role and return projected DTOs (mirrors how member identities are
> served via the `get_account_member_identities` RPC rather than raw table SELECT).

**`account_webhook_endpoints`** (Phase D)
```
id uuid PK, account_id uuid NOT NULL → accounts(id)
url text NOT NULL               -- https only
signing_secret_encrypted text NOT NULL   -- encryptToken(raw); raw shown once
subscribed_events text[] NOT NULL         -- e.g. ['run.failed']
created_by_user_id uuid, disabled_at timestamptz
created_at, updated_at
```

**`webhook_deliveries`** (Phase D, append-only ledger)
```
id uuid PK, account_id uuid, endpoint_id uuid, event_type text
http_status int, attempt int, max_attempts int
next_retry_at timestamptz, error_reason text   -- no body, no secret
created_at timestamptz
```

---

## 13. UI expectations

- **Active-account scoped**, truthful, read-only at launch (Q26) — mirrors Billing.
  `ApiSection` gains an `active: ActiveAccountView | null` prop and reuses
  `Panel` / `SettingRow` / `ComingSoon` / `ComingSoonRow`.
- **Phase A (now):** two panels —
  - *API keys:* a short, honest explanation of planned **account-scoped developer
    access** (owner/admin-managed keys to trigger this account's workflows) +
    `ComingSoon`. **No fake keys, no create button.**
  - *Webhooks:* honest explanation that **event webhooks to your URLs** are planned +
    `ComingSoon`. **No fake endpoints, no fake delivery log.**
  - Copy may note: "keys act as this account and never expose your connected
    integrations' tokens," reinforcing the no-credential-sharing guarantee.
- **Omit/defer (Q27):** any key list, create/reveal flow, scope picker, webhook
  endpoint form, delivery logs, test buttons — until Phases B/D.
- **Future (Phase B+):** real key list (name/prefix/scopes/last-used/status), a
  create flow with **one-time reveal** modal, and revoke; webhook UI later.

---

## 14. Implementation slice breakdown

- **API-WEBHOOKS-1 (Phase A) — read-only "coming soon" surface (shippable now, no
  backend).** Replace the single-message placeholder with two honest panels (API
  keys / Webhooks), active-account scoped, reusing existing primitives. Tests per §15
  Phase-A. *Smallest, truthful, unblocks the section.*
- **API-KEYS-FOUNDATION (Phase B) — account-scoped keys for manual trigger only.**
  `account_api_keys` table (hash + prefix), owner/admin management routes, one-time
  reveal, soft revoke, last-used tracking, `notifications` audit. **Prereq within
  this phase:** the key-auth guard + **rate limiting** before the public trigger
  endpoint goes live. Scope enum modeled fully; only `workflows:trigger` enabled.
- **INBOUND-TRIGGER-KEYS (Phase C, optional / may fold into B) — generic customer
  trigger.** `POST /api/v1/workflows/[id]/trigger` authenticated by Phase-B keys.
  Decide whether a per-workflow trigger secret is also wanted, or keys suffice.
- **OUTBOUND-WEBHOOKS (Phase D) — heaviest.** Delivery queue + retry/backoff + HMAC
  signing (encrypted secret) + `webhook_deliveries` ledger + `webhook_delivery_failed`
  notification + SSRF/egress guards. Starts with `run.failed`.
- **Cross-cutting prereq:** rate-limiting infrastructure (§9) lands with/just before
  Phase B's public endpoint. **Separate hygiene item:** migrate the existing
  plaintext `trigger_resources.config` webhook secrets to encrypted storage (§2.5) —
  not part of this customer-facing arc, but tracked.

> Do **not** build outbound webhooks and API keys in the same first implementation
> slice — they are not tightly coupled (keys are auth/ingress; outbound is egress +
> delivery infra). Keep provider webhook receivers untouched and separate throughout.

---

## 15. Test plan (for the implementation slices)

**Phase A (read-only):**
- `ApiSection` renders both panels with honest copy + `ComingSoon`; **no** interactive
  controls (no create/revoke/test buttons, no inputs).
- Active-account scoping: switching the active account re-renders the section (prop
  wiring), like Billing.
- Frozen/pending-deletion account → no "create" affordance is ever shown (consistent
  read-only state).

**Phase B (keys):**
- Create returns the raw key **exactly once**; subsequent reads expose only
  `prefix` — never `key_hash` or raw.
- Stored value is `sha256(raw)`; verifying a presented key matches via constant-time
  compare; a wrong/revoked/expired key is rejected.
- Management routes enforce `requireAccountRole(…, ["owner","admin"])`; member → 403;
  non-member → `NOT_ACCOUNT_MEMBER`; frozen account → rejected.
- RLS/least-privilege: `authenticated` cannot SELECT `key_hash` (view/RPC projection
  test); writes are service-role only.
- Key auth **never** resolves or returns any OAuth/integration token (negative test).
- Trigger endpoint enforces scope `workflows:trigger`; rate limiter caps abusive
  bursts; billing gate still deducts/refuses.
- Audit: create/revoke writes the right `notification_type` with masked metadata only.

**Phase D (outbound):**
- Each delivery is HMAC-signed; signature verifies with the (decrypted) secret;
  retries/backoff recorded in `webhook_deliveries`; exhausted retries notify; SSRF
  guard blocks internal URLs; secret revealed once and stored encrypted.

---

## 16. Risks / open questions

- **Inbound-trigger-keys vs. separate per-workflow secret** (Q19): fold customer
  triggering into the API-key model (recommended) or add per-workflow trigger
  secrets? Decide in Phase B/C design.
- **Member visibility of key metadata** (Q5/Q21): owner/admin-only listing
  (recommended) vs. all-members read for transparency.
- **Rate-limit backend** (Q14): Upstash Redis vs. in-memory vs. Postgres token-bucket
  — must be chosen before the public endpoint ships.
- **API-key hashing**: confirmed **plain SHA-256 (no bcrypt/argon2, no new
  dependency)** for high-entropy keys — corrects the investigation's "add a hashing
  library" note. (Re-evaluate only if keys ever become low-entropy / user-chosen,
  which they should not.)
- **Outbound egress / SSRF**: allowing arbitrary customer URLs requires deliberate
  SSRF protection (block loopback/internal/link-local; https-only); non-trivial,
  reinforces deferring Phase D.
- **Plaintext webhook secrets today** (`trigger_resources.config`, §2.5): existing
  hygiene debt to migrate to encrypted storage; flagged, separate slice.
- **`db:push` debt:** per the Billing closeout, the Notifications migration
  `20260605000002` is still unapplied; extending the notification enum for key/webhook
  events depends on the notifications schema being current. Sequence accordingly.
- **No public API contract yet:** versioning (`/api/v1`), error envelope, and
  pagination conventions for the public surface are undecided — settle before Phase B
  exposes the first endpoint.

---

## 17. Acceptance criteria (for this planning slice)

- A committed planning doc at this path; **no** source, migrations, tests, Stripe,
  API-key, webhook, UI, rate-limit, or enforcement changes; nothing pushed.
- States unambiguously, from verified evidence, that: ChainReactV2 has **no public
  API, no customer webhooks, no API-key table, no bearer auth except `CRON_SECRET`,
  no outbound delivery system, no rate limiting, and no audit-log table**; all
  existing "webhook" code is **inbound, provider-OAuth-bound** trigger infrastructure
  that stays separate.
- Locks the recommended models: **account-scoped, owner/admin-managed,
  least-privilege (trigger-only at launch) API keys**, stored as a **one-way SHA-256
  hash + prefix**, revealed once, soft-revocable, last-used-tracked, rate-limited
  before public exposure, audited via `notifications`; **API keys never expose OAuth
  tokens and are not credential sharing**; **outbound webhooks deferred** (Phase D)
  behind a delivery queue + retry + encrypted signing secret + delivery ledger.
- Gives a concrete phased breakdown (A read-only → B keys/trigger → C inbound trigger
  keys → D outbound webhooks), an account-scoped/owner-admin role recommendation, a
  storage model (hash keys / encrypt webhook secrets, reusing `encryptToken`), and
  flags the open decisions (rate-limit backend, member visibility, hashing choice,
  SSRF, plaintext-secret migration, public-API contract).

---

## Report summary

- **Current state (verified):** No public API, no API keys, no customer webhooks, no
  outbound delivery, no rate limiting, no audit-log table. The only bearer-token auth
  is the `CRON_SECRET` cron guard. All ~20 `app/api/webhooks/<provider>` routes are
  **inbound provider webhooks** bound to OAuth/integration connections via
  `trigger_resources` + the trigger lifecycle — a separate concern from a developer
  surface. Reusable foundations exist: `requireAccountRole` (owner/admin gating),
  `resolveActiveAccount` (account scoping), membership-RLS + Data API GRANT
  conventions, `encryptToken`/`decryptToken` (AES-256-GCM), inbound HMAC-SHA256
  verifier templates, and the `notifications` table for user-facing audit. Webhook
  signing secrets are currently stored **plaintext** in `trigger_resources.config`
  (an anti-pattern not to replicate).
- **Recommended API-key model:** account-scoped; owner/admin-managed; least-privilege
  with a `workflows:trigger`-only launch scope; raw key shown **once** and stored as
  an unsalted **SHA-256 hash + displayable prefix** (high entropy → no bcrypt/argon2,
  no new dependency); optional expiry; soft revoke; last-used tracking;
  `Authorization: Bearer crk_…` verified with `timingSafeEqual`; **never** exposes an
  OAuth token; rate-limited before public exposure.
- **Recommended webhook model:** disambiguate inbound-provider (exists, separate),
  inbound-customer-trigger (Phase C, folds into API keys), and outbound (Phase D).
  Outbound deferred until a delivery queue + retry/backoff + HMAC signing
  (per-endpoint secret stored **encrypted** via `encryptToken`) + `webhook_deliveries`
  ledger + SSRF guards exist; first event `run.failed`; secret one-time visible.
- **Scoping / roles:** account-scoped (active account, like Billing); management
  restricted to **owner + admin**; members cannot mint/revoke; frozen accounts
  rejected; new tables membership-RLS + service-role writes + GRANTs.
- **Implementation breakdown:** API-WEBHOOKS-1 read-only "coming soon" (now) →
  API-KEYS-FOUNDATION (keys + trigger endpoint + rate limiting) → INBOUND-TRIGGER-KEYS
  (optional) → OUTBOUND-WEBHOOKS. Keep API keys and outbound webhooks in **separate**
  first slices; keep provider receivers untouched.
- **Open decisions:** rate-limit backend; member visibility of key metadata;
  inbound-trigger-key vs per-workflow secret; SSRF/egress controls; migrating the
  existing plaintext `trigger_resources.config` secrets; the public-API
  versioning/error/pagination contract; sequencing around the unapplied
  `20260605000002` notifications migration.
