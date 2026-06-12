# 4.MCP-STAGE-2 — Internal MCP Diagnostics Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-11
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this plan):**
[scripts/mcp/config.ts](../../../scripts/mcp/config.ts) (whitelist roots, byte/output caps, npm-script allowlist) ·
[scripts/mcp/security/paths.ts](../../../scripts/mcp/security/paths.ts) (whitelist-first path guard, blocked segments incl. `test-results` / `playwright-report` / `dist`, blocked filename patterns) ·
[scripts/mcp/security/redact.ts](../../../scripts/mcp/security/redact.ts) (credential-shape redaction rules) ·
[scripts/mcp/lib/files.ts](../../../scripts/mcp/lib/files.ts) (`readAllowedFile` — the single read seam) ·
[scripts/mcp/tools/index.ts](../../../scripts/mcp/tools/index.ts) (explicit registry assembly) ·
[scripts/mcp/tools/docs.ts](../../../scripts/mcp/tools/docs.ts) · [scripts/mcp/tools/providers.ts](../../../scripts/mcp/tools/providers.ts) · [scripts/mcp/tools/builderGaps.ts](../../../scripts/mcp/tools/builderGaps.ts) · [scripts/mcp/tools/commands.ts](../../../scripts/mcp/tools/commands.ts) ·
[scripts/mcp/registry.ts](../../../scripts/mcp/registry.ts) · [scripts/mcp/http/config.ts](../../../scripts/mcp/http/config.ts) · [scripts/mcp/http/auth.ts](../../../scripts/mcp/http/auth.ts) ·
[app/api/options/[source]/route.ts](../../../app/api/options/%5Bsource%5D/route.ts) (option-source endpoint + closed error taxonomy) ·
[services/options/types.ts](../../../services/options/types.ts) (`OptionsSourceErrorCode` enum, `OptionsResolverError`) ·
[services/options/_registry.ts](../../../services/options/_registry.ts) (`getOptionsResolver` / `listOptionsResolvers`) ·
[integrations/slack/options/channels.ts](../../../integrations/slack/options/channels.ts) (the Slack-channel resolver — the motivating failure) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`IntegrationRecord`, `getActiveForExecution`) ·
[tests/smoke/smokeReporter.ts](../../../tests/smoke/smokeReporter.ts) · [tests/smoke/slack-action.smoke.spec.ts](../../../tests/smoke/slack-action.smoke.spec.ts) · [playwright.smoke.config.ts](../../../playwright.smoke.config.ts) ·
[docs/runbooks/internal-mcp-server.md](../../runbooks/internal-mcp-server.md) (Stage-1 security contract) · [docs/runbooks/chatgpt-mcp-developer-mode.md](../../runbooks/chatgpt-mcp-developer-mode.md) (Stage-1.5 HTTP transport)

Prior shipped work referenced: `cc6a56b8f` (Stage-1 server), `ac31da8f1` (Stage-1 hardening), `9d7131678` (Stage-1 closeout), `d17163649` (Stage-1.5 HTTP transport), `57116df28` (options credential-sharing policy), `3473352bd` (builder options node-owner awareness).

---

## 1. Context

We have a curated, read-only internal MCP server (`scripts/mcp/`) shipped in two
stages: **Stage 1** (stdio transport, `cc6a56b8f`→`9d7131678`) and **Stage 1.5**
(an opt-in, bearer-gated Streamable-HTTP front door onto the *same* registry,
`d17163649`). Today it exposes **repo-context** tools only: docs, rule files,
provider-manifest summaries, the builder-metadata gap tracker, and three
allowlisted read-only npm scripts.

The recurring real-world need it does **not** yet serve is **diagnosis**: when a
builder dropdown won't populate (the current Slack channel-picker failure), a run
fails, an integration looks connected but isn't, or a smoke test goes red, there
is no MCP-mediated way to ask "what is actually wrong and where do I look." Today
that means hand-tracing [app/api/options/[source]/route.ts](../../../app/api/options/%5Bsource%5D/route.ts)
and the resolver by eye every time.

