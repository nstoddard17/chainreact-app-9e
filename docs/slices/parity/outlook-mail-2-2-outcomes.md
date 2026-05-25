# Outlook Mail 2.2 — Parity outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **12**.
**Accepted audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`.
**Prior outcomes:** [`outlook-mail-2-1-outcomes.md`](outlook-mail-2-1-outcomes.md).
**Plan:** [`docs/slices/parity/outlook-mail-2-2-lifecycle-search-plan.md`](outlook-mail-2-2-lifecycle-search-plan.md) — commit `41890402c`.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 baseline + Outlook Mail 2.1 + Outlook Mail 2.2).

Outlook Mail 2.2 closes the second slice of the accepted parity arc: the **Lifecycle & Search** batch. The slice landed in 4 commits (plan + lifecycle-trio feat + fetch_emails feat + outcomes). **Zero manifest changes, zero new platform-tier work, zero new scopes** — every endpoint exercises scopes already declared in 2.1's P-O1 widening. **One new shared-core helper** (`core/integrations/parseCsvList`) that retroactively backs `parseRecipients` so future Q7-shape callers (categories, labels, mentions) share one canonical splitter.

The qualitative shift continues V2's narrow-mail-only stance: V1's 741-LOC `emailActions.ts` monolith holding 8 mail handlers + the dead `searchOutlookEmail` export stays NOT PORTED end-to-end now that the lifecycle trio + fetch_emails closed. V2's per-action-split shape (`integrations/microsoft-outlook/actions/<name>.{ts,schema.ts}`) absorbed all four 2.2 handlers without restructuring; the 2.2 surface inherits the same registry-test pin (`expect(registered.map(r => r.type).sort())`) so V1's orphan can never accidentally re-enter via planner / AI suggestion.

The accepted **D-OM1 + D-OM2** decisions stick:
- `fetch_emails` shipped V1-shape exactly (`folderId? + query? + startDate? + endDate? + maxResults?`). No cross-provider `search_emails` unification.
- `delete_email` ships REQUIRED Q11 `deleteMode: "trash" | "permanent"` enum, no default. V1's `permanentDelete: false` destructive default + boolean-string coercion permanently retired.

V1 lifecycle / search rot CLOSED end-to-end now that the trio + fetch landed. The remaining V1 surface is triggers + attachments → Outlook Mail 2.3.

---

## 1. Commit chain

| # | Hash | Subject |
|---|---|---|
| 1 | `41890402c` | `docs(outlook-mail): plan 2.2 lifecycle and search` |
| 2 | `a729eec47` | `feat(outlook-mail): add move, delete, and add_categories actions` |
| 3 | `79ebd4a77` | `feat(outlook-mail): add fetch_emails action` |
| 4 | (this)     | `docs(outlook-mail): document 2.2 outcomes` |

All commits local on `v2-provider-port-local`. Not pushed.

Inter-commit interleave note: between Commit 1 and Commit 2 the parallel native-nodes chat landed `02dd475bb` (`feat(native): add http_request action`) which inadvertently captured my unsaved working-tree edits to `services/execution/handlers/_registry.ts`. The native chat then explicitly cleaned up via `ed50446f7` (`fix(native): remove swept-in outlook registry entry`) — preserving my untracked Outlook 2.2 action / wrapper / test files and leaving the registry in the right shape for my Commit 3 to add `fetch_emails`. No history rewrite. Both chats stayed on `v2-provider-port-local` per the project rules.

---

## 2. Scope shipped

### Actions (4 net-new)

| Action | Endpoint | Wrapper module |
|---|---|---|
| `move_email` | `POST /me/messages/{id}/move` | [`integrations/microsoft-outlook/api/moveMessage.ts`](../../../integrations/microsoft-outlook/api/moveMessage.ts) (new) |
| `delete_email` | `DELETE /me/messages/{id}` OR `POST /me/messages/{id}/move {destinationId:"deleteditems"}` | [`integrations/microsoft-outlook/api/deleteMessage.ts`](../../../integrations/microsoft-outlook/api/deleteMessage.ts) (new, permanent-delete only) + reuses [`moveMessage.ts`](../../../integrations/microsoft-outlook/api/moveMessage.ts) for trash mode |
| `add_categories` | `PATCH /me/messages/{id}` | [`integrations/microsoft-outlook/api/patchMessage.ts`](../../../integrations/microsoft-outlook/api/patchMessage.ts) (new, open-shape `patch` payload) |
| `fetch_emails` | `GET /me/messages` OR `/me/mailFolders/{folderId}/messages` | [`integrations/microsoft-outlook/api/listMessages.ts`](../../../integrations/microsoft-outlook/api/listMessages.ts) (new — owns `$filter` vs `$search` mutual-exclusion routing) |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
**V2 Outlook Mail action total after 2.2: 8** (1 Slice 6 + 3 Outlook Mail 2.1 + 4 Outlook Mail 2.2).

### Trigger surface (unchanged)

**V2 Outlook Mail trigger total: 1** (`new_email` — Slice 6 baseline). Triggers ship in 2.3.

### Manifest scope (unchanged)

No scope changes — 2.1's P-O1 Mail.ReadWrite widening already covered every endpoint 2.2 ships (`Mail.ReadWrite` for `move_email` / `delete_email` / `add_categories`; `Mail.Read` for `fetch_emails`).

### API wrappers + helpers

- **4 new wrapper modules** under `integrations/microsoft-outlook/api/`. Each ~45–110 LOC, mirrors Slice 6 / 2.1 shape: `Unauthorized401Error` on 401, `surfaceGraphError` on other non-2xx, URL-encoded message ids.
  - `moveMessage` — POST `/move`, returns moved-message envelope (Outlook re-keys on move; new id surfaces in handler output).
  - `deleteMessage` — DELETE, 204 No Content, no body.
  - `patchMessage` — PATCH, open-shape `patch` payload (categories now, isRead / flag / inferenceClassification future-proof).
  - `listMessages` — GET, owns the $filter vs $search routing + ConsistencyLevel header.
- **1 new shared-core helper** — [`core/integrations/parseCsvList.ts`](../../../core/integrations/parseCsvList.ts) (~20 LOC). Shape-agnostic sibling of `parseRecipients` (Q7). `parseRecipients` now delegates to it — one canonical splitter for recipients, categories, labels, mentions. Public name `parseRecipients` preserved for handler / test legibility.

### Tests

| Suite | Net-new tests |
|---|---|
| `tests/unit/integrations/microsoft-outlook/manifest.test.ts` | Registry-contains assert extended to 7 actions in Commit 2, then 8 actions in Commit 3 |
| `tests/unit/integrations/microsoft-outlook/actions/moveEmail.{schema,}.test.ts` | 9 schema + 11 handler |
| `tests/unit/integrations/microsoft-outlook/actions/deleteEmail.{schema,}.test.ts` | 12 schema + 14 handler (split across trash / permanent / common describes) |
| `tests/unit/integrations/microsoft-outlook/actions/addCategories.{schema,}.test.ts` | 13 schema + 13 handler |
| `tests/unit/integrations/microsoft-outlook/actions/fetchEmails.{schema,}.test.ts` | 18 schema + 18 handler |
| `tests/unit/integrations/microsoft-outlook/api/moveMessage.test.ts` | 9 wrapper |
| `tests/unit/integrations/microsoft-outlook/api/deleteMessage.test.ts` | 9 wrapper |
| `tests/unit/integrations/microsoft-outlook/api/patchMessage.test.ts` | 12 wrapper |
| `tests/unit/integrations/microsoft-outlook/api/listMessages.test.ts` | 25 wrapper |
| `tests/unit/core/integrations/parseCsvList.test.ts` | 9 (new helper) |

**Outlook unit-test total after 2.2: ~370 tests across ~33 suites** (2.1 baseline + 2.2 additions). Full jest suite at slice close: **695 / 7084 passing**.

### E2E

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) extended with **6 new test() blocks**:
- 4 in Commit 2 — `move_email` happy path, `delete_email` trash mode, `delete_email` permanent mode, `add_categories` CSV parse.
- 2 in Commit 3 — `fetch_emails` no-query ($filter path), `fetch_emails` with-query ($search path with client-side date filter).

**Slice 6 walkthrough total after 2.2: 12 tests** (6 baseline+2.1 + 6 Outlook Mail 2.2). Run with `--workers=1`; ran twice consecutively for cross-run stability on each of Commits 2 + 3.

Mock surface added:
- `POST /v1.0/me/messages/{id}/move` (record body + destinationId, 201 Created with synthetic `mock-moved-N` envelope; reused by trash-delete + move).
- `DELETE /v1.0/me/messages/{id}` (record messageId, 204 No Content).
- `PATCH /v1.0/me/messages/{id}` (record patch body, 200 OK with echoed `categories[]` when present in request).
- `GET /v1.0/me/messages` + `GET /v1.0/me/mailFolders/{folderId}/messages` (record full URL + parsed query params + ConsistencyLevel header + folderId; returns injected messages filtered by `parentFolderId` when path-scoped).

4 new `RecordedMoveMessage` / `RecordedDeleteMessage` / `RecordedPatchMessage` / `RecordedListMessages` types added to `MockMicrosoftHandle.calls`. `movedMessageCounter` added to `MutableState` for synthetic moved-message id generation. The mock does NOT honor `$filter` / `$search` server-side — handler unit tests cover that boundary; e2e asserts URL construction + handler behavior end-to-end.

---

## 3. Durable decisions worth preserving

### 3.1 D-OM2 — `delete_email` REQUIRES explicit `deleteMode` enum, no default

V1's `deleteOutlookEmail` silently defaulted `permanentDelete = false` (move to Deleted Items). V2 rejects this — `deleteMode: "trash" | "permanent"` is REQUIRED at the schema layer with no default.

Schema is `.strict()` Zod with discriminated enum:
- `"trash"` → `moveMessage(destinationId: "deleteditems")`. Reversible.
- `"permanent"` → `deleteMessage` (DELETE /me/messages/{id}). Irreversible.

Boolean / boolean-string V1 inputs (`true`, `false`, `"true"`, `"false"`) are explicitly rejected at parse time. Workflow authors that paste V1-shape config get an immediate Zod error at builder time, not at runtime. Schema-test bank covers each rejection variant.

**Single-call invariant:** the mode branch happens INSIDE `refreshAndRetry`'s `apiCall`, so a 401 retries only the selected endpoint. Two distinct wrapper calls never fire per handler invocation. Handler test pins this with separate assertions per mode (`mockMoveMessage` called / not called) covering each branch.

### 3.2 D-OM1 — `fetch_emails` ships V1-shape, single-page only

`fetch_emails` accepts five optional fields: `folderId? + query? + startDate? + endDate? + maxResults?`. Maxresults defaults to **10**, bounded **1..50**. No `@odata.nextLink` following — single-page only.

Wrapper owns the Graph mutual-exclusion routing:
- **No `query`**: server-side `$filter` (`receivedDateTime ge/le`) + `$orderby receivedDateTime desc` + `$top = maxResults`.
- **`query` set**: server-side `$search="<query>"` + `$top = maxResults * 3` (capped at 100) + NO `$orderby`. Handler applies client-side date filter post-response and slices to `maxResults`.

`ConsistencyLevel: eventual` header set unconditionally — required by Graph for `$search`, harmless for `$filter`-only paths.

**Bounded output shape** (no Graph envelope leakage; `| null` on Graph-optional fields):

```ts
{
  messages: Array<{
    id, subject, from: { name?, address } | null,
    to: [...], cc: [...],
    receivedDateTime, bodyPreview, hasAttachments,
    importance, isRead
  }>,
  count: number,
}
```

`$select` whitelist fixed at the wrapper layer to:
`id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead`

Workflows that need >50 results compose multiple calls with date-window slicing. A future `iterate_emails` action could ship later if real workloads demand it.

V1's `folderId !== "inbox"` quirk (treating the "inbox" sentinel as "no folder filter") is permanently retired. V2 sends whatever the workflow author supplied; cross-folder behavior happens by omitting `folderId` entirely.

### 3.3 `add_categories` — PATCH-REPLACE semantics, explicitly documented

V1's `addOutlookCategories` PATCH-replaces the message's full `categories[]`. V2 follows the same semantics — the name "add_categories" matches V1 for workflow-author legibility but the operation is "set_categories" semantically. Adding one category to an email with three existing categories REPLACES all four with the one.

The handler's doc-comment prominently flags this. If user feedback demands additive semantics, ship a sibling `append_categories` action that does a read-merge-PATCH round trip. Out of scope for 2.2.

Input parsing: CSV-string OR array OR array-of-CSV via `parseCsvList`. At-least-one-category guard fires POST-parse (whitespace-only CSV like `"   ,  "` passes schema's `.min(1)` but yields `[]` post-parse).

Output echoes Graph's authoritative `categories[]` from the PATCH response (the new full list), falling back to the parsed input list defensively when Graph's response omits it.

### 3.4 `move_email` — Outlook re-keys on move; new id surfaces in output

Microsoft Graph's `POST /me/messages/{id}/move` returns 201 Created with a moved-message envelope whose `id` differs from the source. Outlook re-assigns the message id when crossing folder boundaries. The handler's output exposes both ids:

```ts
{
  moved: true,
  emailId: <original id>,    // echo
  newId: <Graph re-keyed id>,
  destinationFolderId: <as-configured>,
}
```

Workflows that chain `move_email` → further actions on the same message MUST reference `{{node.newId}}`, not the original `emailId` — operating on the original would 404 because the message no longer exists at that id. Handler test pins this with explicit `result.output.newId !== "AAMkAGI2-orig"` assertions.

**Well-known folder names + custom ids:** the schema accepts either path verbatim (`"inbox"`, `"sentitems"`, `"deleteditems"`, `"drafts"`, `"archive"`, `"junkemail"`, `"outbox"`, or any custom Graph folder id). Invalid names surface as Graph `ErrorItemNotFound` at runtime via standard error mapping.

### 3.5 `parseCsvList` — shared canonical splitter

`core/integrations/parseCsvList.ts` is a generic CSV-or-array list parser. `parseRecipients` now delegates to it. One canonical implementation backs every Q7-shape splitter — recipients (Calendar attendees, Gmail / Outlook to/cc/bcc), categories (Outlook 2.2), and any future labels / mentions / tags.

Public name `parseRecipients` preserved for handler / test legibility — existing 2.1 / Slice 6 / Calendar / Gmail callers don't migrate. The new helper's only consumer in 2.2 is `addCategories` (where "recipients" naming would have been misleading).

Test bank at `tests/unit/core/integrations/parseCsvList.test.ts` covers null / undefined / empty / whitespace-only / CSV / array / array-of-CSV / non-string entries / no-dedup.

### 3.6 Bounded output projection — no raw provider response spread

Every new handler returns only a load-bearing typed subset:
- `move_email`: `{ moved, emailId, newId, destinationFolderId }`.
- `delete_email`: `{ deleted, emailId, mode }` (`mode` is V2's renamed alias of V1's `permanent: boolean`).
- `add_categories`: `{ categorized, emailId, categories: string[] }`.
- `fetch_emails`: `{ messages: [...], count }` (bounded message shape — see §3.2).

Handler tests assert NO extra keys leak even when the wrapper returns a richer envelope (e.g. `move_email`'s test passes a mock response with `subject`, `body`, `changeKey` — handler ignores them).

### 3.7 Single principal call per handler — Q3 retry semantics preserved

Each handler invocation results in EXACTLY ONE wrapper-level Graph call wrapped in `refreshAndRetry`. The `delete_email` two-mode branch happens INSIDE `apiCall`, so a 401 retries only the selected endpoint. No two-step protocols, no helper round-trips that could re-fire a side effect on retry. Test bank verifies `mockRefreshAndRetry.mock.calls.length === 1` for every handler.

### 3.8 `fetch_emails` defensive nullability

The output's `from`, `receivedDateTime`, `bodyPreview`, `hasAttachments`, `importance`, `isRead` are all explicitly `| null`. Graph may omit them under unusual mailbox states (auto-generated messages, certain inferred classifications). Defensive nullability keeps downstream variable refs like `{{node.messages[0].from.address}}` safe (the workflow author handles the null case rather than crashing).

`from: { address }` is dropped to `null` when Graph returns either no `from` or no `emailAddress.address`. `to[]` / `cc[]` filter out entries with missing addresses but keep the shape stable. Handler test pins the `{ id: "msg-bare" }` minimal-response case asserting every field projects to `null`.

### 3.9 Q4 within-session idempotency — deferred, matches 2.1

`move_email`, `delete_email`, `add_categories` are all WRITE actions but do NOT receive `meta?` threading for Q4 dedup wrapping today. Matches Slice 6 / 2.1's handler set (none received `meta?` either). Q4 wraps via engine-layer `meta?` once the v2-canonical-execution-engine consolidation lands. Deferred per the active plan.

`fetch_emails` is read-only — Q4 doesn't apply.

### 3.10 V1 boolean-string deleteMode coercion — permanently retired

V1's `deleteOutlookEmail` accepted `'true'` / `'false'` string variants alongside the boolean. V2's schema enum rejects them. Workflows that wired V1's boolean (or string-boolean) shape need migration tooling to swap to the enum (out of scope — Phase 3 / 4).

The schema-test bank explicitly covers each rejection variant:
- `deleteMode: true` → reject
- `deleteMode: false` → reject
- `deleteMode: "true"` → reject
- `deleteMode: "false"` → reject
- `deleteMode: "archive"` → reject (unknown enum value)

Strict mode also rejects `permanentDelete: true` as an unknown field, double-pinning the V1 → V2 break.

### 3.11 Mock e2e captures wire shape, not Graph semantics

The mock's GET `/me/messages` returns ALL injected messages — it does NOT honor `$filter` / `$search` server-side. The e2e asserts URL construction (params, headers, folder path) and handler-side projection / client-side filtering; wrapper unit tests cover the routing logic exhaustively. This deliberate split keeps mock-server complexity bounded while preserving end-to-end coverage of every workflow-author-visible behavior.

`state.calls.listMessages` captures `searchParams` as a `Record<string, string>` keyed off `url.searchParams` — so the spec can assert `searchParams.$search`, `searchParams.$filter`, `searchParams.$top`, `searchParams.$orderby` independently per branch.

---

## 4. V1 rot — closed / not ported / deferred

| V1 finding | 2.2 disposition |
|---|---|
| **R1** — `emailActions.ts` 741 LOC monolith — 8 handlers in one file | **CLOSED end-to-end after 2.2** — V2's per-action-split absorbs every 2.2 handler. `moveOutlookEmail` / `deleteOutlookEmail` / `addOutlookCategories` / `getOutlookEmails` now live in 4 separate files with sibling `.schema.ts`. |
| **R1** — `searchOutlookEmail` orphan exported but not registered | **CONFIRMED SKIP** — registry test pins the 8-action set; `search_email` cannot accidentally re-enter. `fetch_emails` with `query` covers the search use-case. |
| **R8 / Q11** — V1 `deleteOutlookEmail` defaults `permanentDelete = false` | **CLOSED** — V2 REQUIRES explicit `deleteMode` enum. No destructive hidden defaults. |
| **R8** — V1 accepts boolean-string `'true'`/`'false'` coercion on `permanentDelete` | **CLOSED** — V2's strict enum rejects all V1 boolean / string-boolean variants. |
| **R8** — V1 `getOutlookEmails` permissive maxResults validation at HTTP-call time | **CLOSED** — V2 enforces `z.number().int().min(1).max(50)` at schema layer. Default 10. |
| V1 inline `getDecryptedAccessToken` + `refreshMicrosoftToken` per handler | **CLOSED for 2.2 actions** — all 4 wrap principal call in `services/oauth/refreshAndRetry.ts`. |
| V1 `getOutlookEmails` `folderId !== 'inbox'` sentinel quirk | **CLOSED** — V2 sends `folderId` verbatim or omits when absent. No sentinel handling. |
| V1 `getOutlookEmails` raw `msg.from?.emailAddress` shape leakage | **CLOSED** — V2 projects bounded output with explicit `| null` on Graph-optional fields. |
| V1 `addOutlookCategories` ad-hoc CSV-or-array parsing inline | **CLOSED** — V2 routes through shared `parseCsvList` helper; `parseRecipients` also delegates. One canonical splitter. |
| V1 `moveOutlookEmail` returns Graph response `{id, moved, newFolderId}` shape | **REPLACED** — V2 returns `{moved, emailId, newId, destinationFolderId}` with the new re-keyed id surfaced separately from the original. |
| V1 monolithic mega-route for ALL Microsoft Graph notifications | **CLOSED (Slice 6)** — per-provider routes. Unchanged in 2.2 (no trigger work). |
| V1 9-scope Microsoft mega-list | **CLOSED (Slice 6 + 2.1 P-O1)** — 4 mail-only scopes. Unchanged in 2.2 (no scope work). |
| V1 `email_sent` / `email_flagged` triggers | **DEFERRED to 2.3** — both ports planned with `email_flagged` accepting V1-parity over-fire per D-OM4. |
| V1 `new_email` per-trigger filter logic | **DEFERRED to 2.3** — D-OM3 accepted; ports all 5 V1 filters with folder via subscription resource. |
| V1 `get_attachment` action | **DEFERRED to 2.3** — depends on P-O2 receive-side carry-through with `createWorkflowFilesStorageAdapter` reuse. |
| Cross-provider `search_emails` unification with Gmail's accepted shape | **DEFERRED indefinitely** — Phase 5 / 7 candidate. Outlook ships V1-shape `fetch_emails` per D-OM1. |
| Upload-session flow for attachments >3 MB / >25 MB | **DEFERRED indefinitely** (carry-forward from 2.1). |
| `itemAttachment` / `referenceAttachment` Graph subtypes in send-side `send_email` + receive-side `get_attachment` | **SKIP (P-O2)** (carry-forward from 2.1). |

Q4 session-side-effect idempotency is NOT threaded at the handler layer in 2.2 — deferred at the V2 engine level pending broader consolidation (matches every prior parity slice).

---

## 5. Reused unchanged from Slice 6 / Outlook Mail 2.1

- **Shared Microsoft OAuth** via [`integrations/_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts).
- **Microsoft Graph base + error helpers** at [`integrations/_shared/microsoft/api/{_base,errors,me,subscriptions}.ts`](../../../integrations/_shared/microsoft/api/).
- **`refreshAndRetry` 401-retry contract** at [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts).
- **`new_email` subscription-watch trigger** + per-trigger lifecycle directory.
- **Webhook receive route** at `app/api/webhooks/microsoft-outlook/route.ts`.
- **Manifest scopes** (4 mail-only set from 2.1 P-O1) — no changes.
- **`parseRecipients` Q7 helper** at [`core/integrations/parseRecipients.ts`](../../../core/integrations/parseRecipients.ts) — now delegates to `parseCsvList` but the public name + shape are preserved.

