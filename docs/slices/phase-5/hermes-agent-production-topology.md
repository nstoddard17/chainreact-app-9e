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
| Server-only gateway config reader (flag + url + token + timeout; null when off/unconfigured) | [`services/ai-guidance/gateway/gatewayConfig.ts`](../../../services/ai-guidance/gateway/gatewayConfig.ts) |
| Safe prompt builder (from de-identified DTO + scrubbed goal text) | [`services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) |
| Server-only gateway client + `WorkflowGuidanceProvider` impl (advisory; fail-closed) | [`services/ai-guidance/gateway/hermesAgentGatewayClient.ts`](../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts) |
| **Strict response contract** (Zod envelope schema + `normalizeGatewayResponse` → `NormalizedGatewayGuidance`: `guidanceText`/`source`/`workflowPlan`/`rawUsage?`/`warnings?`) — HERMES-AGENT-RESPONSE-CONTRACT | [`services/ai-guidance/gateway/gatewayResponseContract.ts`](../../../services/ai-guidance/gateway/gatewayResponseContract.ts) |
| **Plan extractor** (deterministic, model-free) — pulls a shape-valid `WorkflowPlan` from a fenced ` ```json ` block in the guidance text; the normalizer then gates it through `validateWorkflowPlan` (advisory validated plan only; `notApplied: true`; invalid → null + safe warning) — HERMES-AGENT-PLAN-EXTRACTION | [`services/ai-guidance/gateway/extractPlanFromText.ts`](../../../services/ai-guidance/gateway/extractPlanFromText.ts) + prompt [`buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) + UI [`WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) |
| **Draft preview converter** (deterministic) — turns a validated `WorkflowPlan` into an ephemeral, non-applied `DraftPreview` (preview-only ids, labels only, `notApplied: true`, missing field-keys → warnings; no config/persistence). Derived at the route from `result.workflowPlan` only — HERMES-AGENT-DRAFT-PREVIEW | [`services/ai-guidance/preview/planToDraftPreview.ts`](../../../services/ai-guidance/preview/planToDraftPreview.ts) + type [`contracts/workflowPlanPreview.ts`](../../../contracts/workflowPlanPreview.ts) + UI [`WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) |
| **Builder preview overlay** (visual/ephemeral) — renders a `DraftPreview` as a SEPARATE ghost layer over the canvas (shimmered/dashed "Suggested" nodes + dashed edges + "Preview only…" notice + Discard). UI state in `WorkflowBuilder` only; never merges into the real graph / `draftDefinition` / dirty / save. Panel "Show on canvas" (builder-only) feeds it; Discard clears it — HERMES-AGENT-BUILDER-PREVIEW-OVERLAY | [`features/workflow-builder/canvas/BuilderPreviewOverlay.tsx`](../../../features/workflow-builder/canvas/BuilderPreviewOverlay.tsx) (state in [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx); wired via [`BuilderGuidanceEntry.tsx`](../../../features/workflow-builder/panels/BuilderGuidanceEntry.tsx) → panel `onPreviewToCanvas`) |
| Gateway barrel + `resolveServerGuidanceProvider()` (gateway-when-enabled, else noop) | [`services/ai-guidance/gateway/index.ts`](../../../services/ai-guidance/gateway/index.ts) |
| **React Agent capability** `workflow_guidance_intake` (read-only, audited, gated; runs through `runAuthorizedCapability`) — HERMES-AGENT-CAPABILITY | [`services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`](../../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts) + registry [`capabilities.ts`](../../../services/ai/reactAgent/capabilities.ts) |
| **Gated route** `POST /api/accounts/[id]/ai/workflow-guidance` (auth + membership + freeze + `aiCreditGate` feature `workflow_guidance` + persistent audit recorder + config gating) — HERMES-AGENT-CAPABILITY-ROUTE | [`app/api/accounts/[id]/ai/workflow-guidance/route.ts`](../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) |
| **UI entry point** "Build with me" advisory panel (workflows dashboard; server-gated on `HERMES_AGENT_ENABLED`; calls only the route via the client helper) — HERMES-AGENT-GUIDANCE-UI | [`features/workflows/WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) + helper [`lib/api/ai/guidance.ts`](../../../lib/api/ai/guidance.ts) |
| **Builder UI entry point** "Build with me" advisory entry inside the workflow builder — a collapsed floating pill (bottom-left of the canvas) that reveals the SAME `WorkflowGuidancePanel`, passing the in-context `workflowId` so guidance is drawn from the current draft. Server-gated on `isHermesAgentEnabled()` AND a resolved `accountId`; reuses the route/helper/panel verbatim (no new request logic) — HERMES-AGENT-GUIDANCE-UI-BUILDER | [`features/workflow-builder/panels/BuilderGuidanceEntry.tsx`](../../../features/workflow-builder/panels/BuilderGuidanceEntry.tsx) (mounted by [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx); gated in [`app/workflows/[id]/page.tsx`](../../../app/workflows/[id]/page.tsx)) |

### End-to-end advisory path (UI → route → capability → gateway)

The same path is used by the builder entry — `BuilderGuidanceEntry` mounts the identical
`WorkflowGuidancePanel`, the only difference being a trusted in-context `workflowId` in the body. The
route then verifies that workflow belongs to the caller's account (no-leak 404 otherwise) and passes
its sanitized saved draft as optional context to the capability.

```
"Build with me" panel (browser, workflows page OR builder; builder adds workflowId)
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

## Boundaries (unchanged from the pivot)

- Advisory only — no workflow mutation / execution / apply / create / delete.
- Any plan-like reply is capability-validated via `validateWorkflowPlan`; an invalid plan fails
  closed.
- ChainReact never receives OAuth/refresh tokens, API keys, raw integration/Supabase rows,
  service-role data, or private provider config across this boundary; it sends only the safe DTO.
- Workflow execution never depends on the Agent.

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
9. **HERMES-AGENT-PLAN-APPLY (next, gated)** — the FIRST mutation path: an explicit, user-initiated
   "Create / Use this" action that hands the validated `WorkflowPlan` to the **deterministic
   ChainReact builder** to create a real draft. Must be its own approval-gated slice — the AI still
   never auto-applies; everything so far is review/preview-only, nothing applies yet.
