# 4.MCP-STAGE-2B-2 — `diagnose_integration_connection` (Live Connection Diagnostic) Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-11
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this plan):**
[app/api/internal/diagnostics/_shared.ts](../../../app/api/internal/diagnostics/_shared.ts) (the 2B-1 machine gate — reused verbatim) ·
[app/api/internal/diagnostics/option-source/route.ts](../../../app/api/internal/diagnostics/option-source/route.ts) (2B-1 route shape: gate → validate → service → sanitized DTO) ·
[services/options/resolveOptionsSource.ts](../../../services/options/resolveOptionsSource.ts) (2B-1 shared resolver + the credential-decision branching this plan mirrors) ·
[scripts/mcp/tools/diagnoseLive.ts](../../../scripts/mcp/tools/diagnoseLive.ts) (2B-1 MCP `fetch` client + render pattern; import-fenced) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`IntegrationRecord`, `getActiveForExecution`, `getByIdForAccountServiceRole`, `countActiveByAccountProviderServiceRole`, `listActiveByAccount`) ·
[repositories/accountMemberships.ts](../../../repositories/accountMemberships.ts) (`isMemberServiceRole`, `getRoleServiceRole` — sessionless authz) ·
[services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts) (`requireAccountRole` — session/RLS-based, NOT usable here) ·
[contracts/integration.ts](../../../contracts/integration.ts) (`ProviderManifestSchema`: `scopes.required/optional`, `isEnabled`, `refreshable`, `tokenScope`, `capabilities.oauth`) ·
[integrations/_registry.ts](../../../integrations/_registry.ts) (`getProvider(id)` runtime manifest accessor) ·
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`credentialSharingForProvider`, `isPersonalCredentialProvider`) ·
[services/options/credentialPolicy.ts](../../../services/options/credentialPolicy.ts) (`decideOptionsCredential` — the provenance policy reused) ·
[services/ai/tools/integrations.ts](../../../services/ai/tools/integrations.ts) (line 13: "does not yet model per-integration health / reconnect state") ·
[docs/slices/phase-4/mcp-stage-2b-live-diagnostics-plan.md](./mcp-stage-2b-live-diagnostics-plan.md) (parent 2B plan)

Prior shipped work referenced: `93a2d5484` (Stage 2B-1 `diagnose_option_source_live` + internal diagnostics API + gate), `f54044841` (Stage 2B plan), `57116df28` (options credential-sharing policy), `3473352bd` (node-owner awareness), `55c004501`/`deb4897a5` (parallel disconnect arc — `getByIdForAccountServiceRole`, `countActiveByAccountProviderServiceRole`).

---

## 1. Context

Stage 2B-1 (`93a2d5484`) shipped the first live diagnostic and, with it, the
**internal diagnostics API pattern**: an import-fenced MCP `fetch` tool → an
app-owned `/api/internal/diagnostics/*` route → a sanitized DTO, gated by a
machine bearer that is default-OFF and 404 in production. It diagnoses **one
option-source resolution** by running the real resolver.

Stage 2B-2 adds the next tool in the parent plan's Plane B:
**`diagnose_integration_connection`** — "is provider X actually connected and
usable for this account/subject?" This is the *root-cause* layer beneath 2B-1:
when 2B-1 returns `INTEGRATION_DISCONNECTED` / `PROVIDER_REAUTH_REQUIRED`, 2B-2
explains **why** the connection is in that state (no row at all vs expired token
vs missing scopes vs provider disabled vs a provenance/ownership wall) — without
running any picker and without calling the provider.

This plan designs 2B-2 only. It implements nothing.

---

## 2. Current codebase findings (verified)

### 2.1 The diagnostics route is SESSIONLESS — authz must be service-role + explicit subject

