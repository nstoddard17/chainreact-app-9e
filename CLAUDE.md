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

As of 2026-05-12, **Phase 1 (Provider foundation) is substantially complete locally** with 17 providers ported. See [`docs/roadmap/chainreact-v2-roadmap.md`](./docs/roadmap/chainreact-v2-roadmap.md) for the authoritative roadmap covering Phases 1–8.

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
- Trello (slice 17) — V2's first **token-ingest** provider. Plan: [`docs/slices/slice-17-trello.md`](./docs/slices/slice-17-trello.md). Contract: [`docs/slices/trello-token-ingest-contract-plan.md`](./docs/slices/trello-token-ingest-contract-plan.md). Outcomes: [`docs/slices/trello-token-ingest-outcomes.md`](./docs/slices/trello-token-ingest-outcomes.md).

**Active local branch:** `v2-provider-port-local`

**Important:** Local provider work is not pushed. Do not assume any remote branch has the latest. Ask Marcus before pushing.

**Phase 1 → Phase 2 transition rule:** Do not add net-new providers without an audit doc and an entry in the roadmap. After Phase 1 the priority is provider parity (Phase 2) and UI/teams/AI/engine/billing/ops (Phases 3–8), in that order. See the roadmap for the gate rules.

**Phase 2 progress (Slack):**
- Slack 2.1 (messaging + reactions) — shipped locally. See [`docs/slices/slack-2-1-messaging-reactions-plan.md`](./docs/slices/slack-2-1-messaging-reactions-plan.md).
- Slack 2.2 (private channels + channel lifecycle triggers) — shipped locally. See [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](./docs/slices/slack-2-2-private-channels-and-lifecycle.md).
- Slack 2.3 (channel + user actions; 14 actions) — shipped locally. Plan: [`docs/slices/slack-2-3-channels-users-plan.md`](./docs/slices/slack-2-3-channels-users-plan.md). Outcomes: [`docs/slices/slack-2-3-outcomes.md`](./docs/slices/slack-2-3-outcomes.md).
- Slack 2.4 (file actions; 3 actions: `upload_file`, `download_file`, `get_file_info`) — shipped locally. First V2 consumer of the P-S3 contract. Plan: [`docs/slices/slack-2-4-files-plan.md`](./docs/slices/slack-2-4-files-plan.md). Outcomes: [`docs/slices/slack-2-4-outcomes.md`](./docs/slices/slack-2-4-outcomes.md).
- Slack 2.5 (file_uploaded trigger; `slack.file_shared`) — shipped locally. Pure-filter slice; zero runtime infrastructure / manifest / normalizer changes. Trigger payload is raw Slack inner event passthrough; composition with `slack:get_file_info` is the canonical metadata story. Plan: [`docs/slices/slack-2-5-file-uploaded-trigger-plan.md`](./docs/slices/slack-2-5-file-uploaded-trigger-plan.md). Outcomes: [`docs/slices/slack-2-5-outcomes.md`](./docs/slices/slack-2-5-outcomes.md).
- Gmail 2.3 (triggers + attachments; 2 triggers + 1 action: `new_labeled_email`, `new_attachment`, `get_attachment`) — shipped locally. Second V2 consumer of the P-S3 contract. Pinned the per-trigger dedup-prefix convention (`labeled:` / `attachment:`) AND the metadata-only-trigger + byte-materialization-action pattern. V1's `downloadAttachment` is intentionally folded into `get_attachment` (no separate handler, no registry alias). Plan: [`docs/slices/gmail-2-3-triggers-attachments-plan.md`](./docs/slices/gmail-2-3-triggers-attachments-plan.md). Outcomes: [`docs/slices/gmail-2-3-outcomes.md`](./docs/slices/gmail-2-3-outcomes.md).

