# Runbook — Hermes Agent local sandbox

> ⚠️ **SECONDARY / NON-AUTHORITATIVE (HERMES-AGENT-PROD-CLIENT, 2026-06-20).** Marcus chose a
> production-style **Render** topology, which is live. The authoritative setup is
> [`hermes-agent-render-prod.md`](./hermes-agent-render-prod.md) (Vercel → Render public gateway →
> Render private Hermes Agent → OpenAI). This local Docker sandbox is kept for local experiments
> only and is NOT the chosen path — do not treat it as the production setup.

**Status:** Local experiment guide for the **Hermes Agent** internal service. Nothing here is wired
into ChainReact (the app calls the Render gateway, never a local sandbox). See the architecture
spike: [`docs/slices/phase-5/hermes-agent-chainreact-architecture-spike.md`](../slices/phase-5/hermes-agent-chainreact-architecture-spike.md).

> **Direction:** ChainReact → Hermes Agent (internal service) → OpenAI (LLM provider) → Hermes Agent
> → ChainReact validation/decision. ChainReact never calls a hosted LLM model API directly. There is
> no Nous Portal / direct-model path or fallback.

## 1. What the Hermes Agent is

An internal service (the learning/skills brain) that ChainReact talks to over a **private,
token-authenticated** boundary — never exposed to the browser. It owns prompting and model
orchestration; OpenAI is the first LLM provider underneath it. It receives only **safe DTOs** from
ChainReact and returns **advisory** guidance / workflow plans. It cannot mutate workflows and has no
access to ChainReact's database, secrets, or credentials.

## 2. Local Docker sandbox

Run the Agent as a container exposing an internal HTTP API (the API server / internal-service
concept). Shape (illustrative — adapt to the actual Agent image/compose once chosen):

```yaml
# docker-compose.hermes-agent.yml (local sandbox only)
services:
  hermes-agent:
    image: <hermes-agent-image>          # the Agent service image
    ports:
      - "8088:8088"                       # internal API; bind localhost only in real use
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}   # provider key lives in AGENT config — see warnings
      HERMES_AGENT_INTERNAL_TOKEN: ${HERMES_AGENT_INTERNAL_TOKEN}
    volumes:
      - hermes-agent-data:/data           # persistent skills/memory — REQUIRED (see below)

volumes:
  hermes-agent-data:                      # named volume so learning survives restarts
```

```bash
docker compose -f docker-compose.hermes-agent.yml up -d
docker compose -f docker-compose.hermes-agent.yml logs -f hermes-agent
```

### Persistent volume requirement

The Agent's skills/memory MUST live on a **persistent named volume** (e.g. `hermes-agent-data`
mounted at `/data`). Without it, the brain's learned, generalized skills are wiped on every
container restart. Do not run the Agent with ephemeral-only storage outside throwaway smoke checks.

### OpenAI provider config requirement

The Agent needs an OpenAI provider configured (API key + model) in **its own service config /
environment**. This is the only place the OpenAI key belongs. ChainReact has no OpenAI key for this
path and never sends one across the boundary.

### API server / internal service concept

The Agent exposes a small internal HTTP API that ChainReact's future client will call:
- a health/readiness endpoint, and
- a guidance endpoint that accepts the safe DTO (generalized workflow shape + guidance kind + safe
  finding codes + user goal text) and returns advisory guidance / a workflow plan.

Authentication is a shared internal token (`HERMES_AGENT_INTERNAL_TOKEN`), sent by ChainReact in a
header. The endpoint is private (internal network / localhost in dev) — never browser-reachable.

## 3. Env vars ChainReact will eventually need

These are **not consumed by the app yet** — a later slice (HERMES-AGENT-CLIENT) reads them behind a
default-OFF flag. Document them here so the contract is stable when that lands:

| Var | Purpose | Notes |
|---|---|---|
| `HERMES_AGENT_BASE_URL` | Base URL of the internal Hermes Agent API. | e.g. `http://localhost:8088`. Private/internal only — never a public or browser URL. |
| `HERMES_AGENT_INTERNAL_TOKEN` | Shared secret for the ChainReact ↔ Agent internal boundary. | **Server-only secret.** Never `NEXT_PUBLIC_`, never logged, never sent to the browser. |
| `HERMES_AGENT_TIMEOUT_MS` | Per-request timeout for the Agent call. | Keep guidance non-blocking; execution never depends on the Agent answering. |

## 4. Warnings

- ⚠️ **The OpenAI API key belongs in the Hermes Agent service config — NOT in ChainReact frontend
  code, env, or any `NEXT_PUBLIC_` var.** ChainReact does not hold or forward an OpenAI key for this
  path. The browser must never see provider keys.
- ⚠️ **The Hermes Agent's memory/skills must NOT receive raw private user/account data globally.**
  Only sanitized, generalized skill events (capability shape + safe outcome + counts — no ids, no
  conversation text, no PII, no config/secrets) may enter the Agent's global learning. Raw private
  guidance sessions stay account-scoped and ChainReact-side.
- ⚠️ **Keep the Agent boundary internal and token-authenticated.** No public exposure, no browser
  access, no credentials or DB rows ever cross from ChainReact to the Agent.
- ⚠️ **Workflow execution must remain independent of the Agent.** If the sandbox is down, ChainReact
  must continue to build, validate, run, and recover workflows normally.
