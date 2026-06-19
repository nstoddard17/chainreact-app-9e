# REACT-AGENT-HERMES-ARCHITECTURE-CORRECTION-1 — React Agent + MCP + Hermes split

**Type:** Architecture correction / direction-setting (docs-only). **No source, tests,
migrations, UI, or env changes. Nothing pushed, nothing deployed.**
**Date:** 2026-06-19
**Branch:** `v2-main`

**Supersedes the *conclusion* (not the audit) of:**
[hermes-hosting-plan.md](../hermes/hermes-hosting-plan.md) (`9b87fdd86`) — see §10.
**Builds on:**
[ai-credits-and-agent-runtime-plan.md](../ai-credits-and-agent-runtime-plan.md) (agent-runtime adapter, §7/§9) ·
[ai-diag-2-llm-explanation-plan.md](../ai-diag-2-llm-explanation-plan.md) (Explain) ·
[ai/ai-diag-qa-plan-1.md](./ai-diag-qa-plan-1.md) (Q&A) ·
the AI-REPAIR closeouts (suggestions + approved apply) ·
[mcp/mcp-diagnostic-suite-closeout.md](../mcp/mcp-diagnostic-suite-closeout.md) (MCP adapter).

---

## 0. Why this doc exists

Marcus clarified the intended AI direction. The previous hosting plan over-redirected
toward **MCP hosting** as the answer to "Hermes," which is wrong as a *product* direction.
This doc records the corrected three-layer split and the boundaries each layer must keep.
The product path is **React Agent first**; **Hermes later** as a scoped runtime/memory
layer; **MCP** is adapter infrastructure on the side — never the product brain.

---

## 1. Corrected terminology (the three layers + the tool layer)

| Term | What it is | What it is NOT |
|---|---|---|
| **React Agent** | The **in-app, customer-facing assistant** inside the workflow builder. The product AI surface users talk to. Orchestrates intent → internal ChainReact tools/services → safe results, scoped to one user/account/workflow/conversation. | NOT the MCP server. NOT a global chatbot brain. NOT a runtime that workflow execution depends on. |
| **MCP** | An **external / diagnostic adapter** that exposes a curated, read-only slice of capabilities to *external dev tools* (ChatGPT Developer Mode, Claude, Codex) and internal engineers. | NOT a dependency of the in-app React Agent. NOT the product path. NOT a public product surface. The in-app agent does **not** call MCP. |
| **Hermes** | A **later, scoped runtime + memory layer** for the React Agent — bounded orchestration + per-scope memory/context. Introduced behind the existing `AgentRuntimeAdapter` port. | NOT a giant shared chatbot brain. NOT global memory. NOT cross-account retrieval. NOT a prerequisite for shipping React Agent features. |
| **ChainReact services / tool layer** | `services/*` (diagnostics, workflows, execution, billing, integrations) — the **source of truth**. The React Agent (and, as an adapter, MCP) reach capabilities *through* these. | NOT bypassable by the agent. The agent never invents facts or reads the DB directly. |

**One-line model:** *React Agent orchestrates → ChainReact services do the work and own the
truth → MCP re-exposes the same safe capabilities to external tools → Hermes (later) adds
scoped runtime/memory under the agent.*

---

## 2. Responsibilities per layer

- **React Agent (product):** receive a scoped user request; choose deterministic checks
  first; call internal tools/services; gate paid model calls on credits; return safe,
  explained results; propose (never auto-apply) workflow changes; record audit events.
- **ChainReact services / tool layer:** all reads/writes, authz, account-scoping,
  credential provenance, sanitization, and derivation. Emit `ai_cost_event`s and audit
  records. The single source of truth.
- **MCP (adapter):** translate the *same* underlying service capabilities into the MCP
  protocol for external dev tools; stay read-only/curated; redact + size-cap at egress.
  Independent of the React Agent's lifecycle.
- **Hermes (later runtime/memory):** orchestrate multi-step agent flows and hold
  **per-scope** memory/context **as an aid**, while ChainReact services remain the truth.
  Sits behind `AgentRuntimeAdapter` so swapping `OpenAiDirectRuntime` → `HermesRuntime`
  changes nothing in the billing/audit model.

---

## 3. What each layer MUST NOT do

**Global / cross-cutting (all AI layers):**
- No **global memory**; no **cross-account retrieval**; no **autonomous workflow mutations**.
- **Safe DTOs only** — no secrets, tokens, raw provider data/payloads, or raw configs leave
  a layer. Enums/counts/ids/field-names/public scope-gap names only.
- **Cheap model first; escalate only when needed.** Credit-gated **before** the model call.
- **Workflow execution NEVER depends on AI** — AI is optional to core execution.