---

## 6. E2E validation

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) — 12/12 tests passing, twice consecutively, with `--workers=1`:

| # | Scenario | Load-bearing assertion |
|---|---|---|
| 1 | (Slice 6 baseline) | OAuth + subscription + notification + dedup; preserved unchanged through 2.2 |
| 2 | (2.1) `reply_to_email` replyAll: false | `/reply` hit, body `{ comment }`, dedup row |
| 3 | (2.1) `reply_to_email` replyAll: true | `/replyAll` hit (Q11 endpoint selection) |
| 4 | (2.1) `forward_email` CSV `to` | Two Graph recipients (closes V1 O-R3 end-to-end); cc parsed; comment passed |
| 5 | (2.1) `create_draft_email` | POST `/me/messages` body asserts subject + HTML body + importance + parsed recipients; `mock-draft-1` returned |
| 6 | (2.1) `send_email` + signed_url FileRef attachment | Mock `/sendMail` body has `@odata.type: "#microsoft.graph.fileAttachment"` + non-empty base64 contentBytes; output shape unchanged (no bytes leakage) |
| 7 | (2.2) `move_email` | Mock `/move` recorded with destinationId `"archive"`; output exposes Graph-re-keyed `newId`; `deleteMessage` + `patchMessage` NOT called |
| 8 | (2.2) `delete_email` trash mode | Mock `/move` recorded with destinationId `"deleteditems"`; `deleteMessage` NOT called; output `mode: "trash"` |
| 9 | (2.2) `delete_email` permanent mode | Mock DELETE recorded; `moveMessage` NOT called; output `mode: "permanent"` |
| 10 | (2.2) `add_categories` CSV parse | Mock PATCH recorded with `patch.categories: ["Important", "Urgent", "Follow-up"]` (CSV split + trim); other lifecycle endpoints NOT called |
| 11 | (2.2) `fetch_emails` no-query | Mock GET recorded; `$filter` matches `receivedDateTime ge ...`; `$orderby` `receivedDateTime desc`; NO `$search`; `$top: 5`; `ConsistencyLevel: eventual`; folderId null; bounded output keys assert |
| 12 | (2.2) `fetch_emails` with-query | Mock GET recorded; `$search: '"invoice"'`; NO `$filter`; NO `$orderby`; `$top: 15` (3× headroom); `ConsistencyLevel: eventual`; client-side date filter includes in-window injected msg, excludes out-of-window |