**Phase 2 progress (Notion):**
- Notion 2.1 (page lifecycle + users + comments + databases/blocks; 9 actions: `archive_page`, `restore_page`, `get_user`, `list_users`, `create_comment`, `list_comments`, `create_database`, `get_block`, `get_block_children`) — shipped locally. Zero new platform infrastructure; every action fits Slice 9's OAuth + property polymorphism + `notionRequest` stack. V1's 3,041-LOC `handlers.ts` kitchen-sink dispatcher + the `manage_*` routers are NOT ported — Notion 2.1 ships 9 typed `ActionHandler` modules with locked output key sets and `.strict()` schemas. Plan: [`docs/slices/parity-notion.md`](./docs/slices/parity-notion.md). Outcomes: [`docs/slices/notion-2-1-outcomes.md`](./docs/slices/notion-2-1-outcomes.md). Property + block type expansion deferred to Notion 2.2; webhook triggers deferred to Notion 2.3 conditional on P-N1 manual-webhook UX product decision.

**Phase 2 platform (file output contract):**
- P-S3 (FileRef + Supabase storage stack) — shipped locally. Plan: [`docs/slices/p-s3-file-output-contract-plan.md`](./docs/slices/p-s3-file-output-contract-plan.md). Outcomes: [`docs/slices/p-s3-file-output-contract-outcomes.md`](./docs/slices/p-s3-file-output-contract-outcomes.md). Unblocks Slack 2.4 file actions and any future provider chains that move bytes (Gmail/Drive/Outlook attachments).

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
- `actions/files/` — `upload_file`, `download_file`, `get_file_info` (3 actions; Slack 2.4).
- `actions/` parent — messaging, scheduling, reactions+pins, Block Kit, helpers.

New Slack actions land in the domain subfolder that matches their Slack
API namespace. Import paths in `services/execution/handlers/_registry.ts`
and test files must follow the same convention.

### Slack file actions: P-S3 enforcement specifics (Slack 2.4)

Every Slack file handler under [`integrations/slack/actions/files/`](./integrations/slack/actions/files/) consumes / produces `FileRef` exclusively. The 10 V1 rot patterns from the Slack 2.4 plan §7 (inline `content` / `base64Data` config arms, `fileSource` discriminator, `asUser` toggle, `workspace` selector, raw URL config arm, base64 outputs, logging `url_private_download`) are not ported and must not be reintroduced.

Two Slack-specific applications of the P-S3 gotcha (below) worth pinning:

- **`upload_file` rejects `FileRef(kind=provider_url)` at handler entry.** Slack 2.4 does NOT introduce a Slack-specific `providerFetcher` and does NOT extend `core/files/fetchFileBytes.ts`. Workflow authors composing `<any>:get_file_info → slack:upload_file` must materialize durable bytes first (`<any>:download_file` → `FileRef(v2_storage)` → `slack:upload_file`). A cross-provider `provider_url` fetch adapter is future platform work, not Slack 2.4 scope. Per P-S3 durable rule #5.
- **`download_file` is bot-token only.** `url_private_download` GETs attach `Authorization: Bearer ${botToken}` and nothing else. No user-token (`xoxp-…`) file scopes are in the manifest. V1's `asUser: true` toggle is not ported.

### Slack file actions e2e: workflow_files migration + `--workers=1`

Running [`tests/e2e/slice-1-slack-walkthrough.spec.ts`](./tests/e2e/slice-1-slack-walkthrough.spec.ts) against a fresh Supabase project requires `npm run db:push` first — the Slack 2.4 download/upload scenarios depend on the `workflow_files` table (and on Supabase storage being reachable). Slack walkthrough specs also share the mock-Slack `__inspect` counter; local runs MUST pass `--workers=1`. CI is already pinned to workers=1 in `playwright.config.ts`. Test fixtures must use Slack-format ids (no hyphens: `^[CG][A-Z0-9]+$` for channels, `^F[A-Z0-9]+$` for files, `^U[A-Z0-9]+$` for users), and `workflow_files.run_id` requires UUID-shaped values.

### Slack `file_shared` events use snake_case `_id`-suffixed fields, NOT bare `channel` (Slack 2.5)

