# Hosted Hermes Workflow Guidance — Plan + Foundation

**Type:** Plan + foundation slice. **Ships skeleton code/contracts/tests for a FUTURE hosted
guidance brain — NOT a live integration.** No live Hermes call, no production routing to
Hermes, no workflow mutation, no migration, no real env required for tests/typecheck/build.
Local commit, nothing pushed.
**Date:** 2026-06-20
**Branch:** `v2-main`
**Marker:** HOSTED-HERMES-GUIDANCE-FOUNDATION-1

**Parent / context:** [react-agent-hermes-architecture.md](./react-agent-hermes-architecture.md)
(React Agent vs MCP vs Hermes split) · [react-agent-governance-closeout.md](./react-agent-governance-closeout.md)
(governance arc — Hermes design was the recommended next track).

**Source of truth (files inspected/created):**
[contracts/aiGuidance.ts](../../../../contracts/aiGuidance.ts) ·
[services/ai-guidance/](../../../../services/ai-guidance/) (types · flags · hermesConfig ·
sanitizeWorkflowForGuidance · noopGuidanceProvider · hostedHermesGuidanceProvider ·
workflowGuidanceIntake · index) · reused [core/security/secretKeys.ts](../../../../core/security/secretKeys.ts)
patterns + [contracts/workflowDefinition.ts](../../../../contracts/workflowDefinition.ts) shape ·
flag accessor mirrors [services/apiKeys/flags.ts](../../../../services/apiKeys/flags.ts).

---

## 1. Goal

Build the ChainReact-side foundation so a future **hosted Nous Hermes Workflow Guidance Brain**
can be plugged in with minimal, well-bounded work — **without requiring Hermes to exist now**.
Per the architecture correction, Hermes is a **later, scoped runtime/memory layer behind an
adapter port**, never a global brain, never a dependency of workflow execution. This slice
delivers that port + the privacy boundary + an inert skeleton.

## 2. What this is deliberately NOT

- **Not a live integration.** No network call is made or possible (no transport is wired).
- **Not a model in the loop.** Guidance is **advisory**; the deterministic ChainReact validator
  + apply pipeline remain the source of truth and the only mutation path.
- **Not a mutation path.** The intake service imports no repository/mutation/model/DB path and
  never changes a workflow.
- **Not on by default.** `ENABLE_HOSTED_HERMES_GUIDANCE` defaults OFF; HERMES_* env is unset.

## 3. Architecture (what shipped)

```
caller (future React Agent advisory capability)
  → requestWorkflowGuidance({ definition, guidanceKind, findingCodes?, provider? })   [intake seam]
      → sanitizeWorkflowForGuidance(...)        [PRIVACY BOUNDARY → de-identified request]
      → provider.getWorkflowGuidance(request)   [WorkflowGuidanceProvider port]
           • noopWorkflowGuidanceProvider (default) → PROVIDER_DISABLED
           • hostedHermesGuidanceProvider (skeleton) → gated; no transport → never calls out
  → GuidanceResult (advice only)                 [caller decides; nothing applied here]
```

- **Provider-neutral contracts** ([contracts/aiGuidance.ts](../../../../contracts/aiGuidance.ts)):
  `WorkflowGuidanceRequest/Response`, `GeneralizedWorkflow*`, `GuidanceResult`. They name nothing
  Hermes-specific; Hermes is one adapter.
- **Port:** `WorkflowGuidanceProvider` — the concrete first instance of the "`AgentRuntimeAdapter`
  for Hermes" idea, scoped to advisory workflow guidance.
- **Privacy boundary:** `sanitizeWorkflowForGuidance` drops every node `config`, label, and real
  id; keeps only `kind/provider/type` + edge topology (by opaque `n0/n1` refs) + safe finding
  codes. The real-id `refMap` is returned separately for ChainReact-side use and never sent.
- **Gating:** `flags.ts` (`ENABLE_HOSTED_HERMES_GUIDANCE`, default OFF) + `hermesConfig.ts`
  (reads HERMES_* placeholders; returns `null` when unconfigured; constructs no client).
- **Hosted adapter skeleton:** disabled → `PROVIDER_DISABLED`; enabled-but-unconfigured →
  `PROVIDER_NOT_CONFIGURED`; configured-but-no-transport (this slice) → `PROVIDER_NOT_CONFIGURED`;
  configured + injected transport → delegates. **No transport ships**, so no live call is possible.

