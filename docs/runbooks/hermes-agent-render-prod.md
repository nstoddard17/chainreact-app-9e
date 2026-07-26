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
| `HERMES_AGENT_TIMEOUT_MS` | Per-request gateway timeout **for the whole logical call** (both bounded attempts + the retry backoff share it). **Default 45000, clamped 1s–55s** (REACT-AGENT-PRODUCTION-TIMEOUT-1 — was 30000/120s). Optional: leave it UNSET and the code default applies. The clamp ceiling deliberately sits below the routes' `maxDuration = 60`, so the client's own abort always fires first and the user gets ChainReact's typed 503 instead of a bodyless platform 504. **An explicit `60000` here is clamped to `55000`** (tested). ⚠️ **Name collision:** Render also has a variable called `HERMES_AGENT_TIMEOUT_MS`. That one belongs to the gateway service and is read by a DIFFERENT process — ChainReact never sees it, and it cannot terminate a ChainReact request. Only the Vercel copy controls the client's abort. |

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

**Draft preview (HERMES-AGENT-DRAFT-PREVIEW).** The route adds a `previewDraft` field, derived
deterministically from the **already-validated** `workflowPlan` by
[`services/ai-guidance/preview/planToDraftPreview.ts`](../../services/ai-guidance/preview/planToDraftPreview.ts)
(`result.workflowPlan ? planToDraftPreview(...) : null`). The preview is an **ephemeral, non-applied**
`DraftPreview` ([`contracts/workflowPlanPreview.ts`](../../contracts/workflowPlanPreview.ts)) — a
DISTINCT type from the persisted `WorkflowDefinition`/`draftDefinition` so it can never be accidentally
saved/applied:

- preview-only ids (`preview-step-1`, `preview-edge-1`) — never real workflow/node/db ids;
- nodes carry capability LABELS only (provider/type from the validated plan) — no config, credentials,
  field mappings, resolved variables, secrets, or provider account ids;
- step `requiredInputs` → plain-text `warnings` + per-node `missingInputs` (field keys only), never
  executable config;
- linear sequence edges (steps are ordered; branching is never invented);
- `notice: "Preview only — your workflow has not changed."`; `notApplied: true` on the preview AND
  every node/edge; an unconvertible plan (no steps) → `null`.

Converting a plan to a preview **changes nothing** — no workflow create/mutate/apply/run, no
`draftDefinition` write, no builder-state call, no persistence. There is no apply/create/add/run path
in this slice. `previewDraft` is `null` whenever `workflowPlan` is `null` (never derived from an
unvalidated plan).

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

### AI context / memory scope (HERMES-AGENT-MEMORY-SCOPE-GUARD)

**A team/shared account does NOT mean shared private AI memory.** Guidance is **request-scoped** —
there is no durable Hermes/ChainReact AI memory store, and the guidance/session/audit tables are NOT a
memory source. `services/ai-guidance/guidanceContextPolicy.ts` (`buildSafeGuidanceContext`) is the
deterministic guard for what context a request may carry:

- **Allowed:** account type/role summary; account-SHARED connection availability (personal providers
  filtered out); the caller's OWN connection availability; the route-authorized workflow's safe shape;
  the capability registry; generic product patterns.
- **Blocked (never representable in the output):** other members' private AI memory / preferences /
  connections / credentials / prior prompts; OAuth/refresh tokens, secrets, sensitive provider account
  ids; raw emails/messages/files; raw Supabase rows; service-role data; full audit payloads; the
  caller's own userId / account id / email / name (identity stays server-side for auth+audit).
- When a workflow uses a personal connection owned by **another member**, guidance gets only a generic
  notice (no owner identity/credential). The route gathers raw inputs (account type via
  `accounts.getById`, workflow `createdByUserId` for the own-vs-foreign comparison only) and the
  capability runner builds the safe context via the policy. **No env/operational change.**

**Provider availability (HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT).** The account-shared + own
connection availability is now sourced LIVE from active integrations via
`services/integrations/guidanceCredentialAvailability.ts`, which reduces rows to provider KEYS (+
registry display names) under credential-sharing semantics:

- **account-class** providers (slack/notion/stripe/shopify/hubspot/mailchimp) → summarized as
  account-shared.
- **personal-class** providers connected by the **current user** → summarized as their own.
- **another member's** personal connection → EXCLUDED (no key, no identity).
- NEVER any token/secret, provider account id, integration id, owner user id/email/name, account id,
  scopes, sharing scope, or the integration row's `displayName` (only the registry name like "Gmail").
