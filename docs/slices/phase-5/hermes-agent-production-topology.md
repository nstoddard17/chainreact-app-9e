# Hermes Agent — production topology (Render) + ChainReact client

**Status:** Production topology of record (HERMES-AGENT-PROD-CLIENT, 2026-06-20). The Render
infrastructure is **live**; the local Docker sandbox path is **skipped** as the main direction.
Builds on the pivot spike
([`hermes-agent-chainreact-architecture-spike.md`](./hermes-agent-chainreact-architecture-spike.md));
operational detail lives in the runbook
([`docs/runbooks/hermes-agent-render-prod.md`](../../runbooks/hermes-agent-render-prod.md)).

## Final architecture

```
Vercel ChainReact app
  → Render public AI Gateway (chainreact-ai-gateway-prod)
    → Render private Hermes Agent (chainreact-hermes-agent-prod, Ohio :8642, disk /opt/data)
      → OpenAI
    ← Hermes Agent memory/skills
  ← Gateway
→ ChainReact final validation/decision (validateWorkflowPlan; ChainReact is the only mutation path)
```

- ChainReact (Vercel) calls ONLY the public gateway endpoint
  `POST https://chainreact-ai-gateway-prod.onrender.com/api/hermes-agent/guidance` with
  `Authorization: Bearer CHAINREACT_AI_GATEWAY_TOKEN` and body `{ "prompt": "<safe prompt>" }`.
- ChainReact never calls a model vendor, Nous, or the private Hermes Agent directly. There is no
  direct OpenAI/Nous path and no Nous fallback.
- The OpenAI key and `API_SERVER_KEY` live ONLY on Render. The only secret ChainReact holds is the
  gateway token.
- **Model provider (under the Hermes Agent, verified 2026-06-20):** OpenAI is wired as a **custom
  OpenAI-compatible provider named `openai-api`** (NOT the built-in `openai` name) with base URL
  `https://api.openai.com/v1`; the working model is the one configured on the Hermes Agent service
  (exposed to ChainReact as model `hermes-agent`). Direct Nous Portal / model API is not used, and
  any OpenRouter/Nous warnings were from old/default config, not the intended path. See runbook §3.

## What this slice shipped (ChainReact side)

