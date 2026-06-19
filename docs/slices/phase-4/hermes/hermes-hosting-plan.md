# HERMES-HOSTING-PLAN-1 — Safe Hosting Path Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, env, or behavior
changes in this slice. Nothing pushed, nothing deployed, no cloud resources created, no
env vars set.**
**Date:** 2026-06-19
**Branch:** `v2-main`

> **⚠️ CONCLUSION CORRECTED (2026-06-19) by
> [react-agent-hermes-architecture.md](../ai/react-agent-hermes-architecture.md)
> (REACT-AGENT-HERMES-ARCHITECTURE-CORRECTION-1).** The *audit* below stands and the
> "Hermes does not exist yet" finding is true, but the *conclusion* over-redirected toward
> MCP hosting as the answer to Hermes. Marcus DOES intend to start the product AI / Hermes
> direction: **React Agent first, Hermes later as a scoped runtime/memory layer.** Treat this
> doc as **MCP adapter hosting notes** (a separate, secondary track), NOT the product path.

**Source of truth (verified current state — files actually read for this plan):**
[docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md](../../../docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md) §7 (the only Hermes architecture reference) ·
[docs/runbooks/internal-mcp-server.md](../../../docs/runbooks/internal-mcp-server.md) (stdio MCP server, security contract, 43-tool registry) ·
[docs/runbooks/chatgpt-mcp-developer-mode.md](../../../docs/runbooks/chatgpt-mcp-developer-mode.md) (Stage 1.5 HTTP transport + tunnel) ·
[scripts/mcp/http/config.ts](../../../scripts/mcp/http/config.ts) (loopback default, bearer token, body cap, external opt-in) ·
[scripts/mcp/http/handler.ts](../../../scripts/mcp/http/handler.ts) (auth, origin validation, wire shape) ·
[docs/slices/phase-4/mcp/mcp-diagnostic-suite-closeout.md](../../../docs/slices/phase-4/mcp/mcp-diagnostic-suite-closeout.md) (gated live diagnostics plane) ·
`package.json` (`mcp:build`/`mcp:start`/`mcp:http`/`mcp:smoke`/`mcp:http:smoke`) ·
`.env.example` (does **not** document MCP vars today).

---

## 0. TL;DR (read this first)

**There is no "Hermes" to host.** "Hermes" is an **unbuilt, deliberately-deferred future
product agent-runtime concept** — a name that appears ~55× across docs almost always as
"**no Hermes**" / "Hermes deferred" / "future runtime, not wired." There is **zero Hermes
code**: `grep` for `AgentRuntimeAdapter` / `HermesRuntime` / `OpenAiDirectRuntime` across
`lib/ services/ core/ app/` returns nothing.

**Recommendation: do NOT host Hermes.** Hosting it now is impossible (nothing exists) and
premature (its own gating preconditions in the agent-runtime plan §9 are unmet).

**What is actually hostable today** — and what the task's signals (MCP, HTTP transport,
ChatGPT Developer Mode, tunnel) really point at — is the **internal MCP developer server**
(`scripts/mcp/`). It **already has a prepared, secured hosting path**: stdio (Stage 1) +
Streamable HTTP (Stage 1.5) with bearer auth, loopback-default bind, origin validation, a
1 MiB body cap, redaction, an import fence, and passing smoke tests — plus two runbooks.

So this plan splits cleanly into two tracks:
- **Track A — Hermes (product runtime):** *do-not-host-yet.* Keep deferred behind its gates.
- **Track B — Internal MCP server hosting:** the real, low-risk, mostly-already-built path.
  The actionable "safe hosting" work is **operational + hardening follow-ups**, not new hosting.

---

## 1. Context

Marcus wants to "move next into setting up hosting for Hermes." The task itself flags the
key risk — *"Do not assume Hermes should expose full repo/MCP power publicly"* — and asks
for discovery + architecture first. This plan answers the 8 questions in the brief and
produces a phased path, grounded in what the repo actually contains.

