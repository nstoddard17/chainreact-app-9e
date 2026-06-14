# 4.AI-REPAIR-1 — Safe Repair-Plan Proposal (no apply) Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-13
**Branch:** `v2-main`

**Source of truth (verified current state — files read for this plan):**
[app/api/workflows/[id]/ai/diagnose/explain/route.ts](../../../../app/api/workflows/[id]/ai/diagnose/explain/route.ts) (the paid/metered LLM route this slice mirrors) ·
[services/ai/diagnostics/explainWorkflowDiagnosis.ts](../../../../services/ai/diagnostics/explainWorkflowDiagnosis.ts) (injected-model-client service pattern) ·
[services/ai/diagnostics/diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts) (the safe diagnosis DTO) ·
[services/ai/diagnostics/buildDiagnosisExplainContext.ts](../../../../services/ai/diagnostics/buildDiagnosisExplainContext.ts) (the allow-list projector) ·
[services/ai/diagnostics/renderWorkflowDiagnosis.ts](../../../../services/ai/diagnostics/renderWorkflowDiagnosis.ts) (deterministic findings → nextSteps) ·
[core/billing/aiCreditPolicy.ts](../../../../core/billing/aiCreditPolicy.ts) (`workflow_repair: 4` already mapped) ·
[services/billing/aiCreditGate.ts](../../../../services/billing/aiCreditGate.ts) (flag-OFF no-op gate) ·
[services/billing/billingFeatureFlags.ts](../../../../services/billing/billingFeatureFlags.ts) (`ENABLE_AI_CREDIT_ENFORCEMENT`) ·
[services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts) (the existing `WorkflowPatch` + `validateWorkflowPatch` system AI-REPAIR-2 will build on) ·
[features/workflow-builder/ai/canExplainDiagnosis.ts](../../../../features/workflow-builder/ai/canExplainDiagnosis.ts) (the gating helper to mirror) ·
[features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx](../../../../features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx) + [_BuilderAiPanelDiagnosis.tsx](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx) (diagnosis bubble + affordance gating) ·
[lib/api/ai.ts](../../../../lib/api/ai.ts) (`AgentWorkflowDiagnosis` client type, `diagnoseWorkflow`/`explainDiagnosis` clients).

---

## 1. Context

Just shipped to production (direct `v2-main` pushes): AI-DIAG-2 ("Check workflow"
deterministic diagnosis + "Explain with AI" LLM explanation) and AI-DIAG-2c (hide
the paid Explain affordance for clean/ready diagnoses, commit `8a246ef1f`). The
native/manual-trigger false-positive is fixed and the AI-credit DB migration is
applied to the shared Supabase project (`qcepijemjlkssfkvzlio`) with
`ENABLE_AI_CREDIT_ENFORCEMENT` OFF.

The natural next capability: when "Check workflow" finds issues, let the user ask
the AI to **propose a repair plan in plain English** — what's wrong, what to
change, what info is still needed — **without changing anything**. This is the
metered sibling to "Explain with AI", one rung more actionable (it recommends
*changes*, not just *describes*), but still strictly a proposal: no patch, no
apply, no save, no run.

This fits the AI arc after the diagnosis pair and **before** an executable
auto-repair (AI-REPAIR-2), which would emit a validated `WorkflowPatch` against
the already-built patch engine.

Parent arc docs: [ai-diag-2-llm-explanation-plan.md](../ai-diag-2-llm-explanation-plan.md),
[ai-credits-and-agent-runtime-plan.md](../ai-credits-and-agent-runtime-plan.md),
[ai-architecture-react-agent-plan.md](../ai-architecture-react-agent-plan.md) (the WorkflowPatch system, §6).

---

## 2. Current codebase findings (verified)

Every claim below traces to a file read for this plan.

**(a) The diagnosis DTO is already safe and re-derivable server-side.**
`diagnoseWorkflowForAgent({ subjectUserId, workflowId })`
([diagnoseWorkflowForAgent.ts](../../../../services/ai/diagnostics/diagnoseWorkflowForAgent.ts))
returns `AgentWorkflowDiagnosisDTO`: `access` (`OK`/`NOT_FOUND`/`NO_ACCESS`),
`overallReady`, `runnable`, `allRequiredConnected`, `findings[]` (source/code/
severity/title/nodeIds/provider/providerName/missingFields/missingScopes/
credentialClass), `latestRun` (humanized classification only), `summaryText`,
`nextSteps`. It is no-leak by construction (codes / node ids / provider ids +
public names / missing-field NAMES / public scope-gap names / safe text) — never
tokens, raw config, integration rows, providerAccountId, account metadata, or
connectedByUserId.