**This plan designs Stage 2 — diagnostics — without expanding the server's blast
radius.** It deliberately scopes the *first* implementation slice to local
smoke-artifact reading + static builder option-source diagnosis only, and fences
everything that needs live/production data behind an explicit, separately-approved
internal diagnostic API.

This is the arc this fits into:
[docs/runbooks/internal-mcp-server.md](../../runbooks/internal-mcp-server.md) §"How to
extend it (deliberately)" and §"Do NOT use the MCP server for".

---

## 2. Current codebase findings (verified)

### 2.1 The Stage-1/1.5 server is hard-fenced to "Node built-ins, no app/DB code"

[docs/runbooks/internal-mcp-server.md](../../runbooks/internal-mcp-server.md)
§"What it deliberately does NOT expose" states the contract, and it is
**test-enforced**, not aspirational:

- `tests/unit/mcp/server-safety-guards.test.ts` asserts no Supabase / service-role
  / repository / DB-client import exists anywhere under `scripts/mcp`.
- `tests/unit/mcp/security-hardening.test.ts` runs an **import-boundary scan**
  asserting every import in `scripts/mcp` is a `node:` builtin or a relative local
  module (per the runbook §Tests).

**Consequence (the single most important design constraint):** a Stage-2 tool
**cannot** `import { getOptionsResolver }` or `import { getActiveForExecution }`
directly. Doing so would drag Supabase + the encryption layer + app code into the
MCP process and break both guard tests. Any tool needing *live* app data must
reach it **over HTTP through the app**, not by import. This is what forces the
two-plane model in §4.

### 2.2 Every read already funnels through one sanitizing seam

[scripts/mcp/lib/files.ts](../../../scripts/mcp/lib/files.ts) `readAllowedFile`
combines (a) the whitelist-first path guard
([scripts/mcp/security/paths.ts](../../../scripts/mcp/security/paths.ts)),
(b) a per-file byte cap, and (c) `redactSecrets`. Output is **redacted then
truncated** at the protocol egress too (runbook §"Redact-before-truncate"). New
local-file tools get all three for free *if* they route through `readAllowedFile`
and add their root to `ALLOWED_DOC_ROOTS`/an equivalent allowlist in
[config.ts](../../../scripts/mcp/config.ts).

### 2.3 `test-results/` and `playwright-report/` are BLOCKED today

[paths.ts](../../../scripts/mcp/security/paths.ts) `BLOCKED_SEGMENTS` includes
`test-results`, `playwright-report`, `dist`, `build`, `coverage`. So the existing
whitelist **cannot** read raw Playwright artifacts — by design (traces/screenshots
are binary and may carry rendered PII). The smoke config
([playwright.smoke.config.ts](../../../playwright.smoke.config.ts)) writes only an
HTML report to `playwright-report/smoke` plus a **console-only** summary
([smokeReporter.ts](../../../tests/smoke/smokeReporter.ts)). **There is no
machine-readable, sanitized smoke-result artifact today.** A "list recent smoke
failures" tool therefore requires us to *first* emit one to a new, MCP-readable,
sanitized location — not to un-block the existing report dirs.

### 2.4 The option-source failure taxonomy is already finite and closed

[services/options/types.ts](../../../services/options/types.ts) defines
`OptionsSourceErrorCode` as a closed union:
`UNAUTHENTICATED | INTEGRATION_DISCONNECTED | SOURCE_NOT_FOUND | MISSING_DEPENDENCY |
PROVIDER_ERROR | SERVER_ERROR | NOT_WORKFLOW_OWNER | OWNER_MUST_CONNECT | UNKNOWN`.
[route.ts](../../../app/api/options/%5Bsource%5D/route.ts) maps each branch
deterministically, and resolvers throw `OptionsResolverError` with **pre-sanitized**
messages (the Slack resolver explicitly drops the raw Slack error code so
`invalid_auth` / `missing_scope` never reach the client —
[channels.ts](../../../integrations/slack/options/channels.ts) lines 49-55, 101-111).
This means a **static** diagnosis tool can be authoritative: given an observed
`code`, it can explain cause + next checks *from the code itself*, no live call
required. And `listOptionsResolvers()` already exists "useful when future admin
tooling lists known sources" ([_registry.ts](../../../services/options/_registry.ts)
lines 564-575).

