# 4.MCP-STAGE-2B — Live Read-Only Diagnostics (Internal Diagnostic API) Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-11
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this plan):**
[scripts/mcp/config.ts](../../../scripts/mcp/config.ts) (whitelist roots, caps, npm-script allowlist) ·
[scripts/mcp/registry.ts](../../../scripts/mcp/registry.ts) (explicit tool registry, no dynamic discovery) ·
[scripts/mcp/tools/index.ts](../../../scripts/mcp/tools/index.ts) (registry assembly — Plane A 2A tools wired) ·
[scripts/mcp/tools/diagnose.ts](../../../scripts/mcp/tools/diagnose.ts) (shipped Plane-A `diagnose_option_source` static + closed `OPTION_SOURCE_DIAGNOSES` taxonomy) ·
[scripts/mcp/http/config.ts](../../../scripts/mcp/http/config.ts) (Stage-1.5 HTTP transport: bearer required, loopback default, `MCP_HTTP_ALLOW_EXTERNAL` opt-in) ·
[scripts/mcp/http/auth.ts](../../../scripts/mcp/http/auth.ts) (constant-time bearer compare, `extractPresentedToken`, `redactToken`, Origin check) ·
[scripts/mcp/http-smoke.mjs](../../../scripts/mcp/http-smoke.mjs) (the `node:fetch` client pattern an MCP-side Plane-B tool will mirror) ·
[scripts/mcp/security/redact.ts](../../../scripts/mcp/security/redact.ts) (credential-shape egress redaction) ·
[app/api/options/[source]/route.ts](../../../app/api/options/%5Bsource%5D/route.ts) (the live resolution path Stage 2B-1 reuses end-to-end) ·
[app/api/providers/_shared.ts](../../../app/api/providers/_shared.ts) (`requireUser()` — cookie-based, **not** reachable by the MCP client) ·
[services/options/types.ts](../../../services/options/types.ts) (`OptionsSourceErrorCode` closed enum, `OptionsResolverError`, `OptionsResolverContext`) ·
[services/options/_registry.ts](../../../services/options/_registry.ts) (`getOptionsResolver`, `listOptionsResolvers`) ·
[services/options/credentialPolicy.ts](../../../services/options/credentialPolicy.ts) (`decideOptionsCredential` — the 4-way creator/account/not-owner decision) ·
[services/options/workflowCreatorContext.ts](../../../services/options/workflowCreatorContext.ts) (`resolveWorkflowCreatorContext` — RLS-scoped, never leaks existence) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`IntegrationRecord` incl. `accessTokenEncrypted`/`refreshTokenEncrypted`; `getActiveForExecution` — service-role) ·
[docs/slices/phase-4/mcp-stage-2-diagnostics-plan.md](./mcp-stage-2-diagnostics-plan.md) (parent plan — three-plane model; Plane A shipped, Plane B = this doc)

Prior shipped work referenced: Stage-1 server, Stage-1.5 HTTP transport, Stage-2A
Plane-A diagnostics (`diagnose_option_source` static + smoke tools, now live in
[tools/index.ts](../../../scripts/mcp/tools/index.ts)); options credential-sharing
policy (`57116df28`), builder options node-owner awareness (`3473352bd`).

---

## 1. Context

The internal MCP server (`scripts/mcp/`) has shipped three stages:

- **Stage 1** — stdio transport, curated read-only repo-context tools.
- **Stage 1.5** — opt-in, bearer-gated Streamable-HTTP front door onto the *same*
  registry ([http/config.ts](../../../scripts/mcp/http/config.ts)).
- **Stage 2A (Plane A)** — local-artifact + repo-static diagnostics:
  `diagnose_option_source` (**static**), `explain_provider_connection_requirements`,
  and the smoke-artifact tools. These import **only Node built-ins** and are
  test-fenced against any app/DB import (parent plan §2.1).

The parent plan ([mcp-stage-2-diagnostics-plan.md](./mcp-stage-2-diagnostics-plan.md))
defined a **three-plane model** and shipped Plane A. **This doc designs Plane B —
"Stage 2B" — live read-only diagnostics**, and scopes the *first* implementation
slice to **`diagnose_option_source_live` only**.

