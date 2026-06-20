# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-19 @ cf0e43b97 (Builder AI polish batch + selected-node Q&A label — 5 feature commits LOCAL/UNPUSHED; AI credit enforcement + AUTOROUTE live in prod; origin/v2-main = cf0e43b97)

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

- **React Agent CS-7e apply-audit LIVE SMOKE — LOCAL/UNPUSHED, 4/4 PASSED + cleaned (2026-06-20)** — gated
  self-cleaning integration test `tests/integration/ai/react-agent-repair-apply-audit.dev.test.ts` (opt-in
  ALLOW_DB_INTEGRATION_TESTS; skipped in CI) drove the REAL seam + REAL live `reactAgentAuditRecorder`
  (service-role insert) + REAL `assessApplyReadiness`/`executeWorkflowPatch` + REAL `repairPatchRef` against V2
  (`qcepijemjlkssfkvzlio`). VERIFIED live: (1) repair_proposal success row (proposes_change, ref non-null); (2)
  repair_apply success row (requires_approval, credit_feature null, **ref MATCHES proposal**), draft mutated
  (moveNode), **state unchanged (no deactivation)**, **0 ai_cost_events** (no model call); (3) stale apply →
  failed row, draft unchanged; (4) blocked removeNode → failed row. All rows metadata `{}`, no raw
  patch/config/id leak. **Cleanup confirmed: 0 orphaned NULL-account rows** (delete audit before account, vs the
  SET NULL FKs), 0 leftover workflows/users — DB pristine. NOT exercised (out of scope): HTTP route + SSR-cookie
  persistence (CS-7d unit-tested) + OpenAI model call. Unit re-run 141 (5 suites), eslint 0, lint:structure OK,
  typecheck clean. → [`react-agent-cs-7e-apply-audit-live-smoke.md`](./slices/phase-4/ai/react-agent-cs-7e-apply-audit-live-smoke.md).
- **React Agent CS-7d repair-apply AUDIT wiring — LOCAL/UNPUSHED, apply now through the seam (2026-06-19)** — the
  guarded apply route (`/ai/repair/apply`) now wraps the deterministic `applyRepairPatch` call in
  `runAuthorizedCapability({capabilityId:"repair_apply", intent:"apply_repair", recorder, classifyResult,
  deriveProposedPatchRef})` → emits ONE `react_agent.repair_apply` / `requires_approval` audit row (success on
  applied, failed on STALE_PATCH/NOT_APPLYABLE/EXECUTION_FAILED, denied pre-exec). All safety
  (validateWorkflowPatch→assessApplyReadiness→executeWorkflowPatch→optimistic revision) stays INSIDE
  applyRepairPatch (untouched); auth/membership/edit-gate run BEFORE the seam (pre-seam denial → no audit). **NO
  model call, NO aiCreditGate (creditFeature null), NO new apply behavior, NO UI/schema; response contract
  byte-for-byte unchanged; metadata-free at seam.** `proposed_patch_ref` = `repairPatchRef({workflowId,
  baseRevision,operations})` from the apply REQUEST input → MATCHES the CS-7b preview proposal row (correlation
  closed, no approval table); null when baseRevision/operations absent. Verified: 227 tests (9 suites incl.
  ref-matches-preview, failed-audit, fail-open, pre-seam-no-audit, no-leak), typecheck clean, eslint 0,
  lint:structure OK. Next CS-7e: live smoke (query react_agent_audit_events by auditKind) / apply-governance
  closeout. → [`react-agent-cs-7d-repair-apply-audit-wiring.md`](./slices/phase-4/ai/react-agent-cs-7d-repair-apply-audit-wiring.md).
