# ChainReactV2 — Claude Instructions

## ✅ PRIMARY / ACTIVE APP — LIVE IN PRODUCTION

ChainReactV2 is the primary ChainReact app/codebase — build all new work here.
V1 (`chainreact-app-9e`) is archived reference only.

**V2 is live in production** at `https://chainreact.app`, deploying from the
`v2-main` branch. Authoritative status, including current verification state:
[`docs/slices/phase-4/v2-go-live-status.md`](./docs/slices/phase-4/v2-go-live-status.md).

**Push posture (updated 2026-06-12):** local work stays **push-gated** — commit
locally, do not push by default. **But when Marcus explicitly approves a verified
batch, pushing to `v2-main` IS allowed and DOES deploy to production** — that is the
intended path at this stage (there is no separate staging environment yet). The old
"do not deploy to prod" caution is retired. Still: never push, deploy, open PRs, or
change public launch posture **without** Marcus's explicit approval; approval is
per-batch and does not carry over. A proper dev/staging environment will be added
later, before broad user rollout + taking payments. "Don't push this branch by
default" does not mean "V2 isn't live" — both facts can be true at once.

## Project Purpose

ChainReactV2 is the cleaner rebuild of the original ChainReact app.

The original V1 reference repo is:

`c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`

**Use `chainreact-app-9e` as the V1 source/reference before implementing provider behavior.**

The goal is not to recreate everything from scratch. The goal is to selectively port proven V1 behavior into V2's cleaner architecture while fixing known V1 bugs and avoiding legacy mess.

Claude should consult V1 for provider behavior, workflows, OAuth flows, triggers, schemas, and edge cases — then adapt them into V2's boundaries.

---

## Working Style

- Work in meaningful local batches.
- Do not over-slice into tiny PRs.
- Local commits are allowed after gates pass.
- **Do not push unless Marcus explicitly says to push.** When he does approve a
  verified batch, pushing to `v2-main` is allowed and deploys to prod (intended).
- Do not open PRs unless Marcus explicitly says to.
- Before major/shared-infrastructure work, write a short plan first.
- For provider work, audit V1 before coding.
- Prefer porting and adapting V1 behavior over inventing new behavior.

## Current Branch Strategy

Most V2 work is local-only for now.

Do not assume work should be pushed after each provider or slice.

Use local branches/commits to keep progress organized, but wait for Marcus before
pushing. When he approves a verified batch, the push goes to `v2-main` and deploys
to production — that is the intended ship path until a dev/staging env exists.

---

## V1 Porting Rules

Before implementing a provider, inspect V1 for:

- OAuth/auth implementation
- action handlers
- trigger/webhook/polling lifecycle
- schemas/node definitions
- API wrappers
- tests
- known bugs or deprecated files

Classify V1 code as:

- **copy mostly as-is**
- **port with V2 adaptation**
- **rewrite** because V1 is too coupled/messy
- **skip** because out of scope

Do not copy deprecated V1 files unless explicitly approved.

---

## V2 Architecture Boundaries

Keep provider-specific logic under:

`integrations/<provider>/`

Keep shared provider-family helpers under:

`integrations/_shared/<family>/`

Examples:

`integrations/_shared/google/`
`integrations/_shared/microsoft/`

Keep reusable trigger infrastructure under:

`services/triggers/`

Keep cron orchestration under:

`services/cron/`

Keep repositories under:

`repositories/`

Keep pure helpers only in `core/`.

**Do not import repositories or services into `core/`.**

---

## Provider Implementation Pattern

For each provider, prefer this larger batch rhythm:

1. Plan doc
2. Manifest + OAuth
3. Actions + API wrappers
4. Triggers/webhooks/polling
5. E2E walkthrough with mocked external provider boundary

Do not push after each batch unless Marcus explicitly says to. On his explicit
approval, the batch pushes to `v2-main` and deploys to prod (intended at this stage).

---

## Testing Gates

After meaningful batches, run:

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

For E2E batches, also run relevant Playwright specs sequentially.

---

## E2E Philosophy

E2E tests should use real V2 internals and mock only the external provider boundary.

**Real:**

- auth
- OAuth dispatcher/state
- token encryption
- integration rows
- workflow create/activate
- trigger resource lifecycle
- workflow execution
- action handlers

**Mock:**

- Slack / Google / Microsoft / other provider network APIs

---

## Important Defaults

- Do not add DB migrations unless truly needed.
- Prefer existing `trigger_resources.config` for provider-specific watch/polling metadata when safe.
- Use DB-backed dedup, not in-memory dedup.
- Use `refreshAndRetry` for provider API calls that can receive 401.
- Use Q-contract helpers where applicable.
- Keep manifest capabilities honest. Do not set `actions: true` or `webhookTrigger: true` until handlers/triggers are actually registered.

---

## Current State & Status

ChainReactV2 is the primary app. Live status is tracked in maintained docs —
do NOT keep a duplicate point-in-time status list here (it goes stale).