The motivating failure is unchanged: a builder dropdown (Slack channels) won't
populate. Plane A's static tool maps an *observed* `code` to cause + next-check from
the closed taxonomy — but it cannot tell you the *actual* code for *this* user right
now. That answer needs live state: the real registry lookup, the real
account/creator credential decision, the real integration row, and (for a
connected provider) the real resolver call. Stage 2B exposes exactly that, through
the app, sanitized, gated, and read-only.

---

## 2. Current codebase findings (verified)

### 2.1 The MCP process is hard-fenced from app/DB code — and stays that way

Per the parent plan §2.1 (test-enforced by `server-safety-guards` + the
import-boundary scan), nothing under `scripts/mcp` may import Supabase, a
repository, or app services. **Stage 2B does not change this.** A Plane-B MCP tool
is a `node:http`/`node:fetch` **client** only — the exact shape already proven by
[http-smoke.mjs](../../../scripts/mcp/http-smoke.mjs) lines 84-137 (build headers
with `Authorization: Bearer`, POST JSON, read JSON). All live data access, all
service calls, and all sanitization happen **inside a new app route**, never in the
MCP process.

### 2.2 The live resolution path already exists and is already sanitized

[app/api/options/[source]/route.ts](../../../app/api/options/%5Bsource%5D/route.ts)
is the single source of truth for "resolve options for this source." Its pipeline:

1. `getOptionsResolver(source)` → `SOURCE_NOT_FOUND` if absent (route 127-134).
2. `extractDeps` + `requiredDeps` check → `MISSING_DEPENDENCY` (route 149-160).
3. `resolveWorkflowCreatorContext(workflowId)` — RLS-scoped provenance, never throws
   (route 164-167; [workflowCreatorContext.ts](../../../services/options/workflowCreatorContext.ts)).
4. `decideOptionsCredential(provider, userId, workflowCreator, effectiveOwnerUserId)`
   → `legacy | account | personal-creator | not-owner`
   ([credentialPolicy.ts](../../../services/options/credentialPolicy.ts)).
   `not-owner` returns `NOT_WORKFLOW_OWNER` with **no lookup and no resolver call**
   (route 203-211) — a co-member's personal credential is never fetched.
5. `getActiveForExecution(accountId, provider, …, { connectedByUserId })` →
   `INTEGRATION_DISCONNECTED` / `OWNER_MUST_CONNECT` if no row (route 213-261).
6. `resolver.resolve(ctx)` (optionally inside `runWithCredentialResolutionContext`)
   → success items, or `OptionsResolverError`/`SERVER_ERROR` (route 264-305).

**Every error arm already emits a closed, pre-sanitized `OptionsSourceErrorCode`**
([types.ts](../../../services/options/types.ts) 46-69), and resolvers re-classify
provider failures (Slack `invalid_auth`/`missing_scope` → `PROVIDER_ERROR` /
`PROVIDER_REAUTH_REQUIRED`) so the raw provider code never reaches the body. This
is the property that makes a *live* diagnostic safe: **the code is already the
sanitized output — we return the code and a count, and drop the items.**

### 2.3 The MCP client cannot satisfy `requireUser()` — identity must be explicit

`requireUser()` ([_shared.ts](../../../app/api/providers/_shared.ts)) reads the
Supabase **cookie** session via `createClient()` (`@/utils/supabase/server`). The
MCP HTTP client sends a bearer header and **no browser cookie** — it has no user
session and cannot obtain the *affected* user's cookie. **Therefore the Stage 2B
route cannot reuse `requireUser()` for subject identity** (this refines the parent
plan §10's loose "`requireUser()` + dev gate" — `requireUser()` is the wrong gate
for a machine client).

Consequence (the central security decision, §6): the **subject** of diagnosis
(`userId`, optional `workflowId`/`nodeId`) is passed **explicitly** in the request,
and the route applies the **same** `decideOptionsCredential` policy under that
subject. The **bearer token is the machine trust boundary** — holding it authorizes
"resolve read-only diagnostics *as* this user." That is an impersonation-shaped
capability and is gated hard: dev-only, loopback, default-OFF in production (§6).