**(b) There is already a defense-in-depth projector for the LLM.**
`buildDiagnosisExplainContext(dto)`
([buildDiagnosisExplainContext.ts](../../../../services/ai/diagnostics/buildDiagnosisExplainContext.ts))
field-by-field allow-lists the DTO into `DiagnosisExplainContext` (readiness
booleans, `summaryText`, `nextSteps`, per-finding `source/code/severity/title/
provider/providerName/missingFields/missingScopes/credentialClass`, and the
latest run's humanized classification). It **excludes** node ids, workflow id,
run ids, `firstFailedNodeId`, `classificationAvailable`. A no-leak test pins
exactly which fields leave.

**(c) The paid LLM route is a clean, proven template.**
`POST /api/workflows/[id]/ai/diagnose/explain`
([explain/route.ts](../../../../app/api/workflows/[id]/ai/diagnose/explain/route.ts))
does, in order: `requireUser()` → `loadWorkflowForMember(id, userId)`
(workflow-owning account + no-leak 404) → **re-derive the DTO server-side** (never
trust a client-posted DTO) → access-wall short-circuit (return safe DTO, NO
gate/model) → require OpenAI configured BEFORE charging → `aiCreditGate(...)`
BEFORE the model call → injected OpenAI `fast` client → `explainWorkflowDiagnosis`
→ fail-open `ai_cost_events` recording (`recordAiModelCallCompleted` /
`...Failed`, feature `workflow_explanation`, billed to the workflow-owning
account) → typed response. Status map: 401/400/404/402(`AI_CREDITS_EXHAUSTED`)/
403(frozen)/503(`MODEL_FAILED`/`AI_GATE_ERROR`/not-configured)/500.

**(d) The service pattern is injected-client, structured-tool, Zod-revalidated.**
`explainWorkflowDiagnosis({ dto, modelClient, tier })`
([explainWorkflowDiagnosis.ts](../../../../services/ai/diagnostics/explainWorkflowDiagnosis.ts))
projects the DTO via `buildDiagnosisExplainContext`, forces a single structured
tool call (`explain_workflow_diagnosis` JSON Schema, `maxOutputTokens 800`),
`JSON.parse` + Zod re-validates, and returns a discriminated result
(`ok` / `MODEL_FAILED` / `PARSE_FAILED`). It has **no account/billing concept** —
the route owns authz + gate + recording. The system prompt explicitly forbids
claiming anything was fixed/applied/run.

**(e) Credits: `workflow_repair` is already a mapped feature — no migration.**
`FEATURE_BASE_CREDITS` in [aiCreditPolicy.ts:59](../../../../core/billing/aiCreditPolicy.ts#L59)
already contains **`workflow_repair: 4`** (comment: "explanation small, repair
more"). `computeAiCreditCharge({ feature: "workflow_repair", isLlmCall: true,
modelTier: "fast" })` → 4 credits, `mapped: true`. The gate
([aiCreditGate.ts:66-69](../../../../services/billing/aiCreditGate.ts#L66)) is a pure
no-op while `ENABLE_AI_CREDIT_ENFORCEMENT !== "true"` (today's prod state: `""` →
OFF) — no DB write, no charge. So a repair route reuses the **existing** credit
infra with zero schema/policy changes.

**(f) The UI affordance-gating helper already exists and is the right pattern.**
`canExplainDiagnosis(diagnosis)`
([canExplainDiagnosis.ts](../../../../features/workflow-builder/ai/canExplainDiagnosis.ts))
returns `access === "OK" && (overallReady === false || findings.length > 0 ||
nextSteps.length > 0)`. The message list ANDs it with "latest diagnosis message"
to gate the Explain button
([_BuilderAiPanelMessageList.tsx:264](../../../../features/workflow-builder/panels/_BuilderAiPanelMessageList.tsx#L264)).
A repair affordance reuses the **identical** condition (there is nothing to repair
on a clean/ready diagnosis).

**(g) The executable-patch engine already exists — and is what AI-REPAIR-2 uses.**
[services/workflows/patch/types.ts](../../../../services/workflows/patch/types.ts)
defines `WorkflowPatch` (small diffs: `updateNodeConfig`, `repairVariableReference`,
`addNode`, `removeNode`, `replaceTrigger`, edge ops…), `validateWorkflowPatch`,
`applyPatchToDefinition`, deterministic risk reclassification, and a
`PatchValidationResult` (`candidateDefinition`, errors/warnings, recomputed
`riskLevel`/`requiresConfirmation`, `affectedNodeIds`, `previewSummary`).
**Critically: the model's proposed risk is advisory; the validator recomputes it.**
This confirms AI-REPAIR-1 should **not** emit patch JSON — that belongs on top of
this validator in AI-REPAIR-2.

**(h) Client + message-bubble surfaces exist.**
[lib/api/ai.ts](../../../../lib/api/ai.ts) has `diagnoseWorkflow(workflowId)` and
`explainDiagnosis(workflowId)` (returns `AiDiagnosisExplanation`), `AgentWorkflowDiagnosis`
client type, and `AI_CREDITS_EXHAUSTED_MESSAGE`. The diagnosis bubble
([_BuilderAiPanelDiagnosis.tsx](../../../../features/workflow-builder/panels/_BuilderAiPanelDiagnosis.tsx))
renders `summaryText` + `nextSteps` + the gated Explain button + a
`DiagnosisExplanationBody`. A repair proposal is a new message kind alongside
`diagnosis` / `diagnosis_explanation`.

---

## 3. Product / model decision

**What it IS:** a metered, read-only **repair proposal**. Given the
server-re-derived diagnosis, the LLM returns a structured plan — what's wrong,
recommended changes (in plain language), which nodes/fields/providers are involved
(safe labels only), what user confirmation/missing info is needed, and an explicit
"nothing was changed" notice. The UI renders it; the user reads it and acts
manually (or, later, triggers AI-REPAIR-2 to generate a *validated* patch).

**What it is deliberately NOT (this slice):** no executable patch JSON, no
`WorkflowPatch`, no apply, no save, no graph mutation, no run, no auto-trigger, no
autonomous loop, no Hermes, no MCP internal path, no memory write, no background
agent, no new DB migration.

**Relation to "Explain with AI":** Explain *describes* the current diagnosis;
Repair *recommends changes* to resolve it. They are distinct features (different
credit weight: 1 vs 4) and can coexist on the same diagnosis bubble. Both are
gated by the same "has real issues" condition.

Anchored to the V2 account-scoped model: the cost owner is always the
**workflow-owning account** resolved server-side (`loadWorkflowForMember`), never
client-supplied; personal-provider provenance and no-leak walls are inherited
wholesale from `diagnoseWorkflowForAgent` (the route never reads an integration
row itself).

---

## 4. Recommended approach (answers Q1–Q9)

**Q1 — Action label:** **"Suggest a fix"** (button text). Rationale: it sets the
expectation that the AI *proposes* (not performs), reads naturally next to
"Explain with AI", and avoids over-promising ("Fix it"/"Repair" imply action). A
supporting caption mirrors the Explain one: *"AI suggests how to fix this. It
doesn't change or run your workflow."* (Internal slice/feature name stays
`workflow_repair` to match the credit policy.)

**Q2 — Where it appears:** on the **latest diagnosis bubble only**, and **only
when there are real issues** — reuse the exact gate
`message.id === latestDiagnosisMessageId && canExplainDiagnosis(message.diagnosis)`.
Clean/ready diagnoses and access walls never show it. Never auto-triggered;
explicit click only (mirrors Explain's no-auto-call contract). Per-diagnosis
"already suggested" disables a repeat charge, exactly like `explainedDiagnosisIds`.

**Q3 — Route:** **`POST /api/workflows/[id]/ai/repair/plan`** (recommended). It
reads as a noun-scoped resource ("the repair plan for this workflow"), leaves room
for AI-REPAIR-2's `POST .../ai/repair/apply` (or `/patch`) as a sibling, and keeps
the diagnosis namespace focused on diagnose/explain. Rejected: `.../ai/diagnose/repair`
(nests repair under "diagnose", which is the *input*, not the action; doesn't
extend cleanly to apply).

**Q4 — Service ownership:** new
**`services/ai/repair/planWorkflowRepair.ts`** — `planWorkflowRepair({ dto,
modelClient, tier })`, a direct structural twin of `explainWorkflowDiagnosis`:
injected model client, single structured tool call, Zod re-validation,
discriminated `ok`/`MODEL_FAILED`/`PARSE_FAILED` result, **no account/billing
concept**. The **route** owns auth, `loadWorkflowForMember`, server-side DTO
re-derivation, the access wall, the OpenAI-configured check, `aiCreditGate`, and
`ai_cost_events` recording. The projector is reused/extended (see Q5).

**Q5 — LLM context (allow-list):** reuse **`buildDiagnosisExplainContext(dto)`**
verbatim as the *only* model input. It already carries everything a repair plan
needs and nothing it shouldn't: readiness booleans, `summaryText`, `nextSteps`,
per-finding `source/code/severity/title/provider/providerName/missingFields
(NAMES)/missingScopes (public constants)/credentialClass`, and the latest run's
humanized classification. **Forbidden (structurally absent from the projector):**
tokens, credentials, integration rows, providerAccountId, provider account
labels, account metadata, connectedByUserId, raw config values, trigger/run
payloads, PII, node ids, workflow/run ids, and the full draft definition.
- **Decision (node ids):** keep node ids OUT of the model prompt for AI-REPAIR-1
  (the projector already strips them; the user maps "the Gmail Send node" by its
  provider/title). If AI-REPAIR-2 later needs node ids to build a `WorkflowPatch`,
  that mapping is done **server-side** by re-deriving the DTO+graph, **not** by
  sending ids to the model. So no projector change is needed for 1; if a label is
  desired we can add a node *display label* (provider + action title, no id) to a
  new `buildRepairContext` extension — flagged as an open question (R-3).

**Q6 — Structured output schema (a PROPOSAL, not a patch):**
```
RepairProposal {
  summary: string;                 // one-paragraph plain-language overview
  recommendedActions: string[];    // ordered, highest-impact first; plain language
  affectedNodes: string[];         // SAFE labels only (e.g. "Gmail — Send Email"); never node ids/config
  missingInfo: string[];           // info/decisions the user must provide
  riskLevel: "low" | "medium" | "high";   // model-proposed, ADVISORY (UI labels it as such)
  canAutoPatchLater: boolean;      // model's hint whether AI-REPAIR-2 could auto-generate a patch
  requiresUserAction: boolean;     // true if the user must do something outside the builder (e.g. reconnect)
  notAppliedNotice: string;        // constant-ish safety line; UI also renders its own immutable notice
}
```
Zod-revalidated server-side with bounded sizes (e.g. arrays ≤ 12, strings ≤ 4000)
mirroring `ExplanationSchema`. `riskLevel`/`canAutoPatchLater` are **advisory**:
the UI presents `riskLevel` as "AI's risk estimate", and `canAutoPatchLater` does
NOT enable any apply path in this slice. `notAppliedNotice` is belt-and-suspenders
— the UI renders its own non-model "nothing was changed or run" line regardless.

**Q7 — Return executable patch JSON?** **No (recommended).** AI-REPAIR-1 returns a
plain-language plan only. Executable graph patches must go through the existing
`validateWorkflowPatch` (which recomputes risk, rejects unknown nodes/actions,
checks variable references, etc. — [patch/types.ts](../../../../services/workflows/patch/types.ts));
designing the model→`WorkflowPatch` contract, the preview UI, and the apply path
is AI-REPAIR-2. Emitting raw patch JSON now would create an unvalidated,
apply-tempting artifact with no guardrails — exactly what this slice forbids.

**Q8 — Credits:** reuse the existing **`workflow_repair` feature (4 credits)** —
no policy/migration change (finding (e)). The route gates with
`aiCreditGate({ accountId, feature: "workflow_repair", plannedTier: "fast" })`
**before** the model call, bills the **workflow-owning account**, and records an
`ai_cost_events` model-call event (`recordAiModelCallCompleted`/`...Failed`,
`feature: "workflow_repair"`, fail-open). `ENABLE_AI_CREDIT_ENFORCEMENT` stays
**OFF** — so today the gate is a no-op and repair runs unmetered, but recording
still writes the 4-credit charge to the ledger (consistent with explanation's
behavior today).

**Q9 — UI:** a new **repair-proposal bubble** (message kind `repair_proposal`)
rendering `summary`, `recommendedActions`, `affectedNodes`, `missingInfo`, the
AI-risk estimate, and an **immutable "This is a suggestion only — your workflow
wasn't changed, saved, or run." notice** (rendered by the UI, not the model).
**No Apply button** (not even disabled) in this slice — to avoid implying a
capability that doesn't exist. A neutral, non-actionable line *"Applying
suggestions automatically is coming soon."* is OPTIONAL and only if it reads as
honest roadmap copy, not a fake control (recommend: omit until AI-REPAIR-2 exists,
per "no fake UI"). The "Suggest a fix" trigger is a sibling button to "Explain
with AI" on the gated diagnosis bubble.

---

## 5. Alternatives considered

**Route naming**

| Option | Verdict | Why |
|---|---|---|
| `POST /api/workflows/[id]/ai/repair/plan` | **Chosen** | Noun-scoped; `repair/apply` extends cleanly for AI-REPAIR-2; keeps diagnose namespace clean. |
| `POST /api/workflows/[id]/ai/diagnose/repair` | Rejected | Nests the *action* under the *input*; awkward to extend to apply. |
| `POST /api/workflows/[id]/ai/suggest-fix` | Rejected | UX label leaking into the URL; less stable than the internal `repair` noun. |

**Output: plan vs patch**

| Option | Verdict | Why |
|---|---|---|
| Plain-language `RepairProposal` (no ids, no ops) | **Chosen** | Safe, no apply temptation, no validation surface; ships small. |
| Plan + advisory patch JSON (not applied) | Rejected (now) | Creates an unvalidated artifact; bypasses `validateWorkflowPatch`; invites a premature apply. Belongs to AI-REPAIR-2. |
| Direct `WorkflowPatch` emission | Rejected (now) | That's AI-REPAIR-2's whole job (validate → preview → apply). |

**Credit feature**

| Option | Verdict | Why |
|---|---|---|
| Reuse `workflow_repair` (4) | **Chosen** | Already mapped (finding (e)); zero migration; matches owner's "repair more" intent. |
| Reuse `workflow_explanation` (1) | Rejected | Under-prices a more expensive, action-oriented call; muddies ledger analytics. |
| New feature key | Rejected | Unnecessary — `workflow_repair` already exists. |

---

## 6. Security / data model

- **No new DB objects, no migration.** Credits reuse existing `account_billing` AI
  counters + `deduct_ai_credits_if_available` (already applied to the shared prod
  project) and the existing `ai_cost_events` recorder. The plan does not prove any
  migration is required — none is added.
- **No-leak inherited wholesale:** the model sees only `buildDiagnosisExplainContext(dto)`
  (allow-list, structurally secret-free). The route re-derives the DTO server-side
  (never a client-posted blob). The response carries only the `RepairProposal`
  fields (all plain strings) — no ids, codes-as-data, config, tokens, integration
  rows, or account labels.
- **Authz wall:** `loadWorkflowForMember` → workflow-owning account membership;
  non-member / missing / cross-account → no-leak 404 **before** any gate or model
  call. Access-wall DTO (`NOT_FOUND`/`NO_ACCESS`) short-circuits with no model
  call (mirrors explain route).
- **Fail-closed billing:** gate runs before the model; an unexpected gate error →
  `AI_GATE_ERROR` 503 (no model call). OpenAI-not-configured → 503 **before**
  charging.
- **Shared-project caution:** because dev/preview/prod share one Supabase project,
  the recorder writes to the live `ai_cost_events` even from dev. This is existing
  behavior (explanation already does it); no new exposure. Flagged so testing uses
  mocked clients (no real model calls / real ledger writes in unit tests).

---

## 7. API / service / UI expectations (described, not built)

- **Route** `POST /api/workflows/[id]/ai/repair/plan`: byte-for-byte the
  explain-route control flow, swapping `EXPLAIN_FEATURE → "workflow_repair"`,
  `explainWorkflowDiagnosis → planWorkflowRepair`, and the response body to the
  `RepairProposal`. Same status map, same denial mapping helper shape.
- **Service** `services/ai/repair/planWorkflowRepair.ts`: twin of
  `explainWorkflowDiagnosis` with a `propose_workflow_repair` structured tool, a
  repair-specific system prompt (forbids claiming any change/apply/run; recommends
  changes in plain language; uses only the provided context; asks for missing
  info), and `RepairProposalSchema` (Zod).
- **Client** `lib/api/ai.ts`: add `planWorkflowRepair(workflowId): Promise<...>`
  mirroring `explainDiagnosis`, returning a discriminated `ok` proposal / typed
  `{ok:false, code}` (reuse `AI_CREDITS_EXHAUSTED_MESSAGE`, `MODEL_FAILED`, etc.).
- **UI**: new `repair_proposal` chat message kind + a `RepairProposalBody`
  presentational component (sibling to `DiagnosisExplanationBody`); a "Suggest a
  fix" button on the gated diagnosis bubble; an immutable "suggestion only" notice;
  per-diagnosis suggested-state to block re-charge. No Apply control.

---

## 8. Tests required (Q10 — what the impl slices must prove)

**Service / projector (1b):**
- No-leak: `planWorkflowRepair` sends ONLY `buildDiagnosisExplainContext(dto)`;
  assert the captured model prompt contains no node id / workflow id / token /
  config / account label / planted raw field.
- Output Zod-revalidation rejects oversized/malformed model output → `PARSE_FAILED`.
- Model failure → `MODEL_FAILED` (no throw); result is safe.
- The proposal/system prompt forbids "applied/changed/ran" — assert the system
  prompt text + that a well-formed proposal never sets a notApplied-contradicting
  claim (schema-level: `notAppliedNotice` always present).

**Route (1b):**
- Re-derives the diagnosis server-side (ignores any client-posted DTO).
- Non-member / missing / cross-account → **404 before** the model (no gate, no model).
- Access wall (`NOT_FOUND`/`NO_ACCESS`) → returns safe DTO, **no** gate/model.
- OpenAI not configured → 503 **before** charging.
- Gate runs **before** the model; gate denial (flag-ON + insufficient) → 402
  `AI_CREDITS_EXHAUSTED`, no model call; frozen → 403; gate error → 503.
- Records `ai_cost_events` with `feature: "workflow_repair"` (4 credits), billed
  to the workflow-owning account; fail-open (telemetry failure never breaks the
  response).
- Response never claims changes were applied/saved/run; carries only proposal fields.
- Import boundary: route + service import **no** `@/services/**`-MCP / `scripts/mcp`
  path beyond the diagnostics services; **no Hermes**.

**UI (1c):**
- "Suggest a fix" shows ONLY on the latest diagnosis with real issues
  (`canExplainDiagnosis` true); hidden on clean/ready and access walls.
- Not auto-called; explicit click only; calls `planWorkflowRepair(workflowId)` once.
- Renders proposal fields + the immutable "suggestion only / not changed" notice.
- Credit-exhausted / model-failure render safe copy (reuse shared messages).
- No-leak: the bubble renders no ids / model metadata / codes.
- No backend mutation, no workflow save, no graph-slice change is triggered by the
  flow (assert the graph store is untouched).

---

## 9. Implementation slice breakdown (Q13)

Recommended split (each small, `v2-main`-direct after checks, per current operating rule):

- **AI-REPAIR-1a — this doc (planning only).** No code. ← *this slice*
- **AI-REPAIR-1b — route + service + client + tests, NO UI.**
  `services/ai/repair/planWorkflowRepair.ts`, `app/api/workflows/[id]/ai/repair/plan/route.ts`,
  `lib/api/ai.ts` client, `RepairProposal` types, and all service/route tests
  above. Shippable and testable with zero user-visible surface. **No flag needed**
  (no UI entry point yet; the route is inert until 1c wires a button). Reuses
  `workflow_repair` credits; enforcement stays OFF.
- **AI-REPAIR-1c — Builder UI.** `repair_proposal` message kind + `RepairProposalBody`,
  the gated "Suggest a fix" button, wiring in `BuilderAiPanel.tsx` + message list,
  immutable notice, suggested-state. UI tests above.

(Refinement over the suggested 1a/1b/1c: keep the **client** in 1b with the route
so the route is end-to-end testable via the typed client before any UI exists.)

Later (separate arc): **AI-REPAIR-2** — model→`WorkflowPatch` over the existing
`validateWorkflowPatch`/`applyPatchToDefinition`, preview, and a gated apply.

---

## 10. Risks / open questions

- **R-1 (Q11 — Hermes?): No.** This is a single request → single structured model
  call → response, identical in shape to "Explain with AI". No multi-step loop,
  tool orchestration, or memory. Hermes stays deferred until those are genuinely
  needed (AI-REPAIR-2's validate→preview→apply is still deterministic server code,
  not an agent loop). **Recommendation: do not introduce Hermes.**
- **R-2 (Q12 — repair planning before generic Q&A?): Yes, do repair first.** Repair
  planning is directly actionable on a concrete, already-surfaced problem (the
  diagnosis), reuses the entire diagnose/explain pipeline and the `workflow_repair`
  credit mapping, and is the natural on-ramp to AI-REPAIR-2 (auto-fix) — the
  highest-value AI capability after diagnosis. Generic Q&A is broader, vaguer,
  harder to scope/no-leak, and less tied to a user's immediate blocked state.
  **Recommendation: AI-REPAIR before Q&A.**
- **R-3 (safe node labels):** `affectedNodes` should be human labels (e.g. "Gmail —
  Send Email"), not ids. The projector currently strips node ids entirely and does
  not include a per-node display label. Options: (a) let the model phrase labels
  from `finding.providerName` + `finding.title` it already sees (no projector
  change — **recommended for 1b**); (b) add a `nodeLabel` (provider + action title,
  no id/config) to a `buildRepairContext` extension if (a) proves too vague.
  **Recommendation: start with (a); revisit in 1c if labels read poorly.**
- **R-4 (advisory risk):** the model's `riskLevel` is advisory and must be labeled
  as such in the UI; it must NOT gate or enable anything (no apply exists). The
  authoritative risk model is the deterministic `validateWorkflowPatch` recompute,
  reserved for AI-REPAIR-2. **Recommendation: render as "AI's estimate"; never act on it.**
- **R-5 (ledger writes from shared project):** recording writes to live
  `ai_cost_events` even in dev/preview (shared project). Existing behavior for
  explanation; mitigated in tests by mocked model clients + mocked recorders.
- **R-6 (two paid buttons on one bubble):** Explain (1) and Suggest-a-fix (4) both
  appear on an issue diagnosis. Acceptable; they're distinct value. If clutter, 1c
  can group them. **Recommendation: ship both; revisit layout only if needed.**

---

## 11. Acceptance criteria

**This planning slice (AI-REPAIR-1a):**
- This doc exists under `docs/slices/phase-4/`, grounded in real files (citations above).
- No source / tests / migrations / UI / schema changed. Nothing pushed; docs-only local commit.

**The implementation must later meet (1b/1c):**
- Route mirrors the explain route's authz → re-derive → access-wall → configured →
  gate → model → record → response ordering; 404-before-model; gate-before-model.
- Model sees only `buildDiagnosisExplainContext(dto)`; response is proposal-only,
  no ids/secrets; output never claims applied/saved/run.
- Credits via existing `workflow_repair` (4), billed to the workflow-owning account;
  enforcement OFF; no migration.
- UI shows "Suggest a fix" only on the latest issue diagnosis (reuse `canExplainDiagnosis`);
  hidden on clean/ready + access walls; no Apply control; immutable "not changed" notice.
- No graph mutation, no save, no run, no MCP path, no Hermes, no memory write.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, or UI were written. No route/service/client
added. No DB push, no migration, no flag enablement, no Hermes, no MCP path, no
deploy, no feature branch, no PR. Repair/apply/mutation explicitly out of scope.
The only artifact is this planning doc.

---

## 13. Recommended next step

**AI-REPAIR-1b** — implement `services/ai/repair/planWorkflowRepair.ts` +
`POST /api/workflows/[id]/ai/repair/plan` + the `lib/api/ai.ts` client +
`RepairProposal` types, with the full service/route test suite (§8). No UI, no
flag, reuse `workflow_repair` credits, enforcement OFF. Ship to `v2-main` after
checks once approved.
