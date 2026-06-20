# Runbook — Hosted Hermes Workflow Guidance setup

**Status:** Foundation + brain shipped (HOSTED-HERMES-GUIDANCE-FOUNDATION-1,
HOSTED-HERMES-GUIDANCE-BRAIN-2): the Nous adapter transport, safe-DTO prompt builder, capability
validator, and private→global skill-event boundary all exist, **but nothing is live-routed** — no
app route, UI, or React Agent wires the adapter into a request path. The adapter only calls out
when `ENABLE_HOSTED_HERMES_GUIDANCE=true` AND HERMES_* is configured AND a caller injects it; until
then it stays inert (`PROVIDER_DISABLED` / `PROVIDER_NOT_CONFIGURED`) and makes no network call.
HERMES-LIVE-SMOKE (this slice) adds an **opt-in, default-skipped** live smoke that proves the real
transport works (see §5). It does not route guidance anywhere.

> Nothing here is required for tests, typecheck, or build — the foundation/brain run fully without
> any of these values. The only thing that calls the real endpoint is the opt-in live smoke in §5.

## 1. Env vars to provide

Set these in `.env.local` (dev) / the hosting env (prod) when the live slice lands. Names are
reserved in [`services/ai-guidance/hermesConfig.ts`](../../services/ai-guidance/hermesConfig.ts)
(`HERMES_ENV`).

| Var | Required | Purpose | Notes |
|-----|----------|---------|-------|
| `HERMES_BASE_URL` | **yes** | Base URL of the hosted Hermes guidance endpoint. | e.g. `https://<host>/v1`. Config reader returns `null` (→ `PROVIDER_NOT_CONFIGURED`) if missing. |
| `HERMES_API_KEY` | **yes** | Bearer credential. | **Secret** — never logged, never echoed. Stored only in env. |
| `HERMES_MODEL` | **yes** | Model id to request (the Nous Hermes variant). | e.g. `Hermes-3-Llama-3.1-…` (confirm exact id with the host). |
| `HERMES_PROVIDER` | no | Provider name; selects the adapter wire format. | Defaults to `nous` (OpenAI-compatible chat completions). |
| `HERMES_TIMEOUT_MS` | no | Per-request timeout (ms). | Defaults to `15000` if unset/invalid (clamped 1s–120s). |
| `HERMES_MAX_OUTPUT_TOKENS` | no | Max tokens in the guidance reply. | Defaults to `1024` (clamped 1–8192). |
| `HERMES_TEMPERATURE` | no | Sampling temperature. | Defaults to `0.3` (clamped 0–2). |

**Confirmed working values (Nous Portal, 2026-06-20):** `HERMES_PROVIDER=nous`,
`HERMES_BASE_URL=https://inference-api.nousresearch.com/v1`, `HERMES_MODEL=nousresearch/hermes-4-70b`,
`HERMES_TIMEOUT_MS=30000`, `HERMES_MAX_OUTPUT_TOKENS=1200`, `HERMES_TEMPERATURE=0.3`. The API key is
**server-only** — it is in local `.env.local` only, never committed/logged, and must never get a
`NEXT_PUBLIC_` prefix.

And the rollout flag (separate from config):

| Flag | Default | Purpose |
|------|---------|---------|
| `ENABLE_HOSTED_HERMES_GUIDANCE` | **OFF** (`false`) | Master switch. Even when ON, the adapter stays inert until config is present AND the live transport is wired. |

## 2. Decisions Marcus must confirm before HERMES-LIVE-1

1. **Provider / wire format.** Is the endpoint OpenAI-compatible (`/chat/completions`-style) or a
   custom shape? This determines the transport's request/response mapping and the
   `HERMES_PROVIDER_FORMAT` value.
2. **Pricing model.** Per-token? Per-request? Flat host fee? This drives whether/how guidance is
   cost-accounted (and whether it charges an AI credit feature). Until known, guidance must not be
   billed.
