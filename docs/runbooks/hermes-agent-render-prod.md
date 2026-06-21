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

#### Working model-provider config (Hermes Agent) — VERIFIED 2026-06-20

OpenAI is the model provider **underneath** the Hermes Agent (the agent is the brain; ChainReact
never calls OpenAI directly). On the Hermes Agent it is wired as a **custom OpenAI-compatible
provider**, NOT the built-in provider name `openai`:

| Setting | Working value |
|---|---|
| Provider name | **`openai-api`** (custom OpenAI-compatible provider — NOT `openai`) |
| Base URL | `https://api.openai.com/v1` |
| Model | the model currently configured on the Hermes Agent service (the gateway exposes it to ChainReact as model `hermes-agent`) |

**Gotchas that were resolved (do not regress):**
- The literal provider name **`openai`** failed with `Unknown provider 'openai'` — use the custom
  provider **`openai-api`** with the base URL above.
- **`gpt-4o-mini` failed** with `HTTP 400: Encrypted content is not supported with this model.` —
  the Hermes Agent sent **encrypted reasoning content** that model rejects. Use a model that
  supports it (the currently-configured working model), or disable encrypted reasoning content.
- Any **OpenRouter / Nous** provider warnings were from the **old/default** provider config and are
  **no longer the intended path** — the intended path is `openai-api` → `https://api.openai.com/v1`.
  Direct Nous Portal / model API is not used anywhere.

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

### Response contract (HERMES-AGENT-RESPONSE-CONTRACT)

[`services/ai-guidance/gateway/gatewayResponseContract.ts`](../../services/ai-guidance/gateway/gatewayResponseContract.ts)
validates the gateway reply with Zod and normalizes it. The **known success envelope** is:

```json
{ "ok": true, "response": { "choices": [ { "message": { "content": "..." } } ], "usage": { } } }
```

`normalizeGatewayResponse(raw)` (and `requestHermesAgentGuidanceNormalized(...)`) returns the
advisory **`NormalizedGatewayGuidance`**:

