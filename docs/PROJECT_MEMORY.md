# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-21 @ e1ce8ab1d (+ HERMES-AGENT-GUIDANCE-UI-BUILDER: second "Build with me" entry inside the workflow builder (collapsed floating pill) reusing WorkflowGuidancePanel verbatim + passing in-context workflowId+accountId; server-gated on isHermesAgentEnabled()+accountId; route/helper already supported workflowId; advisory only, no mutation/plan-extraction/direct-gateway. + HERMES-AGENT-GUIDANCE-UI: first user-facing "Build with me" advisory panel on workflows dashboard, server-gated on HERMES_AGENT_ENABLED, calls only the route via client helper, renders guidanceText; no mutation/no direct gateway. + HERMES-AGENT-CAPABILITY-ROUTE: gated POST /api/accounts/[id]/ai/workflow-guidance — auth+membership+freeze+optional-workflow-ownership+aiCreditGate(workflow_guidance)+persistent audit recorder; billing gap CLOSED; no ai_cost_events/no migration; advisory response only. + HERMES-AGENT-CAPABILITY: advisory React Agent capability workflow_guidance_intake (read_only, audited, gated, server-only via runAuthorizedCapability). + HERMES-AGENT-RESPONSE-CONTRACT: strict Zod gateway envelope schema + normalizeGatewayResponse → advisory NormalizedGatewayGuidance, fail-closed, workflowPlan null unless validateWorkflowPlan passes; live smoke healthy end-to-end. + HERMES-AGENT-PROD-CLIENT: server-only Render gateway client shipped, gated/inert; Render prod infra live, sandbox skipped; gateway now VERIFIED healthy after Render-side fixes. + HERMES-AGENT PIVOT: stripped direct Nous hosted-model integration — adapter/config/flag/prompt-builder/fallback/live-smoke/setup-runbook removed; generic guidance contracts + sanitizer + plan validator + skill-event boundary retained; new direction = internal Hermes Agent with OpenAI underneath, spike + sandbox runbook added. action-smoke live-verification arc + readiness/registry fixes; pruned superseded React Agent CS sub-entries — governance rollup retained. origin/v2-main = 33fad13b4; several LOCAL/UNPUSHED commits ahead, incl. SMOKE-CERT-1 + analytics WIP)

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
    explanation-only UI. **LIVE in prod + credit enforcement ON** (2026-06-19): `ENABLE_AI_CREDIT_ENFORCEMENT=true`
    (Production), OpenAI ON; Q&A + Explain deduct AI credits (see "Recently completed arcs"). **Next:**
    credit-exhaustion product messaging → AI usage in billing UI → later Hermes →
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
- [2026-06-15] **Active-revision model is the real product behavior (LOCAL/UNPUSHED, no flag).**
  Draft edits aren't live; active workflows run the immutable active revision; test/preview runs
  the draft; Publish snapshots the draft → new revision + repoints `active_revision_id`; trigger
  resources are always registered from the same definition that's snapshotted; `workflow_runs.revision_id`
  records the executed revision (NULL for draft/test/legacy/fallback, never exposed by an API).
  Arc 41A–41J; flag `ENABLE_ACTIVE_REVISION_EXECUTION` **removed** (41H). Migration
  `20260626000000_workflow_runs_revision_id.sql` applied to **dev DB only** — **not pushed, not in
  prod**; deploy must apply it →
  [`active-revision-model-closeout.md`](./slices/phase-4/readiness/active-revision-model-closeout.md).
- [2026-06-16] **Sensitive-table Data API grant audit COMPLETE — four tables service-role-only (LOCAL/UNPUSHED).**
  `authenticated` can no longer directly read/write `integrations` (47B/47D, `20260627`/`20260628`),
  `trigger_resources` (50, `20260629`), `workflow_files` (52, `20260630`), or `workflow_runs` (51,
  `20260701`) where locked down; OAuth callback role re-check done (48). Every client read flows through a
  **service-role repository + explicit membership gate + allow-listed DTO**; `workflow_runs` detail strips
  raw `trigger_event`/`fatal_error`/raw step output, exposing SEC-7-redacted output ONLY to the test-run
  author. RLS unchanged; the personal/account model stays in `core/integrations/credentialSharing.ts`,
  **never re-encoded in SQL**. Regression guard `tests/structure/no-authenticated-integration-grants.test.ts`
  locks all four tables; gated RLS DB tests prove member direct SELECT → `42501`. **Migrations dev-DB-applied
  only, not pushed/prod — deploy must apply them. CONN-SHARE must not re-open broad grants** →
  [`v2-ready-49-sensitive-table-grant-audit.md`](./slices/phase-4/readiness/v2-ready-49-sensitive-table-grant-audit.md)
  + 47E/50/51/52 closeouts (`0cac51058`/`2c99a71bd`/`1f34cd7ba`/`88cf2d483`).

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

- **Action-smoke harness — live-verification arc substantially COMPLETE — LOCAL/UNPUSHED (2026-06-20)** —
  CLI + Jest harness (`npm run smoke:actions[:run[:workflow[:live]]]`) drives real V2 internals; per-provider
  live via `SMOKE_PROVIDER`, names-only missing-env summaries, double-gated live mode (read fixtures only — no
  write/destructive runs). **Live-verified reads:** Slack (read+write), Gmail, Google Drive, Microsoft Outlook,
  Airtable, Notion (incl. empty-query "search all"), Google Sheets, Microsoft Teams. **Microsoft Excel still
  BLOCKED** — the connected Microsoft account has no accessible OneDrive/SharePoint drive (`get_workbooks` →
  Graph "Operation not supported"); documented as an account/resource requirement, not a code bug. **Fixes:**
  `e7a0db5f0` — a required field declaring a meta `defaultValue` is no longer a readiness gap (fixes Sheets
  `read_rows` `majorDimension` + the whole required-with-default class for non-builder configs; Notion `search`
  empty query consistently valid; Excel drive requirement documented); `4188b49ee` — refreshed stale
  Gmail(15)/Outlook(11) registry meta-count tests without weakening. Selector ids are discovered into gitignored
  `.env.local` only — no secrets/selectors/account-or-run/workflow-ids/raw provider payloads stored. Nothing
  pushed/deployed/db:pushed → [`docs/runbooks/action-smoke-cli.md`](./runbooks/action-smoke-cli.md).
