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
| **Strict response contract** (Zod envelope schema + `normalizeGatewayResponse` → `NormalizedGatewayGuidance`: `guidanceText`/`source`/`workflowPlan:null`/`rawUsage?`/`warnings?`) — HERMES-AGENT-RESPONSE-CONTRACT | [`services/ai-guidance/gateway/gatewayResponseContract.ts`](../../../services/ai-guidance/gateway/gatewayResponseContract.ts) |
| Gateway barrel + `resolveServerGuidanceProvider()` (gateway-when-enabled, else noop) | [`services/ai-guidance/gateway/index.ts`](../../../services/ai-guidance/gateway/index.ts) |
| **React Agent capability** `workflow_guidance_intake` (read-only, audited, gated; runs through `runAuthorizedCapability`) — HERMES-AGENT-CAPABILITY | [`services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`](../../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts) + registry [`capabilities.ts`](../../../services/ai/reactAgent/capabilities.ts) |
| **Gated route** `POST /api/accounts/[id]/ai/workflow-guidance` (auth + membership + freeze + `aiCreditGate` feature `workflow_guidance` + persistent audit recorder + config gating) — HERMES-AGENT-CAPABILITY-ROUTE | [`app/api/accounts/[id]/ai/workflow-guidance/route.ts`](../../../app/api/accounts/[id]/ai/workflow-guidance/route.ts) |
| **UI entry point** "Build with me" advisory panel (workflows dashboard; server-gated on `HERMES_AGENT_ENABLED`; calls only the route via the client helper) — HERMES-AGENT-GUIDANCE-UI | [`features/workflows/WorkflowGuidancePanel.tsx`](../../../features/workflows/WorkflowGuidancePanel.tsx) + helper [`lib/api/ai/guidance.ts`](../../../lib/api/ai/guidance.ts) |

### End-to-end advisory path (UI → route → capability → gateway)

```
"Build with me" panel (browser, workflows page)
  → requestWorkflowGuidance() helper → POST /api/accounts/[id]/ai/workflow-guidance
    → route: auth + membership + freeze + optional-workflow-ownership + availability + aiCreditGate
      → runWorkflowGuidanceIntakeCapability → runAuthorizedCapability (audited)
        → requestHermesAgentGuidanceNormalized → Render gateway → private Hermes Agent → OpenAI
      ← NormalizedGatewayGuidance (guidanceText, advisory)
  ← { ok, guidanceText, source, workflowPlan, warnings? }  (safe; no envelope/usage/token)
panel renders guidanceText under "Guidance"
```

The browser never holds a token or calls the gateway/vendor directly; the route is the only boundary
it touches. Nothing on this path creates, changes, or runs a workflow.

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
5. **HERMES-AGENT-PLAN-EXTRACTION** — when the agent starts returning structured plans, parse the
   plan from `guidanceText`/a plan object and gate it through `validateWorkflowPlan` before it is
   ever surfaced as usable (still advisory, still no mutation).
6. **HERMES-AGENT-GUIDANCE-UI-BUILDER** (optional) — a second entry inside the builder rail that
   passes the in-context `workflowId` (the helper + route already support it).
