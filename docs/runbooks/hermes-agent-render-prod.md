# Runbook — Hermes Agent on Render (production topology)

**Status:** AUTHORITATIVE for Marcus's chosen path (HERMES-AGENT-PROD-CLIENT, 2026-06-20). The
real production-style infrastructure is live on Render. ChainReact (Vercel) talks ONLY to the
public Render AI Gateway — never to a model vendor, Nous, or the private Hermes Agent directly.

> The local Docker sandbox runbook ([`hermes-agent-sandbox.md`](./hermes-agent-sandbox.md)) is now
> **secondary / non-authoritative** — kept for local experiments only. This Render topology is the
> chosen direction.

## 1. Topology

```
Vercel ChainReact app
   │  POST /api/hermes-agent/guidance   (Authorization: Bearer CHAINREACT_AI_GATEWAY_TOKEN)
   ▼
Render Web Service: chainreact-ai-gateway-prod   (PUBLIC, ChainReact-owned)
   │  https://chainreact-ai-gateway-prod.onrender.com
   │  forwards to the private service (adds the internal auth header)
   ▼
Render Private Service: chainreact-hermes-agent-prod   (PRIVATE, Ohio, port 8642)
   │  http://chainreact-hermes-agent-prod:8642/v1/chat/completions   (model name: hermes-agent)
   │  persistent disk /opt/data   (skills/memory)
   ▼
Model vendor (OpenAI)   ← key lives ONLY on the private service
   ▼
Hermes Agent memory/skills → Gateway → ChainReact final validation/decision
```

ChainReact validates every returned plan via `validateWorkflowPlan` and is the only thing that can
build, change, or run a workflow. Guidance is advisory; execution never depends on the Agent.

## 2. Services

| Service | Type | Notes |
|---|---|---|
| `chainreact-ai-gateway-prod` | Render **Web** (public) | `https://chainreact-ai-gateway-prod.onrender.com`. Endpoint `POST /api/hermes-agent/guidance`. Protected by `CHAINREACT_GATEWAY_TOKEN`. The only thing Vercel calls. |
| `chainreact-hermes-agent-prod` | Render **Private** (Ohio, :8642) | The learning/skills brain. Private base `http://chainreact-hermes-agent-prod:8642/v1`. Model name `hermes-agent`. Persistent disk `/opt/data`. Holds the OpenAI key + `API_SERVER_KEY`. Not reachable from the public internet. |

## 3. Env var responsibilities — what goes WHERE

### Vercel (ChainReact) — server-only, read by `services/ai-guidance/gateway/gatewayConfig.ts`

| Var | Purpose |
|---|---|
| `HERMES_AGENT_ENABLED` | `true` to enable the gateway path. DEFAULT OFF — without it the client is inert (`PROVIDER_DISABLED`). |
| `CHAINREACT_AI_GATEWAY_URL` | `https://chainreact-ai-gateway-prod.onrender.com` |
| `CHAINREACT_AI_GATEWAY_TOKEN` | **Server-only secret.** Must match the gateway's `CHAINREACT_GATEWAY_TOKEN`. Sent as `Authorization: Bearer`. Never `NEXT_PUBLIC_`, never in the browser, never logged. |
| `HERMES_AGENT_TIMEOUT_MS` | Per-request timeout (default 30000, clamped 1s–120s). |

### Render gateway (`chainreact-ai-gateway-prod`)

| Var | Purpose |
|---|---|
| `CHAINREACT_GATEWAY_TOKEN` | Validates the inbound ChainReact `Authorization` header. |
| `API_SERVER_KEY` | The header the gateway adds when forwarding to the private Hermes Agent. |
| (private Hermes URL) | Internal address of `chainreact-hermes-agent-prod`. |

### Render private agent (`chainreact-hermes-agent-prod`)

| Var | Purpose |
|---|---|
| `OPENAI_API_KEY` | The model-vendor key. Lives ONLY here. |
| `API_SERVER_KEY` | Validates the inbound header from the gateway. |

## 4. NEVER put these in Vercel / ChainReact / the browser

