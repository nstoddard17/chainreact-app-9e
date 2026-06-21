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

## What this slice shipped (ChainReact side)

| Piece | File |
|---|---|
| Server-only gateway config reader (flag + url + token + timeout; null when off/unconfigured) | [`services/ai-guidance/gateway/gatewayConfig.ts`](../../../services/ai-guidance/gateway/gatewayConfig.ts) |
| Safe prompt builder (from de-identified DTO + scrubbed goal text) | [`services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts`](../../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) |
| Server-only gateway client + `WorkflowGuidanceProvider` impl (advisory; fail-closed) | [`services/ai-guidance/gateway/hermesAgentGatewayClient.ts`](../../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts) |
| Gateway barrel + `resolveServerGuidanceProvider()` (gateway-when-enabled, else noop) | [`services/ai-guidance/gateway/index.ts`](../../../services/ai-guidance/gateway/index.ts) |

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

1. **HERMES-AGENT-RESPONSE-CONTRACT** — now that the gateway success shape is confirmed live
   (`{ ok, response: { choices:[{ message:{ content } }], usage } }`), tighten the response schema
   (Zod) + structured plan extraction behind `validateWorkflowPlan`.
2. **HERMES-AGENT-CAPABILITY** — expose guidance through a scope-validated, audited server boundary
   (React Agent advisory capability), still no direct mutation; ChainReact validates every plan.
