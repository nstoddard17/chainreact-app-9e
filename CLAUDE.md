# ChainReactV2 — Claude Instructions

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
- **Do not push unless Marcus explicitly says to push.**
- Do not open PRs unless Marcus explicitly says to.
- Before major/shared-infrastructure work, write a short plan first.
- For provider work, audit V1 before coding.
- Prefer porting and adapting V1 behavior over inventing new behavior.

## Current Branch Strategy

Most V2 work is local-only for now.

Do not assume work should be pushed after each provider or slice.

Use local branches/commits to keep progress organized, but wait for Marcus before pushing.

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

Do not push after each batch unless Marcus explicitly says to.

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

## Current Local Development State

As of 2026-05-10, **Phase 1 (Provider foundation) is substantially complete locally** with 16 providers ported. See [`docs/roadmap/chainreact-v2-roadmap.md`](./docs/roadmap/chainreact-v2-roadmap.md) for the authoritative roadmap covering Phases 1–8.

**Completed locally (Phase 1):**
- Slack (slice 1)
- Gmail (slice 2)
- Google Calendar (slice 3)
- Google Drive (slice 4)
- Google Sheets (slice 5)
- Microsoft Outlook Mail (slice 6)
- Microsoft Outlook Calendar (slice 7)
- Microsoft OneDrive (slice 8)
- Notion (slice 9)
- Airtable (slice 10)
- Stripe (slice 11)
- Shopify (slice 12)
- HubSpot (slice 13)
- Mailchimp (slice 14)
- GitHub (slice 14b)
- Microsoft Excel (slice 15)

**Active local branch:** `v2-provider-port-local`

**Important:** Local provider work is not pushed. Do not assume any remote branch has the latest. Ask Marcus before pushing.

**Phase 1 → Phase 2 transition rule:** Do not add net-new providers without an audit doc and an entry in the roadmap. After Phase 1 the priority is provider parity (Phase 2) and UI/teams/AI/engine/billing/ops (Phases 3–8), in that order. See the roadmap for the gate rules.

**Phase 2 progress (Slack):**
- Slack 2.1 (messaging + reactions) — shipped locally. See [`docs/slices/slack-2-1-messaging-reactions-plan.md`](./docs/slices/slack-2-1-messaging-reactions-plan.md).
- Slack 2.2 (private channels + channel lifecycle triggers) — shipped locally. See [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](./docs/slices/slack-2-2-private-channels-and-lifecycle.md).
- Slack 2.3 (channel + user actions; 14 actions) — shipped locally. Plan: [`docs/slices/slack-2-3-channels-users-plan.md`](./docs/slices/slack-2-3-channels-users-plan.md). Outcomes: [`docs/slices/slack-2-3-outcomes.md`](./docs/slices/slack-2-3-outcomes.md).

---

## Deep Gotchas

### Slack message canonical eventType: `channel_type` is authoritative; `G…`-prefix fallback is intentionally dropped

`integrations/slack/webhooks/normalize.ts` derives one of four canonical
eventTypes for Slack `message` events: `slack.message.channel`,
`slack.message.group`, `slack.message.im`, `slack.message.mpim`. The
inner event's `channel_type` field is Slack's authoritative signal and
is checked first.

When `channel_type` is absent (legacy payloads, certain subtypes) the
normalizer falls back to channel-id prefix — but **only** for `C…`
(public channel) and `D…` (DM). The historical `G…`-prefix branch that
used to map to `mpim` was **removed in Slack 2.2** because the `G`
prefix is ambiguous: legacy private channels share it with group DMs
and the two cannot be disambiguated from the id alone. Such payloads
now emit generic `slack.message`, which has no registered filter — the
dispatcher drops with `matched=0`.

If you ever feel tempted to re-add a `G→mpim` (or any kind) fallback,
re-read the slice 2.2 retro doc first. Modern private channels carry
`channel_type === "group"` (often with a `C…` id); the authoritative
path resolves them cleanly.

### Slack action contract: id-only, no silent name resolution; `users:read.email` stays out by default

Every Slack action handler under [`integrations/slack/actions/`](./integrations/slack/actions/) accepts channel and user ids only:
- `channel` must match `^[CG][A-Z0-9]+$` (or `^[CDG][A-Z0-9]+$` for `get_channel_info`, which also resolves DMs).
- `user` must match `^U[A-Z0-9]+$`.

Handlers do NOT call `conversations.list` or `users.list` internally to
translate names → ids. Workflow authors that have only a name compose
`list_channels` / `list_users` upstream and select the id. V1 quietly
accepted a string-or-object union with name fallback; that path is
intentionally not ported (avoids hidden round-trips, eliminates
ambiguity when a name matches both a public and a private channel).

**`users:read.email` is permanently excluded from the Slack manifest.**
`users.info` and `users.list` work on plain `users:read`; Slack returns
`profile.email` as `null` / absent. Handlers do NOT project `email` to
top-level output — the raw `user` object is preserved so workspaces
that grant the scope externally can read `{{nodeId.user.profile.email}}`.
The V1 `findUser` (`users.lookupByEmail`) action is permanently skipped
(orphan + PII). If a workflow truly needs email-by-user-id, that's a
product decision that re-opens the scope question, not a quick port.

If you're adding a new Slack action, mirror this pattern: strict id
regex in the Zod schema, no name resolution side-effects in the
handler, no scope additions beyond what Slack's docs require for the
specific endpoint.

### Slack action folder grouping

[`integrations/slack/actions/`](./integrations/slack/actions/) is
domain-grouped to stay under the 50-file leaf-folder limit:
- `actions/channels/` — channel reads + lifecycle / admin / membership / metadata (12 actions).
- `actions/users/` — user lookups (2 actions).
- `actions/` parent — messaging, scheduling, reactions+pins, Block Kit, helpers.

New Slack actions land in the domain subfolder that matches their Slack
API namespace. New domains (e.g. `files/` for Slack 2.4) get their own
subfolder. Import paths in `services/execution/handlers/_registry.ts`
and test files must follow the same convention.

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

## Reminders

- **Do not push unless Marcus explicitly says to push.**
- **Use `chainreact-app-9e` as the V1 source/reference before implementing provider behavior.**