- The source uses `listActiveByAccount` (service-role) but the route has already authorized the user
  and the output is fully sanitized; it **degrades to empty** on any read error (guidance still runs,
  just without credential context). The prompt instruction: "Only suggest using connections listed as
  available in this request, or ask the user to connect or share the provider first." Enforcement is
  in code (the source + the guard re-sanitize), not the prompt. Conservative limit: explicitly-shared
  personal connections are not yet summarized as account-shared.

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
- **Draft preview (HERMES-AGENT-DRAFT-PREVIEW).** When the route returns a `previewDraft`, the panel
  renders a **preview-only** "Draft preview" section instead of the text "Suggested plan" (the
  preview supersedes it to avoid duplication): title/summary + numbered nodes (`role` · `label` ·
  purpose, with "Still needs: …" for missing field keys) + a "Flow: a → b → c" line from the preview
  edges, under the copy *"Preview only — your workflow has not changed."* Still **no Create / Apply /
  Add-nodes / Use-this / Run control**. The preview is ephemeral/in-memory only — it never touches
  builder canvas state, the graph store, `draftDefinition`, save/dirty state, or any persistence.
- **Builder canvas overlay (HERMES-AGENT-BUILDER-PREVIEW-OVERLAY).** In the builder, the panel adds a
  builder-only "Show on canvas" control that renders the `DraftPreview` as a SEPARATE ghost overlay
  layer over the canvas (shimmered/dashed "Suggested" nodes + dashed edges + the same "Preview only…"
  notice + a "Discard preview" control). This is **purely visual client UI** (`WorkflowBuilder`
  React state): it never merges into the real React Flow graph, never writes `draftDefinition`, never
  marks the workflow dirty, never autosaves, and makes no network call. Discard clears the overlay
  state only (no rollback — nothing was mutated). **No operational/env/route change** — `previewDraft`
  already shipped in the route response (HERMES-AGENT-DRAFT-PREVIEW); this slice only renders it.
- **Apply preview (HERMES-AGENT-APPLY-PREVIEW-PATCH).** The builder overlay's "Apply preview" button
  is the FIRST mutation path. It converts the capability-VALIDATED `WorkflowPlan` (not the display
  preview) into a deterministic ADDITIVE patch (`planToBuilderPatch`) and applies it to the LOCAL
  builder draft via `graphSlice.applyAdditivePatch` — appending nodes (real ids, EMPTY config so
  required fields show "needs setup") + linear edges, marking the draft dirty exactly like manual
  edits. **Additive only:** no delete/replace/update-config/replace-trigger/branch-rewrite; a proposed
  trigger is skipped when one already exists. It does NOT save/activate/run, does NOT create a separate
  workflow, and makes NO network/route/gateway call — the user still reviews fields and saves via
  existing builder flows. **No operational/env/route change.** (Dashboard preview stays review-only —
  no Apply control there.)