**Start here:** [`docs/PROJECT_MEMORY.md`](./docs/PROJECT_MEMORY.md) — compact rolling curated state (status, durable decisions, open follow-ups). Points to the authoritative docs below; never overrides them.

Source of truth:

* **Phases & roadmap:** [`docs/roadmap/chainreact-v2-roadmap.md`](./docs/roadmap/chainreact-v2-roadmap.md)
* **Production go-live status:** [`docs/slices/phase-4/v2-go-live-status.md`](./docs/slices/phase-4/v2-go-live-status.md)
* **Builder-metadata launch gap (9 providers):** [`docs/slices/phase-4/provider-metadata-launch-gap-tracker.md`](./docs/slices/phase-4/provider-metadata-launch-gap-tracker.md)
* **Revived/deferred providers:** [`docs/slices/phase-3/missing-providers-status.md`](./docs/slices/phase-3/missing-providers-status.md) → [`provider-completion-closeout.md`](./docs/slices/phase-3/provider-completion-closeout.md)
* **Per-slice plans & outcomes:** [`docs/slices/phase-1/`](./docs/slices/phase-1/), [`phase-2/`](./docs/slices/phase-2/), [`phase-3/`](./docs/slices/phase-3/) and [`parity/`](./docs/slices/parity/)

**Provider-addition gate (durable):** no net-new provider without a parity/audit doc
and a roadmap entry (roadmap §Phase 2). Local work is not pushed without Marcus.

---

## V2 Provider Authoring Rules

Universal rules every provider action / trigger / handler MUST follow. Per-provider
specifics and the full V1-rot rationale live in the outcome docs indexed under
**Deep Gotchas** below; where a rule has a dedicated reference it is linked here.

**Actions & schemas**
1. **Typed-and-narrow.** One provider endpoint per action. No generic `operation` / `deleteBy` / `searchColumn` router fields and no multi-purpose dispatchers — ship separate typed actions instead.
2. **No `make_api_call` escape hatch.** No generic method/path/body passthrough; fill gaps with targeted typed ports.
3. **`.strict()` schemas; reject raw provider wire-format.** The wrapper synthesizes provider wire-format from V2-shaped inputs — workflow authors never hand-author raw provider payloads.
4. **Q11 — explicit required fields, no hidden defaults.** High-risk / recipient-visible / behaviour-switching fields are required with no silent default (e.g. Sheets `valueInputOption`, Outlook `replyAll` / `isHtml` / `importance`).

**Outputs**
5. **Bounded outputs.** Build output from a fixed key set; never spread the raw provider response (`...result`).
6. **No bytes / base64 / content in outputs** — file-like outputs use `FileRef`. See [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md).
7. **No provider host / `paging.link` leakage.** Paginate via `nextCursor` + `hasMore`; never surface provider URLs/hosts into workflow variables.
8. **Errors propagate to the engine.** No `{success:false}` synthetic ActionResult envelope — throw and let the engine classify (`HANDLER_FAILED`).

**Lists & pagination**
9. **Single-page lists by default.** Return one page; authors compose a loop on `nextCursor` / `hasMore`. No silent auto-pagination.

**Triggers**
10. **`TriggerEvent.eventType` MUST equal the short form** passed to `registerActivation(provider, eventType, …)` and stored in `trigger_resources.event_type` — it drives dispatch lookup. Namespaced / classified subtypes go in `payload.classifiedType`, never in `eventType`.
11. **Baseline-first polling.** `onActivate` seeds the snapshot before the first poll; the first poll after activation fires zero events. Throw on seed failure (→ `TRIGGER_REGISTRATION_FAILED`) — never swallow it (the "first-poll-miss" bug).
12. **Trigger filters are pure.** No enrichment I/O (`*.info`), no `FileRef` construction, no Promises — the trigger emits a thin handle, the action does the I/O. Compose downstream for bytes/metadata.
13. **DB-backed dedup with stable provider IDs; fail-closed.** Key `webhook_event_dedup` on stable provider ids (hashes, not raw PII); on dedup outage skip-enqueue this tick. Prefix the eventId per-trigger when one entity fans out to multiple triggers.

**Porting & structure**
14. **Don't port V1 orphans on file-presence alone.** Registry presence — not `.ts` presence — defines the action set; orphan backfill is product-signal-gated.
15. **Manifest honesty.** Don't set `actions:true` / `webhookTrigger:true` until handlers/triggers are registered. (Also in *Important Defaults*.)
16. **50-file leaf-folder cap.** Split a provider's `actions/` into domain subfolders (`actions/channels/`, `actions/line_items/`) as it approaches the cap; update registry import paths to match.

**Cross-cutting contracts:** file output → [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md) · token-ingest auth → [`docs/rules/token-ingest-auth.md`](./docs/rules/token-ingest-auth.md).

---

## Provider & Contract Notes (index)

Durable per-provider and per-contract specifics — failure modes, V1-rot skip tables,
wire-format details — live in the outcome and rules docs below. The universal rules are
in **V2 Provider Authoring Rules** above; consult these only when working that provider
or contract.