**React Agent specifically:** must not read the DB directly, must not call MCP, must not
apply a workflow change without explicit approval, must not exceed the account's credit/usage
caps, must not act outside the current user/account/workflow/conversation scope.

**MCP specifically:** must not become a product dependency or a public product surface; must
not gain workflow-mutation, secrets, service-role, or arbitrary file/shell reach (its Stage-1
security contract stands).

**Hermes specifically:** must not become a shared brain, must not retain cross-account
memory, must not become the source of truth (facts always re-derived from services), must
not be required to ship earlier React Agent features.

---

## 4. Data / scope boundaries

- AI is scoped by **user → account → workflow → conversation**. Every tool call and memory
  read carries that scope; nothing crosses it.
- **Account is the ownership spine** (V2 model): workflows/integrations/runs/billing are
  account-scoped. AI reads honor account membership + credential provenance walls already
  enforced in `services/diagnostics/*` (non-member / non-creator → access wall, no row).
- **No cross-account retrieval, ever.** Memory (Hermes) is partitioned per scope.
- Personal-provider credentials are never surfaced to co-members (existing credential-sharing
  baseline holds; AI does not relax it).

---

## 5. Permission / audit / billing requirements

- **Permissioned:** every AI tool call is authorized by the same service-layer walls as the
  rest of the app (account membership, run/edit permission, provider provenance).
- **Audited:** emit an audit event for **tool calls, memory reads, proposed patches,
  approvals, and model cost**. (Audit event model = a follow-up slice; see §11.)
- **Credit-gated:** AI usage bills the **workflow-owning account** AI-credit pool, gated
  **before** the paid model call (existing `aiCreditGate`). Deterministic checks stay
  **0-credit / ungated**. Usage caps by **account / plan**.
- **Deterministic-first:** prefer `services/diagnostics/*` deterministic checks; only reach
  for a model when determinism can't answer.

---

## 6. Queue / long-job rules

- **Long jobs go through `agent_jobs` / queue / worker — never a long request/response
  loop.** Synchronous routes stay single-call and bounded (the current Explain/Q&A/repair
  shape). Any multi-step or long-running agent flow is enqueued and processed by a worker;
  the UI polls job status. (The `agent_jobs` model is a future slice; not built today.)
- This keeps serverless request budgets intact and makes long agent work observable +
  cancelable.

---

## 7. Workflow mutation approval model

- **Approval-based for workflow changes.** The agent **proposes** a patch (preview); the
  user **explicitly approves** before anything is written. This matches the shipped
  AI-REPAIR posture: deterministic Preview → explicit Apply, **draft-only**, never
  runs/activates/registers triggers, never mutates credentials/integrations.
- **No autonomous mutation.** There is no path where the agent edits, saves, runs, or
  activates a workflow without an explicit human approval step.

---

## 8. Relationship to existing Builder AI work (already shipped)

This correction **does not discard** the AI work already shipped — it names it as the
foundation the React Agent orchestrates over:

| Capability | Status | Role under the corrected model |
|---|---|---|
| **Deterministic diagnostics** ("Check workflow") | shipped, 0-credit/ungated | The deterministic-first base; React Agent calls this before any model. |
| **Explain with AI** (AI-DIAG-2) | shipped, gated, safe DTO | Single-call explanation; the agent's "explain" capability. |
| **Q&A over diagnosis** (AI-DIAG-QA) | shipped, read-only, gated | The agent's read-only question path; never a patch. |
| **Repair suggestions** (AI-REPAIR-1/2 + coverage) | shipped, deterministic preview | The agent's "propose a fix" capability. |
| **Approved repair apply** (AI-REPAIR-3) | shipped, explicit Apply, draft-only | The agent's approval-gated write path. |
| **Builder AI panel** (one composer + AUTOROUTE) | shipped in prod | The current UI surface the React Agent grows from. |

The React Agent is the **orchestration boundary** over these existing tools — not a rewrite.

---

## 9. Updated build roadmap (the product order)

1. **Deterministic diagnostics** — ✅ shipped.
2. **Safe Explain with AI** — ✅ shipped.
3. **Q&A over diagnosis** — ✅ shipped.
4. **Repair suggestions** — ✅ shipped (4 deterministic categories).
5. **Approved repair apply** — ✅ shipped (explicit, draft-only).
6. **Hermes runtime / memory layer** — ⏳ later, scoped, behind `AgentRuntimeAdapter`, after
   the React Agent service boundary + audit + queue models land (§11).

Build order is **deterministic → explain → Q&A → suggest → approved-apply → Hermes**. MCP
adapter work runs on a **separate track** and is never a blocker for the above.