- **HERMES-AGENT-GUIDANCE-UI-BUILDER — second "Build with me" entry inside the builder — LOCAL/UNPUSHED (2026-06-21)** —
  advisory guidance now reachable from the workflow builder. `features/workflow-builder/panels/BuilderGuidanceEntry.tsx`
  is a thin wrapper that reuses the SAME `WorkflowGuidancePanel` verbatim (no new request logic): a collapsed floating
  pill (bottom-left of the canvas, `absolute` overlay, starts closed) that on toggle reveals the panel, passing the
  in-context `workflowId` + the workflow's `accountId`. Mounted by `WorkflowBuilder.tsx` (new optional `accountId` +
  `guidanceEnabled` props; entry renders only when BOTH present) and gated in `app/workflows/[id]/page.tsx` via
  `isHermesAgentEnabled()` (default OFF → no entry) with `accountId={record.accountId}` (server-resolved, never
  client-supplied). The route/helper already supported `workflowId`; the route verifies the workflow belongs to the
  caller's account (no-leak 404) and passes its sanitized draft as optional context. **ADVISORY ONLY: no workflow
  create/mutate/apply/run, no plan extraction, no automatic node insertion; browser calls ONLY the ChainReact route —
  never gateway/vendor/Nous/private-Hermes, never a token (static-scan extended to the new file).** Verified: tsc clean,
  focused suites green (5 new builder-entry behavior tests + 4 WorkflowBuilder gating tests + extended static safety scan;
  dashboard panel/route/reactAgent/ai-guidance all still pass), lint:structure OK, eslint 0. Right drawer untouched (AI
  stays out per port-plan §4); left React Agent rail untouched. Docs: topology builder UI surface added. Next:
  HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-GUIDANCE-UI — first user-facing "Build with me" panel — LOCAL/UNPUSHED (2026-06-21)** — advisory
  guidance UI on the workflows dashboard. `features/workflows/WorkflowGuidancePanel.tsx` (textarea + submit + loading
  + safe error + renders `guidanceText` under "Guidance") mounted in `app/workflows/page.tsx`, **server-gated on
  `isHermesAgentEnabled()`** (default OFF → panel not rendered, no dead box); `accountId` = page's resolved active
  account (prop, never client-supplied). Client helper `lib/api/ai/guidance.ts` `requestWorkflowGuidance({accountId,
  goalText, workflowId?})` → `postStructured` → `POST /api/accounts/[id]/ai/workflow-guidance` (barreled via
  lib/api/ai.ts). Browser calls ONLY the ChainReact route — never gateway/vendor/Nous/private-Hermes, never a token
  (static-scan test); component makes no direct fetch. Failures → safe "AI workflow guidance is temporarily
  unavailable." (credits denial shows its own safe msg); never shows internal error/envelope/usage. **ADVISORY ONLY:
  no workflow create/mutate/apply/run; no plan extraction (workflowPlan opaque, not rendered).** Verified: tsc clean,
  352 tests pass (9 new UI: render/disabled-empty/success/failure/loading/workflowId-forward/no-direct-call + route +
  reactAgent + ai-guidance green), lint:structure OK, eslint 0. Docs: runbook UI section + topology UI→route→capability
  path. Next: HERMES-AGENT-PLAN-EXTRACTION; optional builder-rail entry passing in-context workflowId.
- **HERMES-AGENT-CAPABILITY-ROUTE — gated server route for workflow guidance — LOCAL/UNPUSHED (2026-06-21)** — added
  `POST /api/accounts/[id]/ai/workflow-guidance` ([route.ts](./../app/api/accounts/[id]/ai/workflow-guidance/route.ts)).
  Gate order: `requireUserWithAccount(id)` (auth + account membership + freeze; accountId from URL param NEVER body,
  `.strict()` body rejects client accountId) → strict `{goalText, workflowId?}` → optional workflow ownership (must
  belong to THIS account → else no-leak 404; draft passed as safe context) → Hermes availability
  (HERMES_AGENT_ENABLED + config) BEFORE charge → `aiCreditGate({feature:"workflow_guidance", fast})` → capability
  runner via `runAuthorizedCapability` with the PERSISTENT `reactAgentAuditRecorder` injected. **Billing gap CLOSED:**
  added `workflow_guidance` to `core/billing/aiCreditPolicy.ts` FEATURE_BASE_CREDITS (base 1, same class as qa) and
  set the capability registry `creditFeature: "workflow_guidance"` (was null; lockstep test updated). **No
  `ai_cost_events` write → NO migration** (ChainReact makes no direct model call; the agent does — usage reconciliation
  deferred). Response = normalized advisory ONLY (`guidanceText/source/workflowPlan/warnings?`) — never raw envelope/
  usage/prompt/token/ids; provider failures → 503 GUIDANCE_UNAVAILABLE. **NO workflow mutation; NO UI; NO direct
  OpenAI/Nous/private-Hermes (route calls the runner, not the gateway client — static-scan test).** Verified: tsc clean,
  170 tests pass (16 new route tests + updated capability/lockstep; qa-route + aiCreditPolicy regressions green),
  lint:structure OK, eslint 0. Docs: runbook route section + topology. Next: HERMES-AGENT-GUIDANCE-UI (client entry
  point) → HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-CAPABILITY — advisory React Agent capability `workflow_guidance_intake` — LOCAL/UNPUSHED (2026-06-20)**
  — exposed Hermes guidance through the existing React Agent governance allow-list, ADVISORY/read-only. Added registry
  entry in `services/ai/reactAgent/capabilities.ts` (`workflow_guidance_intake`, mode `read_only`, intent
  `request_workflow_guidance`, `creditFeature: null`, auditKind `react_agent.workflow_guidance_intake`) + new intent in
  `types.ts` (EXCLUDED from recognized free-text set — runs only via the server seam, never `handle()`). Server-only
  runner `services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`: builds safe DTO (sanitizer) → runs through
  `runAuthorizedCapability` (scope shape-validated; one safe audit row when a recorder is injected — scope ids + enums
  only, NO prompt/goal/guidance/token) → calls `requestHermesAgentGuidanceNormalized`. Lives in the `capabilities/`
  SUBMODULE so the boundary-imports fence (top-level only, relative-imports-only, no model/HTTP) stays intact. Gated by
  HERMES_AGENT_ENABLED (default OFF) + config → disabled/unconfigured returns typed unavailable with NO fetch. **NO
  workflow create/apply/run/delete; NO route/UI; NO direct OpenAI/Nous/private-Hermes; NO migration.** **Billing GAP
  (intentional):** no aiCreditGate for Hermes guidance yet — stays OFF by config until a future route wires the
  established gate. Verified: tsc clean, 128 tests pass (new orchestrator + capability-safety tests + 66 existing
  reactAgent incl. boundary-imports), lint:structure OK, eslint 0. Docs: runbook §5 capability subsection + topology.
  Next: HERMES-AGENT-CAPABILITY-ROUTE (gated route + aiCreditGate + persistent recorder + UI) → HERMES-AGENT-PLAN-EXTRACTION.