### 2.4 `IntegrationRecord` carries token blobs — they must never cross the DTO edge

[repositories/integrations.ts](../../../repositories/integrations.ts) 25-43:
`IntegrationRecord` includes `accessTokenEncrypted` and `refreshTokenEncrypted`
alongside the derivable, non-secret fields (`scopes`, `accessTokenExpiresAt`,
`disconnectedAt`, `connectedByUserId`). `getActiveForExecution` uses a service-role
client (220-227). The diagnostic DTO must be a **deliberate allow-list of derived
fields**, never a spread of the record.

### 2.5 No central feature-flag module exists in V2 (verified)

A grep for `FEATURE_FLAGS` / `featureFlag` / `process.env.ENABLE_` / `isEnabled(`
across `lib/ config/ core/` returns nothing. So Stage 2B's enable/disable gate is an
**env var read at the route**, not a flag registry. (Recommended names in §6.)

### 2.6 No `/api/internal` route group exists yet (verified)

`app/api/internal/**` is empty. Stage 2B introduces it. This is greenfield — no
existing internal surface to widen.

### 2.7 No migration is required (verified)

Stage 2B-1 reuses existing tables (`workflows`, `integrations`) through existing
services. It reads only. **No schema change, no new table, no `db:push`.** The
plan's hard boundary on migrations holds with nothing to prove — §11 states this
explicitly.

---

## 3. Product / model decision — what Stage 2B is, and is NOT

**Is:** a developer-facing *live diagnostic lens* that answers "what is the **actual**
failure code for this user/source/workflow right now, and where do I look next" by
running the **same services the product runs**, behind a sanitizing internal API.

**Is NOT:**
- **NOT** a mutation/repair tool. No reconnect, no disconnect, no workflow edit, no
  run execution, no cache reset, no token refresh. (Plane C, deferred.)
- **NOT** a production data browser. No tool returns item labels/values, field
  values, message text, channel names, recipient lists, raw provider bodies, tokens,
  or env values.
- **NOT** an architecture bypass. The route calls `getOptionsResolver` +
  `decideOptionsCredential` + `getActiveForExecution` + `resolver.resolve` — the
  identical functions the live route calls — so **diagnosis sees the same wall
  execution sees**. It never re-implements credential resolution or RLS, and the MCP
  process stays DB-free and import-fenced.

Anchored to the V2 account-scoped model (`57116df28`, `3473352bd`): a `not-owner`
situation diagnoses as exactly `NOT_WORKFLOW_OWNER` with **no credential fetch** —
the diagnostic never reaches a co-member's personal credential to "help."

---

## 4. Recommended approach — the two-tier Plane-B shape

```
┌────────────────────────────┐         ┌──────────────────────────────────────────────┐
│ MCP tool (scripts/mcp)     │  HTTP   │ app route  /api/internal/diagnostics/<x>       │
│ node:fetch client only     │ ──────▶ │  1. machine gate: shared bearer (const-time)   │
│ NO app import, NO DB        │ bearer  │     + DIAGNOSTICS_API_ENABLED + non-prod/opt-in│
│ reads sanitized DTO,        │ ◀────── │  2. subject from REQUEST body (userId,…)       │
│ renders text for the host   │  DTO    │  3. SAME services as production route          │
└────────────────────────────┘         │  4. map to sanitized DTO (enums/counts/bools)  │
                                        └──────────────────────────────────────────────┘
```

- **MCP side (DB-free, import-fenced):** a new `tools/diagnoseLive.ts` adds the
  Plane-B tool(s). It reads a base URL + bearer from env (`MCP_DIAGNOSTICS_URL`,
  `MCP_DIAGNOSTICS_TOKEN`), POSTs JSON via `node:fetch` (mirroring
  [http-smoke.mjs](../../../scripts/mcp/http-smoke.mjs)), and renders the returned
  **already-sanitized** DTO as text. It performs no interpretation that requires app
  types — it just formats fields. Output still passes the existing `redactSecrets`
  egress net as a backstop.
