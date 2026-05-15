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

**Phase 2 progress (Google Sheets):**
- Google Sheets 2.1 (cell + row + spreadsheet lifecycle; 5 actions: `get_cell_value`, `update_cell`, `delete_row`, `find_row`, `create_spreadsheet`) — shipped locally. Zero new platform infrastructure; every action fits Slice 5's OAuth + `refreshAndRetry` + per-method wrapper stack with 2 new wrappers added for endpoints Slice 5 didn't touch (`spreadsheetsBatchUpdate`, `spreadsheetsCreate`). V1's 123-LOC `unifiedAction.ts` add/update/delete router + `deleteRow.ts`'s `deleteBy` kitchen-sink dispatcher + `createSpreadsheet.ts`'s template/initialData/Drive-folder chrome are NOT ported — Google Sheets 2.1 ships 5 typed `ActionHandler` modules with `.strict()` schemas and locked output key sets. Plan: [`docs/slices/parity-google-sheets.md`](./docs/slices/parity-google-sheets.md). Outcomes: [`docs/slices/google-sheets-2-1-outcomes.md`](./docs/slices/google-sheets-2-1-outcomes.md). E2E coverage extended in [`tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts`](./tests/e2e/slice-5b-google-sheets-walkthrough.spec.ts) — one workflow chain exercises all 5 new actions end-to-end. `batch_update` + `format_range` deferred to Google Sheets 2.2; trigger expansion (`updated`/`removed` change kinds + `new_worksheet`) deferred to Google Sheets 2.3 conditional on P-GS1 per-row diff detection product decision.