Two prior arcs frame this:
- The **AI credits + agent-runtime plan** ([ai-credits-and-agent-runtime-plan.md](../../../docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md) §7, §9) defines Hermes as a *future* `HermesRuntime` behind an `AgentRuntimeAdapter` port, with hard preconditions before any agent loop ships.
- The **internal MCP diagnostic suite** ([mcp-diagnostic-suite-closeout.md](../../../docs/slices/phase-4/mcp/mcp-diagnostic-suite-closeout.md)) — 43 read-only tools, three-layer gated architecture — is the asset that has an HTTP transport.

---

## 2. Current codebase findings (verified)

### 2.1 What "Hermes" is right now — nothing built
- **No code.** No `AgentRuntimeAdapter`, `HermesRuntime`, or `OpenAiDirectRuntime` symbol
  exists anywhere in `lib/ services/ core/ app/` (grep: empty).
- **Only an architecture sketch.** [ai-credits-and-agent-runtime-plan.md §7](../../../docs/slices/phase-4/ai-credits-and-agent-runtime-plan.md):
  Hermes is a *future* runtime behind an adapter port; billing stays keyed on underlying
  LLM token usage; **"ChainReact services remain the source of truth"**; **"MCP stays
  external; the in-app agent calls services directly."**
- **Explicitly gated.** §9 lists hard preconditions before *any* multi-step/agent loop
  ships (complete cost-event coverage, etc.). Across the AI-DIAG / AI-REPAIR arcs, every
  closeout states "no Hermes."
- **Conclusion:** Hermes is **not** the local MCP server, **not** the memory-curator
  workflow, **not** any existing agent. It is a named placeholder for a future hosted
  product runtime that has not begun.

### 2.2 What IS built and hostable — the internal MCP server
From [internal-mcp-server.md](../../../docs/runbooks/internal-mcp-server.md) +
[chatgpt-mcp-developer-mode.md](../../../docs/runbooks/chatgpt-mcp-developer-mode.md):

- **Purpose:** a **local developer tool**, not a product feature — exposes a *curated,
  read-only* slice of the repo (docs, rules, provider-manifest summaries, gap tracker,
  static + gated-live diagnostics) to an AI coding host.
- **Two transports, same registry:**
  - **stdio** (`npm run mcp:start`) — Claude Code/Desktop/Codex; opens **no network port**.
  - **Streamable HTTP** (`npm run mcp:http`) — for ChatGPT Developer Mode / remote MCP
    clients. **Adds no tools** — same `buildRegistry()` + `handleRpc()`.
- **HTTP security posture** (verified in [config.ts](../../../scripts/mcp/http/config.ts) /
  [handler.ts](../../../scripts/mcp/http/handler.ts)): bind **127.0.0.1:8765 by default**;
  non-loopback bind requires explicit `MCP_HTTP_ALLOW_EXTERNAL=1` (+ loud warning); **bearer
  token required** (`MCP_HTTP_TOKEN`, ≥16 chars, constant-time compare, `401` otherwise,
  never logged); **Origin validated** (browser Origin rejected unless allow-listed;
  server-to-server callers send none → allowed, DNS-rebind defense); **body cap 1 MiB →
  413**; `GET /mcp → 405`; import fence (only `node:http`/`node:crypto` + local modules).
- **Security contract** (the "deliberately does NOT expose" list): no production data, no
  DB/Supabase/service-role, no env/secrets/tokens, **no arbitrary file read** (whitelist:
  `docs/**`, `CLAUDE.md`, provider manifests only), **no arbitrary shell** (3 exact
  read-only npm scripts; tool args never reach a command line), no mutation
  (`db:push`/migrate/deploy/`git push`), redact-before-truncate, traversal guards.
  Enforced by `tests/unit/mcp/` (25 suites / 310 tests) + `security-hardening.test.ts`.
