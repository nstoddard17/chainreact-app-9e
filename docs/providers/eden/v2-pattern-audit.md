# Eden — V2 Pattern Audit

**Date:** 2026-07-13
**Provider ID:** `eden`

Purpose: decide which existing V2 patterns Eden reuses, and identify where Eden
requires **net-new cross-cutting infrastructure** (which, per `CLAUDE.md` "write a
short plan first" and the provider skill's blocker policy, needs a design +
Marcus's go-ahead before it is built).

---

## Headline: Eden needs infrastructure V2 does not yet have

Eden's automation surface is a **remote MCP server** reached over Streamable HTTP,
authenticated with a **paste-in `eden_pat_` bearer token**. Auditing current V2:

### Gap 1 — No external MCP **client** transport (major shared infra) 🚧
V2 has an MCP **server** — it *exposes* ChainReact's own tools to external AI hosts:
- `services/mcp/server.ts` — "Public MCP JSON-RPC dispatcher" (ChainReact's server).
- `lib/api/mcp.ts` — typed client for ChainReact's **own** MCP-token mgmt APIs;
  `MCP_ENDPOINT_URL = "https://mcp.chainreact.app/mcp"` (our endpoint).
- `scripts/mcp/` — the internal dev MCP server.
- `core/mcp/scopes.ts`, `repositories/mcpRequestAudit` — server-side scope/audit.

There is **no code that acts as an MCP *client*** — nothing connects *out* to a
remote MCP server, performs `initialize`, `tools/list`, `tools/call` over
Streamable HTTP, or parses MCP structured content. **No MCP client SDK is a
dependency** (`package.json` has only the internal `mcp:*` build scripts). Every
existing provider talks REST/OAuth via typed `integrations/<provider>/api/`
wrappers and `services/oauth/refreshAndRetry`.

→ Eden requires a **new shared, typed MCP-client transport** (proposed
`integrations/_shared/mcp/` or `services/mcp/client/`). This is exactly the
"new cross-cutting pattern / major shared-infrastructure" case the skill says to
**stop and plan before coding**. Design sketch in
[`implementation-plan.md`](./implementation-plan.md) §MCP transport.

### Gap 2 — No **paste-token** auth UI variant (contract extension) 🚧
V2's auth flows (`contracts/integration.ts` `AuthFlowSchema`) are exactly two:
- `code_callback` — standard OAuth 2.0 code/state (all OAuth providers).
- `token_ingest` — token returned to the **browser URL fragment** (`#token=…`),
  captured by a client page (Trello is the sole consumer).

Eden's PAT is **neither**: the user **copies `eden_pat_…` from Eden's Settings and
pastes it** into ChainReact — there is no provider authorize-redirect and no URL
fragment. `docs/rules/token-ingest-auth.md` explicitly **defers** this exact case:

> "Some 'token-paste' providers (Atlassian API token, **Asana PAT**) don't redirect
> to an authorize page — they ask the user to paste a token they copied from the
> provider's UI. That's a different client-side UI (a paste form, not a redirect),
> but the server side (ingest endpoint + verify + persist) is identical. Future
> slice should design the paste-UI variant separately; until then, only
> fragment-redirect providers fit."

→ Eden is the provider that justifies building the **token-paste UI variant**. The
**server contract is reusable** (dispatcher `handleTokenIngest` → verify →
`encryptToken` → `upsertActive`), but it needs: (a) a paste-form connect UI, (b) a
connect path that submits the pasted token (no fragment page), and possibly (c) a
small `AuthFlowSchema` addition (e.g. `token_paste`) so the manifest is honest.
This is a scoped contract extension — design + sign-off before building.

### Gap 3 — No live credential → mandatory live catalog capture blocked ⛔
The task makes **live MCP catalog capture mandatory before finalizing the
catalog**, and Eden's per-tool input schemas are **not fully public** and **change
regularly**. Without an authorized `eden_pat_` token we cannot capture
`tools/list` + each tool's input schema, so we **cannot honestly author `.strict()`
action schemas** or **certify** anything. Per the task: implement what's honest,
give exact credential steps, mark schema-verification + certification **blocked**,
and **do not call the integration complete**.

---

## What IS reusable from current V2 (no new pattern needed)

| Concern | Reuse | Reference |
|---|---|---|
| Credential encryption | `core/encryption/tokens.ts` `encryptToken` (AES-256-GCM) | token-ingest rule §Token Encryption |
| Credential persistence | `repositories/integrations.upsertActive` via dispatcher (no direct writes) | token-ingest rule §No Dispatcher Bypass |
| Token verify-before-persist | `verifyAndIngestToken` probe that proves token + returns account info | token-ingest rule §Server-Side Verification |
| Credential class | `core/integrations/credentialSharing.ts` (`personal`) | see below |
| Refresh-on-401 shape | `services/oauth/refreshAndRetry` (PAT is non-refreshable → surfaces reconnect) | Trello (non-refreshable) |
| Manifest + registry | `integrations/<p>/manifest.ts` + `_registry.ts ALL_MANIFESTS` | Trello manifest |
| Actions anatomy | `action.ts` + `.schema.ts` (`.strict()`) + `.meta.ts` + registry + tests + smoke | any provider |
| Option sources | `integrations/<p>/options/` typed wrappers, redacted labels, owner-pinned for personal | any provider |
| Polling trigger lifecycle | `services/triggers/` baseline-first polling, DB-backed dedup | polling rule (CLAUDE.md #11, #13) |
| Apps catalog gate | category + description + icon + connectable + regression/connect tests | skill Phase 2 |
| AI/React-Agent visibility | safe booleans/redacted flags only | skill Phase 8 |
| Smoke harness | `tests/smoke-actions/`, mock only the external boundary | testing-strategy rule |

## Auth decision

**Credential class: `personal`.** The `eden_pat_` token "can read and post on your
behalf" — it acts as the **connecting human's** Eden workspace + connected social
accounts (like Notion/Airtable/Trello personal-productivity credentials). Eden has
"Workspaces," but the PAT is a personal token, not a shared org service credential
(contrast Slack/Stripe/Shopify). Fail-safe default is also `personal`. → In a Team
account this credential must **not** be silently shared; personal-provider steps
resolve to the workflow creator.

**Auth flow: PAT paste** (reusing the token-ingest **server** contract via the new
**paste-UI** variant — Gap 2). Not OAuth (Gap: no registered OAuth app; Eden OAuth
is an interactive MCP-client handshake, not a V2-registerable app), not
fragment `token_ingest` (Eden doesn't redirect). **Non-refreshable** → on MCP
auth-expired/permission errors, surface reconnect/"action required".

**Verify probe:** on ingest, call the Eden MCP `initialize` + a cheap read tool
(e.g. `eden_list_schedules` or List Workspaces) through the new MCP client; success
proves the token and yields durable account info (`accountIdField` = a stable Eden
workspace/user id, TBD-from-live-catalog). Read-only vs read-write is detected/
recorded so the Builder can show connection readiness. NB: the verify probe
**depends on the MCP client transport existing** (Gap 1 precedes Gap 2's verify).

## Divergences from existing V2 patterns (intentional, need sign-off)

1. **Transport is MCP, not REST.** `integrations/eden/api/` wrappers call a shared
   MCP client (`tools/call`) instead of `fetch` REST endpoints. Same *shape*
   (typed, narrow, one tool per action, bounded outputs, no raw spread), different
   substrate.
2. **Auth is paste-token**, a new `AuthFlow` variant / UI (Gap 2).
3. **Tool catalog is pinned + certified**, and drift-detected at runtime (schema
   drift detection is a transport feature) — because Eden's catalog changes.

## Conclusion

Eden is implementable in V2 **but only after two shared-infra decisions are made**
(MCP client transport; paste-token auth UI) **and a live `eden_pat_` credential is
supplied** (to capture schemas + certify). None of the ~30 documented actions can
have an honest `.strict()` schema until the live `tools/list` is captured.
Therefore this slice stops at **research + audit + plan + owner decision request** —
building the transport/auth/actions now would mean inventing unverified schemas on
top of un-approved infrastructure, which the rules forbid.
