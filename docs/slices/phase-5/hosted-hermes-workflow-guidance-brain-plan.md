# Hosted Hermes Workflow Guidance Brain — Plan + Foundation

> ⚠️ **SUPERSEDED (HERMES-AGENT-PIVOT, 2026-06-20).** The "ChainReact calls a hosted Nous model
> endpoint directly" approach in this plan is **abandoned**. ChainReact will instead talk to an
> internal **Hermes Agent** service (OpenAI underneath), never a hosted model API directly, and Nous
> Portal is not kept as a fallback. The direct-Nous adapter, `HERMES_*` model config/flag, model
> prompt builder, OpenAI fallback policy, and the opt-in live Nous smoke were **removed**. The
> generic guidance contracts, safe-DTO sanitizer, WorkflowPlan validator, and private→global
> skill-event boundary were **retained**. Current direction:
> [`hermes-agent-chainreact-architecture-spike.md`](./hermes-agent-chainreact-architecture-spike.md).
> This doc is kept for history only.

**Type:** Plan + foundation slice. **Config-gated, NOT production-routed.** No live Hermes call in
tests/CI (mocked fetch); real Hermes env is NOT required for tests/typecheck/build; no workflow
creation/apply; no migration; no React Agent route wired yet. Local commit, **nothing pushed**.
**Date:** 2026-06-20
**Branch:** `v2-main`
**Marker:** HOSTED-HERMES-GUIDANCE-BRAIN-2

**Parent / context:** [hosted-hermes-workflow-guidance-plan.md](../phase-4/ai/hosted-hermes-workflow-guidance-plan.md)
(foundation skeleton) · [react-agent-hermes-architecture.md](../phase-4/ai/react-agent-hermes-architecture.md)
(React Agent / MCP / Hermes split) · [react-agent-governance-closeout.md](../phase-4/ai/react-agent-governance-closeout.md).

**Read first (binding rules):** `docs/rules/project-structure-and-module-boundaries.md`,
`account-ownership-model.md`, `database-security.md`, `testing-strategy.md`, `variable-resolver.md`.

---

## 1. Product goal

Help a user who does NOT know how to build a workflow think through what they want to automate:
ask clarifying questions, explain possible workflow shapes, and produce a safe **Workflow Plan**.
The brain advises; it never builds, changes, runs, or applies a workflow.

## 2. Architecture placement (unchanged constraints)

- **React Agent** stays the governed in-app assistant boundary. A future slice exposes guidance as
  an advisory React Agent capability (scope-validated + audited via the existing seam) — **this
  slice does not wire that route.**
- **MCP** stays external/internal diagnostics only.
- **Hermes** is the hosted workflow-guidance brain *behind* React Agent — a `WorkflowGuidanceProvider`
  adapter, not a replacement runtime. **Workflow execution never depends on AI.**
- **ChainReact services are the source of truth.** A plan's provider/action claims are validated
  against the discovery registry; the deterministic builder/validator/apply pipeline is the only
  thing that creates or changes a real workflow.

## 3. Privacy / trust boundaries (the heart of this slice)

Two distinct boundaries, both enforced in code + pinned by tests:

1. **ChainReact → Hermes (per-request inference).** Hermes receives ONLY: de-identified workflow
   SHAPE (node kind/provider/type + topology by opaque `n0` refs — no config), the public
   capability catalog, safe finding codes, and the user's own goal text (their words, scrubbed of
   obvious secret/token shapes). Hermes NEVER receives OAuth/refresh tokens, API keys, provider
   secrets, raw integration rows, config values, account/user/workflow ids, service-role access, or
   DB access. (`database-security.md`: service-role + secrets are server-only, single helper, never
   `NEXT_PUBLIC_`.)
2. **Private session → global learning.** A `GuidanceSession`/`GuidanceTurn` (raw user words) is
   account-scoped and is NEVER promoted raw. Only a `SanitizedSkillEvent` — generalized capability
   shape + a safe outcome, with NO ids/text/config/PII — may enter global aggregation
   (`GuidancePattern`). `toSanitizedSkillEvent` is the enforcement point.

## 4. What shipped (files)

**Contracts**
- [contracts/aiGuidance.ts](../../../contracts/aiGuidance.ts) (foundation) — cross-boundary request/response.
- [contracts/guidanceSession.ts](../../../contracts/guidanceSession.ts) — `GuidanceSession`,
  `GuidanceTurn`, `WorkflowGuidanceIntent`, `WorkflowPlan`(+`Step`).
- [contracts/guidanceSkillEvents.ts](../../../contracts/guidanceSkillEvents.ts) —
  `SanitizedSkillEvent`, `GeneralizedSkillStep`, `GuidancePattern`.

**Services** ([services/ai-guidance/](../../../services/ai-guidance/))
- `sanitizeWorkflowForGuidance` (foundation) — workflow → de-identified request.
- `buildWorkflowGuidancePrompt` — safe-DTO chat-message builder + `redactSecretsFromText`.
- `nousHermesAdapter` — Nous OpenAI-compatible chat-completions adapter (`/chat/completions`,
  Bearer key, model/max_tokens/temperature, AbortController timeout, defensive parse). Injectable
  `fetchImpl` (tests mock it); gated by the foundation's flag+config; `createNousHermesGuidanceProvider`.