- **HERMES-AGENT-RESPONSE-CONTRACT — strict gateway response normalization — LOCAL/UNPUSHED (2026-06-20)** — now
  that the live success envelope is known (`{ ok:true, response:{ choices:[{ message:{ content } }], usage? } }`),
  added `services/ai-guidance/gateway/gatewayResponseContract.ts`: Zod `gatewaySuccessEnvelopeSchema` + pure
  `normalizeGatewayResponse(raw)` → advisory **`NormalizedGatewayGuidance`** (`ok, guidanceText, source:"hermes-agent",
  workflowPlan: WorkflowPlan|null, rawUsage?, warnings?`). Fail-closed: malformed/missing-choices/missing-or-empty
  content → INVALID_RESPONSE; gateway `{ok:false}` → PROVIDER_ERROR (safe short code only, nested downstream messages
  NOT surfaced); non-2xx → PROVIDER_ERROR status_<n>; timeout → TIMEOUT. `usage` sanitized to numeric token counts
  only (NOT billing-trusted); unknown extra fields ignored (never copied out). **workflowPlan stays null** — a plan
  is only surfaced if a structured plan object passes `validateWorkflowPlan` (arbitrary JSON/prose never accepted as
  a plan). Client now exposes `requestHermesAgentGuidanceNormalized` (+ `requestHermesAgentGuidance` thin adapter to
  the `GuidanceResult` port); dropped the old loose extraction (raw-string/`{guidance}`/bare-choices). Verified: tsc
  clean, 51 mocked tests (new `gatewayResponseContract.test.ts` + updated client test), lint:structure OK, eslint 0;
  **live smoke PASSED healthy end-to-end** (non-empty guidanceText, ~4.8s). Nothing user-facing/live-routed; no
  migration. Docs: runbook §5 response-contract table + topology doc. Next: HERMES-AGENT-CAPABILITY (scoped/audited
  server boundary) → HERMES-AGENT-PLAN-EXTRACTION (gate structured plans through validateWorkflowPlan).