---

## 10. Explicit correction to HERMES-HOSTING-PLAN-1

- ✅ **The repo audit was useful and stands.** The inventory of the MCP server, its
  transports, and security contract is accurate and worth keeping.
- ✅ **"Hermes does not exist yet" is true.** No `AgentRuntimeAdapter` / `HermesRuntime`
  code exists today.
- ⚠️ **Correction:** the prior plan's *conclusion* — treating **MCP hosting** as the main
  answer to "hosting Hermes" — **over-redirected**. Marcus **does** intend to start the
  **product AI / Hermes direction** (React Agent first, Hermes later).
- ➡️ **Therefore:** **do NOT treat MCP hosting as the main product path.** MCP hosting is a
  **separate adapter track** (external dev-tool access), useful but secondary. The main path
  is the React Agent product line above. The hosting plan's Track B (local/ephemeral MCP for
  ChatGPT) remains valid **as adapter infrastructure only**, not as "the Hermes plan."

This doc is the current source of truth for AI architecture direction; the hosting plan is
demoted to "MCP adapter hosting notes."

---

## 11. Next implementation slices (ordered; each its own bounded arc)

> All are future slices — **nothing is built in this doc.** Risky/public behavior ships
> default-OFF behind flags. Migrations (if any) are dev-DB-applied per posture, not pushed.

- **CS-1 — React Agent service boundary / interface.** Define the in-app agent's orchestration
  interface over existing `services/*` tools (no new model behavior); the seam the Builder AI
  panel calls. Pure boundary + types first.
- **CS-2 — Account-scoped conversation model (only if schema is needed later).** A
  `conversations` / messages model scoped by account + workflow; account-owned, RLS +
  explicit GRANTs, safe DTOs. Migration dev-DB-only; not pushed.
- **CS-3 — Safe internal tool registry over ChainReact services.** A typed, permissioned,
  audited registry the agent calls (deterministic checks, Explain, Q&A, repair preview/apply)
  — the in-app analogue of MCP's registry, but service-direct (not MCP).
- **CS-4 — Audit event model.** Persist audit records for tool calls, memory reads, proposed
  patches, approvals, and model cost. Account-scoped, no-leak DTOs.
- **CS-5 — Queued agent job model (`agent_jobs` / worker).** Move any long/multi-step agent
  flow off the request/response path onto a queue + worker with status polling + cancel.
- **CS-6 — Hermes scoped memory layer (later).** Per-scope memory/runtime behind
  `AgentRuntimeAdapter`, gated by the agent-runtime plan §9 preconditions; ChainReact
  services stay the source of truth.

**MCP adapter track (parallel, separate):** keep the existing MCP server as external
dev-tool infrastructure; close its named hardening follow-ups per the hosting plan's CS-1..4
**without** coupling it to the product agent.

---

## 12. Open decisions for Marcus

- **OQ-1 — Start point:** begin at **CS-1 (React Agent service boundary)** as the next build
  slice? *Recommended* — it's a low-risk interface/seam that everything else hangs off.
- **OQ-2 — Conversation persistence:** do we need a persisted account-scoped conversation
  model now (CS-2), or keep conversations client/session-local until Hermes? *Recommendation:*
  defer persistence until CS-1 + audit (CS-4) shape the need.
- **OQ-3 — Audit sink:** new `ai_audit_events` table vs. extending the existing
  `ai_cost_events` telemetry? *Recommendation:* separate audit table (different retention +
  shape), decided at CS-4.
- **OQ-4 — Hermes timing:** confirm Hermes (CS-6) stays gated behind CS-1..5 + the
  agent-runtime §9 preconditions (cost coverage, etc.). *Recommendation:* yes — no Hermes
  before the boundary/audit/queue land.
- **OQ-5 — MCP track ownership:** keep MCP hardening as a clearly-separate, lower-priority
  track so it never blocks the product line? *Recommendation:* yes.

## 13. Acceptance criteria (this planning slice)

Doc exists at the path below; corrected terminology + boundaries + roadmap recorded; explicit
correction to the hosting plan included; PROJECT_MEMORY updated with one compact bullet; **no
source/test/migration/UI/env changed; nothing pushed/deployed; no cloud/env mutations.**

## 14. Hard boundaries (what this slice did NOT do)

No code, tests, migrations, schema, UI, or env changes. No cloud resources. No deploy / push /
`db:push`. No new model behavior. Only this doc + a one-line PROJECT_MEMORY bullet were written.

## 15. Recommended next step

Confirm **OQ-1** and pick up **CS-1 (React Agent service boundary / interface)** as the next
implementation slice. Keep the MCP adapter track parallel and secondary.
