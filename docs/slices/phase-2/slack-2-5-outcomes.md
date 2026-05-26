# Slack 2.5 — file_uploaded trigger outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-slack.md`](parity-slack.md).
**Predecessors:**
- [`docs/slices/slack-2-1-messaging-reactions-plan.md`](slack-2-1-messaging-reactions-plan.md) (shipped)
- [`docs/slices/slack-2-2-private-channels-and-lifecycle.md`](slack-2-2-private-channels-and-lifecycle.md) (shipped)
- [`docs/slices/slack-2-3-channels-users-plan.md`](slack-2-3-channels-users-plan.md) → [`slack-2-3-outcomes.md`](slack-2-3-outcomes.md) (shipped)
- [`docs/slices/slack-2-4-files-plan.md`](slack-2-4-files-plan.md) → [`slack-2-4-outcomes.md`](slack-2-4-outcomes.md) (shipped)

**Plan source:** [`docs/slices/slack-2-5-file-uploaded-trigger-plan.md`](slack-2-5-file-uploaded-trigger-plan.md).
**Direct platform dependency:** P-S3 file output contract — shipped. The contract is reused but no platform changes were made in 2.5; the trigger consumes the contract by composition (`slack.file_shared → slack:get_file_info`) rather than directly emitting a FileRef.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/slack/`](../../integrations/slack/).

Slack 2.5 ships the file-uploaded trigger deferred from Slack 2.4 (plan
§10 decision #2). It is the smallest Slack slice to date — one filter
file, one registry line, one e2e block. Zero runtime infrastructure
changes; zero manifest scope changes; zero normalizer changes. All
behavior already supported by the V2 Slack trigger surface; Slack 2.5
just adds the filter that catches `file_shared` events and lets them
propagate through the dispatcher.

---

## 1. Scope shipped

### Trigger (1)

| Trigger | Canonical eventType | Filter file | Config |
|---|---|---|---|
| Slack file uploaded | `slack.file_shared` | [`integrations/slack/triggers/fileUploaded/filter.ts`](../../integrations/slack/triggers/fileUploaded/filter.ts) | `channelId?: string` matching `^[CG][A-Z0-9]+$` |

Filter registered in [`integrations/slack/triggers/index.ts`](../../integrations/slack/triggers/index.ts)
as the 10th Slack trigger filter (after 4 message kinds + 2 reactions +
3 lifecycle).

### Composition story (canonical)

Workflow authors compose `slack.file_shared → slack:get_file_info` to
materialize file metadata + a `FileRef(provider_url)` from the trigger's
file_id. The trigger itself emits no FileRef — Slack's raw `file_shared`
event lacks the fields (`name`, `mimeType`, `sizeBytes`, `url`) that
`FileRefSchema`'s strict `provider_url` arm requires. Downstream
`get_file_info` (shipped in Slack 2.4) is the canonical way to enrich
the id into a FileRef.

For downloads, the chain extends: `slack.file_shared → slack:download_file`
yields a `FileRef(v2_storage)` with staged bytes. For cross-channel
copy, `slack.file_shared → slack:download_file → slack:upload_file`
materializes durable bytes that `upload_file` accepts (per Slack 2.4
§5 / decision #1: `upload_file` rejects `provider_url`).

### Manifest scope changes

**None.** `files:read` was added to the required scope set in Slack 2.4
Commit 2 (`fe8e7529e`); per Slack docs, that scope already unlocks
`file_shared` event delivery. Slack 2.5 just adds the filter to catch
the events Slack was already delivering.

### File system reshape

**None.** New folder [`integrations/slack/triggers/fileUploaded/`](../../integrations/slack/triggers/fileUploaded/)
(1 file). Parent `integrations/slack/triggers/` is now 11 files (10
filter files + index.ts), well under the 50-file leaf-folder limit.
Test mirror at [`tests/unit/integrations/slack/triggers/fileUploaded/`](../../tests/unit/integrations/slack/triggers/fileUploaded/).

---

## 2. Payload contract

The trigger emits the raw Slack inner event verbatim as `payload`. No
synthesis, no enrichment, no aliasing.

### What the trigger payload carries

| Field | Source | Type |
|---|---|---|
| `payload.type` | `"file_shared"` | string |
| `payload.file_id` | Slack envelope `event.file_id` | string (e.g. `F0001`) |
| `payload.user_id` | Slack envelope `event.user_id` | string (e.g. `U0001`) |
| `payload.channel_id` | Slack envelope `event.channel_id` | string (e.g. `C0001`) |
| `payload.event_ts` | Slack envelope `event.event_ts` | string (Slack TS format) |
| `payload.file` | Slack envelope `event.file` | partial `{ id }` stub — id only |

The TriggerEvent envelope around the payload carries:
- `provider: "slack"`
- `eventType: "slack.file_shared"`
- `eventId: <envelope.event_id>`
- `occurredAt: <envelope.event_time × 1000 as ISO>`
- `accountId: <envelope.team_id>`

### What the trigger payload deliberately does NOT carry

- **No camelCase aliases.** No `fileId`, `userId`, `channelId` at any level. Workflow authors index `{{trigger.payload.file_id}}` (snake_case) — same convention as all other V2 Slack triggers (per decision A1).
- **No FileRef.** Slack's raw `file_shared` event lacks `name` / `mimeType` / `sizeBytes` / `url` — required by `FileRefSchema.strict()`'s `provider_url` arm. Constructing a partial FileRef would either fail Zod parsing or lie about the data. Both unacceptable. Compose `slack:get_file_info` downstream.
- **No bytes / base64 / content / data.** Triggers never carry bytes — analogous to P-S3 rule #1 for action outputs. Reaffirmed by `TriggerEventSchema`'s generic `payload: Record<string, unknown>` shape with no file-byte-shaped fields.
- **No enrichment.** No hidden `files.info` lookup on the trigger path; no `users.info` lookup; no `conversations.info` lookup. V1's 17-field synthetic output schema (fileName / fileType / fileSize / fileUrl / userName / channelName / title / initialComment / etc.) was fiction — not in the raw Slack payload, V1 never wired the enrichment.

---

## 3. Filter contract

The filter is a pure synchronous function. No I/O.

### Behavior

| Config | Behavior |
|---|---|
| `{}` (or `{ channelId: undefined }`) | Match every `file_shared` event the workspace receives. |
| `{ channelId: "C…" }` or `{ channelId: "G…" }` | Match only when `event.payload.channel_id === config.channelId`. |
| `{ channelId: <invalid string> }` | `parseConfig` throws — dispatcher drops the workflow's evaluation per the existing fail-closed contract. |

### Validation rules

- `channelId` must match `^[CG][A-Z0-9]+$` — accepts public channels (`C…`) and legacy private channels (`G…`).
- D-prefixed (DM) ids rejected — DMs aren't in the v1 surface.
- Lowercase, empty-string, and hyphenated ids rejected.
- `parseConfig({})` succeeds (match-all).

### Critical: read `payload.channel_id`, NOT `payload.channel`

Slack's `file_shared` event uses snake_case `_id`-suffixed fields
(`file_id`, `user_id`, `channel_id`) — UNLIKE the `message` event
which uses bare `channel` / `user`. This asymmetry is a real
bug-magnet for engineers copy-pasting from `memberJoinedChannel` /
`newMessageChannel` filters.

The unit test pins this: a synthetic event with `channel: "CMATCH001"`
(bare, message-event-style) AND no `channel_id` returns `no-match`
when the filter is configured for `channelId: "CMATCH001"`. The e2e
regression guard pins it from the other angle: a synthetic event
carrying BOTH a decoy `channel: "C0FSHAREDOTHER"` AND a correct
`channel_id: "C0FSHAREDMATCH"` correctly fires the `CMATCH`-configured
workflow and silently drops the `OTHER`-configured workflow.

### What the filter deliberately does NOT do

- **No `files.info` call.** Filter has no integration row, no token. Enrichment is downstream `get_file_info`'s job.
- **No FileRef construction.** Filters don't emit data; they decide match/no-match. FileRef construction belongs to action handlers.
- **No `fileTypes` filter** (V1 had multi-select images/documents/etc). Would require `files.info` enrichment in the filter path; deferred. Workflow authors that want filetype gating add a downstream branch on `{{getFileInfo.fileType}}`.
- **No I/O.** Pure synchronous function. Returning a Promise would break the dispatcher's evaluation contract.

---

## 4. V1 rot not ported

| # | V1 pattern | V1 location | V2 status |
|---|---|---|---|
| 1 | 17-field "synthetic" output schema (`fileName`, `fileType`, `fileSize`, `fileUrl`, `fileUrlPrivate`, `fileThumbUrl`, `userName`, `channelName`, `title`, `initialComment`, `isPublic`, `mode`, etc.) | `lib/workflows/nodes/providers/slack/triggers/fileUploaded.schema.ts:67-180` | Not ported — V1 schema is fiction; raw Slack payload doesn't carry these fields. V2 emits only what Slack ships. |
| 2 | `fileTypes` filter (multi-select: images / documents / spreadsheets / videos / audio / code / archives) | Same V1 schema, lines 41-65 | Not ported — would require `files.info` enrichment inside the filter path; defer. |
| 3 | `workspace` per-trigger config selector | Same V1 schema, lines 14-23 | Not ported — V2 resolves the integration row via `triggerEvent.accountId` (Slack `team_id`). Inherited from Slack 2.3 §2.4 / Slack 2.4 §2.3. |
| 4 | Raw `fileUrl` / `fileUrlPrivate` / `fileThumbUrl` flat output fields | V1 schema output fields | Not ported — even with enrichment, these would be P-S3 violations (bare URLs without auth/scope context). Use `FileRef(provider_url)` via downstream `get_file_info`. |
| 5 | V1 normalizer's `slack_trigger_file_uploaded` short-name canonical type | `lib/webhooks/normalizer.ts:127-141` | Not ported — V2 normalizer uses canonical `slack.<event.type>` namespacing. `slack.file_shared` is the V2 form (auto-derived). |

---

## 5. Files shipped

### Source (Commit 2)
- `integrations/slack/triggers/fileUploaded/filter.ts` (new, 60 lines)
- `integrations/slack/triggers/index.ts` — 1 import + 1 `registerTriggerFilter` call + 1 export entry; header comment updated

### Tests (Commits 2 + 3)
- `tests/unit/integrations/slack/triggers/fileUploaded/filter.test.ts` (new, 16 test cases): identity, parseConfig (7 cases), evaluate match-all, evaluate channelId-filter (4 cases), regression guard (`payload.channel` does not satisfy `channelId` filter), purity (2 cases)
- `tests/unit/integrations/slack/triggers/registration.test.ts` — assertion flipped (file_shared now registers); `team_join` remains in the "not yet registered" set
- `tests/e2e/slice-1-slack-walkthrough.spec.ts` — new "Slice 2.5 — Slack file_shared trigger e2e" describe block with 3 scenarios

### Docs
- [`docs/slices/slack-2-5-file-uploaded-trigger-plan.md`](slack-2-5-file-uploaded-trigger-plan.md) (Commit 1)
- This file (Commit 4)
- CLAUDE.md additions for the `channel_id`-not-`channel` durable rule (Commit 4)

---

## 6. Commit breakdown (4)

| # | Commit hash | What landed |
|---|---|---|
| 1 | `e047812b4` | `docs(slack): plan Slack 2.5 file uploaded trigger` |
| 2 | `a11355e9e` | `feat(slack): add file uploaded trigger filter` (filter + registration + 16 unit tests + 1 registration test update) |
| 3 | `f7093966d` | `test(slack): extend walkthrough with file uploaded trigger` (3 e2e scenarios; no mock additions; no runtime changes) |
| 4 | (this commit) | `docs(slack): document Slack 2.5 outcomes` |

Each implementation commit individually passed:
- `npx tsc --noEmit`
- `npm run lint`
- `npm run lint:structure`
- `npm run lint:migrations`
- `npm test`

And Commit 3 also passed:
- `npx playwright test tests/e2e/slice-1-slack-walkthrough.spec.ts --workers=1` — 11 / 11

Final unit-test totals after Commit 3: **572 suites / 5124 tests
passing** (+1 suite / +18 tests since Slack 2.4 closure, of which +1
suite / +17 tests are Slack 2.5's; the rest are Marcus's parallel
work). Slack-focused unit subset: **83 suites / 611 tests**.

Playwright Slack walkthrough after Commit 3: **11 / 11 tests passing
with `--workers=1`** in 1.9 min — 1 base + 1 Slack 2.1 + 1 Slack 2.2 +
1 Slack 2.3 + 4 Slack 2.4 + **3 new Slack 2.5**.

---

## 7. E2E validation

The Slack walkthrough now covers Slack 2.5 with 3 scenarios; the
deferred replay/dedup case stays in the dispatcher's unit-test
ownership.

| # | Scenario | What it asserts |
|---|---|---|
| 1 | `file_shared` match-all dispatch | Signed Slack `file_shared` envelope → workflow run succeeds → trigger payload preserves raw Slack inner event (`type`, `file_id`, `user_id`, `channel_id`, `event_ts`, `file: { id }`) verbatim. No camelCase aliases on `payload` or `triggerEvent`. No FileRef discriminator fields on `payload.file` (asserted explicitly: `kind`, `provider`, `providerFileId`, `storagePath`, `url`, `mimeType`, `sizeBytes` all undefined). No bytes/base64/content/data keys anywhere. `chat.postMessage` fired exactly once; Slack file API endpoints untouched. |
| 2 | channelId match + no-match | Two workflows differing only on `channelId` config. Decoy event: `payload.channel = "C0FSHAREDOTHER"` (bare, message-event-style) AND `payload.channel_id = "C0FSHAREDMATCH"` (the actual Slack field). The decoy proves the filter ignores bare `channel` — only `payload.channel_id` drives the match. WF-match enqueues; WF-mismatch does not (asserted defensively after a 1.5s settle wait). `chat.postMessage` fires exactly once for WF-match. |
| 3 | `file_shared` → `slack:get_file_info` composition | `{{trigger.payload.file_id}}` template resolves through the engine's strict resolver into the action's `fileId` config. Mock `files.info` called exactly once with the resolved id. `urlPrivateDownload` endpoint NOT touched (metadata-only path). Action output: `file.kind === "provider_url"`, `file.provider === "slack"`, `file.providerFileId === <trigger file_id>`, flat metadata populated. No `content`/`bytes`/`base64`/`data` keys in output. |

### E2E run discipline reaffirmed

- `--workers=1` — Slack walkthrough specs share the mock-Slack `__inspect` counter; parallel runs corrupt assertions. CI is pinned to workers=1 in `playwright.config.ts`; local runs MUST pass `--workers=1`.
- Test fixtures use Slack-format ids (no hyphens) — `C0FSHARED…`, `F0FSHARED…`, `U0FSHAREDUPLOADER`.
- No mockSlackServer additions in Slack 2.5 — `files.info` reused from Slack 2.4.
- Existing Slack 2.1/2.2/2.3/2.4 e2e scenarios remain green (8 + 3 = 11 / 11).

### Bug status

**No bugs found by e2e.** No runtime code changes required for any Slack
2.5 scenario. The filter implementation from Commit 2 is correct as
written; the e2e regression guard (decoy `payload.channel`) reaffirms
the unit test from a different angle.

---

## 8. Acceptance criteria (post-merge)

- [x] 1 trigger filter registered in `integrations/slack/triggers/index.ts` for `slack.file_shared`.
- [x] `channelId` optional, validates `^[CG][A-Z0-9]+$`; D-prefixed / lowercase / empty / hyphenated rejected.
- [x] Filter reads `payload.channel_id`, never `payload.channel`. Pinned by both unit test and e2e regression guard.
- [x] Filter is pure synchronous; no `files.info` call, no FileRef construction, no I/O.
- [x] No manifest scope changes (`files:read` already granted in Slack 2.4).
- [x] No normalizer changes (`slack.<event.type>` auto-derives `slack.file_shared`).
- [x] No per-workflow lifecycle / `registerActivation` (Slack uses workspace-level event subscriptions).
- [x] Trigger payload is raw Slack inner event verbatim — no camelCase aliases, no FileRef, no bytes (decision A1).
- [x] Composition story `slack.file_shared → slack:get_file_info` proven end-to-end in scenario 3.
- [x] All 11 Slack walkthrough e2e tests pass with `--workers=1`.
- [x] Slack-focused unit subset green (83 / 611).
- [x] Full project unit test suite green (572 / 5124).
- [x] Each commit's gates green locally.

---

## 9. What's deferred

| Item | Where it lands |
|---|---|
| `fileTypes` filter on `slack.file_shared` (images / documents / spreadsheets / etc.) | Future slice on demand. Would require `files.info` enrichment inside the filter path or a downstream branch on `{{getFileInfo.fileType}}`. No code path for it in 2.5. |
| FileRef directly on trigger payload | Permanently rejected — Slack's raw `file_shared` event has no name / mime / size / url. `FileRefSchema.strict()` would reject a partial. Composition via `get_file_info` is the canonical answer. |
| CamelCase aliases (`fileId` / `userId` / `channelId`) on trigger payload | Deferred. Adding here without retroactively bumping the other 9 Slack triggers would create surface drift. A future "Slack trigger ergonomics" slice could land aliases consistently across all triggers, or stay snake-case-only per existing convention. |
| Replay / dedup e2e for `file_shared` | Not added — dispatcher's `(provider, eventId)` dedup is unit-test-owned. Adding an e2e would duplicate coverage without new signal. |
| Richer file metadata enrichment inside the trigger payload | Permanently rejected (same reason as FileRef-on-trigger). Workflow composition is the answer. |
| `file_created` / `file_public` / `file_change` / `file_unshared` / `file_deleted` event variants | Defer all five to later slices on demand. `file_shared` covers the dominant use case. |

---

## 10. CLAUDE.md durable note added

A single short subsection added under Deep Gotchas covering the durable
Slack-trigger rule the unit test + e2e both pin:

- Slack `file_shared` events use snake_case `_id`-suffixed fields (`file_id`, `user_id`, `channel_id`), unlike `message` events which use bare `channel` / `user`. Trigger filters reading the wrong field silently never match.
- Slack trigger filters MUST be pure: no `files.info` call, no FileRef construction, no I/O.
- Workflows that need file metadata or a FileRef compose `slack.file_shared → slack:get_file_info` downstream.

The Slack action contract note (id-only, no name resolution) and the
Slack file actions / P-S3 enforcement note (from Slack 2.4) cover the
adjacent territory. The new note is scoped specifically to trigger
filters for file events.

---

## 11. What's next (Slack roadmap)

Slack closure candidates still tracked in
[`docs/slices/parity-slack.md`](parity-slack.md):

- **P-S1** — user-token storage (`xoxp-…`). Unblocks `update_user_status` and `set_user_presence`.
- **`userJoinedWorkspace`** — per-trigger scope-request design (open audit question; carried since Slack 2.3 outcomes §6).
- **`add_reminder`** — pending Slack API status check (parity audit §13).
- **`fileTypes` filter on `slack.file_shared`** — on demand only.
- **`file_created` / `file_public` / `file_change` / `file_unshared` / `file_deleted` event variants** — on demand only.

None of these are committed for follow-up timing in this slice; tracking
lives in [`docs/slices/parity-slack.md`](parity-slack.md) §§5–6.