- **React Agent CS-7c repair-apply CAPABILITY (registration only) — LOCAL/UNPUSHED (2026-06-19)** — registers the
  first `requires_approval` capability. New intent `apply_repair` added to `ReactAgentIntent` but DELIBERATELY NOT
  in `RECOGNIZED_REACT_AGENT_INTENTS` → free-text `handle()` refuses it (`unsupported_intent`); apply reachable
  ONLY via `runAuthorizedCapability`. Capability `repair_apply` (allowedIntent `apply_repair`, mode
  `requires_approval`, creditFeature null [deterministic/0-credit], auditKind `react_agent.repair_apply`).
  Registration does nothing alone — no route binds `exec`, so NO mutation/route-change. Apply route/service
  (`/ai/repair/apply`, applyRepairPatch, executeWorkflowPatch) UNTOUCHED; no schema/UI. Verified: 193 tests
  (7 suites: registration metadata, repair_apply matches only apply_repair else intent_mismatch no-exec,
  unknown/invalid-scope fail-closed, handle() refuses apply, existing caps green), typecheck clean, eslint 0,
  lint:structure OK. Next CS-7d: route apply through seam + emit `react_agent.repair_apply` reusing repairPatchRef
  (proposal↔apply match). → [`react-agent-cs-7c-repair-apply-capability.md`](./slices/phase-4/ai/react-agent-cs-7c-repair-apply-capability.md).
- **React Agent CS-7b repair PATCH-REF — LOCAL/UNPUSHED (2026-06-19)** — deterministic opaque one-way patch ref
  + threaded into the repair PREVIEW audit row. Helper `services/ai/repair/repairPatchRef.ts`:
  `repairPatchRef({workflowId,baseRevision,operations}) → "repair_patch_sha256:<64hex>"` or null (fail-safe);
  REUSES `hashPayload` (core/workflows/idempotency.ts) canonical SHA-256 (sorted keys, preserved op order); pure,
  no-leak (no raw id/config/op-JSON in output). Seam `runAuthorizedCapability` gained optional
  `deriveProposedPatchRef(result)` (resolved-path only, fail-safe throw→null); preview route derives the ref ONLY
  when `preview.apply.applyable` (operations+baseRevision present, secret-free by construction). NULL for:
  non-applyable preview, NO_SAFE_PATCH/MODEL_FAILED, the PLAN route (NL proposal, no operations — not wired),
  deterministic free paths, denied/throw. Still NO metadata at seam; response contracts UNCHANGED; apply still
  UNWIRED. Verified: 210 tests (9 suites), eslint 0, lint:structure OK, typecheck clean for slice. Next CS-7c
  register `repair_apply` (requires_approval) → CS-7d route apply through seam (reuse ref → proposal↔apply match). →
  [`react-agent-cs-7b-repair-patch-ref.md`](./slices/phase-4/ai/react-agent-cs-7b-repair-patch-ref.md).
- **React Agent CS-7 approval-governance PLAN (docs-only) — LOCAL/UNPUSHED (2026-06-19)** — design before wiring
  any `requires_approval` apply. Finding: the apply path (`/ai/repair/apply` → `applyRepairPatch` →
  validateWorkflowPatch + assessApplyReadiness + executeWorkflowPatch + optimistic `updateDraftDefinitionIfRevisionMatches`)
  is ALREADY deterministic, revalidating, optimistic-concurrency-guarded, no-leak, lifecycle-safe (blocks trigger
  changes instead of deactivating), and treats model output as advisory-only (validator recomputes risk). Real gaps
  are governance-shaped: NOT through the seam, NO audit row, NO proposal↔apply correlation id, no first-class
  approver. **Recommend NO new table** (A/C hybrid): route apply through `runAuthorizedCapability`, emit
  `repair_apply`/`requires_approval`/`react_agent.repair_apply` audit (actor_user_id = approver), correlate via a
  deterministic content-hash `proposed_patch_ref` (storage-free) on both the CS-6 preview row + the apply row; new
  intent `apply_repair`, creditFeature null, apply NEVER calls the model. Durable `react_agent_approvals` table
  DEFERRED (CS-7f) until server-minted proposals/one-time tokens have a driver. Next: CS-7b patch-ref helper →
  CS-7c register repair_apply → CS-7d route+emit → CS-7e live smoke. →
  [`react-agent-cs-7-approval-governance-plan.md`](./slices/phase-4/ai/react-agent-cs-7-approval-governance-plan.md).