- **Live-diagnostics plane (separate, already gated):** the `diagnose_*_live` tools `fetch`
  app-owned `/api/internal/diagnostics/*` routes gated by `applyDiagnosticsGate` —
  `DIAGNOSTICS_API_ENABLED` **default-OFF → 404**, in prod also requires
  `DIAGNOSTICS_API_ALLOW_PROD`, plus a distinct bearer `DIAGNOSTICS_API_TOKEN`. The MCP
  process stays DB-free; data access/authz/sanitization live in the route's service.
- **Verification already exists:** `npm run mcp:smoke` (stdio) and `npm run mcp:http:smoke`
  (drives a real socket: `initialize`→`tools/list`→`tools/call`, asserts `401` on no token,
  `405` on GET, token absent from stderr).
- **Known gaps (from the runbooks):** OAuth not implemented (ChatGPT's first-class auth);
  single shared token, manual rotation, no expiry, no per-client tokens; **ChatGPT
  end-to-end is NOT verified** from this environment; GUI host configs unverified;
  `.env.example` does **not** document the MCP/diagnostics vars.

---

## 3. Product / model decision — what to host, and what NOT to

| Thing | What it is | Host now? |
|---|---|---|
| **Hermes** | Unbuilt future *product* agent-runtime (behind an adapter port). Customer-facing eventually. | **No.** Nothing exists; preconditions unmet. |
| **Internal MCP server (stdio)** | Local dev context tool, no network port. | Already "hosted" locally; nothing to do. |
| **Internal MCP server (HTTP)** | Same registry over loopback HTTP + tunnel, bearer-gated, **Marcus-only dev tooling**. | **Yes — locally / ephemerally**, exactly as the runbook describes. |
| **`/api/internal/diagnostics/*`** | App-owned gated routes the live MCP tools call. | **Keep OFF in prod** (default). Local/dev-token only. |

**Hard separation to preserve (non-negotiable):** the *internal repo/dev assistant* (MCP) and
any future *product runtime* (Hermes) are different systems with different blast radii. MCP
must **never** become a public product surface, and Hermes must **never** be granted MCP's
repo/file/command reach. The agent-runtime plan already encodes this ("MCP stays external;
the in-app agent calls services directly") — this plan does not change it.

---

## 4. Recommended approach

**Track A — Hermes: do-not-host-yet (explicit decision).** Keep Hermes deferred. When it
begins, it starts as the `AgentRuntimeAdapter` port + `OpenAiDirectRuntime` *inside the
existing app* (Vercel route handlers, account-scoped, billed via the existing recorder) —
**not** as a separately-hosted server, and **not** with any MCP/repo/file/shell reach. A
real "hosted Hermes" is Phase 4 (future), only after its §9 gates pass. No hosting work now.

**Track B — Internal MCP server: use the prepared local path; harden the named gaps.**
The "safe hosting path" that is real and low-risk today is the **existing** Stage-1.5 HTTP
transport, run **locally and ephemerally** by Marcus, fronted by a tunnel **only when** a
ChatGPT Developer Mode session needs it, then stopped. This is **session tooling, not an
always-on service** (runbook's own framing). No new hosting infra; the actionable work is
operational discipline + closing the OAuth / token-rotation / end-to-end-verification gaps.

### Recommended runtime shape (Track B, today)
```
Marcus's machine                              ChatGPT Developer Mode
┌───────────────────────────┐   tunnel        ┌──────────────────────┐
│ npm run mcp:http           │  (ngrok/        │ custom MCP connector │
│  127.0.0.1:8765/mcp        │◄──cloudflared──►│  https://<host>/mcp  │
│  bearer MCP_HTTP_TOKEN     │   ephemeral)    │  ?key=<token> or     │
│  read-only curated tools   │                 │  Bearer header       │
└───────────────────────────┘                 └──────────────────────┘
   loopback bind • origin-validated • 1 MiB cap • redacted • no DB/secrets/shell
```
Stop the tunnel + server when done. Rotate the token after any tunnel session.

---

## 5. Alternatives considered (hosting target)

| Option | Verdict | Why |
|---|---|---|
| **Local loopback MCP-HTTP + ephemeral tunnel (ChatGPT Dev Mode), Marcus-only** | **RECOMMENDED (Track B)** | Already built + smoke-tested; smallest blast radius; bearer-gated; read-only; stop when done. Matches the runbook. |
| stdio MCP only (Claude Code) | **Keep (default)** | No network at all; best for local coding hosts. HTTP is additive, only for remote clients. |
| Vercel serverless / route handler for the MCP server | **Reject (now)** | Would put the repo-reading dev tool on a public always-on edge surface; MCP reads local repo files + runs local npm checks — neither maps to serverless. Conflates dev tooling with product. |
| Long-running Node service on a VM/container (always-on) | **Reject (now)** | Always-on increases exposure for a tool that's meant to be ephemeral; needs infra/patching/secret management for near-zero benefit over an on-demand tunnel. Revisit only if multi-user internal demand appears. |
| Internal-only HTTP service behind VPN/SSO | **Defer** | Reasonable *if/when* the team needs shared access; today it's single-user. Park as Phase 3. |
| Host "Hermes" (product runtime) anywhere | **Reject (now)** | Nothing to host; preconditions unmet. Track A. |
| **Do-not-host-yet** for the public/product surface | **Adopt** | The honest default until there's a built thing with a complete security model. |

---

## 6. Security model — what hosted Hermes / MCP may and may not do

These are the **boundaries the implementation must keep**. Most are already enforced for
MCP; restated so a future Hermes track inherits them explicitly.

**Internal MCP HTTP (Track B) — already enforced, keep:**
- ✅ **Auth required** — bearer `MCP_HTTP_TOKEN` (≥16 chars), constant-time, `401` else, never logged.
- ✅ **Loopback by default** — external bind needs `MCP_HTTP_ALLOW_EXTERNAL=1` + warning. **Prefer tunnel over external bind.**
- ✅ **Origin validated** — DNS-rebind defense; allow-list via `MCP_HTTP_ALLOWED_ORIGINS`.
- ✅ **Body cap 1 MiB → 413**; `GET → 405`; no SSE.
- ✅ **No DB / service-role / secrets / env** — no such imports exist (test-enforced).
- ✅ **No arbitrary file read** — whitelist only (`docs/**`, `CLAUDE.md`, manifests).
- ✅ **No arbitrary shell** — 3 exact read-only npm scripts; no arg injection surface.
- ✅ **No mutation** — no `db:push` / migrate / deploy / `git push` / workflow mutation.
- ✅ **Redact-before-truncate** at the single egress point; token-redacted stderr.
- ✅ **No broad repo exfiltration** — `repo_file_search` returns paths only; `get_file_outline` is structural + byte-capped.

**Future Hermes (Track A) — boundaries to design in from day one:**
- ❌ **No MCP/repo/file/shell reach.** Hermes orchestrates the *product*; it calls
  `services/*` directly and never inherits the dev MCP's repo access.
- ❌ **No service-role / cross-account access.** Account-scoped per the V2 model;
  facts come from `services/diagnostics/*`, never agent memory.
- ❌ **No workflow mutation unless explicitly approved later** (Apply stays explicit,
  per the AI-REPAIR arc's posture).
- ✅ **Billed + gated** — every underlying LLM call emits an `ai_cost_event` and charges
  the workflow-owning account before the model call (existing `aiCreditGate`).
- ✅ **Auth + rate/body limits + redacted logs** at its own boundary.

**Cross-cutting (both):** require auth; rate/body limits; clear logs with token redaction;
**no secrets/env/token access in responses**; **no git push / deploy / db:push**; clear
separation between the internal repo assistant (MCP) and any product runtime (Hermes).

---

## 7. Access model

| Surface | Who may access | Auth | Rotation / revocation |
|---|---|---|---|
| stdio MCP | Local coding hosts on Marcus's machine (Claude Code/Desktop/Codex) | none (subprocess) | n/a (no network) |
| MCP HTTP + tunnel | **Marcus only**, **ChatGPT Developer Mode only**, **ephemeral** | bearer `MCP_HTTP_TOKEN` (header or `?key=`) | rotate = restart with a new token; revoke = stop server + tunnel. Rotate after every tunnel session (URL-token can be proxy-logged). |
| `/api/internal/diagnostics/*` | Local/dev only (MCP fetch client) | `DIAGNOSTICS_API_TOKEN` + flag default-OFF, prod-locked | rotate token; keep `DIAGNOSTICS_API_ENABLED` OFF in prod |
| Future Hermes | In-app, account-scoped end users (eventually) | app session + account membership + credit gate | n/a now (unbuilt) |

- **Team members later:** **deferred** — would need per-client tokens or OAuth + an
  internal-only deployment (Phase 3). Not single-shared-token over a tunnel.
- **Internal admin only:** the diagnostics plane already models this (gated, dev-token).

---

## 8. Environment / secrets (LIST ONLY — do not set, do not commit values)

| Var | For | Safe to commit? | Notes |
|---|---|---|---|
| `MCP_HTTP_TOKEN` | MCP HTTP bearer | **NEVER** | ≥16 chars; shell/untracked-env only; rotate after tunnel sessions |
| `MCP_HTTP_HOST` | MCP HTTP bind host | default-safe | default `127.0.0.1`; leave loopback |
| `MCP_HTTP_PORT` | MCP HTTP port | safe | default `8765` |
| `MCP_HTTP_PATH` | MCP HTTP path | safe | default `/mcp` |
| `MCP_HTTP_ALLOW_EXTERNAL` | non-loopback bind opt-in | **leave unset** | prefer tunnel; setting `1` widens exposure |
| `MCP_HTTP_ALLOWED_ORIGINS` | Origin allow-list | safe | only if a browser client is needed |
| `CHAINREACT_REPO_ROOT` | stdio host repo root | safe (path) | optional |
| `MCP_DIAGNOSTICS_URL` / `MCP_DIAGNOSTICS_TOKEN` | live-diagnostics fetch client | **token NEVER** | distinct from `MCP_HTTP_TOKEN` |
| `DIAGNOSTICS_API_ENABLED` / `DIAGNOSTICS_API_ALLOW_PROD` / `DIAGNOSTICS_API_TOKEN` | gated diagnostics routes | **token NEVER**; flags default-OFF | keep OFF in prod |

**`.env.example` finding:** it exists but documents **none** of these. A future docs-only
slice should add **commented, value-less** placeholders + a one-line pointer to the two
runbooks — so the vars are discoverable without ever committing a secret. (Not done here —
this slice changes no files but the doc.)

---

## 9. Phased hosting plan

- **Phase 0 — Current local status (DONE).** stdio MCP for coding hosts; Stage-1.5 HTTP
  transport built + smoke-tested; live-diagnostics plane gated default-OFF. Hermes unbuilt.
- **Phase 1 — Private authenticated HTTP hosting / tunnel (READY; operational).** Run
  `mcp:http` on loopback with a strong `MCP_HTTP_TOKEN`; front with an ephemeral tunnel
  **only** for a ChatGPT Developer Mode session; stop both after. No code change required —
  this is the existing path. Optional hardening slices in §10.
- **Phase 2 — Smoke + observability.** `mcp:http:smoke` is the acceptance gate; run the
  runbook's "How to verify ChatGPT is actually calling it" steps on Marcus's machine
  (currently **unverified** end-to-end). Add lightweight request logging (token-redacted)
  if needed for confidence.
- **Phase 3 — Restricted internal deployment (only if multi-user need appears).** Replace
  single-shared-token + tunnel with per-client tokens or OAuth 2.1 + an internal-only host
  behind SSO/VPN. Until then, **do not** stand up an always-on public service.
- **Phase 4 — Future productized agent (Hermes) — only when intentionally designed.** Begin
  as the in-app `AgentRuntimeAdapter` + `OpenAiDirectRuntime`, account-scoped, billed, **no
  MCP reach**; "hosted Hermes" only after the agent-runtime plan §9 gates pass. Separate arc.

---

## 10. Implementation slice breakdown (follow-ups; each docs-or-small, none required to "host")

> Hosting (Track B Phase 1) needs **no** code slice — it already works. These close the
> named gaps and improve safety/discoverability. All default-OFF / additive.

- **CS-1 (docs):** Add commented, value-less MCP/diagnostics env placeholders + runbook
  pointers to `.env.example`. No secrets.
- **CS-2 (docs):** Add a short "ephemeral hosting session" checklist to
  `chatgpt-mcp-developer-mode.md` (start → tunnel → verify → stop → rotate).
- **CS-3 (small, optional):** Token-redacted per-request access log (count/path/status only)
  behind an opt-in `MCP_HTTP_LOG=1`, for Phase-2 observability. No bodies, no tokens.
- **CS-4 (medium, only if Phase 3 triggers):** OAuth 2.1 + Protected Resource Metadata OR
  per-client tokens with expiry/rotation for the HTTP transport. Out of scope until shared
  access is real.
- **CS-5 (future, Track A):** `AgentRuntimeAdapter` port + `OpenAiDirectRuntime` *in-app*
  (no hosting) — the genuine first Hermes slice, gated by agent-runtime plan §9. Separate arc.

---

## 11. Risks / open questions (each with a recommendation)

- **OQ-1 — Did Marcus mean "host Hermes" or "host the MCP server for ChatGPT"?** The repo
  has no Hermes; all signals point at MCP. **Recommendation:** confirm the framing — proceed
  on Track B (MCP) and keep Hermes deferred unless Marcus explicitly wants to *start building*
  Hermes (a different, larger arc).
- **OQ-2 — ChatGPT end-to-end is unverified.** **Recommendation:** run the runbook's verify
  steps on Marcus's machine before relying on it; treat as the Phase-2 acceptance gate.
- **OQ-3 — Tunnel exposure.** A tunnel publishes the loopback port; the bearer token is the
  only gate. **Recommendation:** ephemeral only, rotate after each session, never
  `MCP_HTTP_ALLOW_EXTERNAL=1`, prefer the header over `?key=` where the client allows it.
- **OQ-4 — Always-on temptation.** **Recommendation:** do **not** stand up an always-on
  public MCP host (Phase 3 internal-only is the ceiling until product need is proven).
- **OQ-5 — Hermes/MCP boundary drift.** **Recommendation:** when Hermes starts, enforce in
  code/review that it never imports `scripts/mcp` or gains repo/file/shell reach.

---

## 12. Acceptance criteria

**For this planning slice:** the doc exists at the path below; every "current state" claim
is tied to a file actually read; **no source/test/migration/UI/env changed**; nothing
pushed/deployed; no cloud resource created; no env var set.

**For any later implementation (Track B):** Phase-1 hosting runs with `MCP_HTTP_TOKEN` set
out-of-source, loopback bind, ephemeral tunnel, `mcp:http:smoke` green, ChatGPT verify steps
passed, token rotated after the session, and **zero** new reachable surface beyond the
existing read-only registry.

## 13. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, schema, UI, or env changes. No cloud resources. No tunnel
started. No external bind. No service-role access. No secrets created/committed/printed. No
`git push` / deploy / `db:push`. Only this one planning doc was written.

## 14. Recommended next step

**Confirm OQ-1 with Marcus.** If the intent is ChatGPT-Dev-Mode access to the MCP server
(most likely): proceed with **Phase 1 as a runbook-driven operational session** (no code) and
optionally land **CS-1** (`.env.example` placeholders, docs-only). If the intent is to *begin
Hermes*, that is a separate, larger build arc starting at **CS-5** (in-app adapter), not a
hosting task.