Test pattern: per-run randomized message IDs (via `randomUUID()`) so `webhook_event_dedup` never collides across consecutive runs. The "with-query" `fetch_emails` test deterministically injects 1 in-window + 1 out-of-window message ahead of trigger so the client-side date-filter assertion doesn't depend on the test runner's clock.

---

## 7. Final Outlook Mail 2.2 surface (counts)

| Surface | Count |
|---|---|
| V2 Outlook Mail actions | **8** (1 Slice 6 + 3 Outlook Mail 2.1 + 4 Outlook Mail 2.2) |
| V2 Outlook Mail triggers | **1** (`new_email` — Slice 6 baseline) |
| V2 Outlook Mail required scopes | **4** (`offline_access`, `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`) |
| V2 Outlook Mail webhook subscriptions per trigger | 1 (`/me/messages`, changeType `created`, 70.5h expiration, 1h renewal threshold) |
| Outlook Mail unit-test suites (cumulative) | ~33 |
| Outlook Mail unit tests (cumulative) | ~370 |
| Outlook Mail e2e tests | 12 |

---

## 8. Final commit chain (recap)

```
41890402c — docs(outlook-mail): plan 2.2 lifecycle and search
a729eec47 — feat(outlook-mail): add move, delete, and add_categories actions
79ebd4a77 — feat(outlook-mail): add fetch_emails action
(this)    — docs(outlook-mail): document 2.2 outcomes
```