2B-1's route ([option-source/route.ts](../../../app/api/internal/diagnostics/option-source/route.ts))
uses **no** `requireUser()`. The machine bearer is the trust boundary; the subject
is an explicit `userId` in the body
([_shared.ts](../../../app/api/internal/diagnostics/_shared.ts)). **Consequence for
2B-2:** the standard account-access guard `requireAccountRole`
([accountAuthz.ts:22](../../../services/accounts/accountAuthz.ts)) reads the
caller's membership through the **session/RLS client** (`getRole` → "a user can
only read their own membership row") — there is **no session here**, so it cannot
authorize anyone. 2B-2 must instead use the **service-role** sessionless check
`isMemberServiceRole(accountId, userId)`
([accountMemberships.ts:205](../../../repositories/accountMemberships.ts)), which
answers "is this subject a member of this account" by bypassing RLS — exactly the
shape the machine-gated route needs.

### 2.2 V2 has NO stored per-integration health/connection-state model (verified)

[services/ai/tools/integrations.ts:13](../../../services/ai/tools/integrations.ts)
states the system "does not yet model per-integration health / reconnect state."
There is **no** `health_check_status` / `requires_user_action` / `last_error_code`
column on `integrations` (the V1 CLAUDE.md health state machine is **V1**, not
present here). The manifest declares a `healthCheckIntervalMs`
([contracts/integration.ts:77](../../../contracts/integration.ts)) anticipating a
future engine, but nothing writes a status today.

**Consequence (the central design fact):** 2B-2's connection status is **derived
at request time** from the stored row + the manifest, never read from a status
column. It is a *snapshot computed from facts*, not a health record. The DTO and
docs must say "derived," and "token will refresh OK" is **not** knowable without a
live call (out of scope — §3).

### 2.3 Everything 2B-2 needs already exists — no new repository, no migration

[repositories/integrations.ts](../../../repositories/integrations.ts) provides:
- `getActiveForExecution(accountId, provider, providerAccountId, { connectedByUserId? })` — service-role, earliest active row, supports the provenance pin (lines 219-250).
- `getByIdForAccountServiceRole(accountId, integrationId)` — service-role, **exact on both columns** so a row from another account returns null (lines 444-461) — cross-account-safe by construction.
- `countActiveByAccountProviderServiceRole(accountId, provider)` — service-role active count (lines 470-489).
- `listActiveByAccount(accountId)` — **RLS-cookie client** (lines 309-321) → NOT usable in the sessionless route; listed to mark it as the wrong tool here.

[integrations/_registry.ts](../../../integrations/_registry.ts) `getProvider(id)`
returns the `ProviderManifest` with `scopes.required` / `scopes.optional`,
`isEnabled`, `refreshable`, `tokenScope`, `capabilities.oauth`
([contracts/integration.ts:48-116](../../../contracts/integration.ts)). The row's
granted `scopes: string[]` ([IntegrationRecord](../../../repositories/integrations.ts)
line 38) compared against `manifest.scopes.required` yields the scope gap.

**So 2B-2 needs zero schema change, zero new table, zero migration, zero new
repository function** — it composes existing service-role reads + the manifest. (If
a future need for a multi-row connection list surfaces, a thin service-role
`listActiveByAccountProviderServiceRole` could be added then — explicitly out of
scope here.)

### 2.4 The credential-sharing + provenance policy is already centralized

[credentialPolicy.ts](../../../services/options/credentialPolicy.ts)
`decideOptionsCredential` + [credentialSharing.ts](../../../core/integrations/credentialSharing.ts)
`credentialSharingForProvider` classify a provider `personal | account` and decide
which credential a request may resolve. 2B-1 already threads this. 2B-2 reuses the
**same** decision so a connection diagnosis is scoped identically to how execution
and the builder resolve — never wider.

### 2.5 The gate + MCP client patterns are reusable verbatim

`applyDiagnosticsGate(req)` ([_shared.ts](../../../app/api/internal/diagnostics/_shared.ts))
already encodes: `DIAGNOSTICS_API_ENABLED` (default OFF → 404), prod lock
`DIAGNOSTICS_API_ALLOW_PROD` (→ 404 in prod unless set), bearer `DIAGNOSTICS_API_TOKEN`
(constant-time, never logged). The MCP tool
([diagnoseLive.ts](../../../scripts/mcp/tools/diagnoseLive.ts)) already encodes the
import-fenced `fetch` client reading `MCP_DIAGNOSTICS_URL` / `MCP_DIAGNOSTICS_TOKEN`.
2B-2 adds one route + one tool that **reuse both** — no new env, no new gate, no new
transport.

