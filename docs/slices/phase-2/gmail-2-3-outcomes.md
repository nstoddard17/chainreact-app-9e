# Gmail 2.3 — triggers + attachments outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](phase-2-plan.md).
**Provider audit:** [`docs/slices/parity-gmail.md`](parity-gmail.md).
**Plan source:** [`docs/slices/gmail-2-3-triggers-attachments-plan.md`](gmail-2-3-triggers-attachments-plan.md).
**Direct platform dependency:** P-S3 file output contract — shipped. Gmail 2.3 is the second P-S3 consumer (after Slack 2.4) and the first to combine a metadata-only trigger with a separate byte-materialization action.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/gmail/`](../../integrations/gmail/).

Gmail 2.3 closes the Gmail parity gap for the attachment surface and the labeled-email trigger that was deferred from Slice 2e. Two new polling triggers, one new action, one new API wrapper, one shared MIME-tree walk helper, and one base64url decode helper. No manifest scope changes. No runtime engine changes. Net +7 files of source code + 11 files of unit tests + the e2e walkthrough extension.

---

## 1. Commit chain

| # | Commit | Title |
|---|---|---|
| 1 | `96e8b2628` | docs(gmail): plan Gmail 2.3 triggers and attachments |
| 2 | `17a1d578e` | refactor(gmail): extract tagged message events |
| 3 | `2667ae56a` | feat(gmail): add new labeled email trigger |
| 4 | `876af4c17` | feat(gmail): add new attachment trigger |
| 5 | `6aea91bb0` | feat(gmail): add get attachment action |
| 6 | `e8e5cfde3` | test(gmail): extend walkthrough with triggers and attachments |
| 7 | _this commit_ | docs(gmail): document Gmail 2.3 outcomes |

---

## 2. Shipped surface

### Triggers (2)

| Trigger | Canonical eventType | EventId scheme | Files |
|---|---|---|---|
| Gmail new labeled email | `new_labeled_email` | `labeled:<gmailMessageId>` | [`integrations/gmail/triggers/newLabeledEmail/`](../../integrations/gmail/triggers/newLabeledEmail/) |
| Gmail new attachment | `new_attachment` | `attachment:<gmailMessageId>` | [`integrations/gmail/triggers/newAttachment/`](../../integrations/gmail/triggers/newAttachment/) |

Both triggers register at module load via [`integrations/_registry.ts`](../../integrations/_registry.ts) (Commits 3 + 4 each added one import line; the rest is module-init `registerActivation` + `registerPollingHandler` calls). Same Slice-2e activation pattern: the activate hook fetches `users.getProfile` and seeds `snapshot.historyId` before the first poll executes — without this baseline the "first poll miss" rule from the polling-trigger-snapshot-initialization design would silently drop messages that arrive between activate and the first cron tick.

### Action (1)

| Action | Provider key | Output FileRef kind | Files |
|---|---|---|---|
| Gmail get_attachment | `gmail:get_attachment` | `v2_storage` (provider="gmail") | [`integrations/gmail/actions/getAttachment.ts`](../../integrations/gmail/actions/getAttachment.ts) + [`getAttachment.schema.ts`](../../integrations/gmail/actions/getAttachment.schema.ts) |

Registered in [`services/execution/handlers/_registry.ts`](../../services/execution/handlers/_registry.ts). V1's separate `downloadAttachment` action is intentionally **folded** into `get_attachment` per Gmail 2.3 plan §8 + decision §13.1 — see §8 below.

### New API wrappers (1) + helpers (2)

| File | Purpose |
|---|---|
| [`integrations/gmail/api/usersMessagesAttachmentsGet.ts`](../../integrations/gmail/api/usersMessagesAttachmentsGet.ts) | Wraps `GET /gmail/v1/users/me/messages/{messageId}/attachments/{attachmentId}`. Bearer auth, URL-encodes both ids, `GMAIL_API_BASE` override, 401→`Unauthorized401Error`, Gmail error.message/status/HTTP fallback. Returns wire shape `{ data: string /* base64url */, size?: number }`. |
| [`integrations/gmail/triggers/newEmail/extractMessageEvents.ts`](../../integrations/gmail/triggers/newEmail/extractMessageEvents.ts) | Commit 2 — pure helper that walks Gmail history records and tags each event by `source` (`"messagesAdded" \| "labelsAdded" \| "messages"`). Replaces the private `extractMessageIds` flat-string helper that existed in Slice 2e. See §3. |
| [`integrations/gmail/triggers/newAttachment/extractAttachmentMetadata.ts`](../../integrations/gmail/triggers/newAttachment/extractAttachmentMetadata.ts) | Commit 4 — pure helper that walks `payload.parts` from a `format=full` Gmail message and emits per-attachment metadata (`{attachmentId, filename, mimeType, sizeBytes}[]`). Inclusion rule: filename non-empty AND `body.attachmentId` present. Shared by the new_attachment trigger AND the get_attachment action — single source of truth for the "what counts as an attachment" predicate. |
| [`integrations/gmail/utils/decodeBase64Url.ts`](../../integrations/gmail/utils/decodeBase64Url.ts) | Commit 5 — pure helper that converts Gmail's base64url wire form to `Uint8Array`. Handles `-`/`_` alphabet + missing padding (Gmail strips trailing `=`); throws on malformed `length % 4 === 1`. Bytes never escape the handler except as the `bytes` arg to `stageFileToStorage`. |

### Existing wrapper extension

[`integrations/gmail/api/usersMessagesGet.ts`](../../integrations/gmail/api/usersMessagesGet.ts) gained an optional `format?: "metadata" | "full"` param (Commit 4). Omitted = pre-Commit-4 behavior verbatim (`format=metadata` + default metadata headers). `format="full"` requests the full MIME tree under `payload.parts`; `metadataHeaders` is dropped in full mode (Gmail only honors the arg with metadata). `UsersMessagesGetResult.payload` gained an optional `parts?: readonly GmailMessagePart[]` field. The new_attachment trigger + get_attachment action are the only `format=full` callers today; every other Gmail surface remains on the default metadata response.

### Manifest scope changes

**None.** `gmail.readonly` (Slice 2 manifest) already unlocks `users.history.list`, `users.messages.get?format=full`, and `users.messages.attachments.get` per Gmail 2.3 plan §10 scope analysis. No re-consent flow.

---

## 3. Tagged event extraction (Commit 2)

Slice 2e's polling handler had a private `extractMessageIds(history) → string[]` helper that flattened all source-fields into a deduped id list. Gmail 2.3 needs per-source filtering (`new_labeled_email` filters `source === "labelsAdded"`; `new_attachment` filters `source === "messagesAdded"`), so Commit 2 promoted that helper to a shared `extractMessageEvents` returning **tagged events**:

```ts
interface MessageEvent {
  id: string;
  source: "messagesAdded" | "labelsAdded" | "messages";
  /** For source === "labelsAdded": the labels just added (lets the
   *  new_labeled_email trigger match without a separate fetch). */
  addedLabelIds?: readonly string[];
}
```

- **`new_email` behavior preserved.** The Slice 2e polling handler now maps tagged events back to a flat `string[]` via `ev.id` and collapses with `Array.from(new Set(...))`. Net effect on the new_email surface is byte-for-byte unchanged — including the V1-port `historyTypes=[messageAdded, labelAdded]` rule where labelsAdded entries for `INBOX` count as new arrivals from the user's perspective.
- **`new_labeled_email` consumes labelsAdded only.** Filter predicate at `newLabeledEmail/poll.ts:matchesLabel` rejects messagesAdded + defensive `messages` events first; then matches `ev.addedLabelIds?.includes(config.labelId)` for exact-id match.
- **`new_attachment` consumes messagesAdded only.** Filter predicate at `newAttachment/poll.ts:matchesAttachmentSource` rejects labelsAdded + defensive `messages` (a label change is not a new-attachment event). The hydrate step uses `format=full`; `extractAttachmentMetadata` then determines whether to fire.

The function is pure / standalone — unit-tested without mocks. Two-step `extract → filter` keeps the history walk single-pass at the orchestrator layer while leaving per-trigger semantics to per-trigger handlers.

---

## 4. Dedup convention

`webhook_event_dedup` is keyed on `(provider, eventId)`. Gmail 2.3 introduced per-trigger dedup-key prefixes so the same Gmail message id can drive multiple triggers without collision:

| Trigger | Dedup key | Wrapper |
|---|---|---|
| `new_email` | `<messageId>` (bare) | [`newEmail/dedup.ts:checkAndMarkSeen`](../../integrations/gmail/triggers/newEmail/dedup.ts) |
| `new_labeled_email` | `labeled:<messageId>` | [`newLabeledEmail/dedup.ts:checkAndMarkSeenLabeled`](../../integrations/gmail/triggers/newLabeledEmail/dedup.ts) |
| `new_attachment` | `attachment:<messageId>` | [`newAttachment/dedup.ts:checkAndMarkSeenAttachment`](../../integrations/gmail/triggers/newAttachment/dedup.ts) |

All three wrappers fail-CLOSED on dedup errors (same Slice 2e policy — a transient dedup failure delays-but-doesn't-double on retry). Cross-trigger isolation is asserted in both unit tests (`newAttachment/dedup.test.ts:104` checks all three keys remain distinct) and in the e2e walkthrough (`new_labeled_email` test asserts the bare key is NOT written; `new_attachment` test asserts the bare + labeled keys are NOT written).

The prefix is the dedup wrapper's responsibility — never the dispatcher's. Same convention is also reflected in the canonical `TriggerEvent.eventId` value (`labeled:<id>` / `attachment:<id>`) so cross-trigger-type events stay distinguishable at the dispatch layer too.

---

## 5. `new_labeled_email` rules

- **Source model:** polling — fires from `users.history.list` `labelsAdded` records.
- **Schema:** `.strict()`, requires `labelId: string`. Polling-state fields (`pollingEnabled`, `snapshot`, `polling`) mirror new_email/new_attachment.
- **V1 fields intentionally rejected:** `from` (V1 `email-autocomplete` — deferred), `includeReplies` (V1's toggle was implemented inconsistently — V2's design fires for replies that carry the configured label by default), V1 newEmail filter fields (`subject` / `hasAttachment` / `labelIds[]` — not the same trigger).
- **Match predicate:** `ev.source === "labelsAdded" && ev.addedLabelIds?.includes(config.labelId)`. Exact label-id match (no substring / prefix).
- **Dedup collapse:** when a single message gets the configured label applied multiple times within one history-walk window, the handler collapses to one fire keyed on the first occurrence's `labelsAdded` list. Cross-tick dedup catches subsequent re-applications via the `labeled:<messageId>` key.
- **Payload extras (beyond standard Gmail metadata):**
  - `labelAppliedId: string` — echoes the workflow's configured `labelId`. Resolves the "which trigger does this event belong to?" ambiguity when a workflow has multiple `new_labeled_email` triggers wired to the same Gmail account.
  - `labelsAdded: readonly string[]` — the FULL list of labels added in the originating Gmail history entry (NOT the message's current `labelIds`). Workflow authors who want to branch on side-effects of multi-label applications get an unambiguous reference.

---

## 6. `new_attachment` rules

- **Source model:** polling — fires from `users.history.list` `messagesAdded` records, then hydrates with `format=full` to enumerate attachments.
- **Schema:** `.strict()`. NO user-set filter fields in this version per Gmail 2.3 plan decisions §13.2 + §13.5. Polling-state fields only.
- **V1 fields intentionally rejected:** `fileType` (V1's pdf/image/document enum — deferred), `from` (V1 `email-autocomplete` — deferred), `minSize` (would inspect `body.size` — trivial to add later). All deferred to a follow-up slice if real workflows ask for them. Fastest path to a working trigger is fire-on-any-attachment; downstream filter actions compose for refinement.
- **Match predicate:** `ev.source === "messagesAdded"`. A label change is NOT a new-attachment event.
- **Attachment-present check:** post-hydrate, `extractAttachmentMetadata(message)` runs; if `[]`, the trigger does NOT fire (inline images don't count — the filename + `body.attachmentId` predicates filter them out). Skipped-because-empty is silent (no fire, no dedup mark).
- **Payload extras (beyond standard Gmail metadata):**
  - `attachments: readonly AttachmentMeta[]` — per-attachment objects with EXACTLY four keys: `attachmentId`, `filename`, `mimeType`, `sizeBytes`. No bytes. No FileRef. No base64. No data.
  - `attachmentCount: number` — `attachments.length`. Convenience for downstream branching without forcing the workflow author to inspect the array.
- **Bytes policy:** none at the trigger boundary. Workflow authors who need bytes compose `gmail/get_attachment(messageId, attachmentId)` downstream. Staging at trigger time would waste storage on workflows that just need the metadata for routing decisions.

---

## 7. `get_attachment` rules

- **Schema:** `.strict()`, requires `messageId: string` + `attachmentId: string`. `fileName` / `mimeType` overrides are intentionally rejected — both derive from Gmail message metadata, not workflow-author config (overrides would diverge the staged file's identity from the provider's).
- **V1 fields intentionally rejected:** `attachmentSelection` (V1's all/byName/byMime — V2 takes one attachment per action), `saveToVariable` (V1's "skip the upload, just return base64" — V2 always stages + returns FileRef), `storageService` / `folderId` (V1's cross-provider Drive/OneDrive/Dropbox routing — V2 splits via composition), `data` / `content` / `base64` (V1's "supply your own bytes" — rejected at input boundary AND at FileRef output boundary).
- **Behavior:**
  1. Resolve Gmail integration through `refreshAndRetry` accountId routing (Gmail trigger → trigger's `accountId`; non-Gmail trigger → `null` → dispatcher picks the user's single active Gmail integration).
  2. `usersMessagesGet({format:"full"})` via `refreshAndRetry`.
  3. `extractAttachmentMetadata` locates the target attachment by id. If absent → throw `"Gmail attachment not found: …"` BEFORE the (more expensive) byte fetch.
  4. `usersMessagesAttachmentsGet` via `refreshAndRetry` → returns wire `{data: base64url, size?}`.
  5. `decodeBase64Url(wire.data) → Uint8Array`. Bytes never leave this function except as the `bytes` arg to `stageFileToStorage`.
  6. `stageFileToStorage({provider: "gmail", metadata: {messageId, attachmentId}})`. Workflow_files row records ONLY messageId + attachmentId per Gmail 2.3 plan §9 metadata policy — NO tokens, NO PII, NO email headers, NO subject, NO addresses.
- **Output:** `{ file: FileRef(kind="v2_storage", provider="gmail"), messageId, attachmentId, fileName, mimeType, sizeBytes }`. Output has no `data` / `content` / `base64` / `bytes` keys (defense-in-depth tested at the handler unit + e2e levels).
- **Error propagation:** metadata fetch errors, byte fetch errors, and `stageFileToStorage` errors all propagate verbatim. `stageFileToStorage` owns its own partial-failure orphan cleanup (per P-S3); the handler does not.

---

## 8. V1 rot fixed (cited by parity-gmail.md rot-catalog ID)

| ID | V1 pattern | V2 outcome |
|---|---|---|
| **R8 / G-R5** | Base64 attachment output in `getAttachment` (`output.data = base64`) | Replaced by `FileRef(kind=v2_storage)` via P-S3. Schema rejects `data` / `content` / `base64` / `bytes` at parse time; `FileRefSchema.strict()` rejects them at FileRef construction; handler tests assert output keys exclude all four. |
| **R1** | Cross-provider Drive/OneDrive/Dropbox dispatch in `downloadAttachment` (413-line monolith) | Replaced by P-S3 composition. Gmail 2.3 ships ONLY the stage-to-v2-storage path; cross-provider routing is the workflow author's job via downstream `<provider>:upload_file` actions consuming the FileRef. |
| **R8** | Hidden defaults in V1 attachment schemas (`saveToVariable: true` default; silent `attachmentSelection: 'all'`) | V2 schemas require explicit `messageId` + `attachmentId` (single attachment per action). No bulk modes. No silent defaults. |
| **G-R4** | Bulk partial-success loops in V1 `downloadAttachment` (loop over multiple attachments, swallow errors, return partial results) | V2 single-attachment-per-action; fail-fast on errors. |
| **R5 / DEPRECATED** | V1 `gmail-watch-setup.ts` push-Pub/Sub model | V2 polling-only architecture (Slice 2e + Gmail 2.3 extend the same model). Pub/Sub not ported. |
| (decision §3) | V1 `newStarredEmail` 2-day window (hidden heuristic) | Trigger deferred per Gmail 2.3 plan decision §13.3. When revisited, drop the hidden heuristic or make the window configurable. |
| (decision §4) | V1 `new_email` AI content filter (`aiContentFilter` / `aiFilterConfidence` / `aiFailClosed`) | Deferred to Phase 5 per parity-gmail.md decision §4. Not in Gmail 2.3. |

### `download_attachment` — folded, not aliased

The plan considered shipping `download_attachment` as a thin alias of `get_attachment`. Marcus accepted the **fold** (decision §13.1): `download_attachment` ships as **neither a separate handler nor a registry alias**. The registry contains exactly one entry: `gmail:get_attachment`. The registry test at [`tests/unit/services/execution/handlers/registry.test.ts`](../../tests/unit/services/execution/handlers/registry.test.ts) pins this — one assertion that `gmail:get_attachment` IS registered, one that `gmail:download_attachment` is NOT registered.

Workflow authors who used V1's `downloadAttachment(storageService=Drive)` recompose as `gmail/get_attachment → drive/upload_file({file: <ref>, folder: …})`. Two steps, but each does one thing. The `upload_file` family of actions (Slack 2.4 / Drive / OneDrive) already accept `FileRef(kind=v2_storage)` inputs per the P-S3 contract.

---

## 9. E2E validation

[`tests/e2e/slice-2f-gmail-walkthrough.spec.ts`](../../tests/e2e/slice-2f-gmail-walkthrough.spec.ts) gained one new `test.describe` block with three scenarios (Commit 6). The existing Slice 2e new_email walkthrough was unchanged except for a stale-assertion fix (scope set drifted with the Gmail 2.1 manifest — now asserts the 4-scope quad). Total scenarios: 4. All pass with `--workers=1`.

| Scenario | Asserts |
|---|---|
| `new_labeled_email fires for the configured labelId; non-matching labelsAdded does NOT fire` | Mix of non-matching + matching labelsAdded events on the same message; exactly one workflow_run; subject `"Labeled: Label_WORK"` resolved from `{{trigger.payload.labelAppliedId}}`; textBody contains both labels from `labelsAdded`; dedup at `labeled:<id>` only (no bare key). |
| `new_attachment fires only for messages with attachments; payload is metadata-only` | Attachment-less + attachment-bearing message both injected; only the latter fires; `format=full` hydrated both messages; `users.messages.attachments.get` NOT touched at trigger time; trigger payload exposes `attachmentCount`, `filename`, `mimeType`, `sizeBytes`, `attachmentId`; rendered body contains NO base64/data/fileRef; dedup at `attachment:<id>` only (no bare, no labeled). |
| `new_attachment → get_attachment composed flow` | Trigger payload's `id` + `attachments[0].attachmentId` flow into action config via the strict resolver; `users.messages.attachments.get` hit once with Bearer auth; workflow_files row created with canonical `<userId>/<workflowId>/<runId>/<nodeId>/<filename>` path; storage object bytes round-trip sentinel verbatim; workflow_files metadata equals `{messageId, attachmentId}` only (PII-free); output FileRef is `kind=v2_storage` / `provider=gmail`; output has no `data`/`content`/`base64`/`bytes` keys; serialized output contains no base64url representation of the sentinel. |

### Mock additions

[`tests/e2e/helpers/mockGoogleServer.ts`](../../tests/e2e/helpers/mockGoogleServer.ts) gained:

- `users.messages.get?format=full` returns `payload.parts` synthesized from the injected email's attachments. Metadata mode + the legacy empty default keep the pre-Commit-6 shape byte-for-byte.
- `users.messages.attachments.get` route — recorded under `state.calls.messagesAttachmentsGet`, returns `{ data, size }` from the matching attachment fixture.
- `__injectEmail` accepts an optional `attachments: [{attachmentId, filename, mimeType, sizeBytes, base64Data}, …]` field. Emails with attachments default to `multipart/mixed` at top level.
- `__injectLabelChange` control-plane endpoint — bumps `currentHistoryId` and queues a `labelsAdded` history record pointing at an already-injected email.
- `users.history.list` now also drains `pendingLabelChanges` and emits `labelsAdded` history records alongside `messagesAdded`.

---

## 10. Deferred (not blocking Gmail 2.3 closure)

- **`newStarredEmail` trigger.** Deferred per Gmail 2.3 plan decision §13.3 (V1's hidden 2-day window heuristic — needs a config story before porting).
- **`new_email` AI content filter.** Deferred to Phase 5 per parity-gmail.md decision §4.
- **`new_attachment` filters: `fileType`, `from`, `minSize`.** Deferred per Gmail 2.3 plan decision §13.5. Each is a small follow-up if a real workflow asks; none block the existing trigger.
- **`new_labeled_email` filters: `from`, `includeReplies`.** Deferred per Gmail 2.3 plan decision §13.3. Same logic — easy adds when needed.
- **Cross-provider attachment routing.** Composition `gmail/get_attachment → <provider>/upload_file` covers the V1 `downloadAttachment(storageService=…)` surface. No platform work needed.

---

## 11. Test inventory

**Unit tests** (Gmail-scoped):
- Pre-Gmail-2.3 baseline: 577 suites / 5160 tests.
- Post-Gmail-2.3: Gmail-scoped suites now 61 / 655 tests.
- Repo-wide post-Gmail-2.3: 590 suites / 5297 tests.

**E2E tests:** [`tests/e2e/slice-2f-gmail-walkthrough.spec.ts`](../../tests/e2e/slice-2f-gmail-walkthrough.spec.ts) — 4/4 passing with `--workers=1` in ~42s.

**Test files added** (by commit):
- Commit 2: existing `extractMessageEvents.test.ts` expanded.
- Commit 3: 5 files under `tests/unit/integrations/gmail/triggers/newLabeledEmail/` (schema, dedup, messageHydration, matchesLabel, index).
- Commit 4: 7 files under `tests/unit/integrations/gmail/triggers/newAttachment/` + `tests/unit/integrations/gmail/api/usersMessagesGet.test.ts` extended.
- Commit 5: `tests/unit/integrations/gmail/actions/getAttachment.{test,schema.test}.ts` + `tests/unit/integrations/gmail/api/usersMessagesAttachmentsGet.test.ts` + `tests/unit/integrations/gmail/utils/decodeBase64Url.test.ts` + the registry test gained two assertions.
- Commit 6: `tests/e2e/slice-2f-gmail-walkthrough.spec.ts` gained one describe block (3 scenarios) + the existing slice-2f scope-assertion drift fix.

---

## 12. Durable patterns worth pinning

The plan + commits revealed two patterns that future provider work should reuse without re-discovering:

1. **Per-trigger dedup-key prefix convention.** When a single provider has multiple polling triggers that can independently fire on the same provider entity (message id / channel id / file id / …), each trigger's dedup wrapper prefixes the `(provider, eventId)` key with the trigger name. Gmail 2.3 set the precedent (`labeled:` / `attachment:`); future Microsoft / Notion / Google triggers should follow the same pattern when their surface fans out. CLAUDE.md captures this — see the Gmail-specific section there.

2. **Metadata-only triggers + composition-based byte materialization.** Gmail 2.3's `new_attachment` deliberately emits a metadata-only payload (no FileRef, no bytes). The dedicated `get_attachment` action is the only byte-materialization path; workflows that don't need bytes don't pay storage. This is the inverse of an "enrich-at-trigger" pattern that Slack 2.5's outcomes also warned against. The rule generalizes: triggers are notifications + identifiers; actions are I/O. CLAUDE.md captures this — see the Gmail-specific section.

These are the only Gmail 2.3 patterns that warranted CLAUDE.md updates. Everything else is documented above; the docs source-of-truth is sufficient for future reference.
