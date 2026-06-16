# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-15 @ 69e3792d8 (MCP internal diagnostic + reporting suite COMPLETE — stages 2A–2D, 43 tools, local-only)

## Current status

- **LIVE in production** at `https://chainreact.app`, deploying from `v2-main` →
  [`docs/slices/phase-4/v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
  **Authenticated + execution production smoke GREEN (2026-06-11)** — `npm run smoke:prod`,
  30 tests, 29 passed / 1 skipped / 0 failed, on deployed `9abe08ab6`. Vercel log review
  still manual.
- **Push state:** `origin/v2-main` is at `43b1a370f` — **deployed to prod 2026-06-12**
  (verified batch of 31 commits: WF-RUNPERM private-credential run/edit policy, Connected-app
  Disconnect-live, MCP Stage-2B live diagnostics). Prod smoke GREEN post-deploy (22 passed /
  8 execution-gated skipped / 0 failed). **Push posture updated:** local work stays push-gated
  (commit locally, don't push by default), but Marcus's explicit approval of a verified batch
  authorizes a `v2-main` push **which deploys to prod** — that is now the intended ship path
  (no staging env yet). Approval is per-batch; it does not carry over.
- **Open threads:**
  - **AI diagnosis + explanation (local-only, flags OFF).** Deterministic "Check workflow"
    (AI-DIAG-1) stays 0-credit/ungated/no-model; its telemetry now bills the workflow-owning
    account (AI-DIAG-2-pre). **"Explain with AI" SHIPPED** (AI-DIAG-2): explicit-click only; the
    route re-derives the safe DTO server-side and sends only an allow-listed projection to OpenAI
    fast, gated **before** the model call (`workflow_explanation`=1, workflow-owning account),
    explanation-only UI. **Credit enforcement WIRED but OFF** (`ENABLE_AI_CREDIT_ENFORCEMENT` =
    literal `"true"`); OpenAI provider not enabled → explain returns safe 503. **Next:** dev/OpenAI
    smoke → later Q&A/repair → **only then** Hermes →
    [`ai-diag-2-llm-explanation-plan.md` §0](./slices/phase-4/ai-diag-2-llm-explanation-plan.md) ·
    [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md).

## Durable decisions

- [2026-06-11] Manual run-now execution is kept alive past the 202 via Next `after()`
  (→ Vercel `waitUntil`) so runs finalize on serverless instead of sticking in `running` —
  interim until a durable queue → commit `9abe08ab6` +
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [2026-06-10] CLAUDE.md is the operating constitution; durable repo rules live in
  [`docs/rules/`](./rules/), provider/contract detail in [`docs/slices/`](./slices/) →
  curation commits `c2bbedbff..4cd929c7f`.
- [2026-06-12] **Team-visible ≠ team-runnable.** A workflow using ≥1 private/member-connected
  credential runs under the **creator's** OAuth identity (22B pin), so only the creator may
  run/edit it; owner/admin manage/audit/disable/delete/duplicate/transfer/request-share but do
  **not** run-as-creator by default. Shared/account-only + native-only workflows stay runnable/
  editable by any member. Non-creators see safe copy + Duplicate. Server (`6a02131ed`) + builder
  UI (`42fe1ce29`); **no migration, no flag**; Disconnect untouched →
  [`workflow-run-edit-permission-closeout.md`](./slices/phase-4/workflow-run-edit-permission-closeout.md).
- [2026-06-12] **AI credits = a separate billing dimension from workflow tasks.** Meter AI
  usage in AI credits (own pool, own limits), gate tiers on it. Deterministic checks
  (`services/diagnostics/*`) free; AI explanation cheap; repair planning costs more; deep
  multi-step agent loops premium. **Cheap model routing by default**, escalate to strong/premium
  only on validation-failure/low-confidence/higher-tier. Track AI cost from day one. Future hosted
  Hermes-style runtime sits behind an **agent-runtime adapter** (OpenAI underneath); ChainReact
  services stay source of truth; **MCP stays external** (in-app agent never calls MCP). As-built
  (`AI-CREDITS-3b`, flag-OFF): recording ledger + credit **policy/limits/gating now SHIPPED** — AI
  usage bills the **workflow-owning account** (personal→personal, team/business→shared pool), gated
  before the paid planner; deterministic diagnosis stays 0-credit/ungated →
  [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md) +
  [`ai-credits-and-agent-runtime-plan.md`](./slices/phase-4/ai-credits-and-agent-runtime-plan.md).
- [2026-06-10] File output (P-S3) is a durable cross-cutting rule →
  [`docs/rules/file-output-contract.md`](./rules/file-output-contract.md).
- [2026-06-12] **Push/deploy posture.** Local work is push-gated by default (commit locally,
  don't push). When Marcus **explicitly approves a verified batch**, pushing to `v2-main` is
  allowed and **deploys to production** — intended at this stage. The earlier "do not deploy to
  prod" caution is retired. A proper dev/staging env will be added later, before broad user
  rollout + taking payments → CLAUDE.md push-posture banner.
- [2026-06-09] V2 promoted live in production. "Don't push the working branch by default" does
  not mean "V2 isn't live" — both are true at once → CLAUDE.md banner @`4cd929c7f`.

## Open risks & follow-ups

- [n/a] Slack-side message landing is **not externally verified** — that smoke step is
  intentionally gated (no Slack API read creds in the harness) →
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [Marcus] Provider builder-metadata launch gap **CLOSED 26/26** (2026-05-25) — enforced by
  `COVERED_PROVIDERS` / `tests/structure/discovery-meta-coverage.test.ts`; residual backlog
  non-launch-blocking →
  [`provider-metadata-launch-gap-tracker.md`](./slices/phase-4/provider-metadata-launch-gap-tracker.md) §8–§9.
- [Claude] `chainreactv2-parity-auditor` skill **deferred** until recurring demand.
- [Marcus] V1 (`chainreact-app-9e`) CLAUDE.md trim **shelved** (`git stash@{0}` on
  `marcus_dev`) — leave V1 untouched unless asked.

## Recently completed arcs

- **AI diagnosis explanation (AI-DIAG-2) — safe single-call "Explain with AI", local-only (2026-06-12)** —
  deterministic check stays 0-credit/ungated (telemetry now → workflow-owning account); optional
  explicit-click explanation re-derives the safe DTO server-side, sends only an allow-listed projection
  to OpenAI fast (no ids/config/tokens/free-text), gated before the model call (`workflow_explanation`=1,
  workflow-owning account); explanation-only UI. Flags OFF, OpenAI not enabled → safe 503. Q&A/repair/
  Hermes deferred → `a66d0d87e`/`baea491b4`/`8e090b2f6` +
  [`ai-diag-2-llm-explanation-plan.md` §0](./slices/phase-4/ai-diag-2-llm-explanation-plan.md).
- **AI credit enforcement (AI-CREDITS-3b) — gate WIRED flag-OFF, local-only (2026-06-12)** — paid
  planner (`workflow_creation`) gated before the model call → 402 `AI_CREDITS_EXHAUSTED` (planner not
  called) / 403 frozen / 503 fail-closed; bills the workflow-owning account. Migration `20260621000000`
  on dev; gated dev smoke proved the RPC/gate path. Flag OFF everywhere (literal `"true"`). Full
  as-built + commits + deferred work →
  [`ai-credits-enforcement-3b-plan.md` §0](./slices/phase-4/ai-credits-enforcement-3b-plan.md).
- **Internal MCP diagnostic + reporting suite COMPLETE — stages 2A–2D, 43 tools (local-only, 2026-06-15)** —
  repo navigation, provider readiness, targeted verification, gated live diagnostics
  (run-failure/visibility, workflow-readiness, integration-/workflow-connections), workflow-graph
  diagnostics, no-leak scanner, composite doctors, and diagnostic/deploy-readiness reports
  (Phase 2D `69e3792d8`). Reports **compose** existing doctors/checks — no new route/brain/DB/mutation;
  output stays enums/counts/ids/field-names only (route=gate/validate/serialize ·
  `services/diagnostics/*`=brain · MCP=adapter/render). Deferred / do-not-build: smoke runners + any
  mutating/deploy/db/prod-data tools →
  [`mcp-diagnostic-suite-closeout.md`](./slices/phase-4/mcp-diagnostic-suite-closeout.md) +
  [`mcp/mcp-development-tooling-audit.md`](./slices/phase-4/mcp/mcp-development-tooling-audit.md).
- **Connected-app recovery + disconnect (local-only, 2026-06-12)** — **Reconnect UX-complete**
  on connected app cards (provider-level recovery, always visible on collapsed cards;
  filled-secondary + refresh glyph + "Refresh this connection" tooltip). **"Connect another"
  UX-complete** ("Add another account"). Per-account **Disconnect is LIVE / product-complete**
  — UI + backend (service/repo CD-1, routes CD-2, UI CD-3, polish `8c38d8b60`), and the
  `ENABLE_INTEGRATION_DISCONNECT` rollout flag was **removed `34b28e045`** (renders + works by
  default; no replacement flag). `markDisconnected()` dead code replaced by a service-role
  disconnect path. Soft-disconnect + best-effort revoke + `integration_revoked` cascade
  (last-active-row only; never auto-resume); no token/secret/raw-error leak. Localhost-OAuth
  observation audited as a dev redirect artifact, not a prod auth bug →
  [`connected-app-recovery-ux.md`](./slices/phase-4/connected-app-recovery-ux.md),
  [`connected-app-disconnect-plan.md`](./slices/phase-4/connected-app-disconnect-plan.md);
  commits `55c004501`/`deb4897a5`/`9964dc5d3`/`8c38d8b60`/`34b28e045`.
- **Production smoke closeout (2026-06-11)** — run-now `after()` reliability validated in
  prod (builder manual-run finalizes + appears on `/runs`); Slack action manual-run
  finalization validated; Slack channel loading recovered after Slack re-OAuth →
  `dd9e69502` + [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).

## Owner preferences

- Local-only / push-gate; no fake UI, no invented backend; challenge only real
  architectural / security / product risk; verify-then-report with structured outputs →
  see [`CLAUDE.md`](../CLAUDE.md) + [`.claude/skills/README.md`](../.claude/skills/README.md).
- Small, scoped, reversible commits; strict honesty (never claim a check ran unless it did).

## Not captured here

- secrets / env / tokens / credentials / production or customer data
- per-message chat noise · unverified speculation
- rule bodies (→ `docs/rules/`) · roadmap / go-live / closeout / outcome detail
  (→ `docs/slices/`, `docs/roadmap/`) · every slice (→ closeouts)