- `OPENAI_API_KEY` — model-vendor key. Render private service only.
- `API_SERVER_KEY` — gateway↔agent internal auth. Render only.
- the **private** Hermes Agent URL (`http://chainreact-hermes-agent-prod:8642/...`). Render only.
- the internal Hermes token. Render only.
- the gateway token in any `NEXT_PUBLIC_` var or browser-reachable code.

ChainReact holds exactly ONE secret for this path: `CHAINREACT_AI_GATEWAY_TOKEN`. A repo test
(`hermesAgentGatewaySafety.test.ts`) fails if gateway code reads any of the Render-only secrets or
imports a direct model client.

## 5. ChainReact client (this slice — HERMES-AGENT-PROD-CLIENT)

- Config reader: [`services/ai-guidance/gateway/gatewayConfig.ts`](../../services/ai-guidance/gateway/gatewayConfig.ts) — disabled/unconfigured → `null` (safe default).
- Client: [`services/ai-guidance/gateway/hermesAgentGatewayClient.ts`](../../services/ai-guidance/gateway/hermesAgentGatewayClient.ts) — `requestHermesAgentGuidance(...)` + `createHermesAgentGatewayProvider(...)` (implements the generic `WorkflowGuidanceProvider` port). Advisory only; never mutates/runs/applies. Malformed/unsafe replies fail closed with a typed code.
- Safe prompt: [`buildGatewayGuidancePrompt.ts`](../../services/ai-guidance/gateway/buildGatewayGuidancePrompt.ts) — built from the de-identified DTO + scrubbed goal text. No tokens/keys/ids/config/Supabase rows.
- **Inert by default**: gated on `HERMES_AGENT_ENABLED`; not wired into any route/UI/React Agent.

## 6. Opt-in live smoke

[`tests/unit/services/ai-guidance/hermesAgentGateway.live.dev.test.ts`](../../tests/unit/services/ai-guidance/hermesAgentGateway.live.dev.test.ts)
— double-gated, default-SKIPPED. Calls the real gateway once.

> ⚠️ Hits the real, paid production gateway. Run deliberately, locally. CI always skips (no
> `.env.local`, switches unset).

```bash
HERMES_AGENT_ENABLED=true HERMES_AGENT_GATEWAY_SMOKE=true \
  npx jest tests/unit/services/ai-guidance/hermesAgentGateway.live.dev.test.ts
```

The test auto-loads only the gateway CONFIG (`CHAINREACT_AI_GATEWAY_URL/TOKEN`, `HERMES_AGENT_TIMEOUT_MS`)
from `.env.local`; the two opt-in switches must come from the launch env. It asserts the
ChainReact client contract (correct URL/method, token in the header only, never in the body) and is
**status-aware**: a healthy gateway (HTTP 2xx) must yield an advisory `ok` result; an erroring
gateway must map to a typed `PROVIDER_ERROR` (the client never invents guidance) and logs a loud,
secret-free warning.

### Gateway state — VERIFIED HEALTHY (2026-06-20)

The smoke now passes end-to-end: the gateway returns **HTTP 200** `{ ok: true, response: { choices:
[{ message: { content } }], usage } }` and the ChainReact client normalizes it into an advisory `ok`
guidance result (~3.5s round-trip). The full chain is healthy: inbound gateway auth → gateway→agent
auth → agent provider config → model → OpenAI → reply.

Getting here took a sequence of **Render/agent-side** config fixes (ChainReact code needed none),
each surfaced by the smoke as a distinct downstream error:
1. inbound gateway auth (`401 UNAUTHORIZED`) — token sync;
2. gateway→agent auth (`HTTP 401: Missing Authentication header`) — gateway must forward
   `API_SERVER_KEY` / the internal token to `chainreact-hermes-agent-prod`;
3. agent provider config (`Unknown provider 'openai'`) — fix the agent's model/provider name
   (`hermes doctor` / `hermes model`);
4. model feature (`HTTP 400: Encrypted content is not supported with this model`) — pick a
   compatible model / disable encrypted reasoning content.

If the smoke regresses, compare its downstream error message against this list to localize which
hop broke.