### 2.5 The motivating failure (Slack channel dropdown)

For `slack:channels` the dropdown can fail in exactly these ways, all already
classified at the route/resolver boundary:
| Observed `code` | Meaning for slack:channels | Where decided |
|---|---|---|
| `SOURCE_NOT_FOUND` | resolver not registered (won't happen for slack:channels — it IS registered) | route 127-134 |
| `INTEGRATION_DISCONNECTED` | no active Slack row for the resolved account | route 246-261 |
| `OWNER_MUST_CONNECT` | creator editing a team workflow but hasn't connected Slack | route 247-255 |
| `NOT_WORKFLOW_OWNER` | non-creator editing a personal-cred provider on a team workflow | route 203-211 |
| `PROVIDER_ERROR` | Slack returned a logical error (`invalid_auth`/`missing_scope`) — **code intentionally hidden** | channels.ts 101-111 |
| `SERVER_ERROR` | network/decode/decrypt failure | route 299-305 |
| `UNAUTHENTICATED` | no session (401) | route 119-120 |

A diagnosis tool's job is to turn a paste of "the channel dropdown is empty / shows
an error" into "you're seeing `PROVIDER_ERROR`; for Slack that is almost always a
missing scope — check `get_provider_manifest_summary slack` for the required
`channels:read`/`groups:read` scopes and reconnect."

### 2.6 Integration connection data shape

[repositories/integrations.ts](../../../repositories/integrations.ts)
`IntegrationRecord` carries: `provider`, `accountId`, `connectedByUserId`,
`displayName`, `scopes: string[]`, `accessTokenExpiresAt`, `disconnectedAt`,
**and the encrypted token blobs** (`accessTokenEncrypted`,
`refreshTokenEncrypted`). A connection-health diagnosis can be expressed *entirely*
in non-secret derived fields (connected? scopes present vs required? token expired?
who connected it?) without ever returning a token. But reading this requires
service-role DB access → **Plane B only** (§4.2).

### 2.7 V2 has no admin-capability layer (verified gap)

A grep across `app/ lib/ services/ core/` for
`requireAdmin|super_admin|isSuperAdmin|admin_capabilities` returns **nothing**.
The only auth guard in the relevant path is `requireUser()`
([app/api/providers/_shared.ts](../../../app/api/providers/_shared.ts)). (Note: the
V1 archive's CLAUDE.md describes a rich admin-capabilities system — that is **V1**,
not present in V2.) **Implication:** the Plane-B internal diagnostic API cannot lean
on an admin guard that does not exist. Its gate must be designed (§4.2 / §10) —
most likely reusing the Stage-1.5 bearer-token shared-secret pattern
([http/auth.ts](../../../scripts/mcp/http/auth.ts)) rather than inventing an admin
role for this.

---

## 3. Product / model decision — what Stage 2 is, and is NOT

**Is:** a developer-facing *diagnostic lens*. It answers "why is this thing
broken and where do I look next" for five surfaces — workflow readiness,
integration connection, builder option-source, runs, and smoke — using the
**least-privileged data plane that can answer each question.**

**Is NOT:**
- **NOT** a repair/mutation tool. It never reconnects, never edits a workflow,
  never re-runs, never writes the DB. (Deferred — §4.3.)
- **NOT** a production data browser. No tool returns user content, message bodies,
  recipient lists, field values, or provider response bodies.
- **NOT** an architecture bypass. Live diagnosis routes **through the app's own
  services** (options registry, integrations repository, run/execution services)
  behind a sanitizing internal API — it never re-implements credential resolution
  or RLS, and the MCP process itself stays DB-free and import-fenced (§2.1).

Anchor to the V2 account-scoped model (`57116df28`, `3473352bd`): a connection or
option-source question is always *account-and-creator-scoped*. The diagnostic API
must apply the **same** `decideOptionsCredential` / node-owner policy the real
route applies — it must never fetch a co-member's personal credential to "help
diagnose." Diagnosis sees the same wall execution sees.

---

## 4. Recommended approach — a three-plane model

The organizing idea: **classify every proposed tool by the data plane it needs,
and ship planes in privilege order.** A tool's plane determines its environment
classification, its auth, and which slice it belongs to.

```
Plane A — Local-artifact + repo-static    → SAFE NOW (no app import, no network, no DB)
Plane B — Live read via internal API      → NEEDS INTERNAL DIAGNOSTIC API (HTTP, sanitized, gated)
Plane C — Mutation / repair               → DEFERRED (explicit approval required)
```

### 4.1 Plane A — Safe now (local-artifact + repo-static)

These tools stay **inside** the MCP process. They read only sanitized local
artifacts and repo-static text, route through `readAllowedFile`, and import **only
Node built-ins** — so §2.1's guard tests stay green. No live data, no session, no DB.

| Tool | Purpose | Reads (exactly) | Plane |
|---|---|---|---|
| `list_recent_smoke_failures` | List the most recent smoke run's failed/skipped categories + test titles | the sanitized JSON artifact emitted by the smoke reporter (§9 CS-1) at a new allowed root — `category`, `title`, `status`, `durationMs`, `sanitizedErrorClass`, run timestamp | local-artifact-only |
| `read_smoke_failure_context` | Sanitized detail for one failed smoke test | the same artifact's per-test record: `title`, `status`, **sanitized** error summary (message redacted + class only), step label, attachment **basenames** (never paths/binaries) | local-artifact-only |
| `diagnose_option_source` | **Static** diagnosis: given a `source` key (+ optional observed `code`), explain registration status, required deps, credential-sharing rule, and per-code cause→next-check | repo-static: `listOptionsResolvers()` shape exported to a **generated manifest** (§9 CS-2) — source key, provider, `requiresIntegration`, `requiredDeps`; plus the closed `OptionsSourceErrorCode` taxonomy | repo-only |
| `explain_provider_connection_requirements` | What a provider needs to be "connected and usable" — auth flow, token scope, required scopes, refreshable | the existing text-parsed manifest summary ([providers.ts](../../../scripts/mcp/tools/providers.ts) / `manifestSummary.ts`): `isEnabled`, `apiVersion`, `authFlow`, `tokenScope`, `capabilities`, `refreshable` | repo-only |

**Why `diagnose_option_source` is repo-static, not live:** the failure taxonomy
(§2.4) is closed and the messages are pre-sanitized. The tool maps an *observed*
code (pasted by the dev, or read from a smoke artifact) to a cause + the next thing
to check. It does **not** call `/api/options` — that needs a live session + live
data (Plane B). This keeps the highest-value diagnostic in the safe plane.

### 4.2 Plane B — Needs internal diagnostic API (live read, sanitized, gated)

These answer questions only live state can answer. They are **not** implemented by
importing services into the MCP process. Instead:

```
MCP tool (node:http client)  ──HTTP+bearer──▶  NEW app route: /api/internal/diagnostics/*
                                                  │ requireUser()  +  dev/diagnostic gate (§10)
                                                  │ calls EXISTING services:
                                                  │   getOptionsResolver / resolver.resolve (dry)
                                                  │   listActiveByAccount / getActiveForExecution
                                                  │   run/execution read service
                                                  │ SANITIZES at the route boundary → typed DTO
                                                  ▼
                                            sanitized JSON (codes/enums/booleans only)
```

The MCP process remains DB-free and import-fenced — it is just an HTTP client (it
already speaks HTTP for Stage 1.5; the same `node:http` + bearer pattern applies).
The **app route** is where existing services run and where sanitization happens.

| Tool | Purpose | App route reads (via existing services) | Returns (sanitized) | Plane |
|---|---|---|---|---|
| `diagnose_integration_connection` | Is provider X connected & usable for account/creator? | `listActiveByAccount` / `getActiveForExecution` + manifest required-scopes | `{ connected, disconnectedAt?, scopesPresent: string[], scopesMissing: string[], tokenExpired: bool, connectedByUserId? }` — **never** token blobs | dev-only (prod behind approval) |
| `diagnose_option_source_live` | Run the *actual* resolver for `source` and report the real `code` | the option-source route logic / a dry-run resolver call with creator-policy applied | `{ ok, code, itemCount, hasMore, missingDependency? }` — **never** the item labels/ids or provider body | dev-only |
| `diagnose_workflow_readiness` | Why is workflow W not runnable? | workflow read service + node readiness validator | per-node `{ nodeId, kind, provider, status, missingRequiredFields: string[] (names only) }` — **never** field values | dev-only |
| `diagnose_run_failure` | Why did run R fail? | run/execution-history read service | `{ status, firstFailedNodeId, errorCategory, errorCode, humanizedTitle }` — **never** raw provider error bodies or step payloads | dev-only |

Every Plane-B return is **enums/booleans/ids/scope-names only**. The route maps the
provider-error surface to the existing humanized classification, never echoing raw
bodies — same discipline the live UI already follows.

### 4.3 Plane C — Deferred (mutation / repair)

Explicitly **out of scope** until separately approved. Listed so the boundary is
named, not so it is built: `reconnect_integration`, `retry_run`,
`reset_option_cache`, `repair_workflow_node`, `force_token_refresh`. These mutate
external/production state and are forbidden by the Stage-1 contract
([runbook](../../runbooks/internal-mcp-server.md) §"Do NOT use the MCP server
for"). Not in this plan beyond naming them.

---

## 5. Exact data each tool may read (and the boundary)

| Tool | Data plane | May read | Hard limit |
|---|---|---|---|
| `list_recent_smoke_failures` | local artifact | sanitized smoke JSON: category, title, status, durationMs, error **class**, run ts | one file, byte-capped, redacted |
| `read_smoke_failure_context` | local artifact | one test record: title, status, sanitized error summary, step label, attachment **basenames** | no binary/trace/screenshot bytes; no absolute paths |
| `diagnose_option_source` (static) | repo-static | generated resolver manifest (source/provider/requiresIntegration/requiredDeps) + closed error-code taxonomy | no live data, no session |
| `explain_provider_connection_requirements` | repo-static | text-parsed manifest summary (scopes, authFlow, refreshable, capabilities) | manifest is **text-parsed, never executed** (existing guarantee) |
| `diagnose_integration_connection` | live (API) | connected-bool, disconnectedAt, scopes present/missing, token-expired bool, connectedBy id | **never** token blobs, never raw scopes-as-secrets |
| `diagnose_option_source_live` | live (API) | resolver `code`, item **count**, hasMore | **never** item labels/values, **never** provider body |
| `diagnose_workflow_readiness` | live (API) | per-node status enum + missing-required-field **names** | **never** field **values**, never resolved config |
| `diagnose_run_failure` | live (API) | run status, failed node id, error category/code, humanized title | **never** raw provider error body, never step payloads |

---

## 6. Explicit never-expose list (applies to every tool, every plane)

| Must never expose | Enforcement |
|---|---|
| **OAuth tokens / API keys / secrets** | `redactSecrets` egress pass (existing); Plane-B DTOs carry derived booleans/scope-names only, never `*Encrypted` columns; `decryptToken` is never called in any diagnostic path |
| **Env values** | `.env*` blocked by filename pattern ([paths.ts](../../../scripts/mcp/security/paths.ts)); diagnostic API must not echo `process.env`; no env tool exists |
| **Service-role access** | MCP process holds **no** DB/service-role client (guard test §2.1); Plane-B uses service-role **inside the app route only**, and returns sanitized DTOs — the role/credentials never cross the HTTP boundary |
| **Raw workflow payloads (sensitive)** | readiness returns field **names**, never values; option-source diagnosis works on the **source key + code**, never node config |
| **Provider response bodies with PII** | resolvers/route already re-classify to typed codes ([channels.ts](../../../integrations/slack/options/channels.ts) 49-55); Plane-B returns the code, never the body; smoke emitter drops posted-message text / channel names |

These map 1:1 to the user's stated constraints. The redaction net
([redact.ts](../../../scripts/mcp/security/redact.ts)) is the last-line backstop,
not the primary control — the primary control is that no tool ever *fetches* the
forbidden data.

---

## 7. Environment classification (per tool)

| Classification | Meaning | Tools |
|---|---|---|
| **local-artifact-only** | reads files the dev's own smoke run produced on this machine | `list_recent_smoke_failures`, `read_smoke_failure_context` |
| **repo-only** | reads committed repo text (registry/manifest/taxonomy); identical for everyone | `diagnose_option_source` (static), `explain_provider_connection_requirements` |
| **dev-only** | live read, default-pointed at a **dev/staging** origin; the bearer + gate must be present | all four Plane-B tools |
| **production-safe (behind explicit approval)** | a dev-only tool *may* be pointed at production **only** after separate approval, because it is read-only + sanitized + account-scoped + gated | Plane-B tools, opt-in only — **never the default** |

The **first slice ships only local-artifact-only + repo-only tools.** No dev-only
or production tool ships in slice one.

---

## 8. How tools route through existing services (no architecture bypass)

- **Plane A** imports nothing from the app. `diagnose_option_source` (static) and
  `explain_provider_connection_requirements` read **generated, committed** artifacts
  (a resolver manifest derived from `listOptionsResolvers()`, and the existing
  text-parsed manifest summary). The generator is a repo script; the MCP tool reads
  its output as a whitelisted file. This preserves §2.1 while still being grounded
  in the real registry.
- **Plane B** never re-implements logic. The internal API route **calls the same
  functions the product calls**: `getOptionsResolver` + `resolver.resolve` (with the
  real `decideOptionsCredential` creator-policy), `listActiveByAccount` /
  `getActiveForExecution`, and the run/execution read service. Sanitization is a thin
  DTO mapper at the route edge. The MCP tool is a `node:http` client only.
- **Account model honored:** Plane-B diagnosis applies the **same** credential-
  sharing + node-owner policy as the live route (`57116df28`, `3473352bd`) — it never
  fetches a co-member's personal credential, and a `NOT_WORKFLOW_OWNER` situation
  diagnoses as exactly that, with no lookup.
- **No new transport for Plane A**, and Plane B reuses the Stage-1.5 bearer/loopback
  posture ([http/config.ts](../../../scripts/mcp/http/config.ts),
  [http/auth.ts](../../../scripts/mcp/http/auth.ts)).

---

## 9. Implementation slice breakdown (ordered; first slice fully specified)

> Risky/live work is default-OFF and lands only after the safe slices. The **first
> slice is CS-1 + CS-2 only** (Plane A), per the request.

**CS-1 — Sanitized smoke artifact + the two smoke tools (local-artifact-only).**
1. Add a sibling reporter (or extend [smokeReporter.ts](../../../tests/smoke/smokeReporter.ts))
   that writes a **sanitized JSON** summary to a NEW allowed root (proposed
   `artifacts/mcp/smoke-latest.json`, gitignored). Per test: `category`, `title`,
   `status`, `durationMs`, `errorClass` (Playwright error name only), `stepLabel`,
   `attachmentBasenames`. **Redacted, no message bodies, no URLs, no absolute paths,
   no trace/screenshot bytes.**
2. Add the `artifacts/mcp/` root to [config.ts](../../../scripts/mcp/config.ts) and
   route reads through `readAllowedFile`. **Do NOT** un-block `playwright-report` /
   `test-results` in [paths.ts](../../../scripts/mcp/security/paths.ts).
3. Add `list_recent_smoke_failures` + `read_smoke_failure_context` tools; register
   in [tools/index.ts](../../../scripts/mcp/tools/index.ts).

**CS-2 — Static option-source + connection-requirements diagnosis (repo-only).**
1. Add a repo script that emits a committed `option-source-manifest.json` from
   `listOptionsResolvers()` (source, provider, requiresIntegration, requiredDeps) —
   no app import into MCP; MCP reads the committed file.
2. Add `diagnose_option_source` (static, maps source + observed `code` → cause +
   next-check using the closed taxonomy) and `explain_provider_connection_requirements`
   (thin wrapper over the existing manifest summary, framed as "what makes this
   provider connected & usable").

**— First-slice boundary. Everything below requires separate approval. —**

**CS-3 — Internal diagnostic API skeleton (no MCP tool yet).** New
`/api/internal/diagnostics/*` route group, `requireUser()` + a dev/diagnostic gate
(§10), returning the sanitized DTOs. Default disabled in production via a
`DIAGNOSTICS_API_ENABLED` flag (default OFF).

**CS-4 — `diagnose_integration_connection` (dev-only).** MCP `node:http` client +
the connection DTO. Pointed at dev origin by default.

**CS-5 — `diagnose_option_source_live` (dev-only).** Dry-run resolver behind the API.

**CS-6 — `diagnose_workflow_readiness` + `diagnose_run_failure` (dev-only).**

**CS-7 (deferred indefinitely) — Plane C repair tools.** Not planned here.

---

## 10. Risks / open questions (each with a recommendation)

1. **No admin layer in V2 (§2.7) — what gates Plane B?** *Recommendation:* reuse
   the Stage-1.5 bearer-token shared-secret on the internal route (env-sourced,
   constant-time compare, loopback default) **plus** `requireUser()`, rather than
   inventing an admin role for diagnostics. Revisit if/when a real admin layer lands.
2. **Smoke artifact PII.** Playwright errors can embed rendered page text (channel
   names, the posted smoke message). *Recommendation:* the emitter ships
   **error-class + step-label only** by default; never the raw `error.message`. The
   redaction net is backup, not primary.
3. **Production pointing.** A dev could point a dev-only tool at production.
   *Recommendation:* default the client origin to dev/staging; require an explicit
   env opt-in to target production, and keep `DIAGNOSTICS_API_ENABLED` OFF in prod
   until separately approved.
4. **Static-vs-live divergence for option-source.** The static tool could give a
   stale answer if the generated manifest drifts from the registry.
   *Recommendation:* regenerate the manifest in CI / via an existing structure-lint
   step and add a test that fails if it's stale.
5. **Scope of "workflow readiness."** Returning missing-field **names** is safe;
   returning *which value is wrong* is not. *Recommendation:* names + status enums
   only, ratified in tests.

---

## 11. Acceptance criteria

**For this planning slice:** this doc exists under `docs/slices/phase-4/`, every
"current state" claim is tied to a file that was read, no source/test/migration/UI
changed, nothing pushed.

**For the first implementation slice (CS-1 + CS-2) to later meet:**
- The smoke emitter writes only sanitized JSON to `artifacts/mcp/`; a test proves
  no `error.message`, URL, absolute path, or token-shaped string appears in it.
- `list_recent_smoke_failures` / `read_smoke_failure_context` read only that file
  via `readAllowedFile`; `playwright-report`/`test-results` stay blocked.
- `diagnose_option_source` returns correct cause + next-check for each closed
  `OptionsSourceErrorCode`, and correctly reports `slack:channels` as registered.
- The §2.1 guard tests (`server-safety-guards`, import-boundary scan) still pass —
  i.e. the new tools import **only** Node built-ins + local modules.
- `npm run typecheck`, `npm run lint`, `npm run lint:structure`, and
  `npm run mcp:smoke` all green.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, or config changed. No tool was added to
the registry. The MCP server, the options route, the integrations repository, and
the smoke harness are all untouched. Nothing was pushed. The three-plane model,
the tool list, and the first-slice scope are **proposals** for the named CS slices,
not implemented behavior.

---

## 13. Recommended next step

Pick up **CS-1** (sanitized smoke artifact + the two local-artifact tools) as the
first implementation slice — it is the lowest-privilege, highest-signal change,
needs no app import and no internal API, and immediately makes "list recent smoke
failures / read sanitized failure context" real for the next red smoke run.
**Do not** start CS-3+ (the internal diagnostic API / any live or production data
access) without explicit, separate approval.