- **In-place placement (HERMES-AGENT-APPLY-IN-PLACE / -INSERT-BETWEEN).** A pure planner
  (`features/workflow-builder/utils/additivePatchPlacement.ts`) decides where the chain lands:
  - **inserted_between** — the selected/active node has exactly ONE outgoing UNLABELED edge A→B → the
    chain splits it into A→new…→B (notice "Preview inserted into draft — review required fields before
    activating."). This is the ONLY edge removal/replacement performed, and only ever one edge.
  - **appended** — selected node with zero/multiple/labeled outgoing edges, else the sole chain tail →
    one new anchor edge (notice "Preview applied to draft — review required fields before activating.").
  - **blank** — empty graph → origin layout.
  - **side_chain** — ambiguous multi-tail / no anchor / trigger-first → detached chain (notice "Preview
    added as a separate draft chain because ChainReact could not safely determine where to insert it.").
  - If no safe operation applies (e.g. trigger-only into a graph that already has a trigger) → notice
    "ChainReact could not safely apply this preview." Labeled/router branches are never split (no branch
    rewrite); all existing node config + positions + all other edges are never touched.

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

### Latency case (REACT-AGENT-PRODUCTION-TIMEOUT-1)

The smoke now runs a SECOND live call (same double opt-in, so it is still one deliberate `npx jest`
invocation — but it is two paid requests). The first case sends a short prose prompt (~3.5s); the
second reproduces a builder **EDIT** turn — capability catalog + narrowed field schemas + editable
graph, ~45 KB / ~11k tokens — and prints the real round-trip:

```
[HERMES-AGENT-GATEWAY-SMOKE] EDIT-shaped latency — elapsedMs=… catalogKeys=… fieldSchemaLines=…
  defaultBudgetMs=45000 ceilingMs=55000 result=… → WITHIN BUDGET | AT RISK | OVER BUDGET
```

It measures with the CEILING deadline (not the configured one) so the true latency is observable
even when it exceeds the default, and it does not assert on time — gateway latency is not
deterministic enough to gate a build. `AT RISK` / `OVER BUDGET` is the signal that either the budget
or the prompt size needs another look. This is the case that would have caught the production
incident: the short-prompt smoke was green the whole time it was failing.

## 7. Troubleshooting — the panel says guidance is unavailable

The route answers 503 for several distinct situations. Since REACT-AGENT-PRODUCTION-TIMEOUT-1 they are
distinguishable without a stopwatch — check the Vercel function log first:

```
[workflow-guidance] brain call failed code=<CODE> elapsedMs=<n> editing=<bool> catalogKeys=<n> …
```

| Signal | Meaning | Where to fix |
|---|---|---|
| response `code: "GUIDANCE_TIMEOUT"`, log `code=TIMEOUT`, `elapsedMs` ≈ `HERMES_AGENT_TIMEOUT_MS` | The brain was still working when ChainReact's own deadline fired. Nothing is broken. | Raise `HERMES_AGENT_TIMEOUT_MS` (≤55s) and/or `maxDuration`; or reduce prompt size. Large `editing=true` + `catalogKeys` values in the log say why the turn was slow. |
| log `code=PROVIDER_ERROR` with a `status_*` reason | The Render gateway or the private agent failed/timed out FIRST — ChainReact never got a body. | Render side — §6 checklist. Note the gateway may impose its OWN upstream timeout; raising ChainReact's does nothing for this case. |
| log `code=INVALID_RESPONSE` | Gateway returned 2xx with a malformed/empty envelope. | Render side — agent/model config. |
| log `code=PROVIDER_DISABLED` / `PROVIDER_NOT_CONFIGURED` | `HERMES_AGENT_ENABLED` off, or the URL/token missing on Vercel. No network happened. | Vercel env (§3). |
| response `code: "AI_GATE_ERROR"` (no brain log at all) | The credit gate failed before the model call. | Billing/DB — not this path. |

The same typed code is now also persisted on the failure's `react_agent_audit_events` row as
`reason: "exec_failed:<CODE>"`, so an incident can be reconstructed after the log window closes.

### Bounded retry (REACT-AGENT-RETRY-BACKOFF-1)

One user submission makes **at most 2** Hermes attempts: 1 initial + 1 automatic retry, and only for
*fast, transient* failures — connection reset / DNS / socket, immediate HTTP 502 or 503, or a 429 whose
`Retry-After` is ≤2s. Between them is a jittered **250–750 ms** backoff. Everything else — timeout,
cancellation, auth/authorization failures, 400/404/500, malformed output, invalid proposals — returns
on the first attempt.

Reading the retry fields in the failure log:

| Field | Meaning |
|---|---|
| `attempts=1 retrySkipped=timeout` | The brain was slow. Retry is deliberately refused: the budget is already spent, and a second attempt would only turn a typed 503 into a platform 504. |
| `attempts=1 retrySkipped=insufficient_budget` | A transient failure happened, but too little time remained for a useful second attempt. If you see this often, the first attempt is eating the budget — look at prompt size, not at the retry policy. |
| `attempts=1 retrySkipped=slow_failure` | A transient-class failure that took >5s. Treated as not-actually-transient. |
| `attempts=1 retrySkipped=not_retryable` | Deterministic: auth, bad token, 4xx/500, malformed envelope. Fix the cause; retrying cannot help. |
| `attempts=2 retrySkipped=attempts_exhausted` | Retried once and still failed. The gateway is genuinely unhealthy — go to §6. |
| `[workflow-guidance] recovered after retry attempts=2` (**warn**, not error) | The retry worked and the user saw normal guidance. A rising rate of these is an early warning that the gateway is degrading **before** users notice. |

Both attempts share one `requestId` (sent as `x-chainreact-request-id`, with `x-chainreact-attempt:
1|2`), and the whole submission still produces exactly **one** audit row and **one** AI-credit gate
call — the retry lives inside the gate, never around it.