**Phase 2 progress (Microsoft Excel):**
- Microsoft Excel parity (4 net-new actions: `update_row`, `delete_row`, `rename_worksheet`, `delete_worksheet`; 1 batch-mode fold: `add_row` gains `rows[]` mode absorbing V1's `addMultipleRows`; 3 net-new polling triggers: `new_worksheet`, `updated_row`, `updated_table_row`) — shipped locally. **Feature-complete.** Zero new platform infrastructure; every action/trigger fits Slice 15's OAuth + `Files.ReadWrite` + shared `microsoftExcelPollingHandler` stack. V1's 444-LOC `addMultipleRows.ts` is permanently folded into `add_row` — no separate registry entry. V1's `createWorkbook` ExcelJS CJS dependency stays deferred (R-Excel-3; opens only if ExcelJS bundle weight is approved or a Graph-native workbook-create path is found). Plan: [`docs/slices/parity-microsoft-excel.md`](./docs/slices/parity-microsoft-excel.md). Outcomes: [`docs/slices/microsoft-excel-parity-outcomes.md`](./docs/slices/microsoft-excel-parity-outcomes.md). E2E coverage extended to 9/9 scenarios in [`tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts`](./tests/e2e/slice-15-microsoft-excel-walkthrough.spec.ts) — every parity action + every parity trigger exercised end-to-end.

**Phase 2 progress (Stripe):**
- Stripe 2.1 (checkout + payment link + invoice + charges list + 2 finders; 6 actions: `create_checkout_session`, `create_payment_link`, `create_invoice`, `get_payments`, `find_subscription`, `find_payment_intent`) — shipped locally. Zero new platform infrastructure; every action reuses Slice 11's `stripeRequest` + `flattenForStripe` + `refreshAndRetry` + Q4 idempotency stack. V1's 13 orphan handler files (products / prices / invoice line items / finalize / void / findCharge / findInvoice / listProducts / getCustomers — none wired in V1's registry) are NOT pre-ported; orphan backfill is on-demand only and gated by product signal. Event allowlist gains `invoice.created` + `customer.subscription.trial_will_end` (18 events total); Slice 11's 16 events preserved. `get_payments` corrects V1's endpoint to `/v1/charges` (V1 hit `/v1/payment_intents` and labeled the result "payments"). Plan: [`docs/slices/parity-stripe.md`](./docs/slices/parity-stripe.md). Outcomes: [`docs/slices/stripe-2-1-outcomes.md`](./docs/slices/stripe-2-1-outcomes.md). E2E coverage extended in [`tests/e2e/slice-11-stripe-walkthrough.spec.ts`](./tests/e2e/slice-11-stripe-walkthrough.spec.ts) — one signed `payment_intent.succeeded` event fans out via `services/triggers/dispatch.ts:listForDispatch` to 6 workflows, each exercising a distinct Stripe 2.1 endpoint with wire-format assertions. Stripe billing webhook (`/api/webhooks/stripe-billing`) is a separate billing-product concern, intentionally untouched by Stripe 2.1. Orphan-action backfill deferred to Stripe 2.2 conditional on product signal.

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

### Google Sheets Phase 2 patterns: typed-and-narrow, single-cell cell actions, single-row delete, equals-only find, bare-API create (Google Sheets 2.1)

Google Sheets's V1 surface ships kitchen-sink shapes across nearly every action: a 123-LOC [`unifiedAction.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/unifiedAction.ts) router dispatching add/update/delete via a single `config.action` field, a `deleteBy: "row_number" | "range" | "column_value"` mode dispatcher on [`deleteRow.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/google-sheets/deleteRow.ts), a 12-operator filter-and-export schema on `export_sheet` / `listRows.ts`, and a 302-LOC [`createSpreadsheet.ts`](c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/googleSheets/createSpreadsheet.ts) with template chrome (budget/project/crm/inventory/calendar), CSV initialData prefill, description-as-A1-note workaround, and Drive folder placement. V2 Google Sheets Phase 2 deliberately does NOT recreate these shapes. Six durable rules every future Sheets action / wrapper / schema MUST follow:

1. **Typed actions only, one Sheets endpoint per V2 action.** No `action` / `deleteBy` / `searchColumn` discriminator fields. No multi-purpose routers. V1's `unifiedAction.ts` add/update/delete pattern is NOT ported — V2 ships separate `append_row` / `update_row` / `delete_row` typed actions. V1's `deleteRow.ts` mode dispatcher is NOT ported — `delete_row` is single-row-by-rowNumber only; range/column-value/cascade modes compose via `find_row` + multiple `delete_row` calls in descending order.

2. **Cell actions are single-cell only — A1 regex enforced.** `get_cell_value` and `update_cell` validate `cell` against `^[A-Za-z]+[0-9]+$`. Ranges (`A1:B5`), full columns (`A:A`), full rows (`1:1`), and bare letters/digits are rejected at parse time. Workflows that want range reads/writes compose `read_rows` / `update_row` / `clear_range` instead. Cell actions exist precisely to avoid the array-of-arrays output (`read_rows`) when the caller knows they want a scalar. The handler builds the A1 range as `<sheetName>!<cell>` — no implicit default sheet, no range syntax leaking into the input shape.

3. **`find_row` is equals-only, case-sensitive, header-name only in Sheets 2.1.** `operator` is `z.literal("equals")` (forward-compat enum widening; Sheets 2.2+ can add `"contains"` / `"starts_with"` / `"greater_than"` non-breakingly). `column` accepts header name only — no `*` wildcard, no single-letter shorthand. Equality is `String(cell) === String(value)` coerced (handles numeric stored as number vs string-passed value). Case-sensitivity is the floor — V1's `toLowerCase()` + `normalizeBooleanValue` heuristic (mapping yes/y/true/1/on → true) is NOT ported. Empty cells in the search column are skipped during scan. Output is uniform across single + `returnAll` modes — same key set `{found, firstMatch, matches, count}` so workflow templates don't fork.

4. **`create_spreadsheet` ships the bare `spreadsheets.create` surface only.** Just `title` (required) + `initialSheetName` (optional). Omitting `initialSheetName` sends NO `sheets[]` field and lets Google create the default `Sheet1`; providing it sends `sheets: [{ properties: { title } }]` only. No `template` chrome (budget / project / crm / inventory / calendar with hardcoded headers + sample rows). No `initialData` CSV prefill. No `description` as A1-note workaround via follow-up `batchUpdate`. No `folder` placement via secondary `drive.files.update`. No `locale` / `timeZone` overrides. No `sheetNames[]` multi-sheet array. No silent `title = "New Spreadsheet"` default. No hardcoded `gridProperties: { rowCount: 1000, columnCount: 26 }`. Multi-sheet creation and folder placement compose via downstream actions; template UX is a Phase 3 builder concern. `create_spreadsheet` is intentionally NOT wrapped in Q4 idempotency — create-shaped actions return a fresh resource on every workflow re-run, which is the right semantics.

5. **`valueInputOption` is REQUIRED on every Sheets write handler (Q11).** `update_cell` (matching Slice 5's `append_row` + `update_row`) requires `valueInputOption: "RAW" | "USER_ENTERED"` at the schema layer — no hidden default. V1's `updateCell.ts` silently defaulted to `USER_ENTERED` which surprised users when literal cell content containing `=` was parsed as a formula. V2 forces the choice.

6. **Auxiliary calls also wrap in `refreshAndRetry`.** `delete_row` composes `spreadsheetsGet` (sheetName → sheetId resolution) + `spreadsheetsBatchUpdate` (the principal write). BOTH calls go through `refreshAndRetry` — auxiliary metadata fetches that precede a write need the same token-decryption + 401 retry mediation as the write itself. Per CLAUDE.md §"OAuth 401 handling" rule.

V1 rot NOT ported across Google Sheets 2.1: `unifiedAction.ts` router (GS-R1), hyphenated `google-sheets_action_export_sheet` action name (GS-R2), orphan `createRow.ts` / `listRows.ts` handlers (GS-R3), `parseInt(maxRows) || 100` silent default coercion (GS-R4), `config.is_inline === "true"` string-typed booleans (GS-R5), V1 silent-partial-failure shape (GS-R6), `confirmDelete` UI gate, `deletedData` pre-delete output, `deleteAll` cascade, `rowSelection: "last" | "first_data"` shortcuts. Open empty-cell convention: `get_cell_value` returns `value: null` for blank cells (NOT `""`) — workflows branch on `{{node.value}} == null`. Full V1 rot inventory + skip table: [`docs/slices/google-sheets-2-1-outcomes.md`](./docs/slices/google-sheets-2-1-outcomes.md) §§3 + 7.

### Microsoft Excel Phase 2 patterns: handler-internal headers, batch-folded `add_row`, positional vs stable-id triggers, no ExcelJS (Microsoft Excel parity)

Microsoft Excel Phase 2 closed the Slice 15 gap with 4 net-new actions + a batch-mode fold + 3 new polling triggers, all on top of the same OAuth + shared `microsoftExcelPollingHandler` stack. Four durable rules every future Excel action / wrapper / trigger MUST follow:

1. **Header-aware actions read headers handler-internal, not via a UI dynamic-field renderer.** `update_row` + `add_row` (batch mode) both fetch `usedRange` at execution time and resolve header names against the resulting row 1. The Phase 2 dynamic-field renderer is **explicitly deferred to Phase 3 UI work** (P-X1 acceptance). Unknown column names FAIL LOUDLY listing every offender — no silent skip, no synthetic header (V1's behavior in some code paths was to skip; V2 rejects). `update_row` also PATCHes the full merged row (existing values overlaid with the supplied updates) so untouched cells stay populated — V1's per-cell PATCH loop is NOT ported.
2. **`add_multiple_rows` is permanently folded into `add_row` `rows[]` mode.** There is **no** `microsoft-excel:add_multiple_rows` registry entry. The single `add_row` handler picks between `values` (single-row, backwards-compatible Slice 15) and `rows[]` (1..1000 batch) via the schema's XOR refine. Batch mode is fail-loud: > 1000 rows rejected at parse time before any Graph call, empty row objects rejected, all unknown column names across all rows reported in one error. **No silent chunking, no partial success** (V1's `addMultipleRows` chunked into 200-row batches and could partially succeed; V2 does exactly one range PATCH for the whole batch). Pattern mirrors Gmail 2.2's `advancedSearch → searchEmails` fold and Notion 2.1's `list_page_content → get_block_children` fold.
3. **`updated_row` is positional and noisy under inserts/deletes; use `updated_table_row` for stable identity.** `updated_row` keys its snapshot on the 1-based row index as a string — a mid-sheet insert or delete shifts subsequent rows and flags every shifted row as "updated" on the next poll. This is an **accepted limitation** (audit NPD-T, Marcus 2026-05-14) and is NOT guarded inside the handler. Workflow authors that need stable row identity use `updated_table_row` instead, which keys on Graph's stable `index` so neighbor mutations do NOT spuriously fire. `new_worksheet` semantics: renames look like `{ remove old name, add new name }` from Graph's `/worksheets` endpoint and fire **one** event with `payload.worksheetName === <new>`. All three new triggers seed their baseline at activation time and **throw** on seed failure (orchestrator wraps as `TRIGGER_REGISTRATION_FAILED`) — V1's swallowed snapshot-seed errors caused the first-poll-miss bug and are NOT ported.
4. **`create_workbook` remains deferred — no ExcelJS, no binary workbook generation in V2's bundle.** V1's `createWorkbook.ts` (370 LOC) does `require('exceljs')` CJS inside `.ts` and generates an empty XLSX in-process (R-Excel-3). Microsoft Graph has no native workbook-create endpoint that ships an empty XLSX file. The action is deferred until either (a) ExcelJS is explicitly accepted in V2's bundle (ops decision: weight + license review), (b) a Graph-native path is found, or (c) a server-side template-file pattern lands. Until then, workflows that need a fresh workbook upload a pre-built template via OneDrive and operate on it.

One single shared `microsoftExcelPollingHandler` covers all 5 Excel event types (`new_row`, `new_table_row`, `new_worksheet`, `updated_row`, `updated_table_row`) via its `canHandle` predicate. The four satellite trigger directories register **activation only** — they share the handler. This keeps the polling registry size O(providers) rather than O(eventTypes). Slice 15's `Files.ReadWrite` scope covers every parity action and trigger; **no scope widening to `Files.ReadWrite.All`** was needed (SharePoint / shared-with-me workbooks remain deferred until requested). Full V1 rot inventory + deferral table: [`docs/slices/microsoft-excel-parity-outcomes.md`](./docs/slices/microsoft-excel-parity-outcomes.md) §§3 + 6.

### Stripe Phase 2 patterns: typed-and-narrow, Idempotency-Key on POSTs only, single-page lists, finder 404 → found:false (Stripe 2.1)

Stripe Phase 2 closed the registered-action parity gap with 6 actions on top of Slice 11's `stripeRequest` + `flattenForStripe` + `refreshAndRetry` + Q4 idempotency stack. Six durable rules every future Stripe action / wrapper / e2e MUST follow:

1. **Typed schemas only — no raw Stripe payload passthrough.** Every action input is a strict Zod schema (`.strict()`). Lists, objects, and discriminated unions are typed (`lineItems: [{ priceId, quantity }]`, `metadata: Record<string, string>`, `afterCompletion: discriminatedUnion("type", [redirect, hosted_confirmation])`). V1's `JSON.parse` of `line_items` / `metadata` / `after_completion` / `automatic_tax` strings is REJECTED at parse time. No `parseInt(quantity) || 1` silent coercion — invalid values fail loud.
2. **`Idempotency-Key` on POSTs; absent on GETs.** All POST `create_*` actions send `Idempotency-Key: ${runId}:${nodeId}:stripe_action_<name>` via `buildIdempotencyKey`. The action-type suffix matches V1's existing wire-format convention so cutover safety holds (`stripe_action_create_checkout_session` / `stripe_action_create_payment_link` / `stripe_action_create_invoice` / `stripe_action_create_customer` / etc.). V2 ADDS the header on `create_payment_link` + `create_invoice` where V1 omitted it. GET / list / find actions do NOT send the header — Stripe rejects it on GET requests. Unit tests + e2e both assert the header is absent on GETs.
3. **Lists are single-page by default.** `get_payments` returns ONE page of charges; workflow authors compose a downstream loop on `output.nextCursor` (the last charge's id when `hasMore: true`, else `null`). NO auto-pagination, NO client-side filter loops (V1's `getPayments` fetched all then filtered by `status` client-side because Stripe doesn't accept `status` on `/v1/payment_intents` — V2 REJECTS that pattern; compose a downstream filter node instead). V2 also corrects V1's endpoint mistake: `get_payments` hits `/v1/charges`, not `/v1/payment_intents`.
4. **Finder actions return `{found: false, ...}` on 404 — non-404 errors propagate.** `find_subscription`, `find_payment_intent`, and the Slice 11 `find_customer` all catch `NotFoundError` from the wrapper layer and return `{found: false, subscription/paymentIntent/customer: null}` without throwing. "Find" is semantically allowed-to-return-zero. `Unauthorized401Error` and any other error still propagates to the engine — finders are NOT a global error-swallowing convention.
5. **Bounded output projections — no raw Stripe response spread.** Every Stripe handler builds output from a fixed key set off the Stripe wire response. No `...result` spread. Nulls are preserved where Stripe returns nullable fields. The `find_subscription` output projection deliberately omits the raw `items.data` array (use a future `get_subscription_items` if needed); `find_payment_intent` deliberately omits `client_secret` (confirm-time) and `next_action` (mid-flow). No "I'll just spread the rest of the response" escape hatch.
6. **Do NOT pre-port V1's 13 orphan handlers.** V1's `lib/workflows/actions/stripe/` carries 13 `.ts` files that are NOT in V1's `registry.ts` and NOT in V1's node defs — they're intentional dead code (`createInvoiceItem`, `createPrice`, `createProduct`, `updateInvoice`, `updateProduct`, `finalizeInvoice`, `voidInvoice`, `findCharge`, `findInvoice`, `listProducts`, `getCustomers`, plus `capturePaymentIntent` / `confirmPaymentIntent` which Slice 11 already shipped despite being V1 orphans). Orphan-action backfill is on-demand only and gated by product signal; do not port from V1's `.ts` presence alone. Per parity audit NPD-S1: "build new" decision, not "port" decision. `getCustomers` (bulk PII export) is permanently skipped pending an explicit product decision.

**E2E fan-out pattern (Stripe 2.1 Commit 6).** Stripe receive route uses strict-direct lookup (`?workflowId=X&nodeId=Y` on the notification URL), but `services/triggers/dispatch.ts:listForDispatch` then fans out to ALL active `(provider, eventType)` trigger resources. So ONE signed webhook event triggers ALL matching workflows. Design e2e walkthroughs as **one event, N workflows** — NOT N events × N workflows (the latter produces N² dispatches and false counts). Pattern is identical to `slice-1-slack-walkthrough.spec.ts:828` ("14 workflows, one event, 14 distinct endpoints"). Mock server records calls per endpoint; spec creates one workflow per action, sends one event, asserts each endpoint received exactly one call with the expected wire shape.

**Event allowlist additions are explicit.** Stripe 2.1 added two events (`invoice.created` + `customer.subscription.trial_will_end`) at [`integrations/stripe/triggers/eventReceived/allowedEventTypes.ts`](./integrations/stripe/triggers/eventReceived/allowedEventTypes.ts) — Slice 11's 16 events preserved. **Trap:** when an event is added to the allowlist, any test asserting it gets "skipped" by the unsupported-event filter goes stale. The walkthrough's unsupported-event scenario currently uses `account.updated` (Stripe Connect platform event still outside the allowlist); change it if `account.updated` ever moves into the allowlist.

**Stripe billing webhook is OUT OF SCOPE for provider parity.** `app/api/webhooks/stripe-billing` is a separate billing-product concern (subscription lifecycle for ChainReact's own billing, not provider-parity workflow triggers). Stripe 2.1 explicitly does NOT touch it. Provider parity is `app/api/webhooks/stripe` (the consolidated `event_received` trigger receive route). Don't conflate.

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