- `hermesConfig` — reads `HERMES_*` (provider/baseUrl/apiKey/model/timeoutMs/maxOutputTokens/
  temperature); `getHermesGuidanceConfig()` → `null` when unconfigured; `describeHermesConfigStatus()`
  reports presence + missing var NAMES only (never the key).
- `validateWorkflowPlan` — every trigger/action step's `provider:type` must resolve in the discovery
  registry; else the plan is rejected.
- `skillEventBoundary` (`toSanitizedSkillEvent`) — the private→global enforcement point.
- `guidanceFallbackPolicy` — OpenAI-fallback SKELETON; returns `useFallback:false` (flag OFF + seam
  not confirmed clean); broad fallback intentionally NOT wired.

## 5. Feature flags (all default OFF)

- `ENABLE_HOSTED_HERMES_GUIDANCE` — gates the hosted adapter.
- `ENABLE_HERMES_OPENAI_FALLBACK` — gates the (unwired) OpenAI fallback; also requires an explicit
  `seamClean` signal no caller sets yet.

## 6. Live-routing status

**Nothing is live-routed.** The adapter only calls out when the flag is ON **and** `HERMES_*` is
configured **and** a caller wires `createNousHermesGuidanceProvider`. No app route, no React Agent
capability, and no UI invokes it. Tests use an injected mock fetch — **no live network call in CI.**
Marcus confirmed the direct Nous API works (`nousresearch/hermes-4-70b`, Nous Portal,
`https://inference-api.nousresearch.com/v1`) and added local `HERMES_*` env (key server-only).

## 7. Data / migration decision

**No migration, none added.** Guidance is computed from an in-memory definition + session and
returned to the caller. `GuidanceSession` is not persisted by this slice. If durable sessions or a
skill-event store land later, they MUST be **account-scoped, RLS-gated tables with explicit GRANTs**
(`database-security.md`); global `GuidancePattern` aggregation must store only sanitized events.
Defer until a real driver exists; do not pre-build.

## 8. Tests (40 across 8 suites, this slice + foundation)

This slice's six required proofs:
- **Hermes cannot mutate workflows** — `guidanceBoundaries.test.ts`: no `services/ai-guidance` file
  imports a mutation/repo/DB/service-role path; intake never changes the definition.
- **Private context not promoted to global** — `skillEventBoundary.test.ts`: a session full of
  account/user/workflow ids + secret/PII turn text yields an event containing none of it.
- **Sanitizer strips private entities** — `sanitizeWorkflowForGuidance.test.ts` (foundation) +
  skill-event test.
- **Missing Hermes env doesn't break tests/typecheck unless enabled** — `nousHermesAdapter.test.ts`:
  no env → `PROVIDER_DISABLED`/`PROVIDER_NOT_CONFIGURED`, fetch never called; all suites pass with no
  `HERMES_*` set.
- **Plan provider/action validated against ChainReact capabilities** — `validateWorkflowPlan.test.ts`:
  hallucinated `provider:type` rejected; real ones (from discovery) accepted.
- **No secrets/tokens/configs in prompts/logs/audit/skill events** — prompt builder, skill event, and
  the (mock) transport request body carry no config/secret; the key appears ONLY in the Authorization
  header, never in the message body; the adapter never logs it.

## 9. Remaining risks

- **Prompt-injection / model output trust.** A guidance reply could propose unknown capabilities or
  unsafe text. Mitigated by `validateWorkflowPlan` (capability gate) + the advisory-only contract —
  but the live slice must validate EVERY plan before surfacing and must never auto-act.
- **Goal-text residual PII.** The user's goal text is sent for inference; `redactSecretsFromText`
  catches token shapes, not arbitrary PII (e.g. names/emails the user types intentionally). Acceptable
  for per-request inference (account-scoped) and stripped before any global skill event; revisit if a
  stricter egress policy is required.
- **No live smoke yet.** The transport is unit-tested with a mock; a gated live smoke (mirroring CS-7e)
  is needed before any enablement.

## 10. Verification baseline (ran this session, 2026-06-20)

- `npx jest tests/unit/services/ai-guidance` — **40 passed, 8 suites**.
- `npm run typecheck` — clean for the new files (no real env).
- `eslint` on the new files — 0; `npm run lint:structure` — OK.
- No migration; no flag enabled; no live network call; the API key is not printed/logged/committed.

## 11. Next recommended slice

**HERMES-LIVE-SMOKE** — a gated `.dev.test.ts` (opt-in, real `HERMES_*`) that drives
`requestNousWorkflowGuidance` against the real Nous endpoint once, asserts a parseable plan, validates
it against capabilities, and confirms no secret echoes — then **HERMES-GUIDANCE-CAPABILITY** to expose
guidance as an advisory React Agent capability (scope-validated + audited via the existing seam),
mapping any suggestion back through the sanitizer's ref map. Acting on a plan stays the CS-7
`repair_apply` deterministic + approved + audited path.