---

## 3. Product / model decision — what 2B-2 is, and is NOT

**Is:** a developer-facing, **stored-state-derived** connection diagnostic. Given a
subject + account + provider (optionally a specific integration row), it returns a
single classified `status` plus a few derived booleans/counts explaining the
connection's usability — reusing the same account-membership + provenance walls as
execution.

**Is NOT:**
- **NOT** a mutation/repair tool — no reconnect, disconnect, token refresh, or
  workflow edit. (Q boundaries.)
- **NOT** a live provider probe — it makes **no** outbound provider call. "Does the
  token actually still work at the provider" is 2B-1's job (it runs a real resolver);
  2B-2 answers the orthogonal "what does our stored state say." (§Q8.)
- **NOT** a health record reader — there is no stored health status (§2.2); every
  field is derived at request time and labelled as such.
- **NOT** a cross-member presence browser — for **personal** providers it only ever
  inspects the subject's own / the workflow-owner's connection, never "which other
  member has X connected" (that presence question is owner/admin-gated elsewhere,
  [integrations.ts:334](../../../repositories/integrations.ts)).

**Anchored to the V2 account model:** the account is the ownership root. Access is
gated by **account membership** (`isMemberServiceRole`); provenance for personal
providers follows `decideOptionsCredential`. A subject can only diagnose a
connection that subject could legitimately resolve.

---

## 4. Recommended approach

Mirror 2B-1 exactly, swapping the resolver for a pure derivation:

```
MCP tool diagnose_integration_connection (fetch client, import-fenced)
   │  POST { userId, accountId|workflowId, provider, integrationId? }
   ▼
POST /api/internal/diagnostics/integration-connection
   1. applyDiagnosticsGate(req)                          ← reused 2B-1 gate
   2. validate input
   3. resolve accountId (+ creator provenance) from workflowId if given
   4. AUTHZ:  isMemberServiceRole(accountId, userId)     ← service-role, sessionless
              → NO_ACCOUNT_ACCESS (no row fetch) if false
   5. PROVENANCE: credentialSharingForProvider(provider) + decideOptionsCredential
              → NOT_WORKFLOW_OWNER (no row fetch) for personal+non-owner
   6. READ stored state (service-role, no provider call):
              getProvider(provider)                       ← manifest
              getByIdForAccountServiceRole | getActiveForExecution(+pin)
              countActiveByAccountProviderServiceRole
   7. DERIVE status from row + manifest (pure function)   ← deriveConnectionDiagnosis()
   8. map to sanitized DTO (enums / counts / booleans)
```

The derivation (step 7) is a **pure, unit-testable** function
`deriveConnectionDiagnosis(manifest, row | null, activeCount, now)` — this is the
recommended CS-1 (ship + test it before any HTTP). The route + MCP tool is CS-2.

### 4.1 Inputs (Q2) — recommended shape

| Field | Type | Required | Role |
|---|---|---|---|
| `userId` | uuid | **yes** | Subject — drives `isMemberServiceRole` authz + personal-provider provenance. The bearer authorizes acting as this subject. |
| `provider` | string | **yes** | Provider id (`getProvider` validates it). |
| `accountId` | uuid | yes¹ | The account whose connection to inspect. |
| `workflowId` | uuid | no | Convenience: resolves `accountId` + creator provenance via `resolveWorkflowCreatorContext`, mirroring 2B-1. Drives `NOT_WORKFLOW_OWNER`. |
| `integrationId` | uuid | no | Pin a SPECIFIC row (by-id mode, §Q4). Diagnosed via `getByIdForAccountServiceRole(accountId, integrationId)` — cross-account-safe. |

¹ Exactly one of `accountId` or `workflowId` must be present (workflow resolves the
account). Supplying both: `workflowId` wins for the account, `accountId` must match
or → `400`.

### 4.2 Modes (Q4) — support BOTH