4 commits total. Branch `v2-provider-port-local`. Local-only. Not pushed.

Inter-chat interleave (informational): native-nodes chat landed `02dd475bb` + `924f06043` + `48033cae6` between my commits, plus a clean-up commit `ed50446f7` that explicitly restored my Outlook 2.2 file ownership. No merge conflicts, no history rewrite.

---

## 9. Deferred — Outlook Mail 2.3 + on-demand items

### Outlook Mail 2.3 — Triggers & Attachments (plan + 3 implementation commits)

| Item | Locked decision |
|---|---|
| `email_sent` trigger | PORT — clone Slice 6 lifecycle with `resource: "/me/mailFolders/SentItems/messages"` |
| `email_flagged` trigger | PORT — V1-parity over-fire (D-OM4 accepted; no prior-state cache for v1) |
| `new_email` filter expansion | PORT all 5 V1 filters (D-OM3 accepted): folder via subscription resource, the rest at notification-receive time. V1 defaults preserved (`subjectExactMatch: true`, `hasAttachment` enum-of-3, `importance` enum-of-4) |
| `get_attachment` | PORT after P-O2 carry-through — `fileAttachment` only; returns `FileRef[]` via the reusable `createWorkflowFilesStorageAdapter` helper from 2.1. `itemAttachment` + `referenceAttachment` log-and-continue with `skipped: true` flag. |

