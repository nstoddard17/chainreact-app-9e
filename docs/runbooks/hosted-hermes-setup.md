# Runbook — Hosted Hermes Workflow Guidance setup

**Status:** Foundation shipped (HOSTED-HERMES-GUIDANCE-FOUNDATION-1); **the live integration is
NOT wired.** This runbook lists exactly what **Marcus must provide** before the live slice
(HERMES-LIVE-1) can wire a real transport. Until then the adapter is inert
(`PROVIDER_DISABLED` / `PROVIDER_NOT_CONFIGURED`) and makes no network call.

> Nothing here is required for tests, typecheck, or build — the foundation runs fully without
> any of these values.

## 1. Env vars to provide

Set these in `.env.local` (dev) / the hosting env (prod) when the live slice lands. Names are
reserved in [`services/ai-guidance/hermesConfig.ts`](../../services/ai-guidance/hermesConfig.ts)
(`HERMES_ENV`).

| Var | Required | Purpose | Notes |
|-----|----------|---------|-------|
| `HERMES_BASE_URL` | **yes** | Base URL of the hosted Hermes guidance endpoint. | e.g. `https://<host>/v1`. Config reader returns `null` (→ `PROVIDER_NOT_CONFIGURED`) if missing. |
| `HERMES_API_KEY` | **yes** | Bearer credential. | **Secret** — never logged, never echoed. Stored only in env. |
| `HERMES_MODEL` | **yes** | Model id to request (the Nous Hermes variant). | e.g. `Hermes-3-Llama-3.1-…` (confirm exact id with the host). |
| `HERMES_TIMEOUT_MS` | no | Per-request timeout. | Defaults to `15000` if unset/invalid. |
| `HERMES_PROVIDER_FORMAT` | no | Wire format the live transport speaks. | Defaults to `openai-compatible`. Set if the host uses a different shape. |

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

- [ ] Marcus provides §1 env + confirms §2 decisions.
- [ ] HERMES-LIVE-1 wires the transport (fetch + AbortController timeout + defensive response parse
      → `GuidanceResult`), behind the flag + config, with a **mocked-fetch** contract test (no real
      network in CI).
- [ ] HERMES-RATE-LIMIT adds a limiter; nothing user-facing ships before it.
- [ ] HERMES-GUIDANCE-CAPABILITY exposes guidance through the React Agent seam (scope-validated +
      audited).
- [ ] HERMES-LIVE-SMOKE: gated live smoke against the real endpoint (mirrors CS-7e), then enable the
      flag in the target env.

See [`docs/slices/phase-4/ai/hosted-hermes-workflow-guidance-plan.md`](../slices/phase-4/ai/hosted-hermes-workflow-guidance-plan.md)
for the full design + post-foundation slice breakdown.
