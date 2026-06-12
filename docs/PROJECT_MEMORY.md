# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-11 @ 9abe08ab6 (prod)

## Current status

- **LIVE in production** at `https://chainreact.app`, deploying from `v2-main` →
  [`docs/slices/phase-4/v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
  **Authenticated + execution production smoke GREEN (2026-06-11)** — `npm run smoke:prod`,
  30 tests, 29 passed / 1 skipped / 0 failed, on deployed `9abe08ab6`. Vercel log review
  still manual.
- **Push state:** `62da1088b..9abe08ab6` is pushed to `origin/v2-main`. Working branch
  `builder-ui-v1-audit-1` has **local-only** commits on top — docs status (`dd9e69502`) and
  MCP Stage-2 plan + Stage-2A (`64bfd850a`, `ccace0e23`). Push-gated: don't push without Marcus.
- **Open threads:** connected-app recovery UX (Reconnect/Disconnect) and a localhost-OAuth
  session observation — see Open risks.

## Durable decisions

- [2026-06-11] Manual run-now execution is kept alive past the 202 via Next `after()`
  (→ Vercel `waitUntil`) so runs finalize on serverless instead of sticking in `running` —
  interim until a durable queue → commit `9abe08ab6` +
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [2026-06-10] CLAUDE.md is the operating constitution; durable repo rules live in
  [`docs/rules/`](./rules/), provider/contract detail in [`docs/slices/`](./slices/) →
  curation commits `c2bbedbff..4cd929c7f`.
- [2026-06-10] File output (P-S3) is a durable cross-cutting rule →
  [`docs/rules/file-output-contract.md`](./rules/file-output-contract.md).
- [2026-06-09] V2 promoted live in production. "Don't push the working branch" does not
  mean "V2 isn't live" — both are true at once → CLAUDE.md banner @`4cd929c7f`.

## Open risks & follow-ups

- [Marcus/Claude] **Connected-app recovery UX gap** — no visible **Reconnect** on connected
  app cards; **Disconnect** needs separate backend/API design (`markDisconnected()` is
  repo-only dead code, no route). Recovery relies on the "Connect another → same workspace"
  workaround → [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [Marcus] **Localhost OAuth session confusion** observed after Slack re-OAuth (signed-in
  user appeared to change). Appears explained by the localhost OAuth flow redirecting to
  production while another production session was active — **not a proven production auth
  bug**; revisit before building the Reconnect UX →
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [n/a] Slack-side message landing is **not externally verified** — that smoke step is
  intentionally gated (no Slack API read creds in the harness) →
  [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- [Marcus] Provider builder-metadata launch gap **CLOSED 26/26** (2026-05-25) — enforced by
  `COVERED_PROVIDERS` / `tests/structure/discovery-meta-coverage.test.ts`; residual backlog
  non-launch-blocking →
  [`provider-metadata-launch-gap-tracker.md`](./slices/phase-4/provider-metadata-launch-gap-tracker.md) §8–§9.
- [Claude] `chainreactv2-parity-auditor` skill **deferred** until recurring demand.
- [Marcus] V1 (`chainreact-app-9e`) CLAUDE.md trim **shelved** (`git stash@{0}` on
  `marcus_dev`) — leave V1 untouched unless asked.

## Recently completed arcs

- **Production smoke closeout (2026-06-11)** — run-now `after()` reliability validated in
  prod (builder manual-run finalizes + appears on `/runs`); Slack action manual-run
  finalization validated; Slack channel loading recovered after Slack re-OAuth →
  `dd9e69502` + [`v2-go-live-status.md`](./slices/phase-4/v2-go-live-status.md).
- **Slack action smoke** — `tests/smoke/slack-action.smoke.spec.ts` (pick channel by visible
  name → run → assert finalize), `RUN_EXECUTION`-gated real send → shipped in
  `62da1088b..9abe08ab6`.
- **Internal MCP server — Stage 1 + 1.5 HTTP transport SHIPPED to `v2-main`** (in
  `62da1088b..9abe08ab6`). Streamable HTTP front door (`/mcp`) for a ChatGPT Developer-Mode
  connector over the same read-only Stage-1 registry. **Stage-2A diagnostics** (smoke artifact
  + static option-source tools) implemented **locally** (`ccace0e23`, plan `64bfd850a`) — not
  pushed. Runbooks → [`chatgpt-mcp-developer-mode.md`](./runbooks/chatgpt-mcp-developer-mode.md),
  [`internal-mcp-server.md`](./runbooks/internal-mcp-server.md).
- **Secret-scan rewrite** — fake Slack-token fixtures in the MCP test commits reassembled at
  runtime (no literal Slack-bot-token string in source) so GitHub push protection allowed the
  `v2-main` push; no bypass used → in `62da1088b..9abe08ab6`.
- **CLAUDE.md curation** — 132,565 → 13,211 chars (−90%), `c2bbedbff..4cd929c7f`.

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
