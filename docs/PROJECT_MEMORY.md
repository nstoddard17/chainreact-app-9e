# ChainReactV2 — Project Memory

> Compact curated project state. This is not the source of truth.
> Repo docs, commits, and code win. Link to authoritative docs/commits instead of
> copying long content. No secrets, env values, tokens, credentials, production data,
> or private customer/user data.
>
> Last curated: 2026-06-10 @ 0bdea78dd

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
- [Marcus] **9 of 26 providers builder-invisible** (`hasMetadata:false` → "coming soon") →
  [`provider-metadata-launch-gap-tracker.md`](./slices/phase-4/provider-metadata-launch-gap-tracker.md).
- [Claude] `chainreactv2-parity-auditor` skill **deferred** until recurring new-provider
  parity-audit demand.
- [Marcus] V1 (`chainreact-app-9e`) CLAUDE.md trim **shelved** (`git stash@{0}` on `marcus_dev`)
  — leave V1 untouched unless explicitly asked.

## Recently completed arcs

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