Slack's `file_shared` event uses `event.file_id`, `event.user_id`, `event.channel_id` — UNLIKE the `message` event which uses bare `event.channel` and `event.user`. Trigger filters reading the wrong field silently never match. The [`fileUploaded`](./integrations/slack/triggers/fileUploaded/filter.ts) filter reads `payload.channel_id`; copy-pasting from `memberJoinedChannel` or `newMessageChannel` (which use bare `payload.channel`) is the bug-magnet. Both the unit test ([`tests/unit/integrations/slack/triggers/fileUploaded/filter.test.ts`](./tests/unit/integrations/slack/triggers/fileUploaded/filter.test.ts)) and the e2e regression guard (decoy `payload.channel` carried alongside the correct `payload.channel_id`) pin this from both angles. When adding a new Slack trigger filter, consult Slack's event docs for the exact payload key (snake_case `_id` vs bare) before reading it.

### Slack trigger filters are pure: no `files.info`, no FileRef construction, no I/O (Slack 2.5)

Slack trigger filters under [`integrations/slack/triggers/`](./integrations/slack/triggers/) are pure synchronous `parseConfig` + `evaluate` functions. They MUST NOT call `files.info` / `conversations.info` / `users.info` to enrich the payload, MUST NOT construct a `FileRef`, and MUST NOT return Promises. The trigger payload is the raw Slack inner event verbatim. Workflows that need enriched metadata or a `FileRef` compose the right action downstream (e.g. `slack.file_shared → slack:get_file_info` yields `FileRef(kind=provider_url)` + flat metadata; `slack.file_shared → slack:download_file` yields `FileRef(kind=v2_storage)` + staged bytes). V1's 17-field synthetic output schema for `fileUploaded` (`fileName`, `fileType`, `fileSize`, `fileUrl`, `userName`, `channelName`, etc.) was fiction — not in Slack's raw payload, never wired in V1 either, and not ported to V2. If a Slack trigger payload appears to be "missing" data, the answer is composition, not enrichment inside the filter.

### Token-ingest auth contract (Slice 17 — Trello pattern)

V2 ships **two** auth contracts side by side, discriminated by `ProviderManifest.authFlow`:

- `"code_callback"` (DEFAULT) — standard OAuth 2.0 code/state through `ProviderOAuth`. Every provider through Slice 16 uses this.
- `"token_ingest"` — provider returns token in URL fragment; V2 client page POSTs it to `/api/integrations/oauth/[provider]/ingest` → `dispatcher.handleTokenIngest` → server-side verify + persist. **Trello is the inaugural production consumer.**

Reach for `ProviderTokenIngestAuth` ONLY when the provider's auth flow does not surface a `code` to a server callback. If a provider has any working OAuth 2.0 code/state flow, use `ProviderOAuth` — do not "future-proof" by adopting token-ingest where it's not required. Schema invariant: `authFlow: "token_ingest"` AND `refreshable: true` is rejected at manifest load (token-ingest providers do not refresh).

Token-ingest dispatcher checks are stricter than OAuth callback in one place: **session user MUST equal state JWT's userId.** Both server hops (connect + ingest) share a browser session, so a state token POSTed by a different signed-in user is unambiguously a hijack attempt and rejected with `InvalidStateError("session/state user mismatch")`.

Full design + 12 numbered security rules: [`docs/slices/trello-token-ingest-outcomes.md`](./docs/slices/trello-token-ingest-outcomes.md) §3.

### `TriggerEvent.eventType` MUST match `trigger_resources.event_type` short form

**Pinned by a Slice 17 Commit 5 → Commit 6 bug.** Webhook normalizers emit a canonical `TriggerEvent`; `dispatchTriggerEvent` looks up matching workflows via `listForDispatch(provider, eventType)`. If the normalizer puts a provider-classified namespaced form (e.g. `"trello.card.created"`) into `eventType` while `trigger_resources.event_type` stores the short form (`"new_card"`, from `registerActivation("trello", "new_card", …)`), the lookup matches zero rows and workflow_runs are never created.