- **HERMES-AGENT-PROD-CLIENT — Render gateway client (gated, inert) — LOCAL/UNPUSHED (2026-06-20)** — Marcus
  stood up real production-style infra on **Render**, so the local Docker **sandbox is SKIPPED** as the main
  direction. Topology: **Vercel ChainReact → Render public AI Gateway (`chainreact-ai-gateway-prod`,
  `https://chainreact-ai-gateway-prod.onrender.com`, `POST /api/hermes-agent/guidance`) → Render private Hermes
  Agent (`chainreact-hermes-agent-prod`, Ohio :8642, disk /opt/data, model `hermes-agent`) → OpenAI**. ChainReact
  calls ONLY the gateway — never a model vendor/Nous/private agent directly; holds ONLY
  `CHAINREACT_AI_GATEWAY_TOKEN`. **OPENAI_API_KEY / API_SERVER_KEY / private Hermes URL / internal token NEVER go
  in Vercel** (Render only). Shipped `services/ai-guidance/gateway/`: `gatewayConfig.ts` (reads HERMES_AGENT_ENABLED
  + CHAINREACT_AI_GATEWAY_URL/TOKEN + HERMES_AGENT_TIMEOUT_MS; null when off/unconfigured), `buildGatewayGuidancePrompt.ts`
  (safe prompt from de-identified DTO + scrubbed goal text), `hermesAgentGatewayClient.ts` (POST {prompt}, Bearer
  gateway token in header only, advisory-only, fail-closed typed errors, `createHermesAgentGatewayProvider` impl of
  the generic port), `index.ts` (`resolveServerGuidanceProvider` = gateway-when-enabled else noop; NOT re-exported
  from the generic barrel = server-only). **Gated/inert**: only calls out when HERMES_AGENT_ENABLED=true + config +
  explicit server caller; no route/UI/React Agent wired; not the app default. Verified: tsc clean, 40 mocked tests
  (client/config/safety incl. no-Render-secret-in-body, no browser import, token-only-in-header), lint:structure OK,
  eslint 0. **Live smoke VERIFIED HEALTHY end-to-end (2026-06-20)**: after a sequence of Render-side fixes
  (inbound gateway auth → gateway→agent auth "Missing Authentication header" → agent provider config "Unknown
  provider 'openai'" → model "Encrypted content not supported" feature) the gateway now returns HTTP 200 `ok=true`;
  **Working model-provider config (on the Hermes Agent, NOT ChainReact):** OpenAI is wired as a CUSTOM
  OpenAI-compatible provider named **`openai-api`** (NOT the built-in name `openai`), base URL
  `https://api.openai.com/v1`, model = the one configured on the agent (exposed to ChainReact as `hermes-agent`).
  `gpt-4o-mini` FAILED (agent sent encrypted reasoning content that model rejects); OpenRouter/Nous warnings were
  old/default config, not the intended path; direct Nous Portal/model API is NOT used.
  the ChainReact client smoke passes the 2xx branch ("OK end-to-end", ~3.5s), normalizing the OpenAI-style
  `{ok:true,response:{choices:[{message:{content}}]}}` envelope into an advisory guidance result. Every blocker was
  Render/agent-side config; ChainReact code needed NO change throughout. NO migration, nothing live-routed/user-facing
  (client still gated + explicitly-constructed only). Docs:
  [`hermes-agent-render-prod.md`](./runbooks/hermes-agent-render-prod.md) (authoritative),
  [`hermes-agent-production-topology.md`](./slices/phase-5/hermes-agent-production-topology.md); sandbox runbook
  marked secondary. Next: HERMES-AGENT-CAPABILITY (scoped/audited server boundary) → HERMES-AGENT-RESPONSE-CONTRACT
  (tighten the now-verified gateway success schema + structured plan extraction behind validateWorkflowPlan).
- **HERMES-AGENT PIVOT — direct Nous hosted-model integration STRIPPED — LOCAL/UNPUSHED (2026-06-20)** — Marcus
  changed direction: ChainReact will NOT call a hosted LLM model API directly, and Nous Portal is NOT a
  fallback. Target arch = **ChainReact → Hermes Agent (internal learning/skills brain) → OpenAI (provider
  underneath) → Hermes Agent → ChainReact validation/decision**. **Removed** from `services/ai-guidance` +
  `contracts`: `nousHermesAdapter`, `hostedHermesGuidanceProvider`, `hermesConfig` (HERMES_* Nous-model
  env/`ENABLE_HOSTED_HERMES_GUIDANCE` flag), `buildWorkflowGuidancePrompt`, `guidanceFallbackPolicy`, the opt-in
  live Nous smoke + its tests, and `docs/runbooks/hosted-hermes-setup.md`. Also discarded the uncommitted
  JSON-mode WIP (`guidanceIntake` contract + `parseGuidanceIntakeResponse`). **Retained (generic, Agent-ready):**
  guidance contracts (`aiGuidance.ts`, `guidanceSession.ts`, `guidanceSkillEvents.ts`), `WorkflowGuidanceProvider`
  port, safe-DTO `sanitizeWorkflowForGuidance` (privacy boundary), `workflowGuidanceIntake` seam (noop default),
  `validateWorkflowPlan` (registry capability gate), `skillEventBoundary` (private→global generalized events).
  Hard boundaries: Agent never mutates workflows / never touches Supabase/service-role/OAuth tokens/API
  keys/raw integration rows; execution never depends on the Agent; global skills get only sanitized generalized
  events. NO migration, nothing live-routed, no app/route/UI. New docs:
  [`hermes-agent-chainreact-architecture-spike.md`](./slices/phase-5/hermes-agent-chainreact-architecture-spike.md)
  + [`hermes-agent-sandbox.md`](./runbooks/hermes-agent-sandbox.md) (sandbox: Docker + persistent volume + OpenAI
  in AGENT config; future env `HERMES_AGENT_BASE_URL`/`_INTERNAL_TOKEN`/`_TIMEOUT_MS`, not yet consumed). Prior
  plan banner-superseded. Verified: tsc clean, 5 suites/21 tests pass, lint:structure OK. Next: HERMES-AGENT-SANDBOX
  → HERMES-AGENT-CLIENT (inert `WorkflowGuidanceProvider` posting safe DTO, flag-OFF, mocked-fetch).
- **React Agent GOVERNANCE ARC COMPLETE + live-verified — LOCAL/UNPUSHED (2026-06-20)** — CS-1 boundary →
  CS-7e live smoke (14 commits, `193627693`..`c6820d5a1`). One account/workflow/user-scoped seam
  (`runAuthorizedCapability`) validates scope+registry+intent and emits ONE `react_agent_audit_events` row
  (success/failed/denied, fail-open ×2, metadata-free/no-leak). Registry: `diagnosis_qa`(read_only/workflow_qa),
  `diagnosis_explain`(read_only/workflow_explanation), `repair_proposal`(proposes_change/workflow_repair),
  `repair_apply`(requires_approval/null-credit; apply is deterministic, NO model, NO aiCreditGate; `apply_repair`
  excluded from free-text handle). `proposed_patch_ref` (one-way sha256) correlates proposal↔apply w/ no approval
  table. CS-5b migration APPLIED+live-verified; arc added NO feature flags (governance always-on for wired
  routes; apply has no UI entry yet). DEFERRED: ai_cost_event_id link, `react_agent_approvals` table (CS-7f),
  cross-ledger grant hardening, Hermes design. Next: push verified batch (Marcus approval)
  or start Hermes. → [`react-agent-governance-closeout.md`](./slices/phase-4/ai/react-agent-governance-closeout.md).
- **AI architecture direction CORRECTED: React Agent + MCP + Hermes split — LOCAL/UNPUSHED (2026-06-19)** —
  **React Agent** = in-app customer-facing assistant (the product AI path, **first**); **MCP** =
  external/diagnostic **adapter** for ChatGPT/Claude/internal tools, **NOT** a dependency of the in-app
  agent and **NOT** the product path; **Hermes** = **later** scoped runtime/memory layer (behind the
  `AgentRuntimeAdapter` port), not a global shared brain; **ChainReact `services/*` stay the source of
  truth**. Principles: account/workflow/conversation-scoped · permissioned · audited · credit-gated ·
  deterministic-first · queued for long jobs (`agent_jobs`/worker, never long req/resp) · approval-based
  workflow changes · AI optional to execution · NO global memory / cross-account retrieval / autonomous
  mutation · safe DTOs only. Build order: deterministic diagnostics → Explain → Q&A → repair suggest →
  approved apply (all ✅ shipped) → **Hermes later**. **Corrects [hermes-hosting-plan.md](./slices/phase-4/hermes/hermes-hosting-plan.md) (`9b87fdd86`):
  audit stands + "Hermes unbuilt" true, but its MCP-hosting conclusion over-redirected — MCP hosting is a
  separate secondary adapter track, NOT the answer to Hermes.** Next slices: React Agent service boundary
  (CS-1) → conversation model → internal tool registry → audit events → queued jobs → Hermes memory.
  Docs-only; no code/env/migration. Doc `react-agent-hermes-architecture.md` →
  [`react-agent-hermes-architecture.md`](./slices/phase-4/ai/react-agent-hermes-architecture.md).
- **Builder activation/readiness UX: visible blocked-go-live reason — LOCAL/UNPUSHED (2026-06-19)** — the
  readiness surface was already strong (`collectBuilderValidationIssues` maps the shared `core/workflows`
  validator into plain-English, no-id builder issues; `ValidationSummary` groups errors→warnings; each
  node-issue button calls `openNode` → opens config + focuses the node; `no_trigger` has a Choose-trigger
  action; `LifecycleActions` already disables Activate/Resume when `blockingIssueCount>0`). **Gap:** the
  disabled-button reason was **hover-only** (`title`). **Fix:** `LifecycleActions` now renders an
  always-visible `role="status"` line under a blocked Activate/Resume — "N setup issue(s) to fix before
  activate/resume" + a "Review" link wired (via `BuilderHeader`) to the existing validation panel; hidden
  at 0 issues / on Pause. **No activation-rule/validation/bypass/backend/AI/migration/flag change; no
  id/secret/token/DTO leak (asserted).** Verified: LifecycleActions+BuilderHeader+validation 103, full
  layout+panels 630, eslint 0, typecheck clean, lint:structure OK; Check workflow untouched. Deferred:
  header-level "jump to first blocking step". Commit `8faa6f3eb` LOCAL/UNPUSHED →
  [`builder-activation-readiness-ux-closeout.md`](./slices/phase-4/workflows/builder-activation-readiness-ux-closeout.md).
- **Builder canvas UX: drag + config-open focus(+zoom tune) + connection UX — LOCAL/UNPUSHED (2026-06-19)** —
  four client-only canvas fixes. (1) Live node drag: `WorkflowCanvas` ran controlled React Flow with no
  `onNodesChange`, so nodes only moved at drag-stop; now local `rfNodes` + `applyNodeChanges` move the
  node live while the graph slice is written **only** at `onNodeDragStop` (no per-mousemove slice/
  readiness/AI/autosave/server work) — plus grab/grabbing cursor. (2) Config-open focus: opening a
  node's config bumps the canvas-focus signal in a `"config"` mode → `useCanvasNodeFocus` `setCenter`.
  **Tuned (`dd53119ee`)** so it zooms IN, never out: zoom is now a FLOOR `Math.max(getViewport().zoom,
  CONFIG_MIN_ZOOM=1.4)` (was a flat forced 1.2 → felt like zooming out when already zoomed in), left
  offset cut 220→60px; no re-pan on same node, re-pans on a different node; reveal/"Go to field" still
  forced 1.75 centered/450ms. (3) Connection UX (`784fe89d9`): empty-catch on `connectNodes` made
  invalid connects fail silently; now `.builder-handle` styling + hover/selected accent ring + crosshair
  cursor, and self-loop/duplicate rejections surface the `connectNodes` message via a transient
  `role="status"` `ConnectionHintBanner` (no toast lib added; hint is local state). Valid connects +
  edge semantics + trigger topology unchanged. No migration, flag, backend, or RLS change. Verified
  (zoom tune): focus+drag+connect 20, full canvas+hooks 301, typecheck 0, eslint 0, lint:structure OK
  (connection slice earlier: 36/121/115). Marcus manually confirmed connection UX ("feels super smooth")
  AND the tuned config-open zoom-in. Commits `192826625` + `fde9b1110` + `784fe89d9` + `dd53119ee`
  LOCAL/UNPUSHED → [`builder-canvas-ux-closeout.md`](./slices/phase-4/workflows/builder-canvas-ux-closeout.md).
- **Selected-node Q&A focus label — LOCAL/UNPUSHED (2026-06-19)** — a diagnostic question asked
  with a step open now renders a subtle **"Focused on: <safe label>"** line in the read-only
  `diagnosis_qa` answer. Label derived **client-side** from the visible draft node via canonical
  `getNodeDisplayName(node)` (custom step name → metadata/type label → "Trigger"/"Action"); stale/
  missing/unresolvable id → no line (silent fallback). **No raw selectedNodeId/config/secrets/`{{}}`/
  DTO rendered; no server-side context projection; Q&A route/payload/model context unchanged; stays
  read-only, no Apply/Preview; still routes to the Q&A endpoint; credit-denied still shows the safe
  exhausted copy.** No routing/billing/env/provider/gate/migration change. Verified during the slice
  (not re-run at closeout): diagnosisQa 21, consolidated 114, typecheck 0, eslint 0, lint:structure
  OK. Commit `d2dfdc092` LOCAL/UNPUSHED (origin `cf0e43b97`); ships UI-only with the polish batch.
  **Deferred:** provider-prefixed labels, backend model/schema changes. →
  [`builder-ai-selected-node-qa-closeout.md`](./slices/phase-4/ai/builder-ai-selected-node-qa-closeout.md).
- **Builder AI polish batch — LOCAL/UNPUSHED (2026-06-19)** — UI/copy polish on the live metered
  Builder AI (no routing/billing-gate/env/provider/migration change). Friendlier out-of-AI-credits
  copy (deterministic checks stay free + Account → Plan & billing path; no raw 402/code) + AI credits
  shown in Account → Plan & billing (used/limit/remaining/reset from `account_billing` via
  `getAiCreditUsage`, account-scoped). One-composer reframed ("Ask a question or describe a change";
  send button "Send"); fill-only example chips (never auto-submit/bypass AUTOROUTE/spend credits);
  clarification copy polished (retained prompt still hidden). Q&A answer presentation: "Read-only"
  badge + "You asked"/answer/"What to check next" + unchanged-workflow footer + "Answering…" loading
  state; **stays read-only, no Apply/Preview, no raw ids/config/tokens/DTO**. Planner result framed
  up front ("nothing has changed yet — review before applying"); **still no auto-apply**. Verified
  during the 4 slices (not re-run at closeout): typecheck 0, eslint 0 errors on touched files,
  focused suites green (71/220/115→94/106); `lint:structure` now OK (`docs/slices/phase-4` split to
  46); `_BuilderAiPanelChat.tsx` carries a pre-existing soft max-lines warning (416>400). Commits
  `e984d1dfb` + `e5b959017` + `d20d45567` + `5a641290f` LOCAL/UNPUSHED (origin `cf0e43b97`); ship is
  a UI-only deploy when approved. **Deferred:** chat-bubble "View AI usage" CTA, Q&A selected-node
  label (no safe label carried), one-click chips, `_BuilderAiPanelChat.tsx` split. →
  [`builder-ai-polish-closeout.md`](./slices/phase-4/ai/builder-ai-polish-closeout.md).
- **AI credit enforcement ON in Production (env enablement) — LIVE & VERIFIED (2026-06-19)** —
  set `ENABLE_AI_CREDIT_ENFORCEMENT=true` for **Production** in Vercel and redeployed the existing
  commit `6a14173f6` (env + redeploy only; **NO code/commit/push/migration**). `aiCreditGate` (shipped
  flag-OFF in AI-CREDITS-3b, wired into Q&A/Explain routes by QA-2) now meters: runs **before** the
  model call, deducts from the **workflow-owning account** AI pool, fail-closed. Q&A=`workflow_qa`,
  Explain=`workflow_explanation`, **1 credit each** (fast tier). **Verified this session in prod:** Q&A
  200/ok=true + answer renders; Explain 200/ok=true + explanation renders; Check stays
  deterministic/free; account `ai_credits_used` **0/20 → 2/20** after 1 Q&A + 1 Explain; telemetry
  `workflow_qa` 4→5 / `workflow_explanation` 7→8; standard smoke 24/8/0 + targeted credit smoke passed;
  disposable workflow cleaned up. Denial paths stay safe (402 `AI_CREDITS_EXHAUSTED` / 403 frozen / 503
  gate|provider). **Caveats:** no live insufficient-credit test (account had headroom); **Preview** flag
  left unset/off (restore only when staging exists); still ONE Supabase project → treat `db:push` as
  prod-impacting. `ENABLE_OPENAI_PROVIDER` left ON, OpenAI key untouched. →
  [`ai-credits-enforcement-prod-enablement-closeout.md`](./slices/phase-4/ai-credits-enforcement-prod-enablement-closeout.md).
- **One Builder AI composer + deterministic auto-routing (AI-DIAG-QA-AUTOROUTE) — PUSHED & LIVE in prod (2026-06-19)** —
  collapses Builder AI to **one feed, one composer, one send**; **deletes the AI-DIAG-QA-3 mini Q&A box**
  (`_BuilderAiPanelQa.tsx`, "chat in chat" Marcus rejected). Routing precedence in `handleComposerSubmit`:
  chat-fill first → follow-up always planner → else pure `classifyComposerIntent(text)` → `qa | plan | clarify`.
  Clear questions→read-only Q&A (`diagnosis_qa`), clear build/edit→planner, vague/mixed-mutation→session-local
  `intent_clarification` bubble (retained prompt NOT rendered; "Explain the issue"→Q&A / "Plan a fix"→planner;
  resolve-once; never persisted). **No LLM in the router**, no second control, no backend/route/client/migration/
  flag/env change; Q&A still read-only (no patch/Apply/Preview/run/cred), planner Apply still explicit;
  `selectedNodeId` still hint-only from `configSlice.activeNodeId`. `DIAGNOSIS_QA_MAX_QUESTION_LENGTH` now
  unused client-side but retained/exported as backend-cap doc. Soft line-count warnings remain on
  `_BuilderAiPanelChat.tsx`/`_BuilderAiPanelMessageItem.tsx`/`useBuilderAiActions.ts`. Inherited verification
  (NOT re-run at closeout): CS-1 classifier 51→59, CS-2 intentClarification 10/diagnosisQa 17/chatFill 5/
  diagnose 8, CS-3 autoRoute 14/classifier 59/68 suites 902, CS-4 diagnosisQa 15/chatFillHint 10/autoRoute 14/
  intentClarification 10/68 suites 900, typecheck 0, eslint 0 touched, lint:structure OK. Commits
  `e0212b481`+`7fa13774a`+`1ff3c0b24`+`d117cd2af` **PUSHED & live in prod** (origin `6a14173f6`, prod-smoked
  2026-06-19); `workflow_qa` migration `20260703000000` **confirmed applied in prod**. →
  [`ai-diag-qa-autoroute-closeout.md`](./slices/phase-4/ai/ai-diag-qa-autoroute-closeout.md).
- **Workflow diagnosis Q&A UI (AI-DIAG-QA-3) — UI live, NO flag, LOCAL/UNPUSHED (2026-06-17); mini box SUPERSEDED by AUTOROUTE (2026-06-19)** —
  exposes the AI-DIAG-QA-2 backend in the Builder AI panel: a small question box next to "Check
  workflow" (placeholder "Ask why this workflow won't run…", Ask→Asking…, Enter submits / Shift+Enter
  newline, clears on success). **Explicit submit only, single-shot, session-local** `diagnosis_qa`
  message (question + answer + optional pointers + optional needsUserDecision + "answer only, not
  changed/run" boundary); **never persisted** (not in `persistedMessageToChat`). Submit disabled on
  empty/whitespace, >500 chars, in-flight, or any guarded panel op; `asking` threaded into all
  diagnosis-action + composer guards. **No patch, no Preview/Apply from Q&A, no run/activate/cred/
  integration mutation, no new flag.** `selectedNodeId` = existing `configSlice.activeNodeId` (hint
  only, never rendered, omitted when no node open — no new selection system). Safe errors only
  (402/403/503/transport; no raw model/server/gate text); hostile-mock test proves smuggled ids/
  tokens/config/`{{` never reach DOM; UI imports no services/MCP. Inherited verification (not re-run
  at closeout): diagnosisQa 17 + regressions (chatFillHint 10/explain 14/diagnose 8/suggest 13/
  preview 15/apply 10/client 38), typecheck 0, eslint clean (12 files), lint:structure OK. Commit
  `facc05666` **PUSHED & live in prod** (in origin `6a14173f6`); `workflow_qa` telemetry migration
  `20260703000000` **confirmed applied in prod**. (Mini box superseded by AUTOROUTE.) →
  [`ai-diag-qa-3-closeout.md`](./slices/phase-4/ai/ai-diag-qa-3-closeout.md).
- **Workflow diagnosis Q&A backend (AI-DIAG-QA-2) — backend live, NO UI, NO flag, LOCAL/UNPUSHED (2026-06-17)** —
  single-shot, explanation-ONLY Q&A about the safe diagnosis. New route `POST /ai/diagnose/qa` mirrors the
  Explain (AI-DIAG-2) contract: re-derive DTO server-side (never trust client DTO) → access wall → OpenAI-503
  → `aiCreditGate` BEFORE model (feature `workflow_qa`, fast, 1 credit, workflow-owning account; 402/403/503)
  → `answerWorkflowQuestion` (injected client, structured tool, Zod, output cap; question = delimited DATA;
  text-only; never a patch; `needsUserDecision`; points to existing Preview fix) → fail-open telemetry. Model
  sees only `buildDiagnosisQaContext` (Explain allow-list + safe selected-node summary: path/type/description/
  sensitive ONLY — no values/ids/tokens/`{{nodeId.path}}`); bogus `selectedNodeId` ignored+never echoed.
  Client `askDiagnosisQuestion` sends id+question(+draft+selectedNodeId), never the DTO. **Telemetry now
  first-class** (`AI-DIAG-QA-2-TELEMETRY-CHECK`): migration `20260703000000` widened `ai_cost_events_feature_chk`
  to allow `workflow_qa` (non-destructive; **confirmed applied in prod**), so telemetry records
  `feature:"workflow_qa"` (was `other` fallback); `metadata.kind` stays `workflow_diagnosis_qa`. **No UI / no
  Hermes / no multi-turn / no patch / no new flag.** Commits `893f44001` (backend) + `9ddd74df6` (telemetry),
  **PUSHED & live in prod** (in origin `6a14173f6`); credit enforcement now ON in prod (2026-06-19) →
  [`ai-diag-qa-2-closeout.md`](./slices/phase-4/ai/ai-diag-qa-2-closeout.md) · [`ai-diag-qa-plan-1.md`](./slices/phase-4/ai/ai-diag-qa-plan-1.md).
- **Builder UX mini-arc — canvas ergonomics + tabs + config-tab consolidation + Data Map MVP + Settings MVP, LOCAL/UNPUSHED (2026-06-16)** —
  builder commits `a6ec958ac → 67ee7f6a6`: non-overlap append/insert + drag resolve, Arrange moved to
  the zoom/fit controls, per-branch tail "+ Add step" (global Add disabled when multiple tails), inline
  node rename + delete (existing safe-rewire), top tabs **Builder | Runs | Data Map | Settings** (no dead
  tabs), one config tab strip **Setup | Test | Data** (Advanced hidden until real metadata), single
  config-panel close ×, a **frontend-only Data Map MVP** outline (graph/draft/metadata-derived; field
  **labels** not values; friendly variable source labels, broken refs flagged; trigger `{{trigger.…}}` copy
  only; no raw ids/JSON/secrets), and a **frontend-only Settings MVP** (real workflow-level sections —
  name/status/publish/unsaved/trigger/counts/timestamps — read-only, editing deferred; "Coming later" rows
  for unbuilt behavior; no creds/node-config). **UI/canvas/state-only — no migration, no backend/runtime, no flag.**
  Interleaved with unrelated parallel CLI/security commits (NOT this arc). Not pushed / not prod-smoked →
  [`builder-ux-mini-arc-closeout.md`](./slices/phase-4/workflows/builder-ux-mini-arc-closeout.md).
- **AI guidance unreachable/orphan-node card (AI-GUIDANCE-UNREACHABLE-NODE-1) — GUIDANCE-ONLY, LOCAL/UNPUSHED (2026-06-17)** —
  promotes the existing `unreachable_node` graph finding from a generic one-line attention item to a
  dedicated **guidance-only** Builder AI card: count-aware copy (singular/plural "…not connected to the
  trigger, so it/they won't run"), safe step LABELS, and a static "What you can do" list (connect / move /
  delete). Multiple orphan findings aggregate into one card. **Deliberately NOT apply-capable** — NO
  Preview/Apply button, no patch/strategy/preview-flag/model/credit (the fix needs user intent; `removeNode`
  apply-blocked, `addEdge` target ambiguous). Detection UNCHANGED (still a shared `findGraphIssues` runtime/
  Activate blocker) — presentation-only. No-leak: labels only (tests assert raw ids absent from payload+DOM).
  No migration, no flag. Commit `c4407ae4d` local/unpushed (origin still `ba0af6616`) →
  [`ai-guidance-unreachable-node-1-closeout.md`](./slices/phase-4/ai/ai-guidance-unreachable-node-1-closeout.md).
- **AI repair narrow duplicate-edge cleanup (AI-REPAIR-COVERAGE-2) — 4th deterministic repair category, PUSHED to origin/v2-main (2026-06-17)** —
  removes a **redundant duplicate edge** (later edge identical by the graph key `(from, to, label ?? "")`;
  keep-first, removeEdge the rest). Same `from/to` with DIFFERENT labels = legitimate branch fan-out and
  is NEVER flagged (broad `from/to`-only cleanup rejected). Check-only detection (`findDuplicateEdges` →
  `DUPLICATE_EDGE` finding, safe endpoint labels, gates `overallReady` false); `findGraphIssues` untouched
  by duplicates (Check stricter than runtime). Deterministic Preview + Apply are **no-LLM/no-credit/
  no-telemetry**, `removeEdge`-only, draft-only, fail-closed → `NO_SAFE_PATCH`. **No migration, no flag.**
  Commit `b45bcabbc` is on `origin/v2-main` (deploys to prod per posture). NOTE: a later separate arc
  (AI-READINESS-CONVERGENCE `5c20d0011`) promoted **self-loop** into the shared `findGraphIssues` verdict —
  that did NOT change duplicate-edge behavior →
  [`ai-repair-coverage-2-closeout.md`](./slices/phase-4/ai/ai-repair-coverage-2-closeout.md).
- **AI repair self-loop edge cleanup (AI-REPAIR-COVERAGE-1) — 3rd deterministic repair category, LOCAL/UNPUSHED (2026-06-17)** —
  removes a **self-loop edge** (a connection whose `from === to` — a step wired to itself). Check-ONLY
  detection (`findSelfLoopEdges` in readiness diagnostic → `SELF_LOOP_EDGE` finding, safe labels, gates
  `overallReady` false); the shared runtime/activation validator is **intentionally untouched** (Check
  stricter than runtime, like the invalid-ref precedent). Deterministic Preview + Apply are **no-LLM /
  no-credit / no-model-telemetry**; **`removeEdge` only** (batch-removes all self-loops in one validated
  preview), validated through the existing preview/apply safety engine, fail-closed. Apply is
  **validated-preview-only + draft-only** (never runs/activates/registers triggers, never mutates
  creds/integrations). **No migration, no flag.** `useBuilderDiagnosisActions.ts` now over the soft
  400-line cap (extract handlers next). Single commit `882519ba0`, atop interleaved parallel work. Not
  pushed / not prod-smoked →
  [`ai-repair-coverage-1-self-loop-closeout.md`](./slices/phase-4/ai/ai-repair-coverage-1-self-loop-closeout.md).
- **AI repair dangling-edge cleanup (AI-REPAIR-4A/4B) — 2nd deterministic repair category, LOCAL/UNPUSHED (2026-06-16)** —
  removes a **dangling edge** (a connection whose `from`/`to` step no longer exists). Check surfaces an
  actionable `STALE_EDGE` card (safe labels only; 4B adds per-endpoint "which side vanished" flags →
  honest singular/plural copy + one descriptor per broken connection). Deterministic Preview + Apply are
  **no-LLM / no-credit / no-model-telemetry**; **`removeEdge` is the only op** (one per dangling edge,
  batch-removed in one validated preview — per-edge deferred since the validator rejects a still-dangling
  intermediate). Apply is **validated-preview-only + draft-only** (never runs/activates/registers triggers,
  never mutates creds/integrations). **No migration, no flag.** Not pushed / not prod-smoked →
  [`ai-repair-4-dangling-edge-closeout.md`](./slices/phase-4/ai/ai-repair-4-dangling-edge-closeout.md).
- **AI repair Apply arc (AI-REPAIR-3A→3L) — deterministic variable-reference repair + guarded Apply, LIVE in prod (2026-06-15)** —
  Check deterministically flags deleted-/unknown-node variable references (**no LLM / no AI credits / no
  model-call telemetry**). For an apply-safe field: **zero** candidates → manual "Open field", no Apply;
  **one** → "Preview fix" → "Apply fix"; **multiple** → user picks a replacement → "Preview selected fix"
  → "Apply fix" (app **never auto-picks**; selection re-validated server-side, anti-injection). Deterministic
  Preview + Apply are **no-LLM / no-credit / no-model-telemetry**; Apply **persists DRAFT only** — never
  runs/activates/deactivates/registers triggers, never mutates creds/integrations/provider accounts. Apply
  eligibility is fail-closed (`assessApplyReadiness`). **No migration, no flag.** Marcus prod-smoked all three
  flows. `HEAD==origin/v2-main==589036fb0` →
  [`ai-repair-3-apply-arc-closeout.md`](./slices/phase-4/ai/ai-repair-3-apply-arc-closeout.md).
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