| Field | Meaning |
|---|---|
| `ok: true` | success |
| `guidanceText: string` | trimmed `response.choices[0].message.content` (the advisory text) |
| `source: "hermes-agent"` | fixed origin tag |
| `workflowPlan: WorkflowPlan \| null` | a capability-validated advisory plan, or null. Surfaced ONLY if a structured plan passes `validateWorkflowPlan` (every step's `provider:type` must exist in the discovery registry). Arbitrary JSON/prose is never accepted. Always `notApplied: true`. |
| `rawUsage?` | sanitized `{ promptTokens?, completionTokens?, totalTokens? }` — numeric counts only, **not trusted for billing** |
| `warnings?: string[]` | e.g. `multiple_choices_truncated`, or `Suggested plan could not be validated.` (an embedded plan was found but failed capability validation) |

**Plan extraction (HERMES-AGENT-PLAN-EXTRACTION).** The Hermes Agent is prompted (see
`buildGatewayGuidancePrompt.ts` → `RESPONSE_FORMAT_INSTRUCTIONS`) to answer in normal language and
OPTIONALLY append ONE structured plan as a fenced ` ```json ` block, using only catalog
`provider:type` keys, omitting the block when detail is thin, and never claiming it changed anything.
`extractPlanFromText` (deterministic, model-free, never throws) pulls the first **shape-valid** plan
out of the fenced block(s) (or a bare JSON-only reply); the normalizer then capability-validates it:

| Embedded content | Result |
|---|---|
| prose only / no JSON | `workflowPlan: null` (guidance text returned as-is) |
| malformed JSON / non-plan JSON / multiple blocks | first shape-valid plan wins; junk blocks skipped → `null` if none |
| shape-valid plan, all `provider:type` known | `workflowPlan: <validated plan>`; the raw ` ```json ` block is stripped from `guidanceText` for clean display |
| shape-valid plan, hallucinated capability | `workflowPlan: null` + `warnings: ["Suggested plan could not be validated."]`; guidance text kept |

The plan is **advisory validated plan only** — `notApplied: true`. Nothing extracts/validates/surfaces
a plan that creates, mutates, applies, runs, or persists a workflow. (An envelope-SIBLING plan object
remains supported and stays STRICT — an invalid sibling object fails the whole response closed; only
the in-text fenced path degrades gracefully.)

**Fail-closed mapping** (advisory; never mutates/executes a workflow):

| Condition | Result |
|---|---|
| malformed envelope / missing `choices` / missing `message.content` | `{ ok:false, code:"INVALID_RESPONSE" }` |
| empty / whitespace-only content | `{ ok:false, code:"INVALID_RESPONSE" }` |
| gateway `{ ok:false, error }` (even on HTTP 2xx) | `{ ok:false, code:"PROVIDER_ERROR", reason:<safe code> }` (nested downstream messages are NOT surfaced) |
| HTTP 401/403/500 / non-2xx | `{ ok:false, code:"PROVIDER_ERROR", reason:"status_<n>" }` |
| timeout / abort | `{ ok:false, code:"TIMEOUT" }` |
| transport error / non-JSON body | `{ ok:false, code:"PROVIDER_ERROR" / "INVALID_RESPONSE" }` |

Unknown extra fields in the envelope are allowed but ignored (never copied into the normalized
output). `requestHermesAgentGuidance(...)` keeps returning the neutral `GuidanceResult` port shape as
a thin adapter over the normalized result.

### React Agent capability — `workflow_guidance_intake` (HERMES-AGENT-CAPABILITY)

The advisory guidance is exposed through the existing React Agent governance allow-list:

- Registry: [`services/ai/reactAgent/capabilities.ts`](../../services/ai/reactAgent/capabilities.ts) —
  `workflow_guidance_intake`, `mode: read_only`, intent `request_workflow_guidance`,
  `auditKind: react_agent.workflow_guidance_intake`. **Excluded** from the free-text recognized intent
  set (runs only through the explicit server seam, never the user-facing `handle()` text path).
- Runner (server-only): [`services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts`](../../services/ai/reactAgent/capabilities/workflowGuidanceIntake.ts)
  — `runWorkflowGuidanceIntakeCapability(input, deps)`. Builds the safe DTO (sanitizer) → runs
  `runAuthorizedCapability` → calls `requestHermesAgentGuidanceNormalized`. **Read-only / advisory:
  never creates / updates / applies / runs / deletes a workflow.** Lives in the `capabilities/`
  submodule (not a top-level boundary file) so the React Agent core stays import-fenced.
- **Gating:** `HERMES_AGENT_ENABLED` (default OFF) + gateway config. Disabled/unconfigured → a typed
  unavailable result with **no network call**.
- **Audit:** when a route injects the persistent recorder, exactly one `react_agent_audit_events` row
  is emitted (success / failed / denied) with safe metadata only — scope ids + registry enums, **no
  prompt / goal text / guidance text / token**.

### Route — `POST /api/accounts/[id]/ai/workflow-guidance` (HERMES-AGENT-CAPABILITY-ROUTE)

The gated server boundary that invokes the capability. Source:
[`app/api/accounts/[id]/ai/workflow-guidance/route.ts`](../../app/api/accounts/[id]/ai/workflow-guidance/route.ts).
Gate order (nothing charges/runs before its guard passes):

1. **auth + account membership + freeze** — `requireUserWithAccount(id)` (401 / 403). `accountId` is
   the validated URL param, **never** trusted from the body (`.strict()` body rejects a client `accountId`).
2. **body** — `{ goalText (required, ≤2000), workflowId? }` → 400.
3. **optional `workflowId`** — must belong to **this** account + caller is a member, else no-leak 404.
   The workflow's saved draft is passed as the optional safe context (sanitized by the runner).
4. **Hermes availability** (`HERMES_AGENT_ENABLED` + gateway config) **before any charge** → 503
   `GUIDANCE_UNAVAILABLE` when disabled/unconfigured (no credit charge, no network).
5. **`aiCreditGate`** (feature **`workflow_guidance`**, fast tier) → 402 `AI_CREDITS_EXHAUSTED` /
   403 `ACCOUNT_PENDING_DELETION` / 503 `AI_GATE_ERROR`.
6. **capability runner** through `runAuthorizedCapability`, injecting the persistent audit recorder.

Response: normalized advisory fields **only** — `{ ok, guidanceText, source, workflowPlan, warnings? }`.
Never the raw provider envelope, raw usage, prompt, gateway token, ids, or secrets. Provider/transport
failures map to 503 `GUIDANCE_UNAVAILABLE`.

- **Billing GAP CLOSED:** the capability's `creditFeature` is now **`workflow_guidance`** (base 1
  credit, fast tier — same class as `workflow_qa`), and the route charges `aiCreditGate({feature:
  "workflow_guidance"})`. The registry metadata and the route's charged feature are kept in lockstep
  by test. Note `aiCreditGate` only deducts when `ENABLE_AI_CREDIT_ENFORCEMENT=true` (default OFF →
  no-op), matching every other AI route.