**Rule for every provider with a webhook trigger:**

> `TriggerEvent.eventType` MUST match the short form passed to `registerActivation(provider, eventType, …)` — the same value stored in `trigger_resources.event_type`. The provider's namespaced / classified subtype belongs in `payload.classifiedType` (or another payload field) for advanced workflow refs, NOT in the canonical `eventType` field that drives dispatch lookup.

Trello's `_shared/normalize.ts` separates the two: `triggerEventType: TrelloTriggerEventName` (short form, emitted as `TriggerEvent.eventType`) and `classifiedType: TrelloEventType` (namespaced, emitted on `payload.classifiedType`). Every other provider's normalizer should be sanity-checked against this rule when reviewed.

**Companion rule for action handlers consuming `triggerEvent.accountId`:** the `accountId` field is the **event scope** (Trello = board id; Slack = team id; etc.), NOT necessarily the integration discriminator. For `tokenScope: "user"` providers like Trello, action handlers MUST pass `accountId: null` to `refreshAndRetry` so `getActiveForExecution` returns the first active row for the user. Passing `triggerEvent.accountId` blindly will fail integration lookup when event-scope and integration-scope disagree. Slice 17 Commit 6 fixed this across all 8 Trello action handlers after the e2e exposed it.

### Gmail attachment triggers stay metadata-only; `get_attachment` is the only byte path (Gmail 2.3)

Gmail's attachment-related triggers under [`integrations/gmail/triggers/`](./integrations/gmail/triggers/) (`new_attachment`, and any future attachment-aware additions) MUST stay metadata-only at the trigger boundary. Their payload may carry `attachments[]` + `attachmentCount` (per-attachment objects with exactly `attachmentId`, `filename`, `mimeType`, `sizeBytes`), but MUST NOT include `file`, `FileRef`, `data`, `content`, `base64`, or `bytes`. Triggers that need to enumerate attachments hydrate with `usersMessagesGet({ format: "full" })` and walk `payload.parts` via the shared [`extractAttachmentMetadata`](./integrations/gmail/triggers/newAttachment/extractAttachmentMetadata.ts) (filename non-empty AND `body.attachmentId` present); the bytes endpoint (`users.messages.attachments.get`) is NOT touched at trigger time. Workflow authors who need bytes compose `gmail/get_attachment(messageId, attachmentId)` downstream — that action is the ONLY Gmail surface that materializes bytes via `stageFileToStorage` and emits `FileRef(kind=v2_storage, provider="gmail")`. The metadata stored on the `workflow_files` row is restricted to exactly `{ messageId, attachmentId }` — no email headers, no subject, no addresses, no snippets, no tokens, no PII.

V1's `downloadAttachment` action (cross-provider Drive/OneDrive/Dropbox routing inside a single 413-line handler) is folded into `get_attachment` per Gmail 2.3 plan §8 + decision §13.1. There is no `gmail:download_attachment` registry entry and no alias — the registry test asserts both `get_attachment` IS registered and `download_attachment` is NOT. V1's cross-provider upload step is replaced by composition: `gmail/get_attachment → <provider>/upload_file` consumes the FileRef. Do NOT reintroduce `download_attachment` as a separate action, an alias, or a flag on `get_attachment`. Do NOT add a `storageService` / `folderId` config field to `get_attachment`. Provider routing is the workflow's job, not the action's.

The same trigger-vs-action separation generalizes to future Gmail surfaces (and arguably to any provider where the trigger emits a thin handle and the action does the I/O). If a Gmail trigger payload "needs" file bytes, the answer is composition, not enrichment inside the trigger.

### Per-trigger Gmail dedup prefix convention (Gmail 2.3)

`webhook_event_dedup` is keyed on `(provider, eventId)`. When a single Gmail message can independently fire multiple polling triggers (`new_email`, `new_labeled_email`, `new_attachment`), each trigger's dedup wrapper prefixes the `eventId` so the same provider message id stays distinguishable across trigger types:

| Trigger | Dedup key | Wrapper |
|---|---|---|
| `new_email` | `<messageId>` (bare) | [`newEmail/dedup.ts:checkAndMarkSeen`](./integrations/gmail/triggers/newEmail/dedup.ts) |
| `new_labeled_email` | `labeled:<messageId>` | [`newLabeledEmail/dedup.ts:checkAndMarkSeenLabeled`](./integrations/gmail/triggers/newLabeledEmail/dedup.ts) |
| `new_attachment` | `attachment:<messageId>` | [`newAttachment/dedup.ts:checkAndMarkSeenAttachment`](./integrations/gmail/triggers/newAttachment/dedup.ts) |

The prefix is the dedup wrapper's responsibility — never the dispatcher's. The canonical `TriggerEvent.eventId` value uses the same prefix (`labeled:<id>` / `attachment:<id>`) so cross-trigger-type events stay distinguishable at the dispatch layer too. Any future Gmail trigger that can re-fire on the same message id MUST take a fresh prefix; don't reuse an existing one. The same convention generalizes to any provider with multiple polling triggers that fan out across the same provider entity.

### Notion Phase 2 patterns: typed-and-narrow, no kitchen-sink, no escape hatch (Notion 2.1)

Notion's V1 source is the largest single-file kitchen-sink in the V1 codebase ([`lib/workflows/actions/notion/handlers.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/notion/handlers.ts), 3,041 LOC, ~30 exported action functions in one file plus 532/613/288/140/130-LOC per-domain `manage_*` routers). V2 Notion Phase 2 deliberately does NOT recreate this shape. Four durable rules every future Notion action / wrapper / schema MUST follow:

1. **Typed actions only, one Notion endpoint per V2 action.** No `operation: string` dispatch fields. No multi-purpose routers. If a Notion endpoint needs multiple V2 ports (e.g. PATCH /v1/pages with `archived: true` vs `archived: false`), ship them as separate typed actions with hard-coded behavior — see `archivePage.ts` / `restorePage.ts` for the precedent. The Slack 2.3 / 2.4 per-action-file convention applies identically.
2. **No `make_api_call` escape hatch.** V1 ships [`notion_action_api_call`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/nodes/providers/notion/actions/makeApiCall.schema.ts) accepting method/path/body/headers as a generic passthrough — V2 does NOT port and does NOT introduce equivalents. Action gaps are filled by targeted typed ports tracked in [`docs/slices/parity-notion.md`](./docs/slices/parity-notion.md) §7.
3. **No raw Notion payload passthrough.** Schemas are `.strict()` and reject raw `rich_text` arrays, raw property wire-format objects (e.g. `{ select: { options: [...] } }`), raw block objects, and pre-built `parent: { workspace: true }` discriminators. V2 wrappers synthesize Notion's wire-format from V2-shaped inputs (`text: string` → rich_text array; `properties: Record<string, { type }>` → `{ <name>: { <type>: {} } }`). The handler synthesizes, the wrapper sends — workflow authors never see Notion's wire-format unless explicitly approved by a parity-audit decision (e.g. `queryDatabase`'s forward-passed `filter` object, which is a documented exception per Slice 9).
4. **List actions are single-page by default.** `list_users` / `list_comments` / `get_block_children` (and `queryDatabase` / `search` from Slice 9) all return exactly ONE page of results. Workflow authors compose a downstream loop on `nextCursor` + `hasMore` to walk all pages. Auto-pagination is rejected — Notion's rate limits + the runs-table size cost both argue against silent multi-page fetches inside a single action. Unit tests pin this with explicit "exactly one wrapper call when has_more is true" guards.

V1 chrome NOT ported across Notion 2.1: synthetic `total_count` / `count` fields on list outputs, `is_guest` / `includeGuests` heuristic, `recent_activity` enrichment, `access_level` / `description` invented fields, `workspace` per-action selector, `selectedBlock` dual-mode picker indirection, `parseInt(page_size) || 100` coercion, hidden `parent: { workspace }` fallback, input-spread-into-output (`...result.output`). All rejected at audit or schema time. Full list: [`docs/slices/notion-2-1-outcomes.md`](./docs/slices/notion-2-1-outcomes.md) §7.

### File output contract (P-S3)

V2 ships a strict file-output contract. Full design + 10 numbered security rules: [`docs/slices/p-s3-file-output-contract-outcomes.md`](./docs/slices/p-s3-file-output-contract-outcomes.md). Six durable rules every future provider / handler / repository / service must follow:

1. **Action outputs never carry raw file bytes or base64.** No `content`, `bytes`, `base64`, or `data` keys for file content. The Zod `FileRefSchema` is `.strict()` per arm — those keys are rejected at parse time. The runs table is the audit/debug surface; it MUST stay free of binary blobs.
2. **File-like outputs use `FileRef`.** Constructed via the builders in [`core/files/createFileRef.ts`](./core/files/createFileRef.ts) (`fileRefFromProviderUrl`, `fileRefFromStoragePath`, `fileRefFromSignedUrl`), never as object literals. `FileRefKind` is closed: `"provider_url"`, `"v2_storage"`, `"signed_url"`. No inline arm — there is no `kind` value that legitimizes inline bytes.
3. **Download actions stage durable bytes to `v2_storage`** via [`services/files/stageFileToStorage.ts`](./services/files/stageFileToStorage.ts) unless they are intentionally returning metadata-only (`provider_url` for unchanged provider URLs, `signed_url` for auth-free links). Staging is the default because the runs table outlives provider URL TTLs and cross-provider chains need durable bytes.
4. **Repositories stay metadata-only; Supabase storage access lives in `services/files/`.** [`repositories/workflowFiles.ts`](./repositories/workflowFiles.ts) does CRUD over `public.workflow_files` rows and nothing else — zero `supabase.storage.*` access. The Commit 3 `storage isolation invariant` test enforces this with a mock client whose `.storage` field is `undefined`. New file flows put their object I/O in `services/files/`.
5. **`provider_url` fetching requires explicit provider-safe auth handling.** [`core/files/fetchFileBytes.ts`](./core/files/fetchFileBytes.ts) deliberately throws `UnsupportedProviderFetchError` for `kind=provider_url`. Per-provider helpers land alongside the consumer slice (Slack 2.4 download is the first). Do NOT implement a generic "fetch any provider URL with whatever token I can find" path — token lookup, scope checking, and refresh handling are provider-specific.
6. **The cleanup cron response is counts-only.** [`/api/cron/cleanup-workflow-files`](./app/api/cron/cleanup-workflow-files/route.ts) MUST NOT expose row ids, storage paths, or user ids — cron monitors are operational surfaces that would otherwise leak workflow / user metadata. The response shape is `{ ok, scanned, storageDeleted, metadataDeleted, failed, startedAt }`; the route test diffs JSON keys against this set.

**Companion rules (also covered in the outcomes doc):**

- The `workflow-files` Supabase storage bucket is created **out-of-band** (ops); SQL migrations do not poke at `storage.buckets`. The bucket name + path scheme `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` are pinned in [`core/files/fetchFileBytes.ts::WORKFLOW_FILES_BUCKET`](./core/files/fetchFileBytes.ts) and the migration header.
- `signed_url` refs are bearer-equivalent secrets. Producers MUST set `expiresAt` when the lifetime is known. The URL never appears in logs or error messages — `fetchFileBytes` strips it from `FileFetchError`.
- Filenames are sanitized via [`core/files/sanitizeFilename.ts`](./core/files/sanitizeFilename.ts) before any storage path or provider API use. Always.
- Per-provider size guidance ([`core/files/limits.ts`](./core/files/limits.ts)) is **advisory** — Phase 7 will add hard quotas. Stage warns when exceeded but does not reject.

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