- **By provider + account (default):** diagnose the active connection for
  `(accountId, provider)`. Returns `activeConnectionCount` + the derived state of the
  **resolved** row (the same earliest-active row execution would pick, via
  `getActiveForExecution`, with the personal-provider provenance pin applied).
- **By integrationId (pin):** when `integrationId` is supplied, diagnose exactly that
  row via `getByIdForAccountServiceRole` (returns null cross-account → `DISCONNECTED`/
  `not found`). Useful when an account legitimately has multiple active rows
  (workspace providers) and the dev wants one specific connection.

Recommendation: **both**, provider+account as primary, `integrationId` optional.

---

## 5. Exact route contract proposal

`POST /api/internal/diagnostics/integration-connection`

**Request body:** `{ userId, provider, accountId? , workflowId?, integrationId? }`
(constraints per §4.1).

**Gate behavior (reused 2B-1):** disabled → `404`; prod-without-allow → `404`;
bad/missing bearer → `401`; bad input → `400`. Token never echoed.

**Response (200, sanitized DTO):**

```jsonc
// CONNECTED
{
  "ok": true,
  "provider": "slack",
  "accountId": "acct-…",          // echoes a value the caller already supplied
  "status": "CONNECTED",
  "activeConnectionCount": 1,
  "hasActiveRow": true,
  "providerEnabled": true,        // manifest.isEnabled
  "refreshable": true,            // manifest.refreshable
  "credentialClass": "account",   // personal | account
  "tokenExpired": false,          // derived; null when no expiry tracked
  "scopesSatisfied": true,
  "missingScopeCount": 0
}

// MISSING_SCOPES (the high-signal case)
{
  "ok": false,
  "provider": "slack",
  "accountId": "acct-…",
  "status": "MISSING_SCOPES",
  "activeConnectionCount": 1,
  "hasActiveRow": true,
  "providerEnabled": true,
  "refreshable": true,
  "credentialClass": "account",
  "tokenExpired": false,
  "scopesSatisfied": false,
  "missingScopeCount": 2,
  "missingScopes": ["channels:read", "groups:read"]   // NAMES of the GAP only (Q7)
}

// authz / no-row arms — no row was fetched
{ "ok": false, "provider": "gmail", "accountId": "acct-…",
  "status": "NOT_WORKFLOW_OWNER", "activeConnectionCount": 0, "hasActiveRow": false,
  "providerEnabled": true, "refreshable": true, "credentialClass": "personal",
  "tokenExpired": null, "scopesSatisfied": false, "missingScopeCount": 0 }
```

**DTO field notes:**
- `status` is the closed classification enum (§Q9).
- `tokenExpired` is `boolean | null` — `null` when no active row, or when the provider
  doesn't expose expiry (`accessTokenExpiresAt === null`). **No timestamp is returned**
  — just the boolean (an exact expiry instant is unnecessary and slightly fingerprinty).
- `missingScopes` (names) appears **only** in the `MISSING_SCOPES` arm and lists the
  **gap** (`required − granted`), never the full granted set (§Q7).
- `credentialClass` / `providerEnabled` / `refreshable` come from the manifest +
  classifier — public, non-secret.
- Every value is an enum / count / boolean / public scope-name. Nothing is spread from
  `IntegrationRecord`.

---

## 6. Security / no-leak model (Q3, Q6, Q7)

**Threat note.** The new capability lets a `DIAGNOSTICS_API_TOKEN` holder ask "what is
the stored connection state for provider P on account A, as subject U." It returns no
credential and no provider data — only derived state. Risks: (a) token leak →
connection-state enumeration; (b) cross-member personal-credential *presence* leak;
(c) DTO drift spreading the row. Mitigations: machine gate (default OFF / prod-locked),
membership authz, personal-provider provenance scoping, and an allow-list DTO.

**Authz + provenance (the account-ownership guarantee):**
- **Account access:** `isMemberServiceRole(accountId, userId)` must be true, else
  `NO_ACCOUNT_ACCESS` with **no integration row fetched**. (Sessionless; service-role.)
- **Account providers** (slack/notion/stripe/shopify/hubspot/mailchimp): account-shared
  — any member may diagnose `getActiveForExecution(accountId, provider, null)`.