## 4. Security / no-leak guarantees

- **The de-identified request carries no user data.** No config values/keys, secrets, tokens,
  PII/emails/recipients, message bodies, labels, or real workflow/account/user/node ids ever
  enter the request (enforced by the sanitizer + made unrepresentable by the contract; pinned by
  privacy tests that scan the serialized request and its key set).
- **No account/user/workflow scope in the cross-boundary payload** — scope stays ChainReact-side.
- **No live egress.** The adapter cannot reach the network in this slice (no transport).
- **Advisory only.** A response may suggest *operation kinds*; it carries no concrete operations
  and nothing applies them. Acting on guidance is a future, approval-gated step (would reuse the
  CS-7 `repair_apply` deterministic + audited path).
- **No secret logging.** `hermesConfig` never logs the key; failures return safe enum codes.

## 5. Data / migration decision

**No migration needed, and none added.** This foundation is stateless: guidance is computed from
an in-memory definition and returned to the caller. If a future slice wants to audit guidance
requests/outcomes, it should reuse the existing `react_agent_audit_events` ledger (a guidance
capability emitting `react_agent.*` rows through the existing seam) rather than a new table —
consistent with the CS-7 governance model. A dedicated table would only be justified if durable
guidance history independent of the audit ledger gains a real driver (defer; do not pre-build).

## 6. Feature flags

- `ENABLE_HOSTED_HERMES_GUIDANCE` — **default OFF**. Gates the hosted adapter only; the noop
  default + the sanitizer + intake are flag-independent and inert.

## 7. What Marcus must provide later (see the runbook)

[docs/runbooks/hosted-hermes-setup.md](../../../runbooks/hosted-hermes-setup.md) enumerates the
inputs the live slice needs: `HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL`, the provider
wire format, pricing, timeout, and rate limits. None are required for tests/typecheck/build.

## 8. Tests (this slice)

- **Privacy boundary** — sanitizer keeps shape/topology, drops config/secret/PII/label/real-id;
  serialized request + its key set contain none of them; unsafe finding codes dropped; input not
  mutated; dangling edges dropped.
- **No mutation** — intake never changes the definition; imports no mutation/repository/model/DB
  path; only the de-identified request reaches the provider.
- **Adapter OFF by default + no network call** — disabled → `PROVIDER_DISABLED` (transport never
  consulted); enabled-unconfigured / configured-no-transport → `PROVIDER_NOT_CONFIGURED`; the
  default exported adapter never calls out even when fully configured.
- **Advisory** — a provider suggestion is returned verbatim; the workflow stays untouched.

16 tests across 3 suites. (Verification baseline in §10.)

## 9. Implementation slices that come AFTER this foundation

- **HERMES-LIVE-1** — wire a real `HermesGuidanceTransport` (fetch `config.baseUrl`, bearer key,
  model, `providerFormat`, AbortController `timeoutMs`) that maps the response into `GuidanceResult`;
  parse defensively (`INVALID_RESPONSE` on shape mismatch). Behind the flag + config; add a
  contract test with a mocked fetch (still no real network in CI).
- **HERMES-GUIDANCE-CAPABILITY** — expose guidance through the React Agent as an advisory
  `read_only`/`proposes_change` capability so it is scope-validated + audited via the existing seam;
  map any suggestion back through the `refMap` to real node ids ChainReact-side.
- **HERMES-RATE-LIMIT / COST** — rate limiting + cost accounting once pricing is known.
- **HERMES-LIVE-SMOKE** — gated live smoke once an endpoint exists (mirrors CS-7e).

## 10. Verification baseline (ran this session, 2026-06-20)

- `npx jest tests/unit/services/ai-guidance` — **16 passed, 3 suites**.
- `npm run typecheck` — clean for the new files (no real env needed).
- `eslint` on the new files — 0; `npm run lint:structure` — OK.
- No migration (none added); no env set; no flag enabled; no network call.

## 11. Hard boundaries (restated)

No live Hermes call; no transport shipped; no production routing; no workflow mutation; no
migration/schema; no real env required; no UI. Local commit. **Nothing pushed.**

## 12. Recommended next step

**HERMES-LIVE-1** when Marcus provides the runbook inputs — wire the transport behind the flag +
config, with a mocked-fetch contract test (no real network in CI). Until then the foundation is
complete and inert.