- **App side (where privilege lives):** a new route group
  `app/api/internal/diagnostics/*`. Each route runs the machine gate, then the
  existing services, then a **thin DTO mapper** at the edge. The service-role client
  and token blobs never leave the process.

### 4.1 Why a new route, not the existing `/api/options/[source]` route

The live options route is **cookie/`requireUser()`-gated** and returns item
**labels/values** in its success arm (`items: OptionItem[]`,
[types.ts](../../../services/options/types.ts) 108-113). A diagnostic must (a) be
machine-authenticated, (b) take an explicit subject, and (c) **drop the items**,
returning only the code + count. Reusing the route would force item leakage and a
cookie we don't have. The new route **calls the same service functions** but owns a
diagnostic-shaped contract.

---

## 5. Stage 2B-1 — `diagnose_option_source_live` (the first slice, fully specified)

> The only tool that ships in 2B-1. It directly addresses the Slack-channel
> dropdown failure and is narrower than workflow/run diagnostics.

**Purpose.** Run the *actual* option-source resolution for a given `source` under a
given subject (user ± workflow/node) and report the **real** `OptionsSourceErrorCode`
(or success-with-count), so a dev can turn "the channel dropdown is empty" into
"this user is hitting `PROVIDER_REAUTH_REQUIRED` — Slack token needs reconnect" or
"`INTEGRATION_DISCONNECTED` — no active Slack row on the resolving account."

**Route it calls.** `POST /api/internal/diagnostics/option-source`