- **Personal providers, no workflow context:** scope the lookup to the **subject's own**
  connection — `getActiveForExecution(accountId, provider, null, { connectedByUserId: userId })`.
  A member never learns whether *another* member has a personal provider connected.
- **Personal providers, workflow context:** run `decideOptionsCredential` exactly as
  2B-1 → `personal-creator` pins to the owner; non-owner → `NOT_WORKFLOW_OWNER` with **no
  row fetched** (no provenance leak). This is the same wall execution + the builder use.
- **By-id mode:** `getByIdForAccountServiceRole(accountId, integrationId)` is exact on
  both columns → a row from another account is invisible (returns null → `DISCONNECTED`/
  not-found). The membership check still gates `accountId` first.

**Never returned (every arm):**

| Must never expose | Enforcement |
|---|---|
| `accessTokenEncrypted` / `refreshTokenEncrypted` / plaintext token | DTO is an allow-list; `IntegrationRecord` never spread; `decryptToken` never called in this path. |
| `connectedByUserId` (provenance identity) | Used internally for the pin; never serialized. |
| `providerAccountId`, `displayName`, raw `accountMetadata` | Not in the DTO; these can carry workspace names / handles (PII-ish). |
| Full granted scope list | Only the **gap** (`missingScopes`) is returned, and only in the `MISSING_SCOPES` arm (Q7). |
| Raw provider response bodies | 2B-2 makes **no** provider call (§Q8) — there is no body to leak. |
| Env values | Route never echoes `process.env`; no env field. |
| Exact token expiry timestamp | Only the derived `tokenExpired` boolean. |
| Cross-member personal presence | Personal providers scoped to subject/owner only. |