**Cross-cutting contracts & rules**
- File output (FileRef / P-S3): [`docs/rules/file-output-contract.md`](./docs/rules/file-output-contract.md)
- Token-ingest auth (Trello pattern): [`docs/rules/token-ingest-auth.md`](./docs/rules/token-ingest-auth.md)
- Folder / module boundaries (50-file cap): [`docs/rules/project-structure-and-module-boundaries.md`](./docs/rules/project-structure-and-module-boundaries.md)
- Shared-mock e2e execution: [`docs/rules/testing-strategy.md`](./docs/rules/testing-strategy.md)

**Per-provider** (outcome docs carry the per-action/trigger detail + V1-rot skip tables)

- **Slack** — [`2.2 channels/lifecycle`](./docs/slices/phase-2/slack-2-2-private-channels-and-lifecycle.md) · [`2.3 channels+users`](./docs/slices/phase-2/slack-2-3-outcomes.md) · [`2.4 files (P-S3)`](./docs/slices/phase-2/slack-2-4-outcomes.md) · [`2.5 file_shared trigger`](./docs/slices/phase-2/slack-2-5-outcomes.md)
- **Gmail** — [`2.3 triggers + attachments`](./docs/slices/phase-2/gmail-2-3-outcomes.md)
- **Notion** — [`2.1 typed-and-narrow`](./docs/slices/phase-2/notion-2-1-outcomes.md)
- **Google Sheets** — [`2.1`](./docs/slices/phase-2/google-sheets-2-1-outcomes.md) · [`2.2 batch/format`](./docs/slices/phase-2/google-sheets-2-2-outcomes.md) · [`2.3 triggers/snapshots`](./docs/slices/phase-2/google-sheets-2-3-triggers-outcomes.md)
- **Microsoft Excel** — [`parity`](./docs/slices/parity/microsoft-excel-parity-outcomes.md)
- **Stripe** — [`2.1`](./docs/slices/phase-2/stripe-2-1-outcomes.md)
- **Airtable** — [`2.1`](./docs/slices/phase-2/airtable-2-1-outcomes.md)
- **Shopify** — [`2.1`](./docs/slices/parity/shopify-2-1-outcomes.md)
- **HubSpot** — [`2.1`](./docs/slices/parity/hubspot-2-1-outcomes.md)
- **Mailchimp** — [`2.1`](./docs/slices/parity/mailchimp-2-1-outcomes.md)
- **Outlook Mail** — [`2.1 compose/drafts`](./docs/slices/parity/outlook-mail-2-1-outcomes.md)
- **Native control-flow** — [`Tier C (if/router)`](./docs/slices/parity/native-nodes-3-tier-c-control-flow-outcomes.md)

---

## Living Documentation Rule

`CLAUDE.md` and the project docs are living documents. When a local batch changes the project's process, architecture, provider patterns, testing approach, branch strategy, or important implementation conventions, Claude must check whether the docs need to be updated.

Before any future push/PR, Claude should review the diff and ask:

- Did this change introduce or modify an architectural pattern?
- Did this change alter how providers should be ported from V1?
- Did this change add a new shared helper, registry, service, repo pattern, or testing convention?
- Did this change alter branch/process rules?
- Did this change add a provider pattern future providers should follow?
- Did this change make any existing CLAUDE.md guidance stale?

If yes, update the relevant documentation in the same local batch:

- `CLAUDE.md` for project-wide Claude/process/architecture guidance.
- `docs/slices/*` for slice-specific plans or retros.
- provider docs if the change is provider-specific.
- ops docs if the change affects deployment, cron, CI, secrets, or environment setup.

Do not update docs just for noisy implementation details. Update docs when the change affects how future work should be done.

Before pushing, Claude should explicitly report:

- whether documentation was reviewed,
- whether documentation needed updates,
- which docs were updated,
- or why no doc update was needed.

**Important:** Documentation updates should be committed locally with the related implementation batch when practical, not left as stale follow-up work.

---

## Internal developer tooling

- **Local MCP server** (read-only repo/doc/provider-metadata context for AI coding
  hosts): [`scripts/mcp/`](./scripts/mcp/) → `npm run mcp:build && npm run mcp:start`
  (health check: `npm run mcp:smoke`). At the start of a coding session, prefer its
  context tools (`get_project_memory`, `get_claude_instructions_summary`,
  `read_rule_doc`, `get_provider_manifest_summary`, `list_builder_metadata_gaps`)
  to ground in the repo's source of truth. What it exposes / deliberately does NOT
  expose (no prod data, no DB, no secrets, no mutation) + the Claude usage workflow:
  [`docs/runbooks/internal-mcp-server.md`](./docs/runbooks/internal-mcp-server.md).

## Reminders

- **Do not push unless Marcus explicitly says to push.** His approval of a verified
  batch authorizes a `v2-main` push, which deploys to prod (no staging env yet).
- **Use `chainreact-app-9e` as the V1 source/reference before implementing provider behavior.**