### On-demand / open follow-ups

- **`iterate_emails` / paged variant** of `fetch_emails`. Currently single-page only. Open if a workflow needs >50 results in one node.
- **`append_categories`** sibling action with additive (not replace) semantics. Open if user feedback flags PATCH-replace as surprising.
- **Upload-session flow** for attachments > 3 MB / > 25 MB (carry-forward from 2.1).
- **`itemAttachment` / `referenceAttachment` body materialization** (carry-forward from 2.1 — P-O2 SKIP).
- **`email_flagged` prior-state cache** (carry-forward — D-OM4 fallback).
- **Cross-provider `search_emails` unification** with Gmail's accepted shape (carry-forward — Phase 5 / 7 candidate).

---

## 10. What's next

After this outcomes commit lands:
1. **Outlook Mail 2.3 plan opens.** Per the audit's batch plan (§13): 1 plan commit + 3 feat commits + 1 outcomes commit. D-OM3 and D-OM4 are pre-decided; the plan captures `email_sent` / `email_flagged` (V1-parity over-fire) / `new_email` filter expansion / `get_attachment` shapes.
2. **CLAUDE.md gains an Outlook Mail 2.2 entry** alongside the Slack / Gmail / Notion / Sheets / Excel / Airtable / Stripe / Shopify / HubSpot / Mailchimp / Outlook Mail 2.1 entries. Captures durable rules from §3 above — particularly D-OM1 fetch_emails single-page bound, D-OM2 deleteMode-enum requirement, PATCH-replace categories semantics, and `parseCsvList` as the canonical Q7-shape splitter.
3. **No remote push.** All Outlook Mail 2.2 work stays local until Marcus pushes.