- **React Agent CS-6 repair PROPOSAL wiring — LOCAL/UNPUSHED, first `proposes_change` capability (2026-06-19)** —
  registers `repair_proposal` (intent `propose_repair`, mode `proposes_change`, creditFeature `workflow_repair`,
  auditKind `react_agent.repair_proposal`) and routes BOTH live LLM proposal routes' model brain through
  `runAuthorizedCapability` + live recorder: `…/ai/repair/plan` (`planWorkflowRepair`, NL proposal) AND
  `…/ai/repair/preview` (`previewWorkflowRepair`, validated-patch preview). PROPOSE + PREVIEW only — **NO apply,
  NO mutation**; `…/ai/repair/apply` (+ applyRepairPatch/executeWorkflowPatch) UNTOUCHED. Deterministic model-free
  preview paths (selected/dangling/self-loop/duplicate/deterministic) NOT wired (pre-gate, $0, not the AI
  capability). Audit: success on proposal produced, failed on model failure (incl NO_SAFE_PATCH), denied on
  scope/registry/intent reject (no exec); **metadata-free at seam** (no proposal/patch/config/model-text leak);
  proposedPatchRef stays null. Routes still own auth/membership/DTO/OpenAI-config/aiCreditGate/cost-telemetry/
  response; response contracts UNCHANGED; gate denial → no audit. Verified: 193 focused/route/recorder/repo/
  migration tests (9 suites), eslint 0, lint:structure OK, typecheck clean for this slice (a transient error from
  the parallel analytics WIP `WidgetConfigPanel.tsx` is unrelated + cleared on re-run). →
  [`react-agent-cs-6-repair-proposal-wiring.md`](./slices/phase-4/ai/react-agent-cs-6-repair-proposal-wiring.md).
- **React Agent CS-5d audit EMISSION (read-only) — LOCAL/UNPUSHED, runtime ACTIVE (2026-06-19)** — wires the
  recorder into `runAuthorizedCapability`; Q&A + Explain routes inject `reactAgentAuditRecorder`. Seam emits ONE
  `react_agent_audit_events` row/call: `denied` (invalid_scope|unknown_capability|intent_mismatch, no exec),
  `failed` (exec throws → re-throws; or `classifyResult` maps brain `{ok:false}`→failed), else `success`.
  Recorder contract (`ReactAgentAuditRecorder`/Input/Outcome) MOVED to boundary core `types.ts` (pure types) so
  `index.ts` references it without importing `audit/`/repo — CS-5c guard still green. **Fail-open at BOTH layers**
  (recorder + seam try/catch). **NO metadata at the seam** (scope ids + registry enums only — no question/answer/
  DTO/config leak). Routes still own auth/membership/DTO/OpenAI-config/aiCreditGate/cost-telemetry/response;
  response contracts UNCHANGED; emission only inside the authorized path (gate denial → no row). **`aiCostEventId`
  DEFERRED** (seam emits before route records cost; `insertEvent` returns void — linking would distort billing;
  ledgers correlatable by account/user/workflow/feature/time). No repair/proposes-change yet. Verified: 115
  focused/route/recorder/repo/migration tests, typecheck 0, eslint 0, lint:structure OK. →
  [`react-agent-cs-5d-audit-emission-readonly.md`](./slices/phase-4/ai/react-agent-cs-5d-audit-emission-readonly.md).