| Piece | File |
|---|---|
| Server-only gateway config reader (flag + url + token + timeout; null when off/unconfigured). **Timeout budget (REACT-AGENT-PRODUCTION-TIMEOUT-1): default 45s, clamped 1s–55s, strictly inside the routes' `maxDuration = 60`** so a slow brain yields ChainReact's typed 503, not a platform 504 | [`services/ai-guidance/gateway/gatewayConfig.ts`](../../../services/ai-guidance/gateway/gatewayConfig.ts) |
| Safe prompt builder (from de-identified DTO + scrubbed goal text) | [`services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) |
| Server-only gateway client + `WorkflowGuidanceProvider` impl (advisory; fail-closed) | [`services/ai-guidance/gateway/hermesAgentGatewayClient.ts`](../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts) |
| **Strict response contract** (Zod envelope schema + `normalizeGatewayResponse` → `NormalizedGatewayGuidance`: `guidanceText`/`source`/`workflowPlan`/`rawUsage?`/`warnings?`) — HERMES-AGENT-RESPONSE-CONTRACT | [`services/ai-guidance/gateway/gatewayResponseContract.ts`](../../../services/ai-guidance/gateway/gatewayResponseContract.ts) |
| **Plan extractor** (deterministic, model-free) — pulls a shape-valid `WorkflowPlan` from a fenced ` ```json ` block in the guidance text; the normalizer then gates it through `validateWorkflowPlan` (advisory validated plan only; `notApplied: true`; invalid → null + safe warning) — HERMES-AGENT-PLAN-EXTRACTION | [`services/ai-guidance/gateway/extractPlanFromText.ts`](../../../services/ai-guidance/gateway/extractPlanFromText.ts) + prompt [`buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) + UI [`WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) |
| **Draft preview converter** (deterministic) — turns a validated `WorkflowPlan` into an ephemeral, non-applied `DraftPreview` (preview-only ids, labels only, `notApplied: true`, missing field-keys → warnings; no config/persistence). Derived at the route from `result.workflowPlan` only — HERMES-AGENT-DRAFT-PREVIEW | [`services/ai-guidance/preview/planToDraftPreview.ts`](../../../services/ai-guidance/preview/planToDraftPreview.ts) + type [`contracts/workflowPlanPreview.ts`](../../../contracts/workflowPlanPreview.ts) + UI [`WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) |
| **Builder preview overlay** (visual/ephemeral) — renders a `DraftPreview` as a SEPARATE ghost layer over the canvas (shimmered/dashed "Suggested" nodes + dashed edges + "Preview only…" notice + Discard). UI state in `WorkflowBuilder` only; never merges into the real graph / `draftDefinition` / dirty / save. Panel "Show on canvas" (builder-only) feeds it; Discard clears it — HERMES-AGENT-BUILDER-PREVIEW-OVERLAY | [`features/workflow-builder/canvas/BuilderPreviewOverlay.tsx`](../../../features/workflow-builder/canvas/BuilderPreviewOverlay.tsx) (state in [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx); wired via [`BuilderGuidanceRail.tsx`](../../../features/workflow-builder/panels/BuilderGuidanceRail.tsx) `onShowPreview` → panel `onPreviewToCanvas`. The superseded floating `BuilderGuidanceEntry.tsx` was deleted) |
| **Apply-preview additive patch** (first mutation path) — explicit user "Apply preview" → `planToBuilderPatch` builds a deterministic ADDITIVE patch from the VALIDATED plan → `graphSlice.applyAdditivePatch` appends nodes/edges to the LOCAL draft (real ids, EMPTY config, dirty via the normal mechanism). NEVER deletes/replaces/updates existing pieces, replaces a trigger, saves, activates, runs, or creates a separate workflow — HERMES-AGENT-APPLY-PREVIEW-PATCH | [`services/ai-guidance/preview/planToBuilderPatch.ts`](../../../services/ai-guidance/preview/planToBuilderPatch.ts) + patch type [`contracts/workflowPlanPreview.ts`](../../../contracts/workflowPlanPreview.ts) + [`graphSlice.applyAdditivePatch`](../../../features/workflow-builder/state/graphSlice.ts) + overlay "Apply preview" + [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) |
| **In-place apply placement** — pure planner `computeAdditivePatchPlacement` decides where an additive patch lands: `blank` (origin) · `inserted_between` (selected node has exactly ONE outgoing UNLABELED edge A→B → split into A→new…→B; the ONLY removal allowed) · `appended` (after the selected node — zero/multiple/labeled outgoing — else the sole tail) · `side_chain` (ambiguous / no anchor / trigger-first). Edges ADD-ONLY except the one split edge; existing config/positions/other edges never touched; no branch rewrite (labeled edges never split) — HERMES-AGENT-APPLY-IN-PLACE / -INSERT-BETWEEN | [`features/workflow-builder/utils/additivePatchPlacement.ts`](../../../features/workflow-builder/utils/additivePatchPlacement.ts) (pure) + [`graphSlice.applyAdditivePatch`](../../../features/workflow-builder/state/graphSlice.ts) + placement-aware notice in [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) |
| **Post-apply config hints** (names only) — after an explicit apply, the transient notice lists each newly-added node's still-empty required fields by LABEL ("Needs configuration: Channel, Message"), and the cards show a short-lived "Added from preview" badge. Hints come from the SAME metadata-driven `missingRequiredFields` rule as the canvas "Needs setup" chip (registry `requiredFieldsByType`), NOT from Hermes prose; unknown-metadata nodes fall back to a generic "Review this step's required fields." NEVER values/secrets/tokens/account-ids. Recomputes from the live draft (clears as fields are filled); no save/activate/run — HERMES-AGENT-APPLY-CONFIG-HINTS | pure [`features/workflow-builder/utils/appliedConfigHints.ts`](../../../features/workflow-builder/utils/appliedConfigHints.ts) + [`canvas/BuilderApplyNotice.tsx`](../../../features/workflow-builder/canvas/BuilderApplyNotice.tsx) + "Added from preview" badge in [`canvas/WorkflowNodeCard.tsx`](../../../features/workflow-builder/canvas/WorkflowNodeCard.tsx) (threaded via [`canvas/adapters.ts`](../../../features/workflow-builder/canvas/adapters.ts) + [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx)) |
| **AI context / memory scope guard** (deterministic policy) — `buildSafeGuidanceContext` decides what request-scoped context crosses to Hermes: account type/role, account-shared connection availability, the caller's OWN connection availability, and a generic notice when a workflow uses ANOTHER member's private connection. Excludes all other-member private data / identity / secrets. NO durable memory store — guidance is request-scoped — HERMES-AGENT-MEMORY-SCOPE-GUARD | [`services/ai-guidance/guidanceContextPolicy.ts`](../../../services/ai-guidance/guidanceContextPolicy.ts) (used by [`workflowGuidanceIntake.ts`](../../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts); rendered by [`buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts); raw inputs gathered in [`route.ts`](../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts)) |
| **Live credential-availability source** (sanitized) — reads active integrations for the account and reduces them to provider KEYS (+ registry display names): account-class providers → account-shared; personal providers connected by the CURRENT user → their own; another member's private provider → excluded. No token/secret/provider-account-id/integration-id/owner/account-id. Degrades to empty on read error. Fed into the scope guard via the route — HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT | [`services/integrations/guidanceCredentialAvailability.ts`](../../../services/integrations/guidanceCredentialAvailability.ts) (read by [`route.ts`](../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) → `contextInputs` → guard) |
| Gateway barrel + `resolveServerGuidanceProvider()` (gateway-when-enabled, else noop) | [`services/ai-guidance/gateway/index.ts`](../../../services/ai-guidance/gateway/index.ts) |
| **React Agent capability** `workflow_guidance_intake` (read-only, audited, gated; runs through `runAuthorizedCapability`) — HERMES-AGENT-CAPABILITY | [`services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`](../../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts) + registry [`capabilities.ts`](../../../services/ai/reactAgent/capabilities.ts) |
| **Gated route** `POST /api/accounts/[id]/ai/workflow-guidance` (auth + membership + freeze + `aiCreditGate` feature `workflow_guidance` + persistent audit recorder + config gating) — HERMES-AGENT-CAPABILITY-ROUTE | [`app/api/accounts/[id]/ai/workflow-guidance/route.ts`](../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) |
| **UI entry point** "Build with me" advisory panel (workflows dashboard; server-gated on `HERMES_AGENT_ENABLED`; calls only the route via the client helper) — HERMES-AGENT-GUIDANCE-UI | [`features/workflows/WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) + helper [`lib/api/ai/guidance.ts`](../../../lib/api/ai/guidance.ts) |
| **Builder UI entry point** — the builder's LEFT CHAT RAIL is now the SINGLE, primary builder AI entry: it renders the SAME `WorkflowGuidancePanel` (passing the in-context `workflowId`), so typing in the rail → Hermes guidance → Show on canvas → preview → Apply preview. It REPLACED the old plan-based `BuilderAiPanel` (which called the deprecated `POST /api/workflows/[id]/ai/plan`, now 503) and the separate floating "Build with me" pill (`BuilderGuidanceEntry`, no longer rendered) so there is ONE AI surface. Gated on `isHermesAgentEnabled()` AND a resolved `accountId` (else a safe "unavailable" note, no dead box). Rail header label is "connected · Hermes" (no model/provider name). Reuses the route/helper/panel verbatim (no new request logic) — HERMES-AGENT-REPLACE-BUILDER-AI-PLAN (supersedes HERMES-AGENT-GUIDANCE-UI-BUILDER) | [`features/workflow-builder/panels/BuilderGuidanceRail.tsx`](../../../features/workflow-builder/panels/BuilderGuidanceRail.tsx) (mounted in the rail by [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx); gated in [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx)). The superseded floating wrapper `BuilderGuidanceEntry.tsx` was DELETED in HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT (dead, zero consumers). |

### End-to-end advisory path (UI → route → capability → gateway)

The same path is used by the builder LEFT CHAT RAIL — `BuilderGuidanceRail` mounts the identical
`WorkflowGuidancePanel`, the only difference being a trusted in-context `workflowId` in the body. The
route then verifies that workflow belongs to the caller's account (no-leak 404 otherwise) and passes
its sanitized saved draft as optional context to the capability. The builder no longer has any path to
the deprecated `POST /api/workflows/[id]/ai/plan` (`planWorkflow`) — proven by the structural scan
[`tests/structure/builder-ai-rail-no-old-endpoint.test.ts`](../../../tests/structure/builder-ai-rail-no-old-endpoint.test.ts).

```
"Build with me" panel (browser, workflows page OR builder LEFT CHAT RAIL; builder adds workflowId)
  → requestWorkflowGuidance() helper → POST /api/accounts/[id]/ai/workflow-guidance
    → route: auth + membership + freeze + optional-workflow-ownership + availability + aiCreditGate
      → runWorkflowGuidanceIntakeCapability → runAuthorizedCapability (audited)
        → requestHermesAgentGuidanceNormalized → Render gateway → private Hermes Agent → OpenAI
      ← NormalizedGatewayGuidance (guidanceText + optional capability-validated workflowPlan, advisory)
    → route derives previewDraft = planToDraftPreview(workflowPlan)  (only when a validated plan exists)
  ← { ok, guidanceText, source, workflowPlan, previewDraft, warnings? }  (safe; no envelope/usage/token)
panel renders guidanceText + a preview-only "Draft preview" (or text "Suggested plan" when no preview)
  → (builder only) "Show on canvas" → BuilderPreviewOverlay renders a ghost layer over the canvas
    → "Discard preview" clears the overlay (UI state only; the real graph was never touched)
    → "Apply preview" → planToBuilderPatch(validated plan) → graphSlice.applyAdditivePatch
        → inserted between the selected node and its sole child (A→new→B) / appended / side chain
        → proposed nodes/edges added to the LOCAL draft (dirty); user reviews fields + saves
        → the FIRST newly-added node that metadata confirms is incomplete is auto-selected/opened for
          editing (HERMES-AGENT-AUTO-OPEN-FIRST-INCOMPLETE-AFTER-APPLY) — navigation only (sets the
          active node → inspector drawer), reuses the same deterministic missing-required-field signal
          as the post-apply hints, never saves/activates/runs/mutates; opens nothing when no added node
          is metadata-confirmed incomplete
```

The browser never holds a token or calls the gateway/vendor directly; the route is the only boundary
it touches. Nothing on this path creates, changes, runs, or persists a workflow — a surfaced plan and
its `previewDraft` are both `notApplied: true` and review/preview-only. The builder overlay is a
separate visual layer (`WorkflowBuilder` UI state) — it never merges into the real React Flow graph,
never writes `draftDefinition`, never marks the workflow dirty, and never autosaves; Discard needs no
rollback because nothing was mutated. No apply/create/run control exists yet.

**Gated + inert:** the client only calls out when `HERMES_AGENT_ENABLED=true` AND the gateway env is
present AND a server caller explicitly constructs it. It is NOT the app-runtime default, and nothing
(route, UI, React Agent) consumes it yet. The generic barrel does not re-export it (server-only).

## Locked AI surface (CHAINREACT-AI-SURFACE-STRUCTURE-LOCKS)

After the Hermes legacy-retirement arc (Phases 1–3), the intended ChainReact AI surface is fixed and
guarded by structure tests so a regression fails CI rather than silently re-introducing legacy paths.

**Live surface (keep-set):**
- Builder AI = the left guidance rail: `BuilderGuidanceRail` → `WorkflowGuidancePanel` →
  `requestWorkflowGuidance` → `POST /api/accounts/[id]/ai/workflow-guidance`.
  - **Chat mode (HERMES-AGENT-BUILDER-RAIL-CHAT-MODE):** the rail enables the panel's
    `conversational` mode — a session-scoped message list (user / Hermes / error turns) with a bottom
    input. A follow-up sends the prior turns as an OPTIONAL, bounded, sanitized `recentTurns` array so
    Hermes answers in context. Conversation is in-memory only (NO durable memory, NO DB write). The
    dashboard "Build with me" stays single-shot (no prop). Only the latest assistant turn's preview is
    actionable ("Show on canvas"); Apply / Discard remain explicit + local-draft-only in the canvas
    overlay. `recentTurns` is plain text only (role allow-list `user`/`assistant`, per-turn text and
    turn-count bounded server-side at the trust boundary, secrets defensively redacted in the prompt
    builder, unknown per-turn fields stripped). No route added — the existing guidance route schema
    gained the optional field (backward-compatible; single-shot requests are byte-identical). Not
    stored in the audit row.
- Run-results repair = governed account suggestion `requestAccountWorkflowRepair` →
  `POST /api/accounts/[id]/ai/workflow-repair` (deterministic, no model), plus EXPLICIT apply
  `applyWorkflowPatch` → `POST /api/workflows/[id]/ai/apply`.
- Deterministic repair internals: `suggestWorkflowRepair`, `repairStrategies`, `repairPatchRef`,
  repair `types`; observability: `recordAiApplyOutcome`, `recordAiRepairOutcome`.
- `services/ai-guidance/*` (server-only gateway client lives under `services/ai-guidance/gateway/`).

**Removed and locked-out:** the builder chat UI subtree (`BuilderAiPanel`, `useBuilderAi*`,
`useChatFill`, `BuilderGuidanceEntry`), the chat-only routes/clients (`…/ai/{plan,complete,thread,
diagnose*,repair/plan,repair/preview}` + the legacy run-repair route), the route-less services
(`services/ai/planner`, `services/ai/diagnostics`, chat-only `services/ai/repair` fns), the dead
`AiPlan*` types, and the dead plan recorder. No browser/client AI file references
`CHAINREACT_AI_GATEWAY_TOKEN`, the Render gateway URL, the private Hermes/gateway endpoint, an OpenAI
key, Nous, or the server-only `hermesAgentGatewayClient`. ChainReact never calls OpenAI directly.

**Guards:** [`tests/structure/builder-ai-rail-no-old-endpoint.test.ts`](../../../tests/structure/builder-ai-rail-no-old-endpoint.test.ts)
(keep-set present · removed-set absent · client no-leak · rail/repair import checks) and
[`tests/unit/features/workflows/workflowGuidanceUiSafety.test.ts`](../../../tests/unit/features/workflows/workflowGuidanceUiSafety.test.ts)
(rail/panel/overlay boundary scan).

## Boundaries (unchanged from the pivot)

- Advisory only — no workflow mutation / execution / apply / create / delete.
- Any plan-like reply is capability-validated via `validateWorkflowPlan`; an invalid plan fails
  closed.
- ChainReact never receives OAuth/refresh tokens, API keys, raw integration/Supabase rows,
  service-role data, or private provider config across this boundary; it sends only the safe DTO.
- Workflow execution never depends on the Agent.

### AI context / memory scopes (HERMES-AGENT-MEMORY-SCOPE-GUARD)

Guidance is **request-scoped** — there is NO durable Hermes/ChainReact AI memory store in V2, and
guidance/session/audit tables are NOT a memory source. `buildSafeGuidanceContext` is the deterministic
guard for what context a request may carry, by scope:

- **user** — the signed-in user's OWN data only (e.g. their own private connection availability,
  sourced live from integrations they personally connected).
- **account** — shared ONLY when explicitly account-safe (account type/role; account-shared
  connection availability — personal providers are filtered out even if mistakenly passed). The
  account-shared list is sourced LIVE from active integrations (account-class providers) via
  `guidanceCredentialAvailability` (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT) — keys + display
  names only.
- **workflow** — only for a workflow the caller is already route-authorized to access.
- **global** — generic product/workflow-building patterns; no customer data.

**A team/shared account does NOT mean shared private AI memory.** A teammate's private AI memory,
personal preferences, private provider connections/credentials, and prior prompts are NEVER blended
into another member's guidance. When a workflow uses a personal connection owned by a *different*
member, guidance receives only a generic notice ("This workflow contains a private connection owned by
another member; connect your own account or ask the owner to share or reconfigure it.") — never the
owner's identity or credential. The caller's userId / account id / email / name stay server-side
(auth + audit), never prompt personalization. Widening any scope is a deliberate future slice.

## Gateway state — VERIFIED HEALTHY (2026-06-20)

The opt-in live smoke now passes **end-to-end**: gateway returns HTTP 200 `ok=true`, the client
normalizes the OpenAI-style `{ ok:true, response:{ choices:[{ message:{ content } }], usage } }`
envelope into an advisory guidance result (~3.5s). Reaching this took four **Render/agent-side**
config fixes (ChainReact code unchanged), each surfaced by the smoke: inbound gateway auth →
gateway→agent auth (`Missing Authentication header`) → agent provider config (`Unknown provider
'openai'`) → model feature (`Encrypted content is not supported with this model`). See runbook §6 for
the regression-localization checklist.

## Next recommended slices

1. ✅ **HERMES-AGENT-RESPONSE-CONTRACT (done)** — Zod envelope schema + `normalizeGatewayResponse`
   → `NormalizedGatewayGuidance` (advisory `guidanceText`, `workflowPlan: null`, sanitized `rawUsage`,
   fail-closed). Live smoke asserts non-empty `guidanceText`.
2. ✅ **HERMES-AGENT-CAPABILITY (done)** — `workflow_guidance_intake` registered as a `read_only`
   React Agent capability; server-only runner through `runAuthorizedCapability` (scope-validated +
   audited), gated by `HERMES_AGENT_ENABLED`, advisory-only. **No route/UI and no billing gate yet**
   (`creditFeature: null` — documented gap; stays OFF by config).
3. ✅ **HERMES-AGENT-CAPABILITY-ROUTE (done)** — `POST /api/accounts/[id]/ai/workflow-guidance`:
   auth + account-membership + freeze + optional-workflow ownership + Hermes-availability +
   `aiCreditGate` (feature `workflow_guidance`) + persistent audit recorder, then the runner.
   **Billing gap closed.** No `ai_cost_events` row / no migration (ChainReact makes no direct model
   call). **No UI yet.**
4. ✅ **HERMES-AGENT-GUIDANCE-UI (done)** — "Build with me" advisory panel on the workflows
   dashboard (server-gated on `HERMES_AGENT_ENABLED`), calls only the route via the client helper,
   renders `guidanceText`. No mutation, no direct gateway/vendor calls.
5. ✅ **HERMES-AGENT-PLAN-EXTRACTION (done)** — **advisory validated plan only.** The agent is
   prompted to optionally append ONE fenced ` ```json ` plan; `extractPlanFromText` (deterministic,
   model-free) pulls a shape-valid candidate, the normalizer gates it through `validateWorkflowPlan`
   (every `provider:type` must exist in the registry). Valid → `workflowPlan` surfaced + raw block
   stripped from `guidanceText`; invalid → `null` + safe `"Suggested plan could not be validated."`
   warning, guidance kept; prose-only/malformed → `null`. UI renders a **review-only** "Suggested
   plan" section ("Review only — this has not changed your workflow.") with **no apply/create/run
   control**. Plan is `notApplied: true`. Still advisory — no mutation/execution/persistence.
6. ✅ **HERMES-AGENT-GUIDANCE-UI-BUILDER (done)** — a second "Build with me" entry inside the
   workflow builder (collapsed floating pill, bottom-left of the canvas) that reveals the same
   `WorkflowGuidancePanel` and passes the in-context `workflowId`. Server-gated on
   `isHermesAgentEnabled()` + a resolved `accountId`; reuses the route/helper/panel verbatim. Still
   advisory only — no mutation, no direct gateway/vendor calls.
7. ✅ **HERMES-AGENT-DRAFT-PREVIEW (done)** — `planToDraftPreview` converts a validated `WorkflowPlan`
   into an EPHEMERAL, NON-APPLIED `DraftPreview` (a distinct type from `WorkflowDefinition`):
   preview-only ids (`preview-step-1`/`preview-edge-1`), capability labels only, linear sequence
   edges, missing field-keys → warnings/`missingInputs` (never config), `notApplied: true` everywhere.
   Derived at the route from `result.workflowPlan` only (never from an unvalidated plan; `null`
   otherwise). UI renders a preview-only "Draft preview" section ("Preview only — your workflow has
   not changed.") with **no apply/create/add/use-this/run control**. Ephemeral/in-memory only — no
   `draftDefinition` write, no builder-state mutation, no persistence.
8. ✅ **HERMES-AGENT-BUILDER-PREVIEW-OVERLAY (done)** — render a `DraftPreview` as a separate,
   ephemeral ghost overlay on the builder canvas (shimmered/dashed "Suggested" nodes + dashed edges +
   "Preview only — your workflow has not changed." + Discard). Triggered by a builder-only "Show on
   canvas" control in the guidance panel. UI state in `WorkflowBuilder` only — it never merges into
   the real graph / `draftDefinition`, never marks dirty, never autosaves; Discard just clears state
   (no rollback). Still no apply/create/use/add/run control.
9. ✅ **HERMES-AGENT-APPLY-PREVIEW-PATCH (done)** — the FIRST mutation path: an explicit "Apply
   preview" converts the VALIDATED plan into a deterministic ADDITIVE patch (`planToBuilderPatch`) and
   applies it to the LOCAL builder draft (`graphSlice.applyAdditivePatch`) like manually-added
   nodes/edges — real ids, EMPTY config (nothing inferred), dirty via the normal mechanism. **Limits:**
   additive only (addNode/addEdge); NO delete/replace/update-config/replace-trigger/branch-rewrite; a
   proposed trigger is SKIPPED when one already exists; existing graphs get the chain as a SIDE CHAIN
   (exact in-place insertion is a follow-up); NO automatic save/activate/run; NO separate workflow.
   The user still reviews required fields and saves through existing builder flows.
10. ✅ **HERMES-AGENT-MEMORY-SCOPE-GUARD (done)** — deterministic `buildSafeGuidanceContext` decides the
    request-scoped context Hermes receives (user/account/workflow/global scopes). Account-shared +
    own-connection availability summarizable; a foreign member's private connection → generic notice;
    all other-member private data / identity / secrets excluded. No durable memory store — guidance is
    request-scoped; audit stays aggregate-safe. Policy + server enforcement + tests only (no new memory
    system, no Honcho, no migration, no workflow/apply change).
11. ✅ **HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT (done)** — wired the LIVE, sanitized credential
    availability source (`services/integrations/guidanceCredentialAvailability.ts`) into the scope
    guard via the route: account-class providers → account-shared; the caller's OWN personal
    connections → their own; another member's private provider excluded; no token/secret/id/owner.
    Prompt gains "Only suggest using connections listed as available…". Degrades to empty on read
    error. Conservative limit: explicitly-shared personal connections not yet summarized as
    account-shared (future widening).
12. ✅ **HERMES-AGENT-APPLY-IN-PLACE (done)** — `applyAdditivePatch` now appends the action chain after
    a safe anchor (selected/active node → else sole chain tail) with one new edge, instead of always a
    side chain. Blank → origin; ambiguous multi-tail / no anchor / trigger-first → side chain with a
    safe fallback notice. Edges ADD-ONLY (no remove/rewrite/split); existing config/positions never
    touched. **Limits:** additive only; no edge splitting / true mid-chain insertion yet; ambiguous
    graphs fall back to side chain; no auto-save/activate/run.
13. ✅ **HERMES-AGENT-APPLY-INSERT-BETWEEN (done)** — true insertion: when the selected/active node has
    exactly ONE outgoing UNLABELED edge A→B, the proposed action chain splits it into A→new…→B
    (`placement: "inserted_between"`, the FIRST edge-rewrite). Exactly one edge is removed/replaced;
    all other edges + every node + its config/position are untouched; labeled/branch edges and
    multi-outgoing nodes never split (fall back to append). Placement logic extracted to the pure
    `additivePatchPlacement.ts`. **Limits:** one-edge split only; only a single-outgoing-unlabeled
    selected node; no multi-branch rewrite; no deletes beyond the one split edge; no auto-save/run.
14. ✅ **HERMES-AGENT-APPLY-CONFIG-HINTS (done)** — after an explicit apply, the newly-added nodes
    surface what still needs configuring, REUSING the existing metadata-driven validation (no parallel
    validator):
    - **Source of truth = metadata.** Hints come from the same `requiredFieldsByType` lookup (built
      server-side from the discovery registry) and the same `missingRequiredFields` rule that already
      drive the canvas "Needs setup" chip and the validation drawer — never from Hermes prose / the
      plan's `requiredInputs`. New pure helper [`appliedConfigHints.ts`](../../../features/workflow-builder/utils/appliedConfigHints.ts)
      maps the just-applied node ids → `{ label, missingFieldLabels, hasMetadata }`.
    - **Names only.** Hints render required-field LABELS (e.g. "Needs configuration: Channel, Message")
      — never field VALUES, secrets, OAuth/refresh tokens, provider account ids, or credential ids.
      When a node's type has no metadata (`hasMetadata: false`), it falls back to a conservative generic
      notice ("Review this step's required fields.").
    - **Post-apply UI.** The transient notice (now [`BuilderApplyNotice.tsx`](../../../features/workflow-builder/canvas/BuilderApplyNotice.tsx))
      shows the placement headline — copy updated to "review required fields before **saving or
      activating**" — plus the per-node hint list (incomplete nodes only). Newly-added cards get a
      short-lived "Added from preview" badge (threaded `appliedNodeIds` → canvas adapter →
      `WorkflowNodeCard`). Hints recompute from the LIVE pending graph, so a hint clears the moment the
      user fills the field and a badge disappears if its node is deleted. Badge + hints clear on
      dismiss / workflow switch / a new preview. Shimmer (the preview overlay) still clears on apply.
    - **Limits / unchanged:** hints are names only, nothing inferred; the user still configures + saves
      through the existing flow; NO apply-then-save, auto-save, activation, run, separate workflow,
      delete-node, replace-trigger, config overwrite, or credential insertion. No direct OpenAI / Nous /
      private Hermes calls; no gateway-token browser exposure.
15. ✅ **HERMES-AGENT-REPLACE-BUILDER-AI-PLAN (done)** — the builder's LEFT CHAT RAIL now IS the Hermes
    guidance surface, replacing the old plan-based `BuilderAiPanel` that called the deprecated
    `POST /api/workflows/[id]/ai/plan` (503 in current envs):
    - New thin `BuilderGuidanceRail` renders the dashboard's `WorkflowGuidancePanel` verbatim in the
      rail (reusing the `requestWorkflowGuidance` helper → `POST /api/accounts/[id]/ai/workflow-guidance`
      with the in-context `workflowId`). Zero new network logic; the Show-on-canvas → preview → Apply
      preview path is the existing one (`graphSlice.applyAdditivePatch`).
    - The separate floating "Build with me" pill (`BuilderGuidanceEntry`) is no longer mounted — ONE AI
      entry. The old `BuilderAiPanel` / `useBuilderAi` / `planWorkflow` code is intentionally NOT
      deleted (still covered by their own tests + the route is used elsewhere); only the VISIBLE rail is
      disconnected. A structural scan
      [`tests/structure/builder-ai-rail-no-old-endpoint.test.ts`](../../../tests/structure/builder-ai-rail-no-old-endpoint.test.ts)
      proves the rail's source no longer references `planWorkflow` / `/ai/plan` / the gateway token, and
      that `WorkflowBuilder` no longer mounts `BuilderAiPanel` / the floating entry.
    - Rail header model label changed "connected · claude" → "connected · Hermes" (no provider/model
      name leaks). Gated on `isHermesAgentEnabled()` AND a resolved `accountId`; otherwise a safe
      "unavailable" note (no dead box, no call to a disabled route).
    - **Limits / unchanged:** advisory + explicit-apply only — NO auto-save, apply-then-save, activation,
      run, or separate-workflow creation; no direct OpenAI / Nous / Render / private-Hermes browser
      calls; no gateway-token exposure. Consequence: the old rail's diagnose / repair / chat-fill
      features (which also rode the deprecated AI endpoints) are no longer surfaced in the builder; their
      code + tests remain for any future re-integration on the Hermes path.
16. ✅ **HERMES-AGENT-LEGACY-AI-ROUTE-AUDIT (done)** — audited the deprecated builder AI plan path and
    recorded the keep/remove/rehome decision. Findings:
    - **`POST /api/workflows/[id]/ai/plan` + `planWorkflow` (client):** NO user-facing consumer remains —
      the only client is the unmounted `BuilderAiPanel` chat. KEPT (backend test `ai-plan-route.test.ts`
      still covers it; chat planning is a Hermes-rehoming candidate) and MARKED DEPRECATED in the route +
      `lib/api/ai/plan.ts` headers. NOT deleted.
    - **Important correction to #15:** diagnose/repair are NOT fully gone from the builder. The
      run-results repair entry [`RunResultsRepairBlock`](../../../features/workflow-builder/panels/RunResultsRepairBlock.tsx)
      is STILL MOUNTED (via `RunResultsPanel` → builder right drawer) and calls `requestWorkflowRepair`
      (`…/ai/repair`) + `applyWorkflowPatch` (`…/ai/apply`). Those routes + `lib/api/ai` (apply/repair) +
      the shared `features/workflow-builder/ai/*` presentational helpers are LIVE — do NOT delete. Only
      the CHAT-driven diagnose/repair/chat-fill (inside the unmounted `BuilderAiPanel`) is dead-in-prod.
    - **Removed now (safe, small):** the superseded floating `BuilderGuidanceEntry.tsx` + its test — dead,
      zero consumers, replaced by `BuilderGuidanceRail`. Deleting it removes the last duplicate builder AI
      surface.
    - **Kept (deprecated, dead-in-prod, rehome candidates):** the whole `BuilderAiPanel` chat subtree
      (`BuilderAiPanel` / `useBuilderAi` / `useBuilderAiActions` / `_BuilderAiPanel*` / `useChatFill` /
      `useBuilderDiagnosisActions`) + `…/ai/plan` / `…/ai/complete` / `…/ai/thread` / chat-only
      `…/ai/diagnose*` / `…/ai/repair/{plan,preview}` and their ~35 tests. Marked deprecated in
      `BuilderAiPanel.tsx` + `useBuilderAi.ts`.
    - **Safety net:** the structural scan gained "legacy plan path is not user-mounted" assertions — no
      builder composition root renders `<BuilderAiPanel>`, the floating entry file is gone, and the
      `/ai/plan` route file still exists (guards the keep-decision). No code/route behaviour changed;
      docs + deprecation comments + one deletion only.
17. ✅ **HERMES-AGENT-REHOME-RUN-RESULTS-REPAIR (done)** — moved the builder's run-results repair "Ask"
    onto a governed, account-scoped route. **Audit-driven decision:** the live run-results repair
    (`RunResultsRepairBlock` → `suggestWorkflowRepairForAI`) makes **NO model call** — it is fully
    deterministic (rule-based classification → safe `WorkflowPatch` → deterministic AI-5 preview →
    value-free result). So the rehome is **governance-only**: it preserves determinism rather than
    routing a destructive-capable repair through an LLM (a real safety/cost regression we avoided).
    - New route [`POST /api/accounts/[id]/ai/workflow-repair`](../../../app/api/accounts/[id]/ai/workflow-repair/route.ts):
      `requireUserWithAccount` + strict `{workflowId, runId}` + workflow-belongs-to-account (no-leak
      404) + the suggester's own run→workflow ownership (`NOT_FOUND` 404) + persistent audit via the
      existing `recordAiRepairOutcome` seam. It delegates to the SAME deterministic
      `suggestWorkflowRepairForAI` and returns the identical value-free `RepairSuggestionResult`.
    - **No model / Hermes / gateway / OpenAI / Nous call** → no prompt or run-context payload is sent
      anywhere, nothing to leak, no `CHAINREACT_AI_GATEWAY_TOKEN` involvement. The AI-credit + 
      `HERMES_AGENT_ENABLED` gates are intentionally NOT applied (they gate model spend / Hermes
      availability, neither of which exists here); a future LLM-backed repair-guidance augmentation
      MUST add them around its model call.
    - New client [`requestAccountWorkflowRepair`](../../../lib/api/ai/workflowRepair.ts); `RunResultsRepairBlock`
      now asks through it (threaded `accountId` from `WorkflowBuilder` → `RunResultsPanel`). Without an
      `accountId` it shows a safe "unavailable" note instead of the Ask button.
    - **Apply is unchanged** — still the existing deterministic `applyWorkflowPatch` (`…/ai/apply`) with
      explicit confirmation. No auto-apply, no auto-save, no activation/run, no separate workflow.
    - **Legacy `…/runs/[runId]/ai/repair` kept** (its backend test still covers it; no live UI consumer
      after this slice). Structural scan asserts the UI uses the new governed helper (not the legacy
      ask) and the new route stays model-free and never applies a patch.
18. ✅ **HERMES-AGENT-RETIRE-LEGACY-REPAIR-ROUTE (done)** — with no live consumer left, removed the dead
    legacy per-workflow repair entry. **Deleted:** the route `app/api/workflows/[id]/runs/[runId]/ai/repair/route.ts`,
    the client request function `requestWorkflowRepair` (+ its `RequestWorkflowRepairRequest` type) from
    `lib/api/ai/runRepair.ts`, the route's dedicated backend test `ai-repair-route.test.ts`, and the
    `requestWorkflowRepair` describe block from `tests/unit/lib/api/ai.test.ts`. **Preserved (live):** the
    deterministic suggester `suggestWorkflowRepairForAI` + its validators/preview/apply contracts; the
    governed account route `POST /api/accounts/[id]/ai/workflow-repair`; the explicit apply path
    (`applyWorkflowPatch` → `…/ai/apply`); `RunResultsRepairBlock`; and the `AiRepair*` CONTRACT TYPES in
    `runRepair.ts` (now a types-only module — still consumed by the governed client + the UI). Structural
    scan gained retirement guards (legacy route file gone, `requestWorkflowRepair` absent from the client
    code, account route still present, UI keeps explicit apply). No behaviour change to the governed route,
    the deterministic suggester, or apply. No migration.
19. ✅ **HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT — Phase 1 (UI subtree) (done)** — deleted the unmounted legacy
    builder chat AI UI layer. Audit (grep) first confirmed: `BuilderAiPanel` has ZERO JSX mounts; the only
    LIVE importer of `features/workflow-builder/ai/*` is `RunResultsRepairBlock` (uses `AiBulletList` +
    `AiRequiredInputList`, which are self-contained); no live code imports any chat-only `ai/*` helper.
    **Removed (37 source + 60 tests = 97 files):** `BuilderAiPanel.tsx` + all 14 `_BuilderAiPanel*`, the
    chat hooks (`useBuilderAi`, `useBuilderAiActions`, `useBuilderDiagnosisActions`, `useChatFill`,
    `_builderAgentPersistence`), and the 17 chat-only `ai/*` helpers (composeFollowUpPrompt,
    deterministicCompletion, detectIntentCorrection, classifyComposerIntent, canExplainDiagnosis,
    firstMissingFieldNodeId, setupFindings, attentionFindings, chatFill*, shouldRouteChatFill,
    useChatFillTarget, useRepairFieldTarget, resolveRequiredInputControl, RequiredInputControl,
    RequiredInputOptionsSourceControl) + their ~49 UI tests. **Kept (live):** `ai/AiBulletList` +
    `ai/AiRequiredInputList` (+ slimmed `ai/index.ts`) used by `RunResultsRepairBlock`; the Hermes
    `BuilderGuidanceRail`; the governed repair route; `applyWorkflowPatch` / `/ai/apply`; the deterministic
    repair services/validators/types. **Deferred to Phase 2:** the now-UI-orphaned chat-only ROUTES
    (`/ai/{plan,complete,thread,diagnose*,repair/plan,repair/preview,repair/apply*}`), their client helpers
    (`planWorkflow`, `completePlan`, thread/diagnose/repair-plan/preview), and chat-only services — all still
    compile (dead, no UI consumer). Stale rail-payload comments updated `BuilderAiPanel`→`BuilderGuidanceRail`.
    Structural scan gained Phase-1 guards (chat files deleted, barrel slimmed, repair block keeps the shared
    views). `tsc` clean; no behaviour change to the rail / repair / apply; no migration.
20. ✅ **HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT — Phase 2 (routes + client helpers) (done)** — deleted the
    UI-orphaned chat-only HTTP surface + dead browser API. **Removed routes (11 files):**
    `/api/workflows/[id]/ai/{plan, complete, thread (+messages), diagnose (+explain, qa),
    repair/plan, repair/preview, repair/apply, repair/apply-readiness}` + their 9 route tests. **Removed
    client helpers:** `lib/api/ai/thread.ts` + `lib/api/ai/diagnostics.ts` (whole files — fully orphaned),
    and `planWorkflow` + `completePlan` (+ their request/response types) from `lib/api/ai/plan.ts`; the
    `@/lib/api/ai` barrel drops the thread/diagnostics re-exports; `ai.test.ts` trimmed to the live
    `applyWorkflowPatch` tests. **Kept (live):** `POST /api/workflows/[id]/ai/apply` + `applyWorkflowPatch`
    (explicit repair apply); the governed `/api/accounts/[id]/ai/{workflow-guidance, workflow-repair}`
    routes; `BuilderGuidanceRail` / `WorkflowGuidancePanel` / `requestWorkflowGuidance`;
    `RunResultsRepairBlock` + `requestAccountWorkflowRepair`; the `AiPreview` / `AiApply*` types +
    `AiRepair*` repair contract; the deterministic repair suggester/validators; `services/ai-guidance/*`;
    the memory/credential scope guards; the Hermes gateway/client/contract. **Deferred to Phase 3 (server
    services):** `services/ai/planner`, `services/ai/diagnostics`, and the chat-only `services/ai/repair`
    functions (`planWorkflowRepair`, `previewWorkflowRepair`, `applyRepairPatch`,
    `assessRepairApplyReadiness`, `deterministicRepairPreview`) + their capability runners + tests — they
    are now UI-orphaned but NOT browser-reachable, and are entangled with the LIVE events recorder
    (`services/ai/events/recordAiRouteEvents.ts` imports `@/services/ai/planner`) and the live
    `suggestWorkflowRepair` (shares `services/ai/repair/{repairStrategies,types}`), so they need careful
    per-file surgery. Structural scan gained Phase-2 guards (routes/client files deleted, barrel/plan
    cleaned, no client code references the removed endpoints, apply + governed routes survive). `tsc`
    clean; no behaviour change to the rail / repair / apply; no migration.
21. ✅ **REACT-AGENT-PRODUCTION-TIMEOUT-1 (done, local)** — fixed the production 503 that hit complex
    builder turns and made the failure diagnosable. **Root cause:** the gateway client's 30s abort
    (`DEFAULT_TIMEOUT_MS`). A builder EDIT turn sends a structurally larger prompt than a first turn —
    measured ~45 KB / ~11.3k tokens (512-key capability catalog + field schemas + editable graph) vs
    ~25 KB / ~6.2k — and the reasoning brain routinely needs more than 30s for it, so it failed
    deterministically at the deadline. **Fix:** default 30s → **45s**, clamp ceiling 120s → **55s**, and
    an explicit `export const maxDuration = 60` on BOTH guidance routes, making the budget a two-part
    invariant (gateway abort < function budget) so a slow brain always returns ChainReact's typed 503
    rather than a bodyless platform 504; a structure test pins the literal to the shared constant.
    **Observability (the other half):** every brain failure previously collapsed into one opaque 503 and
    one `reason: "exec_failed"` audit row — a timeout, a dead gateway, and a malformed envelope were
    indistinguishable. Now: a distinct `GUIDANCE_TIMEOUT` 503 with actionable copy, a safe server log
    (typed code + elapsed + request shape; no goal/guidance text, ids, or token), and
    `reason: "exec_failed:<CODE>"` on the audit row via a new optional `classifyReason` on the governance
    seam. The opt-in live smoke gained an EDIT-shaped **latency** case (the short-prompt case stayed green
    all through the incident). **Unproven:** whether 45s is actually enough (no live measurement yet), and
    whether the Render gateway imposes its own upstream deadline — the new log distinguishes the two.
    **Not attempted:** shrinking the catalog sent on editing turns (the dominant latency term) — that
    changes what the model may propose and was kept out of an infrastructure fix. No migration.
    Closeout: [`react-agent/react-agent-production-timeout-closeout.md`](./react-agent/react-agent-production-timeout-closeout.md).
22. ✅ **REACT-AGENT-RETRY-BACKOFF-1 (done, local)** — added a NARROWLY bounded retry to the guidance
    path and corrected the timeout attribution. **Audit first (all proven, not assumed):** the path made
    exactly ONE Hermes attempt, retried nothing, had no backoff, ignored the incoming request's
    cancellation signal, never checked remaining budget, had no request id / idempotency key, and had NO
    secondary model or provider fallback (`resolveServerGuidanceProvider` has zero production callers;
    the deterministic inferers run only AFTER a successful reply). The repo's `refreshAndRetry` helpers
    are used by provider/analytics code and were never imported here. **Attribution correction:** Render's
    `HERMES_AGENT_TIMEOUT_MS=60000` could not have caused the 30s failure — the same variable NAME exists
    in two processes, and ChainReact reads only the Vercel copy. The boundary that fired was ChainReact's
    own 30,000 ms client abort. **Retry design:** 1 initial + at most 1 retry (`MAX_TOTAL_ATTEMPTS`, a
    constant, not config), only for fast transient failures (network reset, immediate 502/503, 429 with a
    ≤2s `Retry-After`), after a jittered 250–750 ms backoff. NEVER retried: timeout, cancellation, auth /
    authorization / bad token, 400/404/500, malformed structured output, invalid proposals, any transient
    failure that took >5s, and any failure without budget for a useful second attempt. **Budget:**
    `timeoutMs` is now the budget for the WHOLE logical call — each attempt's deadline is what remains and
    the backoff is charged to it, so retry redistributes the existing budget and can never push into
    platform-kill territory. **Cancellation:** `request.signal` is threaded route → runner → fetch AND
    backoff; a cancelled request is the new typed `CANCELLED` code → HTTP 499, never retried, deliberately
    not error-logged. **Identity + metering:** one `requestId` (uuid) per submission on both attempts
    (`x-chainreact-request-id` / `x-chainreact-attempt`), ONE audit row carrying the attempts as safe
    metadata via a new opt-in `classifyMetadata` seam hook, and ONE `aiCreditGate` call — the gate is
    outside the retry, so at-most-one-credit is structural. **Known gap (documented, not hidden):** the
    ledger is deduct-only with no refund/release RPC, so with credit enforcement ON a FAILED submission
    still keeps its credit. Pre-existing, unchanged by retry, inert while enforcement is off; closing it
    is a billing slice. **Render env:** no change needed — 60s downstream is correctly LONGER than
    ChainReact's ≤55s, so ChainReact's deadline binds first. An explicit `60000` on VERCEL is clamped to
    55000 (tested). No migration. 91 targeted suites / 1093 tests green.
    Closeout: [`react-agent/react-agent-production-timeout-closeout.md`](./react-agent/react-agent-production-timeout-closeout.md).