- **No `ai_cost_events` telemetry row** is written: ChainReact makes **no direct model call** here
  (the Hermes Agent does), so there is nothing to attribute and **no migration** is required. Usage
  reconciliation is a future slice.

### UI entry point — "Build with me" (HERMES-AGENT-GUIDANCE-UI / -UI-BUILDER)

The user-facing surface: a small advisory panel on the workflows dashboard
([`app/workflows/page.tsx`](../../app/workflows/page.tsx) → [`features/workflows/WorkflowGuidancePanel.tsx`](../../features/workflows/WorkflowGuidancePanel.tsx)),
and a second collapsed "Build with me" entry inside the builder
([`features/workflow-builder/panels/BuilderGuidanceEntry.tsx`](../../features/workflow-builder/panels/BuilderGuidanceEntry.tsx) reuses the same panel, passing the in-context `workflowId`).
The user types a vague automation goal, submits, and sees Hermes Agent guidance / clarifying
questions. **Advisory only — it never creates / changes / runs a workflow.**

- **Suggested plan (HERMES-AGENT-PLAN-EXTRACTION).** When the route returns a capability-validated
  `workflowPlan`, the panel renders a small **review-only** "Suggested plan" section under the
  guidance: title/summary + a numbered list of `role` · `provider:type` · purpose, with the copy
  *"Review only — this has not changed your workflow."* There is **no Create / Apply / Add-nodes /
  Run control** in this slice — surfacing a plan never mutates a workflow. A `null` plan renders
  nothing; `guidanceText` stays the primary output.

- The panel is **server-gated on `HERMES_AGENT_ENABLED`** — when the flag is OFF (default) the page
  does **not render the panel at all** (no dead box). The `accountId` is the page's resolved active
  account, passed as a prop — never client-supplied.
- The browser calls **only** the ChainReact route via the `requestWorkflowGuidance` client helper
  ([`lib/api/ai/guidance.ts`](../../lib/api/ai/guidance.ts)) — never the Render gateway, a model
  vendor, Nous, or the private Hermes Agent, and it never holds a token (a static test enforces this).
- Failures map to safe copy ("AI workflow guidance is temporarily unavailable.") — no internal error,
  provider status, raw envelope, or usage is shown.
- **Operational note:** enabling `HERMES_AGENT_ENABLED` (+ gateway config) in an environment makes
  this panel appear on the workflows page for that environment's users. The credit gate
  (`workflow_guidance`) only deducts when `ENABLE_AI_CREDIT_ENFORCEMENT=true`.

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