3. **Timeout.** Confirm a sane `HERMES_TIMEOUT_MS` for the host's latency (default 15s).
4. **Rate limits.** The host's request/min + concurrency limits, so HERMES-RATE-LIMIT can add a
   limiter before any user-facing exposure (mirrors the API-keys "stays dark until a rate limiter
   lands" rule).
5. **Data-handling / retention.** Confirm the host does NOT train on or retain submitted payloads
   beyond the request. ChainReact already sends only de-identified shape (no config/PII/ids), but
   the host's retention posture should be on record before go-live.

## 3. What is already guaranteed ChainReact-side (so Marcus doesn't have to)

- **Privacy boundary is built.** Only de-identified workflow SHAPE (node kind/provider/type + edge
  topology, by opaque `n0/n1` refs) + a guidance kind + safe finding codes ever leave ChainReact.
  No config values/keys, secrets, tokens, PII, labels, or real workflow/account/user/node ids.
- **No mutation.** Guidance is advisory; acting on it would go through the existing CS-7
  `repair_apply` deterministic + audited approval path — a separate future slice.
- **Inert by default.** No live call is possible today (no transport wired).

## 4. Go-live checklist (for the live slice, later)

- [x] Marcus provides §1 env + confirms §2 decisions (Nous Portal, OpenAI-compatible; values in §1).
- [x] HERMES-LIVE-1 wired the transport (fetch + AbortController timeout + defensive response parse
      → `GuidanceResult`), behind the flag + config, with a **mocked-fetch** contract test (no real
      network in CI) — shipped in HOSTED-HERMES-GUIDANCE-BRAIN-2
      ([`nousHermesAdapter.ts`](../../services/ai-guidance/nousHermesAdapter.ts)).
- [x] HERMES-LIVE-SMOKE: opt-in, default-skipped live smoke against the real endpoint (§5).
- [ ] HERMES-RATE-LIMIT adds a limiter; nothing user-facing ships before it.
- [ ] HERMES-GUIDANCE-CAPABILITY exposes guidance through the React Agent seam (scope-validated +
      audited), then enable the flag in the target env.

## 5. Opt-in live smoke (HERMES-LIVE-SMOKE)

A single, **double-gated, default-SKIPPED** test that calls the real Nous Hermes endpoint once to
prove the transport works with ChainReact's `workflow_guidance_intake` prompt shape:

**Test:** [`tests/unit/services/ai-guidance/nousHermesAdapter.live.dev.test.ts`](../../tests/unit/services/ai-guidance/nousHermesAdapter.live.dev.test.ts)

> ⚠️ **This test calls the REAL, PAID Nous endpoint.** It consumes tokens on every run. Run it
> deliberately, locally, **exactly once** per change. **Do NOT run it in CI** unless you have
> explicitly configured the two switches AND the HERMES_* secret in that CI env (the default CI
> environment has no `.env.local` and never sets the switches, so it always SKIPs there).

**Env required to run (else it SKIPs — never fails):**

| Var | Source | Notes |
|-----|--------|-------|
| `ENABLE_HOSTED_HERMES_GUIDANCE=true` | **launch env / CLI** | Opt-in switch #1. NOT auto-loaded from `.env.local` by the test. |
| `HERMES_LIVE_SMOKE=true` | **launch env / CLI** | Opt-in switch #2. NOT auto-loaded from `.env.local` by the test. |
| `HERMES_BASE_URL`, `HERMES_API_KEY`, `HERMES_MODEL` | `.env.local` (auto-loaded) | The 3 required config vars (§1). `HERMES_TIMEOUT_MS` / `HERMES_MAX_OUTPUT_TOKENS` / `HERMES_TEMPERATURE` are optional. |

The test auto-loads only the `HERMES_*` **config** values from `.env.local`; it deliberately does
NOT auto-load the two opt-in switches, so the focused non-live run
(`npx jest tests/unit/services/ai-guidance`) and CI never call out.

**Run it (bash), once:**

```bash
ENABLE_HOSTED_HERMES_GUIDANCE=true HERMES_LIVE_SMOKE=true \
  npx jest tests/unit/services/ai-guidance/nousHermesAdapter.live.dev.test.ts
```

**Expected model slug:** `nousresearch/hermes-4-70b` (the test asserts `modelTag === HERMES_MODEL`).

**What it asserts:** real call reaches `${HERMES_BASE_URL}/chat/completions`; a usable reply comes
back; the API key is in the `Authorization` header and **nowhere** in the request body or response;
a fake canary secret in the prompt is redacted out of the body and never echoed into a global skill
event or any logged output; any plan-shaped reply validates against `validateWorkflowPlan`; the
result stays advisory (no apply/mutation). It prints a secret-free latency + token-usage line.

See [`docs/slices/phase-4/ai/hosted-hermes-workflow-guidance-plan.md`](../slices/phase-4/ai/hosted-hermes-workflow-guidance-plan.md)
for the full design + post-foundation slice breakdown.