**Inputs (MCP tool args → request body).**

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string | yes | `<provider>:<resource>`, e.g. `slack:channels`. Validated against `OPTIONS_SOURCE_KEY_REGEX`. |
| `userId` | string (uuid) | yes | The **subject** — whose context to resolve under. The bearer authorizes this. |
| `workflowId` | string (uuid) | no | Drives `resolveWorkflowCreatorContext` + `decideOptionsCredential` (creator/account/not-owner). Omitted → `legacy` (subject's own personal account). |
| `nodeId` | string | no | The node being configured. Threaded to `resolveEffectiveNodeOwner` exactly as the live route (route 145, 184-194). |
| `deps` | `Record<string,string>` | no | Parent dependsOn values, same shape the route extracts from `deps[*]`. |
| `q` | string | no | Search query; trimmed + length-capped (`MAX_QUERY_LENGTH = 256`), as the route does. |

**Exact services/repositories the app route uses (the production code paths).**

1. `getOptionsResolver(source)` — [_registry.ts](../../../services/options/_registry.ts) 560.
2. `resolveWorkflowCreatorContext(workflowId)` — [workflowCreatorContext.ts](../../../services/options/workflowCreatorContext.ts) (RLS-scoped; never leaks existence).
3. `resolveEffectiveNodeOwner(workflowId, nodeId)` — `services/teamCredentials/nodeCredentialOwners` (only for personal providers, as route 184-194).
4. `decideOptionsCredential(...)` — [credentialPolicy.ts](../../../services/options/credentialPolicy.ts).
5. `ensurePersonalAccount(userId)` (legacy arm) / `getActiveForExecution(...)` — [repositories/integrations.ts](../../../repositories/integrations.ts).
6. `resolver.resolve(ctx)` inside `runWithCredentialResolutionContext` for the pinned arm — same as route 264-283.

> **The route SHOULD be a thin wrapper that re-uses the live resolution as much as
> possible.** Recommended implementation note for the slice: extract the route's
> body (steps 1-6) into a shared `resolveOptionsSource(params): OptionsSourceResponse`
> service that **both** `/api/options/[source]` and the diagnostic route call, so the
> two can never diverge. If extraction is too large for 2B-1, the route may inline
> the same calls — but then a parity test (§8) is mandatory.

**Sanitized output shape (DTO returned to the MCP, then rendered as text).**

```jsonc
// success arm
{
  "ok": true,
  "source": "slack:channels",
  "code": null,                 // no error
  "itemCount": 42,              // COUNT ONLY — never the items
  "hasMore": true,
  "credentialDecision": "personal-creator", // legacy|account|personal-creator|not-owner
  "requiresIntegration": true,
  "integrationConnected": true  // derived bool, never the row
}
// error arm
{
  "ok": false,
  "source": "slack:channels",
  "code": "PROVIDER_REAUTH_REQUIRED",        // the real, closed OptionsSourceErrorCode
  "itemCount": 0,
  "hasMore": false,
  "credentialDecision": "personal-creator",
  "requiresIntegration": true,
  "integrationConnected": true,
  "missingDependency": null     // set only when code === MISSING_DEPENDENCY
}
```

Notes on the DTO:
- `code` is the **existing** `OptionsSourceErrorCode` value — already sanitized.
- `itemCount` replaces `items`. **The item labels/values are never serialized.**
- `credentialDecision` is the `kind` from `decideOptionsCredential` — an enum, not an
  identity (no `connectedByUserId` echoed back).
- `integrationConnected` is a derived boolean from whether `getActiveForExecution`
  returned a row — **never** any field of `IntegrationRecord`, never scopes here
  (scopes belong to `diagnose_integration_connection`, a later slice).
- `message` from `OptionsResolverError` is **dropped** — the resolver messages are
  caller-friendly but may name a resource ("Couldn't load Slack channels"); the code
  is the load-bearing signal and is enum-safe. (Decision: code-only, no message, to
  keep the never-expose net maximal. Open question OQ-3.)

**Authz requirements.** §6. Summary: shared bearer (constant-time) **and**
`DIAGNOSTICS_API_ENABLED=1` **and** (`NODE_ENV !== "production"` **or** an explicit
`DIAGNOSTICS_API_ALLOW_PROD=1` opt-in). Loopback-default origin. **No** `requireUser()`
— the subject is the explicit `userId`; the bearer is the trust boundary.

**Failure behavior.**

| Condition | Route response | MCP tool renders |
|---|---|---|
| Missing/invalid bearer | `401` (token never echoed; `redactToken` on any error text) | "diagnostic API rejected the request (401)" |
| `DIAGNOSTICS_API_ENABLED` unset / off | `404` (route behaves as if it does not exist — no capability disclosure) | "live diagnostics are disabled in this environment" |
| Prod without `ALLOW_PROD` | `404` (same — never reveals it exists in prod) | same as disabled |
| Bad/missing `source` or `userId` | `400` with `{ error: "invalid_input" }` (no echo of values) | "invalid input: source/userId required" |
| `source` not registered | `200` `{ ok:false, code:"SOURCE_NOT_FOUND", … }` | normal diagnosis |
| Any resolver/integration error | `200` with the corresponding closed `code` (same mapping as the live route) | normal diagnosis |
| Unexpected throw | `200` `{ ok:false, code:"SERVER_ERROR" }` (sanitized, mirrors route 299-305) | "server error during diagnosis" |
| MCP cannot reach the API (network) | n/a | "could not reach the diagnostic API at &lt;url&gt; (is it running / enabled?)" |

**No-leak tests (required for 2B-1).** §8.

---

## 6. Security model (the load-bearing section)

**Threat note.** The new capability is "a holder of `MCP_DIAGNOSTICS_TOKEN` can ask
the app to run option-source resolution **as an arbitrary `userId`** and learn the
resulting failure code + item count." It does not return content, tokens, or PII.
The risks are: (a) the token leaking and someone enumerating which users have
working/broken connections; (b) the route being reachable in production by default;
(c) DTO drift accidentally serializing items.

**Layered gate (all must pass):**

1. **Machine bearer (constant-time).** Reuse the exact pattern from
   [http/auth.ts](../../../scripts/mcp/http/auth.ts) `safeEqual` /
   `extractPresentedToken`. The token is env-sourced
   (`DIAGNOSTICS_API_TOKEN` on the app, `MCP_DIAGNOSTICS_TOKEN` on the client),
   ≥16 chars, never logged, `redactToken`-scrubbed from any error text. **This is a
   distinct secret from `MCP_HTTP_TOKEN`** (different trust domain — one fronts
   read-only repo tools, the other authorizes act-as-user diagnosis).
2. **Enable flag, default OFF.** `DIAGNOSTICS_API_ENABLED` must be truthy. Unset →
   the route returns `404` (capability non-disclosure), not `403`.
3. **Production lock, default OFF.** When `NODE_ENV === "production"`, the route is
   `404` **unless** `DIAGNOSTICS_API_ALLOW_PROD=1` is *also* explicitly set. Default
   posture: live diagnostics simply do not exist in prod.
4. **Loopback default on the client.** `MCP_DIAGNOSTICS_URL` defaults to a
   dev/staging origin (e.g. `http://127.0.0.1:3000`). Pointing it at production is a
   deliberate env change *and* requires the prod lock above to be lifted on the
   server — two independent actions.
5. **Subject scoping is the real policy.** The route never trusts a client-supplied
   *credential owner*; it derives the credential decision from
   `decideOptionsCredential` using the supplied `userId`/`workflowId` and the
   server-resolved node owner — identical to production. So even with the bearer, a
   diagnosis for a personal provider on a workflow the subject doesn't own returns
   `NOT_WORKFLOW_OWNER` with **no** credential fetch.

**Why not `requireUser()` + admin role?** V2 has no admin layer (parent plan §2.7,
re-verified §2.5). `requireUser()` needs a cookie the MCP client cannot present
(§2.3). The shared-bearer-plus-flags model is the same posture Stage 1.5 already
ships and operates, and it keeps the subject explicit and auditable. If a real admin
capability lands later, the route can additionally require it; the bearer stays as
the machine/transport gate.

**Account ownership & credential provenance preservation.** The route calls the
**same** `decideOptionsCredential` + `getActiveForExecution({ connectedByUserId })`
the live route does (§2.2). It therefore inherits, unchanged: account-shared
resolution for account providers, creator-pin for personal providers, and the
no-lookup `not-owner` path. The diagnostic cannot reach a credential the live route
wouldn't reach for the same subject.

**Same-code-path guarantee.** Enforced structurally by the recommended
`resolveOptionsSource(...)` extraction (§5) — one function, two callers — and/or by a
**parity test** (§8) asserting the diagnostic route and the live route return the
same `code` for the same inputs. This is how we ensure diagnostics reflect
production behavior rather than a re-implementation.

**Never returned (every tool, every Plane-B slice):**

| Must never expose | Enforcement in 2B-1 |
|---|---|
| OAuth tokens / refresh tokens / encrypted blobs | DTO is an allow-list of derived fields; `IntegrationRecord` is never spread; `decryptToken` never called in the diagnostic path; `redactSecrets` egress backstop. |
| Env values | Route never echoes `process.env`; no env field in any DTO. |
| Raw provider response bodies | Resolver already re-classifies to a closed `code` before the route sees it (§2.2); DTO carries the `code`, never the body. |
| Option item labels/values (Slack channel **names**, ids) | `items` is replaced by `itemCount`; items are never serialized into the DTO. |
| Resolver `message` strings | Dropped from the DTO (code-only); see OQ-3. |
| User/customer PII, recipient lists, message text | Not in scope of option-source resolution; DTO has no free-text field. |
| Service-role / DB access | Lives only inside the app route; never crosses the HTTP boundary; MCP process stays import-fenced (parent plan §2.1). |

---

## 7. How this preserves the parent plan's invariants

- **MCP stays DB-free + import-fenced.** The new MCP tool imports only `node:*` +
  local modules; the `server-safety-guards` + import-boundary tests stay green
  (acceptance criterion §10).
- **No new MCP transport.** The MCP tool is an HTTP *client*; Stage 1.5's server is
  untouched. The app route is plain Next.js App Router.
- **Plane discipline.** This is Plane B only. Plane C (`reconnect_integration`,
  `retry_run`, `reset_option_cache`, `force_token_refresh`, `repair_workflow_node`)
  remains explicitly deferred and unbuilt.

---

## 8. Tests required (Stage 2B-1)

**App route (`app/api/internal/diagnostics/option-source`):**
- **Gate tests:** 401 on missing/wrong bearer; 404 when `DIAGNOSTICS_API_ENABLED`
  unset; 404 in `production` without `DIAGNOSTICS_API_ALLOW_PROD`; 200 path only when
  all gates pass. Token never appears in any response body (assert on `401` text).
- **Mapping tests:** for each closed `OptionsSourceErrorCode`
  (`SOURCE_NOT_FOUND`, `MISSING_DEPENDENCY`, `INTEGRATION_DISCONNECTED`,
  `OWNER_MUST_CONNECT`, `NOT_WORKFLOW_OWNER`, `PROVIDER_ERROR`,
  `PROVIDER_REAUTH_REQUIRED`, `SERVER_ERROR`), the route returns the matching `code`
  with `itemCount: 0`.
- **Success test:** a connected resolver returns `{ ok:true, code:null, itemCount:N }`
  and **the items are not present anywhere in the JSON** (assert no item label/value
  string appears).
- **No-leak tests (mandatory):** assert the serialized DTO contains **no**
  `accessTokenEncrypted`/`refreshTokenEncrypted`/`token`/`scopes`/`connectedByUserId`
  field, no resolver `message`, no `items`, no env value, and passes a
  token-shaped-string scan.
- **`not-owner` no-fetch test:** for a personal provider on a workflow the subject
  doesn't own, assert `getActiveForExecution` is **not called** (spy) and the DTO is
  `NOT_WORKFLOW_OWNER`.
- **Parity test (same-code-path guarantee):** given identical inputs, the diagnostic
  route and `/api/options/[source]` produce the same `code` (or the same success
  classification). If the `resolveOptionsSource` extraction lands, this is a unit
  test on the shared function feeding both.

**MCP tool (`tools/diagnoseLive.ts`):**
- Renders each DTO arm to readable text without inventing data.
- Network-failure path renders the "could not reach" message, never throws.
- **Import-boundary test stays green** — the new tool imports only `node:*` + local
  modules (re-run the existing `server-safety-guards` scan; add the new file to its
  coverage if the scan is file-enumerated).
- Output passes `redactSecrets` (feed a synthetic token-bearing DTO, assert redaction).

**Green bar:** `npm run typecheck`, `npm run lint`, `npm run lint:structure`,
`npm run mcp:smoke`, and the MCP unit suite.

---

## 9. Implementation slice breakdown (2B is several slices; only 2B-1 now)

> Default-OFF in production for every live slice. **Ship 2B-1 only**; everything
> below it needs separate approval.

- **2B-1 — `diagnose_option_source_live`.** The new `/api/internal/diagnostics/option-source`
  route (machine-gated, sanitized DTO), the recommended `resolveOptionsSource(...)`
  extraction (or inline + parity test), the MCP `tools/diagnoseLive.ts` client tool,
  registration in [tools/index.ts](../../../scripts/mcp/tools/index.ts), env wiring
  (`DIAGNOSTICS_API_*`, `MCP_DIAGNOSTICS_*`), runbook section, and the §8 tests.
  **No migration.**

— **First-slice boundary. Below requires separate approval.** —

- **2B-2 — `diagnose_integration_connection`.** Route reads
  `getActiveForExecution`/`listActiveByAccount` + manifest required-scopes; DTO:
  `{ connected, disconnectedAt?, scopesPresent[], scopesMissing[], tokenExpired, connectedByUserId? }`.
  (Note: `listActiveByAccount` existence to be confirmed at build time — grep showed
  it referenced in `repositories/integrations.ts`; verify signature before use.)
- **2B-3 — `diagnose_workflow_readiness`.** Per-node `{ nodeId, kind, provider,
  status, missingRequiredFields: string[] (names only) }`. Needs the workflow read
  service + a readiness validator; field **names** only, never values.
- **2B-4 — `diagnose_run_failure`.** `{ status, firstFailedNodeId, errorCategory,
  errorCode, humanizedTitle }` from the run/execution-history read service; never raw
  provider bodies or step payloads.
- **2B-C (deferred indefinitely) — Plane C repair tools.** Not planned here.

---

## 10. Acceptance criteria

**For this planning slice:** this doc exists under `docs/slices/phase-4/`, every
"current state" claim is tied to a file that was read, no source/test/migration/UI
changed, nothing pushed.

**For 2B-1 to later meet:**
- The MCP process still imports only `node:*` + local modules (guard tests green).
- The route is `404` unless `DIAGNOSTICS_API_ENABLED` is set, and `404` in prod
  unless `DIAGNOSTICS_API_ALLOW_PROD` is also set; `401` on a bad bearer; the token
  never appears in any response.
- The DTO returns the **real** `OptionsSourceErrorCode` (or success-with-count) and
  carries **no** items, tokens, scopes, owner id, resolver message, or env value
  (no-leak tests prove it).
- A `not-owner` diagnosis performs **no** `getActiveForExecution` call.
- A parity test (or the shared `resolveOptionsSource` extraction) proves the
  diagnostic and the live route agree on `code`.
- `typecheck` / `lint` / `lint:structure` / `mcp:smoke` all green.

---

## 11. Risks / open questions (each with a recommendation)

- **OQ-1 — Bearer = act-as-user.** Holding `MCP_DIAGNOSTICS_TOKEN` lets the holder
  diagnose as any `userId`. *Recommendation:* accept it for a dev-only,
  read-only, count-only, default-OFF-in-prod capability; keep the token distinct from
  `MCP_HTTP_TOKEN`, ≥32 hex chars, env-only. Revisit if an admin layer lands (then
  additionally require it).
- **OQ-2 — Production pointing.** A dev could point the client at prod. *Recommendation:*
  two independent locks (client `MCP_DIAGNOSTICS_URL` default to dev **and** server
  `DIAGNOSTICS_API_ALLOW_PROD` default OFF). Both must change to reach prod.
- **OQ-3 — Resolver `message` in the DTO.** Messages are caller-friendly but may name
  a resource. *Recommendation:* **omit** the message in 2B-1 (code-only). If devs find
  the code insufficient, add a curated static "what this code means" string from the
  Plane-A `OPTION_SOURCE_DIAGNOSES` table client-side — never the live message.
- **OQ-4 — Route/route divergence.** If 2B-1 inlines the resolution instead of
  extracting `resolveOptionsSource`, the diagnostic could drift from production.
  *Recommendation:* prefer the extraction; if inlined, the parity test (§8) is
  mandatory and must run in CI.
- **OQ-5 — Live provider call cost / rate limits.** `resolver.resolve` makes a real
  read-only provider call (e.g. Slack `conversations.list`). *Recommendation:* fine
  for a manual dev tool; document that it counts against the provider rate limit, and
  do **not** add retry/polling. No caching in 2B-1.
- **OQ-6 — `listActiveByAccount` signature (2B-2 only).** Referenced but not
  inspected for this plan. *Recommendation:* verify its exact return shape before
  building 2B-2; it does not affect 2B-1.

---

## 12. Explicit non-goals

- No mutation of any kind (no reconnect, disconnect, workflow edit, run, cache reset,
  token refresh).
- No migration, no `db:push`, no new table, no schema change (§2.7).
- No arbitrary SQL, no direct Supabase access from `scripts/mcp`.
- No production enablement by default.
- No item labels/values, field values, tokens, scopes (in 2B-1), provider bodies, env
  values, or PII in any output.
- No new MCP transport; no admin role invented for this.

---

## 13. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, or config changed. No tool was added to
the MCP registry. The MCP server, the options route, the integrations repository, and
the credential policy are all untouched. Nothing was pushed. The two-tier Plane-B
model, the DTO shapes, the gate, and the 2B-1 scope are **proposals** for the named
slices, not implemented behavior.

---

## 14. Recommended next step

Implement **2B-1 — `diagnose_option_source_live`** exactly as scoped in §5–§8:
the machine-gated `/api/internal/diagnostics/option-source` route (default OFF in
prod), the `resolveOptionsSource` extraction (preferred) so the diagnostic and the
live builder share one code path, the DB-free MCP client tool, and the full no-leak +
parity test set. Do **not** start 2B-2+ (integration/workflow/run live diagnostics)
without separate approval.