**Scope-status decision (Q7) — recommended:** **return the missing-scope NAMES, not the
full grant.** Required scopes are provider-public constants already in the repo manifest
and already exposed by the MCP's `explain_provider_connection_requirements`; the *gap*
(what's missing) is the actionable, non-secret signal ("reconnect to add
`channels:read`"). The full granted list reveals exactly what a specific connection
authorized and is withheld by default. (Open question OQ-2 if even gap names should be
gated further.)

---

## 7. Classification (Q9) — derived, precedence-ordered

`deriveConnectionDiagnosis` evaluates in this precedence (first match wins for `status`;
`providerEnabled` is always reported as a separate boolean too):

1. `PROVIDER_UNKNOWN` — `getProvider(provider)` undefined (not a real provider). *(authz-independent shape check; may run before/after authz — recommend after gate, before row read.)*
2. `NO_ACCOUNT_ACCESS` — `isMemberServiceRole` false. No row fetched.
3. `NOT_WORKFLOW_OWNER` — personal provider + workflow context + subject not the owner. No row fetched.
4. `DISCONNECTED` — no active row for the resolved scope (count 0, or by-id row missing / `disconnected_at` set).
5. `PROVIDER_DISABLED` — `manifest.isEnabled === false`. *(Note: existing tokens may still function; surfaced as a distinct status because new connects are refused and it's the likely root cause. Precedence above CONNECTED but below DISCONNECTED so "no row" stays the clearer message.)*
6. `RECONNECT_REQUIRED` — active row, `tokenExpired === true`, **and** `manifest.refreshable === false` (expired + cannot auto-refresh → must reconnect).
7. `TOKEN_EXPIRED` — active row, `tokenExpired === true`, `manifest.refreshable === true` (likely auto-recovers on next run; flagged, not fatal).
8. `MISSING_SCOPES` — active row, not expired, `required − granted ≠ ∅`.
9. `CONNECTED` — active row, not expired (or no expiry tracked), scopes satisfied.

**Honest caveats (stated in the DTO docs):**
- `TOKEN_EXPIRED` vs `RECONNECT_REQUIRED` is decided **solely** by `manifest.refreshable`
  + stored expiry. 2B-2 does **not** attempt a refresh, so it cannot *prove* a refreshable
  token will recover — it reports the likely path. Proving recovery is 2B-1's live call.
- `tokenExpired` is `null` (unknown) when `accessTokenExpiresAt` is null — many providers
  don't expose expiry. The status then can't be `TOKEN_EXPIRED`/`RECONNECT_REQUIRED` from
  expiry alone; it falls through to scope/connected.

---

## 8. Alternatives considered

| Decision | Option | Verdict |
|---|---|---|
| Provider call? | (a) stored-state only · (b) also ping provider | **(a) accepted.** Connection/scope/expiry are answerable from stored state; 2B-1 already owns the live-call answer; (b) adds rate-limit + side-effect surface for no new signal here. |
| Authz | (a) `requireAccountRole` (RLS) · (b) `isMemberServiceRole` | **(b) accepted.** Route is sessionless (§2.1); (a) can't resolve membership without a cookie. |
| Lookup shape | (a) provider+account · (b) integrationId · (c) both | **(c) accepted.** Primary by provider+account; id-pin for multi-row accounts. |
| Scope reporting | (a) none · (b) gap names · (c) full grant | **(b) accepted.** Gap is the actionable, non-secret signal; (c) over-discloses a specific grant; (a) drops the highest-value field. |
| New repo/migration? | (a) reuse existing reads · (b) add list/health column | **(a) accepted.** §2.3 — everything exists; a stored health model is a separate, larger track (not this slice). |
| Personal-provider scope | (a) subject/owner only · (b) account-wide presence | **(a) accepted.** (b) leaks cross-member presence; (a) matches execution + builder + the owner-gated presence rule. |

---

## 9. Tests required (Q11)

**Pure derivation (`deriveConnectionDiagnosis`, CS-1):** one test per `status` —
`PROVIDER_UNKNOWN`, `DISCONNECTED`, `PROVIDER_DISABLED`, `RECONNECT_REQUIRED`
(expired+non-refreshable), `TOKEN_EXPIRED` (expired+refreshable), `MISSING_SCOPES`
(gap computed correctly incl. order-independence), `CONNECTED`; plus `tokenExpired === null`
when expiry absent; precedence (expired+missing-scopes → expired wins).

**Route (CS-2):**
- **Gate (reused):** 401 wrong bearer; 404 disabled; 404 prod-without-allow; 200 when enabled+good bearer; token absent from any body.
- **Authz no-fetch:** `NO_ACCOUNT_ACCESS` when `isMemberServiceRole` false — assert **no** `getActiveForExecution`/`getByIdForAccountServiceRole` call (spy).
- **Provenance no-fetch:** personal provider + workflow + non-owner → `NOT_WORKFLOW_OWNER`, no row fetch.
- **Per-status mapping** end-to-end with mocked repo/manifest leaves.
- **By-id cross-account isolation:** `integrationId` from another account → null → `DISCONNECTED`/not-found.
- **No-leak:** serialized DTO contains no `accessTokenEncrypted`/`refreshTokenEncrypted`/`token`/`connectedByUserId`/`providerAccountId`/`displayName`/`accountMetadata`/full-scope-list/env; only `missingScopes` (gap) ever present; token-shaped-string scan clean.
- **Input validation:** missing `userId`/`provider`; neither `accountId` nor `workflowId`; mismatched `accountId` vs workflow account.

**MCP tool:** renders each status cleanly; network failure → helpful message; gate-status (401/404/400) messages; **import-boundary** scan still green (node:* + local only); **egress redaction** via `handleRpc` for a secret-shaped string.

**Parity note:** unlike 2B-1, there is no live-route twin to diff against. The
"same wall as execution" guarantee is enforced by **reusing** `decideOptionsCredential`
+ `getActiveForExecution` (with the same pin) — covered by asserting the same
provenance branches as the 2B-1 / options-route suites, not a separate parity test.

---

## 10. Implementation slice breakdown

> Default-OFF in production. Ship CS-1 then CS-2; both are small.

- **CS-1 — `deriveConnectionDiagnosis` pure function + unit tests.** Input `(manifest,
  row | null, activeCount, now)` → `{ status, derived fields }`. No HTTP, no DB. Fully
  table-tested per §9. Lives in `services/integrations/` (new pure module) or
  `services/diagnostics/`. **No migration.**
- **CS-2 — route + MCP tool.** `POST /api/internal/diagnostics/integration-connection`
  (reuse `applyDiagnosticsGate`, `isMemberServiceRole`, `decideOptionsCredential`,
  `getActiveForExecution`/`getByIdForAccountServiceRole`/`countActiveByAccountProviderServiceRole`,
  `getProvider`, `deriveConnectionDiagnosis`); MCP tool `diagnose_integration_connection`
  in `scripts/mcp/tools/diagnoseLive.ts` (extend the existing file) or a sibling, reusing
  `MCP_DIAGNOSTICS_URL`/`MCP_DIAGNOSTICS_TOKEN`; register in `tools/index.ts`. Full §9
  route + tool tests.

— **Boundary. Do NOT start 2B-3 (`diagnose_workflow_readiness`) or 2B-4
(`diagnose_run_failure`) in this slice.** —

---

## 11. Risks / open questions (each with a recommendation)

- **OQ-1 — `PROVIDER_DISABLED` precedence.** A disabled provider can still have a working
  token. *Recommendation:* report `providerEnabled: false` always, and use the
  `PROVIDER_DISABLED` *status* only when there's no clearer message (precedence §7);
  revisit if devs prefer it as a pure flag.
- **OQ-2 — Are gap scope NAMES safe enough?** They're provider-public constants.
  *Recommendation:* yes, return them; if a future provider has sensitive scope strings,
  gate to `missingScopeCount` only for that provider. Default: names.
- **OQ-3 — `connectedByUserId` echo for the owner case.** Useful ("connected by the
  creator") but it's an identity. *Recommendation:* **do not** return it; surface
  `credentialClass` + `credentialDecision` (enum) instead, matching 2B-1.
- **OQ-4 — Multi-row accounts.** Default mode reports `activeConnectionCount` + the
  resolved (earliest-active) row's state. *Recommendation:* good enough for v1; a full
  per-row list needs a new service-role list function — defer until asked.
- **OQ-5 — Subject impersonation (inherited from 2B-1).** The bearer lets a holder
  diagnose as any `userId`. *Recommendation:* accept for a read-only, derived,
  default-OFF-in-prod tool; keep the token distinct from `MCP_HTTP_TOKEN`; revisit if an
  admin layer lands.

---

## 12. Acceptance criteria

**For this planning slice:** doc exists under `docs/slices/phase-4/`, every current-state
claim ties to a file read, no source/test/migration/UI changed, nothing pushed.

**For 2B-2 (CS-1+CS-2) to later meet:**
- The MCP process still imports only `node:*` + local modules (guard tests green).
- The route reuses `applyDiagnosticsGate` (404 disabled / 404 prod-no-allow / 401 bad
  bearer; token never echoed) and authorizes via `isMemberServiceRole`.
- `status` is the correct derived `ConnectionStatus` for each case; `NO_ACCOUNT_ACCESS`
  and `NOT_WORKFLOW_OWNER` perform **no** integration-row fetch.
- The DTO carries no token blobs, `connectedByUserId`, `providerAccountId`, `displayName`,
  `accountMetadata`, full scope list, or env — only enums/counts/booleans + the missing-
  scope gap (no-leak tests prove it).
- No provider call is made; no migration; default OFF in prod.
- `typecheck` / `lint` / `lint:structure` / `mcp:build` / `mcp:smoke` /
  `node scripts/mcp/http-smoke.mjs` / `jest tests/unit/mcp` green.

---

## 13. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, or config changed. No route or MCP tool was
implemented. The integrations repository, the membership repository, the manifest
registry, the gate, and the 2B-1 tool are all untouched. Nothing was pushed. The route
contract, DTO shapes, classification ladder, and slice split are **proposals**.

---

## 14. Recommended next step

Implement **CS-1** — the pure `deriveConnectionDiagnosis(manifest, row, activeCount, now)`
function + its full status table-test — first. It is zero-privilege, zero-HTTP,
zero-migration, and locks the classification contract before any route exists. Then
**CS-2** (route + MCP tool + gate/authz/no-leak tests). Do **not** start 2B-3 / 2B-4.