- **React Agent CS-5c audit RECORDER — LOCAL/UNPUSHED, NOT wired into runtime (2026-06-19)** — injectable
  recorder maps a safe capability outcome → `react_agent_audit_events` via `insertAuditEvent`. New `audit/`
  submodule under `services/ai/reactAgent/`: `createReactAgentAuditRecorder`/`reactAgentAuditRecorder` (live),
  `noopReactAgentAuditRecorder` (default injection), `types`, `index`. Reuses the SHARED `sanitizeAiEventMetadata`
  (no 2nd sanitizer); coerces non-object metadata→`{}`; caps reason 128 / refs 256; **FAILS OPEN** (swallows repo
  throw). Core (`index.ts`) UNCHANGED + DB-free — boundary import guard extended to forbid core importing
  `audit/`/repositories. `runAuthorizedCapability` UNCHANGED — injection is CS-5d (route injects live recorder,
  emits success|denied|failed for read-only Q&A/Explain, attaches `ai_cost_event_id`). Verified: focused+repo+
  migration tests 57, typecheck 0, eslint 0, lint:structure OK. →
  [`react-agent-cs-5c-audit-recorder.md`](./slices/phase-4/ai/react-agent-cs-5c-audit-recorder.md).
- **React Agent CS-5b audit STORAGE — LOCAL/UNPUSHED, migration APPLIED+live-verified (2026-06-19)** — storage only,
  no runtime emission. Migration `20260705000000_react_agent_audit_events.sql` creates the account-scoped
  governance ledger (cols account_id/actor_user_id/workflow_id/conversation_id/capability_id/intent/mode/
  credit_feature/audit_kind/outcome/reason/proposed_patch_ref/approval_id/ai_cost_event_id link/metadata/
  anonymized_at/ledger_purge_after/created_at; CHECKs outcome∈success|denied|failed, mode∈read_only|
  proposes_change|requires_approval, jsonb_typeof metadata=object, text caps; no raw-payload cols). RLS:
  member-only read via account_memberships, **service-role-write-only** (no user write policy/grant), GRANT
  authenticated SELECT only. **Deletion = anonymize-retain** (all FKs ON DELETE SET NULL, NO cascade; mirrors
  ai_cost_events 20260531000008). Repo `repositories/reactAgentAuditEvents.ts` (insertAuditEvent service-role +
  listAuditEventsForAccount RLS member read; metadata→object, detail-free DB error). `runAuthorizedCapability`
  UNCHANGED — emission is CS-5c (recorder, DONE) + CS-5d (inject into seam, route attaches ai_cost_event_id).
  **`db:push` APPLIED 2026-06-19** (project `qcepijemjlkssfkvzlio`); live-verified 23/24 (table/RLS/service-role
  insert/member-read/non-member-deny/authenticated-write-RLS-denied/invalid outcome+mode+non-object metadata
  rejected/all-FK SET NULL no-cascade/no raw cols/indexes). The 1 non-pass = `authenticated` has schema-default
  grant-level writes (same as `ai_cost_events`); RLS still denies — grant-layer cleanup deferred to broader DB
  hardening. → [`react-agent-cs-5b-audit-storage.md`](./slices/phase-4/ai/react-agent-cs-5b-audit-storage.md).
- **React Agent CS-5 audit-seam PLAN (docs-only) — LOCAL/UNPUSHED (2026-06-19)** — design before wiring any
  proposes-change capability. **Recommend a NEW account-scoped `react_agent_audit_events` table** (cols:
  account_id owner, actor_user_id, workflow_id?, conversation_id?, capability_id, intent, mode, credit_feature,
  audit_kind, outcome success|denied|failed, reason safe-enum, proposed_patch_ref?, approval_id?,
  ai_cost_event_id link, metadata, created_at; RLS members-only read + service_role-only write; append-only).
  Chosen over extending `ai_cost_events` (which DOES now have account_id/conversation_id/patch_id/ai_tool_called
  — viable stop-gap, but its closed CHECK enums + cost-only purpose don't fit denials/approval/mode/future
  memory-reads). **Emission = central seam `runAuthorizedCapability` via an INJECTED recorder** (keeps boundary
  import-fenced); route still owns auth/gate/cost-telemetry + attaches ai_cost_event_id; fail-open. Cost stays
  in ai_cost_events, audit LINKS it (no dup). No raw prompts/answers/config/secrets — ids/enums/counts only.
  Registry↔gate consistency stays test-only + optional non-blocking dev assertion (no hard runtime block).
  Slices CS-5b table→5c repo/recorder→5d seam-inject→5e assertion→5f tests; hold repair-proposal until 5d.
  No code/migration/db:push. → [`react-agent-cs-5-audit-seam-plan.md`](./slices/phase-4/ai/react-agent-cs-5-audit-seam-plan.md).
