# Outlook Mail 2.3 — Parity outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **12**.
**Accepted audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`.
**Prior outcomes:** [`outlook-mail-2-1-outcomes.md`](outlook-mail-2-1-outcomes.md) + [`outlook-mail-2-2-outcomes.md`](outlook-mail-2-2-outcomes.md).
**Plan:** [`docs/slices/parity/outlook-mail-2-3-triggers-attachments-plan.md`](outlook-mail-2-3-triggers-attachments-plan.md) — commit `93c8a72c6`.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 baseline + Outlook Mail 2.1 + 2.2 + 2.3).

Outlook Mail 2.3 closes the final slice of the accepted parity arc: the **Triggers & Attachments** batch. The slice landed in 5 commits (plan + new_email filter expansion + email_sent / email_flagged triggers + get_attachment + outcomes). **Zero manifest changes** (Mail.Read + Mail.ReadWrite from 2.1's P-O1 cover every endpoint 2.3 ships), **zero migrations**, **one new reusable end-to-end pattern** (per-eventType receive-route dispatch with filter-subset schema parsing — extensible for any future Microsoft Graph subscription trigger).

The qualitative shift: V1's 838-LOC `MicrosoftGraphTriggerLifecycle` (one class for Outlook mail + calendar + contacts + Teams + OneDrive + Excel) was already retired by Slice 6's per-provider lifecycle directory shape. 2.3 fully closes the V1 trigger surface — the original lifecycle dispatcher had `trigger_email_sent` / `trigger_email_flagged` resource mapping baked in alongside the calendar / Teams / Excel triggers; V2's per-trigger files live in `integrations/microsoft-outlook/triggers/{newEmail,emailSent,emailFlagged}/` with clear separation. The `MicrosoftGraphSubscriptionManager` empty-accessToken-on-renewal V1 bug (subscriptionManager.ts:303) is now closed across all three Outlook Mail triggers — each per-trigger renew handler wraps the renewal call in `refreshAndRetry` with central token fetch.

The accepted **D-OM3 + D-OM4 + P-O2** decisions stick:
- new_email filter expansion shipped all 5 V1 filters (folder via subscription resource; from / subject / hasAttachment / importance at receive-time). V1 defaults preserved.
- email_sent ships V1-parity 3-filter shape (`to` / `subject` / `subjectExactMatch`). `to` is OPTIONAL in V2 (V1 marked it required but its mega-route only filtered when set).
- email_flagged ships V1-parity over-fire — no prior-state cache; receive-time `flag.flagStatus === "flagged"` skip when the message is no longer flagged.
- get_attachment ships **`fileAttachment` only**; `itemAttachment` + `referenceAttachment` emit metadata-only stubs with `skipped: true`. FileRef[] output via `stageFileToStorage` (P-S3). Zero bytes / base64 / contentBytes / content in output.

V1's permanent SKIPs hold: `searchOutlookEmail` orphan stays permanently unported (registry pin enforced via manifest test). The V1 `MicrosoftGraphTriggerLifecycle` itself is permanently retired.

---

## 1. Commit chain

| # | Hash | Subject |
|---|---|---|
| 1 | `93c8a72c6` | `docs(outlook-mail): plan 2.3 triggers and attachments` |
| 2 | `fa8fd216f` | `feat(outlook-mail): add new_email filter expansion` |
| 3 | `2428f9c8c` | `feat(outlook-mail): add email_sent and email_flagged triggers` |
| 4 | `412b6380b` | `feat(outlook-mail): add get_attachment action` |
| 4.1 | `71431d549` | `chore(outlook-mail): untrack engine-branching-plan.md from prior commit` |
| 5 | (this) | `docs(outlook-mail): document 2.3 outcomes` |

All commits local on `v2-provider-port-local`. Not pushed.

Inter-chat interleave: the parallel native-nodes chat landed 5 commits between mine — Slice 2 plan, manual_trigger, cron-expression utility, scheduled_trigger + scheduler, slice-2 walkthrough + outcomes. Two notable interactions:

- Commit 3 (`email_sent + email_flagged`) staged `integrations/_registry.ts` after manually removing the other chat's pending `import "./native/triggers/scheduledTrigger";` line from the working tree to preserve clean commit boundaries. The line was restored to the working tree post-commit; the native chat landed the file via their own commit `eedd2af00`.
- Commit 4 (`get_attachment`) accidentally captured `docs/slices/parity/engine-branching-plan.md` (an untracked native-node WIP doc). The follow-up cleanup commit `71431d549` un-tracked it via `git rm --cached` while preserving the working-tree file for the native chat. No code-level interference between the two chats.

---

## 2. Scope shipped

### Triggers (2 net-new + 1 expansion)

| Trigger | Subscription resource | Change type | Filters |
|---|---|---|---|
| `email_sent` (new) | `/me/mailFolders/SentItems/messages` | `created` | `to` (CSV-or-array, optional), `subject`, `subjectExactMatch` (default true). All receive-time. |
| `email_flagged` (new) | `/me/messages` OR `/me/mailFolders/{folder}/messages` | `updated` | `folder` (optional, routes via subscription resource). Receive-time filter: `flag.flagStatus === "flagged"`. D-OM4 V1-parity over-fire. |
| `new_email` (expansion) | `/me/messages` OR `/me/mailFolders/{folder}/messages` | `created` | All 5 V1 filters: `folder` via subscription resource, `from` / `subject` / `subjectExactMatch` (default true) / `hasAttachment` enum (default "any") / `importance` enum (default "any"). V1 defaults preserved. |

**V2 Outlook Mail trigger total after 2.3: 3** (parity with V1's 3 — `new_email` + `email_sent` + `email_flagged`).

### Actions (1 net-new)

| Action | Endpoint(s) | Wrapper |
|---|---|---|
| `get_attachment` | LIST `/me/messages/{id}/attachments` + per-id GET `/me/messages/{id}/attachments/{attId}` | [`listAttachments.ts`](../../../integrations/microsoft-outlook/api/listAttachments.ts) + [`getAttachment.ts`](../../../integrations/microsoft-outlook/api/getAttachment.ts) |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts). **V2 Outlook Mail action total after 2.3: 9** (parity with V1's 9 minus the permanently-SKIPped `searchOutlookEmail` orphan).

### Manifest scope (unchanged)

No scope changes — 2.1's P-O1 Mail.ReadWrite + Slice 6's Mail.Read cover every endpoint 2.3 ships:
- `email_sent` + `email_flagged` need `Mail.Read` only (subscription read, message GET).
- `new_email` filter expansion uses no new scopes.
- `get_attachment` needs `Mail.Read` only (LIST + per-id GET).

### Receive route — per-eventType dispatch

The webhook receive route at [`integrations/microsoft-outlook/webhooks/receive.ts`](../../../integrations/microsoft-outlook/webhooks/receive.ts) gained per-eventType dispatch + filter logic + normalize routing:

- Filter-subset schemas at [`triggers/newEmail/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/newEmail/configSchema.ts) / [`triggers/emailSent/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/emailSent/configSchema.ts) / [`triggers/emailFlagged/configSchema.ts`](../../../integrations/microsoft-outlook/triggers/emailFlagged/configSchema.ts) — each with an `extract*FilterFields` helper that walks only the filter keys from the full `trigger_resources.config` row before strict-mode parsing.
- `shouldFireNewEmail` / `shouldFireEmailSent` / `shouldFireEmailFlagged` filter dispatch — returns boolean; `continue` on mismatch.
- Per-trigger `normalize` modules — emit eventType-specific payload shape (e.g. email_sent has `sentDateTime` + `bcc`; email_flagged has a `flag` block with flattened datetime).
- Unknown eventType safety: `default` case in the switch logs `webhook.outlook.unknown_event_type` and skips. Future trigger types fail-soft until their registration lands.

### `GraphMessage` type extensions

[`integrations/microsoft-outlook/api/getMessage.ts`](../../../integrations/microsoft-outlook/api/getMessage.ts) extended with three Graph-optional fields (type-only changes):

- `flag?: GraphMessageFlag` — used by email_flagged's receive-time filter + normalize.
- `parentFolderId?: string` — diagnostic for folder-scoped subscription drift.
- `lastModifiedDateTime?: string` — used by email_flagged's normalize for `occurredAt`.

### Tests

| Suite | Net-new tests |
|---|---|
| `tests/unit/integrations/microsoft-outlook/triggers/newEmail/configSchema.test.ts` | 14 (defaults, enum validation, strict mode, extractor helper, Slice 6 backward compat) |
| `tests/unit/integrations/microsoft-outlook/triggers/newEmail/activate.test.ts` | +6 (folder routing — trimming, fallback, custom Graph folder ids) |
| `tests/unit/integrations/microsoft-outlook/webhooks/receive.test.ts` | +37 (new_email filter combinations + email_sent dispatch + email_flagged D-OM4 + unknown-eventType safety) |
| `tests/unit/integrations/microsoft-outlook/triggers/emailSent/{configSchema,activate,deactivate,renew,normalize}.test.ts` | ~50 |
| `tests/unit/integrations/microsoft-outlook/triggers/emailFlagged/{configSchema,activate,deactivate,renew,normalize}.test.ts` | ~50 |
| `tests/unit/integrations/microsoft-outlook/api/listAttachments.test.ts` | 8 |
| `tests/unit/integrations/microsoft-outlook/api/getAttachment.test.ts` | 10 |
| `tests/unit/integrations/microsoft-outlook/actions/getAttachment.schema.test.ts` | 14 |
| `tests/unit/integrations/microsoft-outlook/actions/getAttachment.test.ts` | 22 (filter modes, P-O2 SKIP stubs, per-attachment failures, no-byte-leakage) |
| `tests/unit/integrations/microsoft-outlook/manifest.test.ts` | +1 (final 9-action registered set) |

**Outlook unit-test total after 2.3: ~580 tests across ~46 suites.** Full jest at slice close: **716 / 7389 passing**.

### E2E

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) extended with **5 net-new test blocks**:

- Commit 2 (new_email filter expansion): match-all-5-filters + folder-scoped subscription resource path.
- Commit 3 (triggers): email_sent fires on outbound mail + email_flagged fires on flagged / drops on notFlagged (D-OM4 over-fire validation).
- Commit 4 (get_attachment): fileAttachment staged + itemAttachment skipped + inline excluded + no-byte-leakage assertion.

**Slice 6 walkthrough total after 2.3: 17 tests** (12 baseline+2.1+2.2 + 5 net-new for 2.3). Run with `--workers=1`; passed twice consecutively (with one transient port-stability retry — unrelated to test logic).

Mock additions:
- Per-eventType handling already in place (subscriptionsCreate accepts arbitrary resource + changeType).
- Trigger-specific message injection (existing `__injectMessage` works for all 3 triggers).
- `GET /v1.0/me/messages/{id}/attachments` (LIST) + per-id GET endpoint.
- `state.messageAttachments: Map<messageId, Attachment[]>` for control-plane fixtures.
- `POST /__injectAttachment` control plane.
- 2 new `RecordedListAttachments` / `RecordedGetAttachment` types in `MockMicrosoftHandle.calls`.
- The existing `connectAndActivateWorkflow` helper gained an optional `triggerType` param (defaults to `"new_email"`).

---

## 3. Durable decisions worth preserving

### 3.1 D-OM3 — `new_email` filter expansion (all 5 V1 filters)

`new_email` ships all 5 V1 filters with V1 defaults preserved:
- `folder` (optional) — **routed via subscription resource**. When set, activate hooks creates the Graph subscription on `/me/mailFolders/{folder}/messages` instead of `/me/messages`. Lower Graph bandwidth than receive-time folder filtering.
- `from` (optional) — receive-time case-insensitive exact match against `email.from?.emailAddress?.address`.
- `subject` (optional) — receive-time match. Exact (case-insensitive) when `subjectExactMatch === true` (D-OM3 default); substring when `subjectExactMatch === false`.
- `subjectExactMatch` (default `true`) — D-OM3 V1 default preserved.
- `hasAttachment` (enum `"any" | "yes" | "no"`, default `"any"`) — receive-time, requires `email.hasAttachments` to match (gate when not "any").
- `importance` (enum `"any" | "high" | "normal" | "low"`, default `"any"`) — receive-time, requires `email.importance` to match (gate when not "any").

Filter logic is consolidated in `webhooks/receive.ts` (one dispatch site per eventType), not duplicated across normalize modules. The strict-mode filter schema parses only the FILTER SUBSET of `trigger_resources.config` (extracted by `extractNewEmailFilterFields`) — keeps Slice 6 baseline workflows that have NO filter keys parsing cleanly (defaults apply).

### 3.2 D-OM4 — `email_flagged` V1-parity over-fire

The email_flagged trigger uses `changeType: "updated"` on `/me/messages` because Graph has no dedicated "flagged" event type — flag changes are message updates. V2 ships the EXACT same V1 over-fire semantic:

- Receive route applies `message.flag?.flagStatus === "flagged"` check after `getMessage`. Drops on `"notFlagged"` or `"complete"`. Fires on `"flagged"`.
- **No per-message state cache.** Any update on an already-flagged message — subject edit, body change, re-flag — fires the trigger.
- **Defensive over-fire on Graph omission.** If `message.flag` is missing entirely from the envelope (shouldn't happen, but documented Graph behavior is "always present"), the receive route fires anyway rather than silently dropping. Logged via `webhook.outlook.email_flagged_missing_flag_field`.

The contract is documented prominently in `triggers/emailFlagged/index.ts` and the email_flagged plan §4. Workflow authors who hit noise from repeat-edits on flagged messages can apply downstream dedup (or wait for the deferred prior-state-cache slice).

### 3.3 `email_sent` config — `to` is OPTIONAL (corrected from V1's "required")

V1's `outlookTriggerEmailSent.configSchema` marked `to` as `required: true`, but V1's mega-route only filters when `triggerConfig.to` is set. V2 makes `to` OPTIONAL to match the actual V1 dispatch behavior — keeps the workflow author free to subscribe to "all sent mail" without supplying a recipient filter. This is a soft tightening of V1's stated contract toward V1's actual behavior; no V1 workflow breaks.

`to` accepts CSV-or-array via `parseCsvList`. Receive-time match is **any-of-many** — the trigger fires when ANY parsed address in the filter matches ANY recipient on `email.toRecipients[]`. Whitespace-only CSV (`"   ,   "`) is treated as "no filter" (passes through).

`subjectExactMatch` defaults to `true` per D-OM3 V1-parity.

### 3.4 P-O2 — `get_attachment` ports `fileAttachment` only

`get_attachment` ports only the `#microsoft.graph.fileAttachment` subtype:

- **`fileAttachment`** → per-id GET → Buffer base64-decode → `stageFileToStorage` (P-S3) → output entry includes a `FileRef(kind=v2_storage)` pointing at `workflow_files` storage.
- **`itemAttachment`** → metadata-only stub: `{ id, name, contentType, size, subtype: "itemAttachment", skipped: true, reason: "itemAttachment subtype not supported (P-O2 SKIP)" }`.
- **`referenceAttachment`** → metadata-only stub: same shape with `subtype: "referenceAttachment"` and a matching reason string.

Skip subtypes still incur the per-id GET round-trip (Graph requires it to identify the subtype reliably; the LIST call's `@odata.type` is sometimes inferred incorrectly), but no bytes flow through `stageFileToStorage`. `downloadedCount` in the output counts only the ported fileAttachment entries; `count` counts all entries (ported + skipped); `totalSize` sums `size` across all entries.

### 3.5 `get_attachment` — `excludeInline` + `downloadMode` filter defaults (V1-parity)

- `excludeInline` defaults to `true` — V1-parity. Filters out attachments with `isInline === true` (typically embedded HTML images). Non-high-risk schema default per Q11 (bounds output, doesn't drive a side effect).
- `downloadMode` defaults to `"all"` — V1-parity. Three modes: `"all"` (no mode filter), `"by_extension"` (matches `fileExtensions` CSV-or-array, case-insensitive, leading dot stripped), `"by_name"` (case-insensitive substring of `fileNameFilter`).
- **Conditional-required at handler layer.** Schema is open-shape; handler enforces `fileExtensions` presence post-parse when `downloadMode === "by_extension"` and `fileNameFilter` presence when `downloadMode === "by_name"`. Schema-level conditional-required would require a Zod discriminated union, which adds complexity without value here.

### 3.6 `get_attachment` — per-attachment failures log-and-continue

Per-attachment GET failures + `stageFileToStorage` failures both log-and-continue (`console.warn` with structured fields, no token leakage). The overall action succeeds as long as the LIST call succeeded. Workflow authors who need all-or-nothing semantics can chain a downstream `if`-check on `downloadedCount === count`. This matches V1's mega-loop behavior — V1 also continued past failed downloads.

LIST call failures (the principal Graph call) propagate verbatim — the entire action fails. No partial success when there's no list to filter.

### 3.7 No byte / base64 / content / data / bare-`bytes` leakage in `get_attachment` output

CLAUDE.md rule #1 enforced end-to-end:
- Handler returns only `attachments[]` (FileRef + metadata OR skipped stubs), `count`, `downloadedCount`, `totalSize`.
- FileRef shape (`V2StorageFileRef`) carries a storage path, never raw bytes.
- Handler unit test pins NO `contentBytes` / `base64` / `bytes` / `content` / `data` key anywhere in the output via JSON-serialize-and-grep.
- E2E test reads `workflow_runs.steps[*].output` and applies the same serialization check (uses `"bytes":` with the colon to allow `sizeBytes` key through). End-to-end byte-leakage check covers handler-level AND engine step-output persistence.

### 3.8 Per-eventType receive-route dispatch shape (reusable)

The dispatch shape in `webhooks/receive.ts` is the canonical pattern for any future Microsoft Graph subscription trigger:

```ts
switch (trigger.eventType) {
  case "new_email":
    if (!shouldFireNewEmail(message, trigger.config)) continue;
    normalized = normalizeNewEmail(message, ctx);
    break;
  case "email_sent":
    if (!shouldFireEmailSent(message, trigger.config)) continue;
    normalized = normalizeEmailSent(message, ctx);
    break;
  case "email_flagged":
    if (!shouldFireEmailFlagged(message, trigger.config)) continue;
    normalized = normalizeEmailFlagged(message, ctx);
    break;
  default:
    // Log + skip — unknown eventType, never throw.
    continue;
}
```

Each per-eventType filter helper:
- Parses ONLY the filter subset of `trigger_resources.config` (via `extract*FilterFields`).
- Uses a strict Zod schema (rejects unknowns at the filter level).
- Returns boolean — no exceptions thrown on filter mismatch.

Adding a new Microsoft Graph subscription trigger follows the same shape: directory + per-trigger configSchema + extractor + filter helper + normalize + receive-route case.

### 3.9 Renewal handlers per-trigger (canHandle pins eventType)

Each of the 3 Outlook Mail triggers registers its own `SubscriptionHandler` with `canHandle()` matching ONLY its eventType:

- `microsoft-outlook:new_email` (Slice 6)
- `microsoft-outlook:email_sent` (2.3)
- `microsoft-outlook:email_flagged` (2.3)

The shared `runRenewals` cron picks each trigger row based on `canHandle()`. No new cron job; no shared renewal logic that branches on eventType internally. Each per-trigger handler defaults to the same 1h-before-expiry threshold + 4230-minute target expiration.

### 3.10 `searchOutlookEmail` orphan stays permanently SKIPped (audit-confirmed across all 3 slices)

V1's `searchOutlookEmail` is exported from `microsoft-outlook/index.ts` but never registered in V1's `registry.ts` and never declared as a manifest node type. V2's audit confirmed SKIP across all 3 slices (2.1 + 2.2 + 2.3). The 9-action registry pin in `manifest.test.ts` enforces it permanently — V2 cannot accidentally register `search_email` without breaking the test.

`fetch_emails` (Outlook Mail 2.2) with the `query` field covers the search use-case for any workflow that needs full-text search over messages.

---

## 4. V1 rot — closed / not ported / deferred

| V1 finding | 2.3 disposition |
|---|---|
| **R1** — `emailActions.ts` 741-LOC monolith holding 8 mail handlers | **CLOSED end-to-end across 2.1 + 2.2** — V2 ships per-action-split for every Outlook Mail action under `actions/`. |
| **R1** — `MicrosoftGraphTriggerLifecycle.ts` 838-LOC for 6 Microsoft surfaces | **CLOSED across Slice 6 + 2.3** — V2 ships per-provider per-trigger directories. Outlook Mail's 3 triggers each in their own folder; calendar in its own provider (microsoft-outlook-calendar). |
| **R3** — 9-scope Microsoft mega-list | **CLOSED (Slice 6 + 2.1 P-O1)** — 4 mail-only scopes. No 2.3 changes. |
| **R8 / Q11** — V1 hidden defaults across handler config | **CLOSED across all 3 slices** — every V2 handler/trigger schema uses strict mode with explicit-required for destructive choices. Non-high-risk defaults documented in §3. |
| **R9** — Inline `getDecryptedAccessToken` + `refreshMicrosoftToken` per V1 handler | **CLOSED across all 3 slices** — every V2 handler + trigger wraps principal Graph calls in `refreshAndRetry`. |
| **R10** — Inconsistent V1 ActionResult shape | **CLOSED across all 3 slices** — V2 actions use bounded `output: { ... }` per-handler with explicit field projection. |
| **O-R5** — V1 inlines normalization in 2475-LOC mega-route | **CLOSED end-to-end across 2.3** — per-trigger `normalize.ts` modules for new_email + email_sent + email_flagged. Three distinct output payload shapes preserved (e.g. email_sent has `sentDateTime` + `bcc`; new_email has `receivedAt`; email_flagged has `flag` block). |
| **O-R6** — V1's per-trigger filter logic in mega-route | **CLOSED end-to-end across 2.3** — filter logic in `webhooks/receive.ts` with per-eventType dispatch. Schema-validated; consolidated; testable. |
| **O-R7** — V1 email_flagged fires on every message update | **PARTIALLY CLOSED — V1-parity (D-OM4)** — V2 ships SAME over-fire behavior for the first port. Prior-state cache deferred unless users report noise. |
| **O-R8** — V1's single Outlook test file (send-email only) | **CLOSED across all 3 slices** — V2 ships ~580 unit tests across ~46 Outlook suites. |
| `searchOutlookEmail` orphan | **PERMANENT SKIP** (registry test pinned). |
| V1 `email_received` trigger (synonym for `new_email`) | **NOT PORTED** — V2's `new_email` covers the same use case. V1's redundant key was an architecture artifact. |
| V1 `trigger_new_attachment` trigger (subscription on /me/messages with hasAttachments filter) | **NOT PORTED** — V2's `new_email` filter expansion (`hasAttachment: "yes"`) covers the use case via the regular new_email trigger. |
| V1 attachment downloads return `contentBytes: base64` inline | **CLOSED** — V2's `get_attachment` returns `FileRef[]` via P-S3. No bytes in output. |
| Upload-session flow for attachments > 3 MB / > 25 MB (outbound — `send_email`) | **DEFERRED indefinitely** (carry-forward from 2.1). |
| Graph attachment upload-session flow on the receive side (inbound — `get_attachment` for payloads > 4 MB) | **DEFERRED indefinitely** — handler today passes through Graph's standard `/attachments/{id}` endpoint; larger payloads return base64 via Graph's auto-streaming. Hard caps would surface at the `stageFileToStorage` size-guidance log layer. |
| `itemAttachment` / `referenceAttachment` body materialization | **PERMANENT SKIP (P-O2)** — metadata-only stubs in `get_attachment` output. |
| `email_flagged` prior-state cache | **DEFERRED indefinitely** (D-OM4 fallback) — revisit only if users report noise. |
| Cross-provider `search_emails` unification with Gmail | **DEFERRED indefinitely** — Phase 5 / 7 candidate (carry-forward from 2.2). |
| Outlook Calendar / Contacts surface | **Out of scope** — separate provider (microsoft-outlook-calendar for calendar; contacts not yet planned). |

Q4 session-side-effect idempotency NOT threaded at handler layer across 2.3 (carry-forward from 2.1 / 2.2 / Slice 6 / every prior provider slice). Deferred at V2 engine layer pending unified consolidation.

---

## 5. Reused unchanged from Slice 6 + Outlook Mail 2.1 + 2.2

- **Shared Microsoft OAuth + Graph subscriptions** at [`integrations/_shared/microsoft/`](../../../integrations/_shared/microsoft/).
- **`refreshAndRetry` 401-retry contract** at [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts).
- **Webhook receive route** at [`app/api/webhooks/microsoft-outlook/route.ts`](../../../app/api/webhooks/microsoft-outlook/route.ts) — unchanged; only the per-eventType dispatch + filter logic inside `webhooks/receive.ts` grew.
- **Manifest scopes** — 4 mail-only set from 2.1 P-O1, no changes.
- **`parseRecipients` / `parseCsvList`** (Q7 / shared splitter) — used by `email_sent` `to` filter (CSV-or-array) and `get_attachment` `fileExtensions` filter.
- **`stageFileToStorage` (P-S3 file producer)** — used by `get_attachment` to stage bytes to `workflow_files` storage. First Outlook Mail consumer (Slack `download_file` was the original producer).
- **Existing renewal cron** at `services/triggers/runRenewals.ts` — picks up all 3 Outlook triggers via their `SubscriptionHandler.canHandle()` predicates. No new cron registered.

---

## 6. E2E validation

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) — 17/17 tests passing, twice consecutively (with one transient port-stability retry between runs), `--workers=1`:

| # | Scenario | Status |
|---|---|---|
| 1-6 | Slice 6 baseline + 2.1 (5 tests — compose/draft/attachment) | preserved unchanged |
| 7-12 | 2.2 lifecycle (move / delete-trash / delete-permanent / add_categories / fetch-no-query / fetch-with-query) | preserved unchanged |
| 13 | new_email filters match — all 5 filters fire end-to-end | new (2.3 Commit 2) |
| 14 | new_email folder-scoped subscription resource path | new (2.3 Commit 2) |
| 15 | email_sent fires on outbound mail to SentItems | new (2.3 Commit 3) |
| 16 | email_flagged fires on flagged + drops on notFlagged (D-OM4 over-fire validation) | new (2.3 Commit 3) |
| 17 | get_attachment stages fileAttachment + skips itemAttachment + excludes inline; no byte leakage in step output | new (2.3 Commit 4) |

End-to-end byte-leakage assertion in test #17 reads `workflow_runs.steps[*].output` directly and pattern-matches against `"contentBytes"`, `"base64"`, `"bytes":` (with colon to allow `sizeBytes`), `"content"`, `"data"`. Asserts NONE of those keys appear anywhere in the serialized step output — proves the bounded-output contract holds through the engine's run-record persistence layer, not just at handler return.

---

## 7. Final Outlook Mail 2.3 surface (counts)

| Surface | Count |
|---|---|
| V2 Outlook Mail actions | **9** (send_email, reply_to_email, forward_email, create_draft_email, move_email, delete_email, add_categories, fetch_emails, get_attachment) |
| V2 Outlook Mail triggers | **3** (new_email, email_sent, email_flagged) |
| V2 Outlook Mail required scopes | **4** (`offline_access`, `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`) |
| V2 Outlook Mail webhook subscriptions per workflow | 1 per (workflow, trigger) — 70.5h expiration, 1h renewal threshold |
| Outlook Mail unit-test suites (cumulative) | ~46 |
| Outlook Mail unit tests (cumulative) | ~580 |
| Outlook Mail e2e tests | 17 |

V1 parity surface CLOSED end-to-end:
- V1 ships 9 mail actions + 3 mail triggers + 1 orphan SKIP. V2 ships 9 + 3 + 0 (orphan permanently skipped).
- V1's 9-scope mega-list collapsed to 4 mail-only scopes.
- V1's 741-LOC handler monolith + 838-LOC trigger lifecycle + 2475-LOC mega-route fully retired in Outlook Mail's V2 lane.

---

## 8. Final commit chain (recap)

```
93c8a72c6 — docs(outlook-mail): plan 2.3 triggers and attachments
fa8fd216f — feat(outlook-mail): add new_email filter expansion
2428f9c8c — feat(outlook-mail): add email_sent and email_flagged triggers
412b6380b — feat(outlook-mail): add get_attachment action
71431d549 — chore(outlook-mail): untrack engine-branching-plan.md from prior commit
(this)    — docs(outlook-mail): document 2.3 outcomes
```

5 implementation commits + 1 cleanup + 1 outcomes = 7 commits total on `v2-provider-port-local`. Local-only. Not pushed.

Inter-chat interleave: 5 native-node chat commits landed between mine (Slice 2 plan + manualTrigger + cron-utility + scheduledTrigger + slice-2 outcomes + walkthrough). One pre-commit registry-file conflict resolved by manually reverting the other chat's working-tree edit before staging (line restored to working tree post-commit). One post-commit cleanup commit (`71431d549`) removed an accidentally-tracked native-chat WIP doc. Both chats stayed on `v2-provider-port-local` per project rules; no merge conflicts, no history rewrites.

---

## 9. Deferred — on-demand items

The full Outlook Mail parity arc closes with 2.3. Remaining open items are deferred indefinitely:

- **Upload-session flow** for outbound `send_email` attachments > 3 MB / > 25 MB total.
- **Upload-session flow** for inbound `get_attachment` payloads > 4 MB (Graph auto-streams via base64 today; hard caps would surface at the `stageFileToStorage` size-guidance log).
- **`itemAttachment` / `referenceAttachment` body materialization** for both `send_email` and `get_attachment`. Currently SKIPped (P-O2).
- **`email_flagged` prior-state cache** (D-OM4 fallback) — revisit only if users report noise.
- **Cross-provider `search_emails` unification** with Gmail's accepted shape — Phase 5 / 7 candidate.
- **`iterate_emails` / paged variant of `fetch_emails`** — single-page only today.
- **`append_categories` sibling action** with additive (not PATCH-replace) semantics for `add_categories` — if user feedback flags PATCH-replace as surprising.

---

## 10. What's next

After this outcomes commit lands:

1. **Outlook Mail parity arc CLOSES.** All 3 slices (2.1 + 2.2 + 2.3) shipped + their outcomes documented. The audit's exit checklist at [`parity-outlook-mail.md`](parity-outlook-mail.md) §14 has every box covered.
2. **CLAUDE.md** gains an "Outlook Mail 2.3" entry alongside the existing Slack / Gmail / Notion / Sheets / Excel / Airtable / Stripe / Shopify / HubSpot / Mailchimp / Outlook Mail 2.1 / 2.2 entries. Captures durable rules from §3 above — particularly D-OM3 filter expansion, D-OM4 V1-parity over-fire, P-O2 fileAttachment-only port, and the per-eventType receive-route dispatch pattern.
3. **No remote push.** All Outlook Mail 2.3 work stays local until Marcus pushes.
4. **The next provider audit is on demand** — every Phase 1 priority-ranked provider audit is accepted with parity arc shipped or in-flight. The next provider work (Outlook Calendar parity, OneDrive, etc.) opens only when Marcus signals.

**Mailchimp remains complete; do not touch. Native-node Tier C engine-branching slice is in flight in another chat; do not touch native files unless explicitly assigned.**
