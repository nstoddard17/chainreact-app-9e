# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-11 @ 845c8c6e9

## Current status

- **LIVE in production** at `https://chainreact.app`, deploying from `v2-main` →
  [`docs/slices/phase-4/v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md)
  (public-surface smoke green; authed-flow + log checks still pending manual verification).
- **Working branch:** `builder-ui-v1-audit-1` — local-only (not on origin), push-gated;
  upstream is `origin/v2-main`. Do not push without Marcus.
- **Active focus:** CLAUDE.md curation track (complete); production smoke-test hardening
  is handled in a separate chat.

## Durable decisions

- [2026-06-10] CLAUDE.md is the operating constitution; durable repo rules live in
  [`docs/rules/`](./rules/), provider/contract detail in [`docs/slices/`](./slices/) →
  curation commits `c2bbedbff..4cd929c7f`.
- [2026-06-10] File output (P-S3) is a durable cross-cutting rule →
  [`docs/rules/file-output-contract.md`](./rules/file-output-contract.md).
- [2026-06-09] V2 promoted live in production. "Don't push the working branch" does not
  mean "V2 isn't live" — both are true at once → CLAUDE.md banner @`4cd929c7f`.

## Open risks & follow-ups

- [Marcus] Authed-flow + log go-live checks **pending manual verification** →
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md) (separate chat owns this).
- [Marcus] Provider builder-metadata launch gap **CLOSED 26/26** (2026-05-25; was
  "9 of 26 builder-invisible") — enforced live by `COVERED_PROVIDERS` /
  `tests/structure/discovery-meta-coverage.test.ts`. Residual post-26/26 deferred
  backlog (trigger arcs / resolvers / FileRef) is **non-launch-blocking** →
  [`provider-metadata-launch-gap-tracker.md`](./slices/phase-4/provider-metadata-launch-gap-tracker.md) §8–§9.
- [Claude] `chainreactv2-parity-auditor` skill **deferred** until recurring new-provider
  parity-audit demand.
- [Marcus] V1 (`chainreact-app-9e`) CLAUDE.md trim **shelved** (`git stash@{0}` on `marcus_dev`)
  — leave V1 untouched unless explicitly asked.

## Recently completed arcs

- **Internal MCP server — Stage 1.5 HTTP transport** (local-only, uncommitted on
  `builder-ui-v1-audit-1`). Adds a Streamable HTTP front door (`/mcp`) so a **ChatGPT
  Developer Mode** custom connector can reach the **same** Stage-1 read-only tool
  registry — no new tools, no boundary expansion. Stage-1 **stdio** server unchanged.
  Scripts: `npm run mcp:http`, `npm run mcp:http:smoke`. Security: `MCP_HTTP_TOKEN`
  required (env-only, redacted), loopback bind by default (external needs explicit
  `MCP_HTTP_ALLOW_EXTERNAL=1`), Origin validation; inherits Stage-1 (no DB/secrets/
  arbitrary-read/mutation). Runbooks →
  [`chatgpt-mcp-developer-mode.md`](./runbooks/chatgpt-mcp-developer-mode.md),
  [`internal-mcp-server.md`](./runbooks/internal-mcp-server.md). Verified: `mcp:build`,
  stdio + http `mcp:smoke`, `tests/unit/mcp` 69/69, typecheck, eslint, lint:structure.
  **Not verified:** live ChatGPT UI end-to-end and whether ChatGPT forwards a static
  `Authorization: Bearer` header — hence the documented `?key=` token fallback.
- **CLAUDE.md curation** — 132,565 → 13,211 chars (−90%), 8 commits `c2bbedbff..4cd929c7f`
  (links fixed → dev-state to pointers → V2 Provider Authoring Rules → Deep Gotchas to index →
  banner reconciled).
- **Skills README post-go-live refresh** → @`0bdea78dd`.
- **Memory-curator workflow** — being implemented now (this file + the curator skill).

## Owner preferences

- Local-only / push-gate; no fake UI, no invented backend; challenge only real
  architectural / security / product risk; verify-then-report with structured outputs →
  see [`CLAUDE.md`](../CLAUDE.md) + [`.claude/skills/README.md`](../.claude/skills/README.md).
- Small, scoped, reversible commits; strict honesty (never claim a check ran unless it did).

## Not captured here

- secrets / env / tokens / credentials / production or customer data
- per-message chat noise · unverified speculation
- rule bodies (→ `docs/rules/`) · roadmap / go-live / closeout / outcome detail
  (→ `docs/slices/`, `docs/roadmap/`) · every slice (→ closeouts)