- **React Agent CS-1 (boundary) + CS-2 (Q&A) + CS-3 (registry) + CS-4 (Explain) — first product-AI code — LOCAL/UNPUSHED (2026-06-19)** —
  narrow account-scoped seam under `services/ai/reactAgent/`. **CS-1** (`193627693`): `ReactAgentScope`
  (userId+accountId required; workflowId?/conversationId? optional), `ReactAgentIntent`
  (explain_diagnosis/answer_diagnosis_question/propose_repair/unknown), `ReactAgentRequest/Response`,
  `ReactAgentService`; pure `dispatchReactAgentRequest` (invalid_scope/unsupported_intent/not_yet_available),
  **no model/tool/mutation/DB/MCP/fs/child_process/service-role** — durable import-guard test enforces it.
  **CS-2**: added a SERVER seam `runAuthorizedCapability<T>({scope,intent,exec})` (validates scope/intent,
  runs the injected already-gated brain call, returns its exact result — still imports no brain/HTTP/gate).
  The Q&A route `…/ai/diagnose/qa` now runs `answerWorkflowQuestion` THROUGH the seam; **route keeps owning
  requireUser+membership+server-derived safe DTO+aiCreditGate(before model)+telemetry+response mapping —
  frontend contract unchanged.** Path = `route guard/DTO/gate → React Agent → brain` (never agent→HTTP, never
  bypass). User-facing `handle` still returns not_yet_available (no DTO there). **CS-3**: explicit capability
  **allow-list** `capabilities.ts` (`ReactAgentCapabilityId` + `ReactAgentCapabilityDefinition{id,allowedIntent,
  mode:read_only|proposes_change|requires_approval,creditFeature,auditKind}` + frozen `REACT_AGENT_CAPABILITIES`;
  `diagnosis_qa`→answer_diagnosis_question/read_only/workflow_qa). `runAuthorizedCapability` now REQUIRES
  `capabilityId` + validates scope→capability-exists→intent-matches-allowedIntent before exec;
  unknown_capability/intent_mismatch fail closed (no exec, no leak of id/intent). Registry is metadata/
  allow-list ONLY — route still owns auth/gate (creditFeature is doc, not enforcement); NOT Hermes, NOT MCP
  (import guard still green). Q&A route passes `capabilityId:"diagnosis_qa"`; response unchanged. **CS-4**:
  Explain wired as 2nd read-only capability — registry `diagnosis_explain`→explain_diagnosis/read_only/
  workflow_explanation/audit react_agent.diagnosis_explain; Explain route `…/ai/diagnose/explain` runs
  `explainWorkflowDiagnosis` THROUGH the seam (`capabilityId:"diagnosis_explain"`), route keeps owning
  auth/DTO/aiCreditGate(workflow_explanation, before model)/telemetry, response unchanged. Test locks each
  capability creditFeature to its route's gate feature (runtime route↔registry cross-check deferred to audit
  slice). propose_repair still unwired. Verified (CS-4): reactAgent+explain+qa routes 66, builder client 38,
  typecheck clean, eslint 0, lint:structure OK →
  [`react-agent-cs-4-explain-wiring.md`](./slices/phase-4/ai/react-agent-cs-4-explain-wiring.md).
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
