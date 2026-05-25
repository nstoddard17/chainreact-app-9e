# Outlook Mail 2.1 — Compose & Drafts plan

**Status:** Plan. **Doc-only commit (Commit 1 of 4).**
**Slice:** Outlook Mail 2.1 — Compose & Drafts.
**Parent audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`, accepted 2026-05-15.
**Branch:** `v2-provider-port-local` (local-only).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 — manifest + `send_email` + `new_email`).

This is the first of three parity slices for Outlook Mail. 2.1 ships:
1. **Mail.ReadWrite scope expansion** (P-O1) — manifest + tests + e2e helper.
2. **`reply_to_email` action** — handler + schema + wrapper + tests.
3. **`forward_email` action** — handler + schema + wrapper + tests.
4. **`create_draft_email` action** — handler + schema + wrapper + tests.
5. **`send_email` attachment expansion** — wrapper extension + handler extension + schema extension + tests.

Triggers (`email_sent`, `email_flagged`, `new_email` filters), lifecycle reads (`fetch_emails`, `move_email`, `delete_email`, `add_categories`), and attachment downloads (`get_attachment`) are **out of scope for 2.1** — they ship in 2.2 / 2.3.

---

## 1. Accepted audit summary

The parent audit ([`parity-outlook-mail.md`](parity-outlook-mail.md), commit `c4c779973`) was accepted 2026-05-15 with every D-OM* + P-O2 decision resolved:

| Decision | Locked direction |
|---|---|
| **D-OM1** — `fetch_emails` shape | V1-shape (`folderId?` + `query?` + `startDate?` + `endDate?` + `maxResults?`). Ships in 2.2. |
| **D-OM2** — `delete_email` shape | Single action with REQUIRED `deleteMode: "trash" \| "permanent"` enum. No default. Ships in 2.2. |
| **D-OM3** — `new_email` filters | Ship all 5 V1 filters in 2.3. Folder via subscription resource; rest at receive-time. V1 defaults preserved. |
| **D-OM4** — `email_flagged` prior-state | V1-parity over-fire for first port. No state cache. |
| **P-O2** — attachment subtype scope | `fileAttachment` PORT, `itemAttachment` SKIP, `referenceAttachment` SKIP. P-S3 FileRef for bytes. |

The accepted 2.1 commit chain:

1. **Commit 1 (this doc)** — `docs(outlook-mail): plan 2.1 compose and drafts` — plan + platform-prep doc.
2. **Commit 2** — `feat(outlook-mail): expand manifest with Mail.ReadWrite scope` — P-O1.
3. **Commit 3** — `feat(outlook-mail): add reply, forward, and create_draft actions` — 3 handlers + schemas + wrappers + tests.
4. **Commit 4** — `feat(outlook-mail): add attachments support to send_email` — wrapper + handler + schema extension; P-O2 fileAttachment-only.

V1 surface that 2.1 closes:
- `microsoft-outlook_action_reply_to_email` (V1 `lib/workflows/actions/microsoft-outlook/emailActions.ts:10-78` `replyToOutlookEmail`)
- `microsoft-outlook_action_forward_email` (V1 `emailActions.ts:83-180` `forwardOutlookEmail`)
- `microsoft-outlook_action_create_draft_email` (V1 `emailActions.ts:185-245` `createOutlookDraftEmail`)
- `microsoft-outlook_action_send_email` attachment block (V1 `lib/workflows/actions/microsoft-outlook/sendEmail.ts:113-308`)

V1 surface that 2.1 explicitly does NOT close (deferred to 2.2 / 2.3):
- `move_email`, `delete_email`, `add_categories`, `fetch_emails` — 2.2.
- `email_sent`, `email_flagged`, `new_email` filter extension, `get_attachment` — 2.3.
- V1's `searchOutlookEmail` orphan — never ported (audit §7 SKIP).

---

## 2. P-O1 — Mail.ReadWrite scope expansion

### What changes

The current manifest at [`integrations/microsoft-outlook/manifest.ts:69`](../../../integrations/microsoft-outlook/manifest.ts#L69) declares:

```ts
scopes: {
  required: ["offline_access", "Mail.Send", "Mail.Read"],
  optional: [],
  deprecated: [],
},
```

2.1 widens to **4 required scopes**:

```ts
scopes: {
  required: [
    "offline_access",
    "Mail.Send",
    "Mail.Read",
    "Mail.ReadWrite", // P-O1 — Outlook Mail 2.1 / 2.2.
  ],
  optional: [],
  deprecated: [],
},
```

### Why Mail.ReadWrite

Microsoft Graph permission reference confirms `Mail.ReadWrite` is required for:
- POST `/me/messages` (create draft) — used by `create_draft_email` (2.1).
- POST `/me/messages/{id}/move` — used by `move_email` (2.2) and `delete_email` move-to-trash mode (2.2).
- DELETE `/me/messages/{id}` — used by `delete_email` permanent mode (2.2).
- PATCH `/me/messages/{id}` — used by `add_categories` (2.2).

`reply_to_email` (POST `/reply` / `/replyAll`) and `forward_email` (POST `/forward`) need `Mail.Send` only — already in the manifest.

`Mail.ReadWrite` is a **superset of `Mail.Read`**. Microsoft's permission hierarchy means a workspace that already granted `Mail.ReadWrite` would not need `Mail.Read` separately. V2 keeps both declared because:
- The manifest is V2's single source of truth (honest-state convention from Slice 6 plan §"Scopes").
- A future user who consents to only `Mail.Read` (some IT-restricted Azure AD tenants block `ReadWrite`) gets a clean per-scope failure at the affected action rather than a blanket "Outlook integration failed."

### Files to touch

| File | Change |
|---|---|
| [`integrations/microsoft-outlook/manifest.ts:69`](../../../integrations/microsoft-outlook/manifest.ts#L69) | Add `"Mail.ReadWrite"` to `scopes.required`. Update header doc comment to reflect 4-scope mail-only set; cite this plan + audit. |
| [`tests/unit/integrations/microsoft-outlook/manifest.test.ts:19-29`](../../../tests/unit/integrations/microsoft-outlook/manifest.test.ts#L19) | Update existing test that asserts `expect(...required).toEqual([...3 scopes])` to expect 4 scopes including `Mail.ReadWrite`. Update the test name + comment to cite Outlook Mail 2.1 + parity audit. |
| [`tests/unit/integrations/microsoft-outlook/manifest.test.ts`](../../../tests/unit/integrations/microsoft-outlook/manifest.test.ts) — new test | Add an explicit assert that `"Mail.ReadWrite"` is REQUIRED (not optional). Mirrors the "does NOT include Calendar scopes" anti-test shape. |
| [`tests/e2e/helpers/mockMicrosoftServer.ts`](../../../tests/e2e/helpers/mockMicrosoftServer.ts) | Update OAuth authorize-url validation to accept `Mail.ReadWrite` in the scopes set. No new mock endpoint — `Mail.ReadWrite` doesn't change the wire protocol, only the consent screen. **Action items:** confirm the mock's authorize handler scopes-validator accepts arbitrary Mail.* scopes today; if not, widen its allow-list. (Survey notes: existing mock doesn't reject scopes — it echoes them in the token response — so no code change expected. Confirm during implementation.) |

### Existing-account re-auth UX

Per Outlook Mail 2.1 commit-2 acceptance, existing connected Outlook accounts will need to re-grant consent to pick up `Mail.ReadWrite`. The PR-AUTH proactive-health architecture (CLAUDE.md "Proactive OAuth Token Management") signals this via `action_required` once the first `Mail.ReadWrite`-using handler returns 403. V2 ships zero special re-auth-prompt code — the existing health-check loop surfaces it. **No migration script. No silent-add.** This decision matches the Gmail-parity-accepted P-G1 pattern: manifest widens → next-call 403 → health system surfaces "reconnect required" → user clicks reconnect → OAuth flow grants new scopes.

### Risk callouts for P-O1

- **R-PO1-1** — A user denies `Mail.ReadWrite` at consent (some Azure AD tenants don't allow the user to elevate to ReadWrite). Microsoft's consent flow returns the granted scopes in the token-exchange response. Today V2's [`refresh.ts`](../../../integrations/_shared/microsoft/oauth.ts) preserves token-side scopes verbatim but doesn't reject the integration on partial-scope-grant. **Decision:** Slice 6's policy stands — partial-scope acceptance is fine; the affected action surfaces a clean Graph 403 at execution time which routes through the standard error-mapping. We do NOT block integration creation on missing optional/superset scope. Future improvement: scope-gap warning in the integration card UI (Phase 3).
- **R-PO1-2** — Microsoft Graph documentation has occasionally changed which scopes are sufficient for which endpoints (e.g. some `me/messages` ops accepted `Mail.Read` in older Graph builds). **Mitigation:** declaring `Mail.ReadWrite` is the safe superset that covers every endpoint in 2.1 / 2.2. We don't depend on Microsoft tightening scopes mid-product-life.

---

## 3. P-O2 — Microsoft Graph attachment model

### Accepted scope (per audit + Marcus acceptance)

| Subtype | Status | Reason |
|---|---|---|
| `#microsoft.graph.fileAttachment` | **PORT** | Carries `contentBytes: base64` + `contentType` + `name` + `size`. Maps cleanly to V2's FileRef contract via `stageFileToStorage`. Used by `get_attachment` (2.3). Used by `send_email` attachments (2.1 Commit 4 — sending direction). |
| `#microsoft.graph.itemAttachment` | **SKIP** | Embeds another message / event. FileRef contract has no clean shape for it (P-S3 doesn't model nested-protocol payloads). Log-and-continue when encountered — `get_attachment` returns metadata-only with `skipped: true` flag in 2.3. No 2.1 impact. |
| `#microsoft.graph.referenceAttachment` | **SKIP** | Link to OneDrive / SharePoint file. Resolving requires a separate provider call. Defer until a workflow needs it. Log-and-continue. No 2.1 impact. |

### 2.1 attachment direction: SENDING (`send_email` only)

`send_email` accepts **`FileRef[]` input** (the workflow author wires upstream nodes that emit FileRefs — Slack `download_file` is the existing producer; future Drive / OneDrive / Outlook `get_attachment` producers). Handler:

1. **Resolves each FileRef to bytes via `fetchFileBytes`.**
   - `v2_storage` kind → resolved through the storage adapter built around the service-role Supabase client.
   - `signed_url` kind → resolved by direct fetch (no auth header).
   - `provider_url` kind → throws `UnsupportedProviderFetchError`; handler maps to a clean action failure (`"Cannot fetch provider_url FileRef for provider <X> — stage the file first or use a signed_url ref."`). Matches P-S3 plan §10 #1.
2. **Encodes bytes as base64** and constructs Graph `fileAttachment[]` per Microsoft's schema:
   ```json
   {
     "@odata.type": "#microsoft.graph.fileAttachment",
     "name": "<filename>",
     "contentType": "<mimeType>",
     "contentBytes": "<base64>"
   }
   ```
3. **Adds `attachments[]` to the message body** in the existing `sendMail` wrapper call.

### NO inline bytes / base64 in action output

`send_email` returns the same output shape it does today (`{ sent: true, to, cc, bcc, subject, isHtml, importance }`). **Zero attachment bytes appear in the output.** The FileRef inputs were already references — no need to project them back. This is the CLAUDE.md rule #1 ("no bytes / base64 / Buffer / stream content in action outputs") applied at send-side.

### Graph payload caps

Microsoft Graph `fileAttachment` is **≤ 3 MB per attachment, ≤ 25 MB total per message** for the `me/sendMail` synchronous endpoint. The slice does NOT implement Graph's larger-attachment upload-session flow (the 4 MB+ path that uses `/messages/{id}/attachments` + `createUploadSession`). 2.1 fails-loud with a clear error when total attachment payload exceeds 25 MB or any single attachment exceeds 3 MB. Phase 7 (or a follow-up Outlook slice) can ship upload-session support.

**Files:** check size pre-base64 in the handler before invoking the wrapper. Reuse `getFileRefSizeGuidance("microsoft-outlook")` from [`core/files/limits.ts`](../../../core/files/limits.ts) for the soft warning; the 25 MB hard cap is handler-level for now (provider enforcement).

### Receive direction NOT in 2.1

`get_attachment` (downloading attachments → FileRef[]) ships in 2.3, not 2.1. P-O2 governs both directions; 2.1 only exercises the SENDING direction.

---

## 4. Compose / draft implementation

Three new actions + one extended action. All registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (append-only at end of microsoft-outlook section).

### 4.1 `reply_to_email`

V1 source: [`emailActions.ts:10-78`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L10) `replyToOutlookEmail`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `emailId` | string (non-empty) | yes | Graph message id; URL-encoded inside wrapper. |
| `replyAll` | boolean | **REQUIRED (Q11)** | No default — workflow author must choose. Closes V1 R8 (V1 defaults `false`). |
| `body` | string | yes | The reply comment / body. V1 wraps this as `{ comment }`. May be empty (matches V1 + Gmail). |

**Endpoint selection (Q11 explicit):** `replyAll === true` → `POST /me/messages/{id}/replyAll`; `replyAll === false` → `POST /me/messages/{id}/reply`. The endpoint switch is decided inside the wrapper based on the boolean — handler passes the boolean through.

**Output shape:** `{ replied: true, replyAll, originalEmailId }`. Graph's reply endpoints return 202 No Content (same pattern as `me/sendMail`) — no provider message id available.

**Q-contracts applied:**
- Q3 — `refreshAndRetry` wraps the principal `POST /reply` call.
- Q11 — `replyAll` required in the schema. No silent default.

### 4.2 `forward_email`

V1 source: [`emailActions.ts:83-180`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L83) `forwardOutlookEmail`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `emailId` | string (non-empty) | yes | Graph message id. |
| `to` | CSV string OR string[] | yes | Routed through `parseRecipients` (Q7). Closes V1 O-R3 (V1 passes raw CSV → becomes one Graph address). |
| `cc` | CSV string OR string[] | no | Routed through `parseRecipients`. |
| `comment` | string | no | Optional message body inserted before forwarded content. V1 hard-defaults to `""`. **Optional in V2** — when absent, omit from payload entirely (Graph treats missing `comment` identically to empty). No silent insertion. |

**Endpoint:** `POST /me/messages/{id}/forward`. Body shape:
```json
{
  "toRecipients": [{ "emailAddress": { "address": "..." } }],
  "ccRecipients": [{ "emailAddress": { "address": "..." } }],
  "comment": "..."
}
```

**Output shape:** `{ forwarded: true, originalEmailId, to: string[], cc: string[] }`. Echo of parsed recipients for downstream variable refs.

**Q-contracts applied:**
- Q3 — `refreshAndRetry`.
- Q7 — `parseRecipients` on both `to` and `cc`. At-least-one-recipient invariant enforced AFTER parsing (CSV like `"  , , "` parses to `[]` → handler rejects with clear error).

### 4.3 `create_draft_email`

V1 source: [`emailActions.ts:185-245`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L185) `createOutlookDraftEmail`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `to` | CSV string OR string[] | yes (`.min(1)`) | Same shape as `send_email`. |
| `cc` | CSV string OR string[] | no | Same shape as `send_email`. |
| `bcc` | CSV string OR string[] | no | Same shape as `send_email`. |
| `subject` | string | yes (may be empty) | Same shape as `send_email`. |
| `body` | string | yes (may be empty) | Same shape as `send_email`. |
| `isHtml` | boolean | **REQUIRED (Q11)** | Same shape as `send_email`. |
| `importance` | enum `"low" \| "normal" \| "high"` | **REQUIRED (Q11)** | Same shape as `send_email`. Closes V1 R8 (V1 defaults `"normal"`). |

**Endpoint:** `POST /me/messages` (NO `/sendMail` — that's the difference vs send_email). Body:
```json
{
  "subject": "...",
  "body": { "contentType": "Text" | "HTML", "content": "..." },
  "toRecipients": [...],
  "ccRecipients": [...],
  "bccRecipients": [...],
  "importance": "low" | "normal" | "high"
}
```

**Returns:** Graph 201 Created with the full draft message envelope including the new draft's `id` + `webLink`. Unlike `sendMail`, this endpoint returns a full body.

**Output shape:** `{ draftId: string, subject: string, webLink: string \| null, createdAt: string \| null, to: string[], cc: string[], bcc: string[] }`. Downstream workflows commonly chain `create_draft_email` → other actions referencing the draft id (e.g. later `send_email` once approved). The `draftId` field is load-bearing.

**Q-contracts applied:**
- Q3 — `refreshAndRetry`.
- Q7 — `parseRecipients` on `to` / `cc` / `bcc`. At-least-one-`to` invariant matches `send_email`.
- Q11 — `isHtml` + `importance` required.

**Scope:** Requires `Mail.ReadWrite` (P-O1).

### 4.4 `send_email` attachment expansion

V1 source: [`sendEmail.ts:113-308`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/sendEmail.ts#L113) attachment dispatch block (5 source types — file / url / node / uploadedFiles / Google Drive cross-provider). V2 collapses to **one source type: FileRef[]** (uniform across all V2 providers per P-S3 §4).

**Schema extension** at [`integrations/microsoft-outlook/actions/sendEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.schema.ts):

```ts
import { FileRefSchema } from "@/contracts/file";

// Append to .object({ ... }):
attachments: z.array(FileRefSchema).optional(),
```

**Handler extension** at [`integrations/microsoft-outlook/actions/sendEmail.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.ts):

1. After `parseRecipients` returns + before `refreshAndRetry`, if `config.attachments?.length > 0`:
   - For each FileRef, call `fetchFileBytes(ref, { storage })` to retrieve bytes.
   - Validate total payload size ≤ 25 MB AND each attachment ≤ 3 MB; fail with clear error otherwise.
   - Base64-encode bytes; build `{ "@odata.type": "#microsoft.graph.fileAttachment", name, contentType, contentBytes }`.
2. Pass the resulting `graphAttachments[]` into the wrapper as a new field on `message.attachments`.

**Wrapper extension** at [`integrations/microsoft-outlook/api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts):

```ts
export interface SendMailInput {
  // ...existing fields...
  message: {
    // ...existing fields...
    attachments?: Array<{
      "@odata.type": "#microsoft.graph.fileAttachment";
      name: string;
      contentType: string;
      contentBytes: string; // base64
    }>;
  };
}
```

The wrapper passes through; no JSON shape mutation. The handler owns base64 encoding + payload sizing.

**Output shape unchanged.** No attachment bytes in output (CLAUDE.md rule #1).

**Q-contracts applied:**
- Q3 — already wraps `sendMail` call in `refreshAndRetry`.
- Q7 — already routes recipients.
- Q11 — already required `isHtml` + `importance`. `attachments` is optional (its presence is the user's choice).

---

## 5. API wrapper plan

3 new wrapper files + 1 extension.

### 5.1 New: `integrations/microsoft-outlook/api/replyMessage.ts`

Mirrors [`api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) shape (202 No Content; throw `Unauthorized401Error` on 401; `surfaceGraphError` on other 4xx/5xx).

```ts
export interface ReplyMessageInput {
  accessToken: string;
  messageId: string;
  comment: string;
  replyAll: boolean;
}

export async function replyMessage(input: ReplyMessageInput): Promise<void> {
  const path = input.replyAll ? "replyAll" : "reply";
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(input.messageId)}/${path}`;
  // POST with body { comment: input.comment }
  // 202 → return; 401 → Unauthorized401Error; else surfaceGraphError.
}
```

~50 LOC including doc comment.

### 5.2 New: `integrations/microsoft-outlook/api/forwardMessage.ts`

```ts
export interface ForwardMessageInput {
  accessToken: string;
  messageId: string;
  toRecipients: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  comment?: string;
}

export async function forwardMessage(input: ForwardMessageInput): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(input.messageId)}/forward`;
  // POST with body { toRecipients, ccRecipients?, comment? }
  // 202 → return; 401 → Unauthorized401Error; else surfaceGraphError.
}
```

Note: `comment` is optional in the request body — when handler doesn't supply it, the wrapper omits the field entirely (Graph default behavior preserved). ~55 LOC.

### 5.3 New: `integrations/microsoft-outlook/api/createMessage.ts`

```ts
export interface CreateMessageInput {
  accessToken: string;
  message: {
    subject: string;
    body: GraphMessageBody;
    toRecipients: GraphRecipient[];
    ccRecipients?: GraphRecipient[];
    bccRecipients?: GraphRecipient[];
    importance: "low" | "normal" | "high";
  };
}

export interface CreatedDraftMessage {
  id: string;
  subject?: string;
  webLink?: string;
  createdDateTime?: string;
  toRecipients?: GraphRecipientField[];
  // ...rest of Graph message envelope (typed loosely; handler maps to output)
}

export async function createMessage(input: CreateMessageInput): Promise<CreatedDraftMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages`;
  // POST with body { ...input.message }
  // 201 → parse + return; 401 → Unauthorized401Error; else surfaceGraphError.
}
```

Reuses `GraphRecipient` + `GraphMessageBody` types from [`api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) — re-export from sendMail OR move to a small `api/types.ts`. **Decision: re-export from `sendMail.ts`** (single canonical location; matches Slice 6 layout). ~70 LOC.

### 5.4 Extension: `api/sendMail.ts` — add `attachments[]` to `SendMailInput.message`

Add the optional `attachments` field to `SendMailInput.message` (typed strictly — discriminated union or single literal for `@odata.type: "#microsoft.graph.fileAttachment"`). Wrapper code itself doesn't need to change beyond stringifying the new field via the existing `JSON.stringify(body)`. ~10 LOC delta.

---

## 6. Schema + handler plan

3 new actions + 1 extended action.

### 6.1 Actions to create

| File | Lines | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/actions/replyToEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~30 | Zod schema with `emailId` (required, non-empty), `replyAll` (required boolean, Q11), `body` (required string). |
| [`integrations/microsoft-outlook/actions/replyToEmail.ts`](../../../integrations/microsoft-outlook/actions/) | ~75 | Handler: parse → resolve accountId → wrap `replyMessage` in `refreshAndRetry` → return `{ replied: true, replyAll, originalEmailId }`. |
| [`integrations/microsoft-outlook/actions/forwardEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~35 | Schema with `emailId`, `to` (CSV/array, min 1), `cc` (CSV/array, optional), `comment` (string, optional). |
| [`integrations/microsoft-outlook/actions/forwardEmail.ts`](../../../integrations/microsoft-outlook/actions/) | ~95 | Handler: parse → parseRecipients on `to`/`cc` → at-least-one-recipient post-parse → resolve accountId → wrap `forwardMessage` in `refreshAndRetry` → return `{ forwarded: true, originalEmailId, to: string[], cc: string[] }`. |
| [`integrations/microsoft-outlook/actions/createDraftEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~50 | Mirrors `sendEmail.schema.ts` minus `to`'s `.min(1)` on the JSON-array case (drafts can be created without recipients; Graph allows it). **DECISION:** match `sendEmail.schema.ts`'s `.min(1)` requirement on `to` for parity — workflow authors who want to-less drafts are uncommon and the constraint surfaces a clean schema error. Optional-`to` can be added in a follow-up if a user requests. |
| [`integrations/microsoft-outlook/actions/createDraftEmail.ts`](../../../integrations/microsoft-outlook/actions/) | ~110 | Handler: parse → parseRecipients on `to`/`cc`/`bcc` → at-least-one-`to` post-parse → resolve accountId → wrap `createMessage` in `refreshAndRetry` → return `{ draftId, subject, webLink, createdAt, to, cc, bcc }`. |

### 6.2 Action to extend

| File | Lines delta | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/actions/sendEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.schema.ts) | +5 | Add `attachments: z.array(FileRefSchema).optional()`. |
| [`integrations/microsoft-outlook/actions/sendEmail.ts`](../../../integrations/microsoft-outlook/actions/sendEmail.ts) | +60 | If `config.attachments?.length > 0`: validate cap (≤ 25 MB total, ≤ 3 MB each), fetch bytes per FileRef via `fetchFileBytes`, base64-encode, build Graph `fileAttachment[]`, attach to `message.attachments`. |
| [`integrations/microsoft-outlook/api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) | +10 | Add `attachments?: Array<GraphFileAttachment>` to `SendMailInput.message` type. |

### 6.3 Storage adapter for `fetchFileBytes`

`fetchFileBytes` needs a `WorkflowFilesStorageAdapter` for `v2_storage` FileRef kind. Sigma: instantiate the adapter once at handler entry (or via a thin helper) backed by the service-role Supabase client. Pattern follows what `services/files/stageFileToStorage.ts` already does internally — `getServiceRoleClient(...).storage.from(WORKFLOW_FILES_BUCKET).download(...)`. **Decision:** factor a small helper `services/files/createWorkflowFilesStorageAdapter.ts` (~25 LOC, returns `WorkflowFilesStorageAdapter`) so reuse across `send_email` (2.1) and `get_attachment` (2.3) is symmetric. Add to commit 4 alongside the `send_email` extension.

### 6.4 Registry registration

Append to [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) after entry 319:

```ts
{ provider: "microsoft-outlook", type: "reply_to_email", handler: replyToOutlookEmail },
{ provider: "microsoft-outlook", type: "forward_email", handler: forwardOutlookEmail },
{ provider: "microsoft-outlook", type: "create_draft_email", handler: createOutlookDraftEmail },
```

Plus 3 imports at the top of the file. Lands in Commit 3.

`send_email` registry entry stays unchanged in Commit 4 — only the handler implementation and its schema gain attachment support.

---

## 7. Unit test plan

Mirrors Slice 6's coverage shape (one schema test + one handler test per action; wrapper test per wrapper). All 5 commits stay under the 50-files-per-leaf-folder structure rule.

### 7.1 New test files

| File | Approx test count | Notes |
|---|---|---|
| `tests/unit/integrations/microsoft-outlook/actions/replyToEmail.schema.test.ts` | ~12 | `emailId` required + non-empty; `replyAll` Q11 (boolean required — no default; missing rejects); `body` required (may be empty); strict mode rejects unknown fields; type-coercion off; etc. |
| `tests/unit/integrations/microsoft-outlook/actions/replyToEmail.test.ts` | ~14 | Happy path: reply → wrapper called with `replyAll: false`. ReplyAll: wrapper called with `replyAll: true`. Output shape: `{ replied: true, replyAll, originalEmailId }`. Empty `body` accepted. 401 → `refreshAndRetry` triggers refresh + retry. `Unauthorized401Error` propagation. AccountId resolution from trigger event. |
| `tests/unit/integrations/microsoft-outlook/actions/forwardEmail.schema.test.ts` | ~14 | `to` CSV vs array vs empty; `cc` optional; `comment` optional; missing `emailId` rejects; etc. |
| `tests/unit/integrations/microsoft-outlook/actions/forwardEmail.test.ts` | ~16 | Q7: CSV → split; array of CSVs → flattened; empty after parse → handler rejects; recipients echoed in output; `cc` absent → wrapper omits `ccRecipients`; `comment` absent → wrapper omits; 401 retry. |
| `tests/unit/integrations/microsoft-outlook/actions/createDraftEmail.schema.test.ts` | ~14 | Mirror `sendEmail.schema.test.ts`. |
| `tests/unit/integrations/microsoft-outlook/actions/createDraftEmail.test.ts` | ~16 | Q11 importance + isHtml required; Q7 recipients parsing; output includes `draftId` + `webLink` + `createdAt`; wrapper returns full Graph envelope mapped to output shape; 401 retry. |
| `tests/unit/integrations/microsoft-outlook/api/replyMessage.test.ts` | ~10 | Endpoint URL construction (reply vs replyAll); 202 → resolved void; 401 → `Unauthorized401Error`; 400 → generic Error with `surfaceGraphError` message. |
| `tests/unit/integrations/microsoft-outlook/api/forwardMessage.test.ts` | ~10 | Endpoint URL; body shape preserves `toRecipients` / `ccRecipients` / `comment`; absent `cc` / `comment` omitted from body; 202 / 401 / error mapping. |
| `tests/unit/integrations/microsoft-outlook/api/createMessage.test.ts` | ~12 | URL; 201 → parsed envelope returned; 401 / error mapping; nested message body content-type respected. |

### 7.2 Updated test files

| File | Changes |
|---|---|
| `tests/unit/integrations/microsoft-outlook/manifest.test.ts` | Update existing 3-scope assertion to 4-scope including `Mail.ReadWrite`. Add new test asserting `Mail.ReadWrite` is REQUIRED. Keep the "no Calendar scopes" anti-test as-is. |
| `tests/unit/integrations/microsoft-outlook/actions/sendEmail.schema.test.ts` | Add tests for the new `attachments` field: valid FileRef array accepted; non-FileRef array rejected; empty array accepted (treated as no attachments); absent field accepted. |
| `tests/unit/integrations/microsoft-outlook/actions/sendEmail.test.ts` | Add ~8 tests for attachment behavior: 1 attachment → wrapper called with `message.attachments[0]` correctly shaped; 25 MB total cap; 3 MB per-attachment cap; `provider_url` FileRef → handler throws `UnsupportedProviderFetchError`-derived clean error; signed_url FileRef → fetched directly; v2_storage FileRef → fetched via storage adapter. |
| `tests/unit/integrations/microsoft-outlook/api/sendMail.test.ts` | Add tests for the optional `attachments` field passthrough: present → in JSON body; absent → not in JSON body. |
| (potential) `tests/unit/services/files/createWorkflowFilesStorageAdapter.test.ts` | New tiny helper test (~6 tests) if the adapter is factored out. |

Total new + updated: ~140 net-new unit tests across ~11 files. Matches Slice 6's per-action test density (~12-16 per action).

### 7.3 Test patterns to reuse

- **Mock for `refreshAndRetry`**: per Slice 6 tests, mock `getActiveForExecution` + `decryptToken` + `dispatcher.refresh` to drive the 401-retry path.
- **Mock for `fetchFileBytes`**: pass a stub `WorkflowFilesStorageAdapter` for `v2_storage` cases; use `jest.spyOn(global, "fetch")` for `signed_url` cases.
- **Mock for Graph endpoints**: `jest.spyOn(global, "fetch")` returning crafted `Response` objects (existing pattern in `sendMail.test.ts`).

---

## 8. E2E plan

### 8.1 Mock surface extensions

[`tests/e2e/helpers/mockMicrosoftServer.ts`](../../../tests/e2e/helpers/mockMicrosoftServer.ts) (2024 LOC today) needs additions:

1. **POST `/v1.0/me/messages/{id}/reply`** — 202 No Content. Record body.
2. **POST `/v1.0/me/messages/{id}/replyAll`** — 202 No Content. Record body.
3. **POST `/v1.0/me/messages/{id}/forward`** — 202 No Content. Record body.
4. **POST `/v1.0/me/messages`** — 201 Created. Return a synthetic draft envelope with id `draft-${counter}`, `subject` echo, `webLink: "https://outlook.example/draft/${id}"`, `createdDateTime: <iso>`.
5. **Existing `/v1.0/me/sendMail` handler** — extend to capture `message.attachments[]` when present. Per-attachment `name`, `contentType`, `contentBytes.length` (don't store raw base64 — assert it's a non-empty string).
6. **Scopes validator** — confirm authorize handler accepts `Mail.ReadWrite` (likely already permissive; survey-confirmed during implementation).
7. **State accessors** — extend `RecordedSendMail`-style records: `RecordedReply`, `RecordedForward`, `RecordedDraft`. Add `state.calls.reply`, `state.calls.forward`, `state.calls.draft`. Reset on `/__reset`.

Estimated mock delta: ~250 LOC across the existing single file.

### 8.2 E2E spec extensions

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) ships a single Slice-6-shaped walkthrough today. 2.1 extends with **3 new describe blocks** + **1 attachment scenario**:

| Block | What it asserts |
|---|---|
| **`reply_to_email` happy path** | Build a workflow with new_email trigger → reply_to_email. Trigger a mock notification. Assert: 1) sendMail mock state's reply records show the reply was POSTed; 2) reply body is the configured body; 3) endpoint selection (replyAll vs reply) matches Q11 choice; 4) workflow_runs row succeeds. |
| **`forward_email` happy path** | Build workflow with new_email → forward_email. Trigger. Assert: 1) forward call recorded; 2) toRecipients/ccRecipients lists match Q7-parsed CSVs; 3) `comment` field omitted when absent. |
| **`create_draft_email` happy path** | Build workflow with manual trigger (or new_email pass-through) → create_draft_email. Trigger. Assert: 1) draft call recorded with full message body; 2) workflow output captures `draftId` + `webLink`; 3) downstream variable resolution works against `{{create_draft_email.draftId}}`. |
| **`send_email` with attachments** | Workflow: upstream Slack `download_file` → outlook send_email referencing the FileRef. Trigger via dispatched Slack file event. Assert: 1) sendMail body's `message.attachments[0]` has correct `name` + `contentType` + non-empty `contentBytes`; 2) workflow run succeeds; 3) Slack download FileRef was correctly resolved via stageFileToStorage adapter. |

### 8.3 E2E execution

Per the e2e doc patterns:
- Each new describe block uses per-run randomized message IDs / draft IDs to avoid `webhook_event_dedup` collisions (Sheets 2.2/2.3 §2.16 rule + the existing Slice 6 spec's same pattern).
- Run twice for cross-run stability when randomized values are introduced.
- Standard command: `CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1`.

### 8.4 E2E commits

E2E mock + spec extensions ride alongside the implementation commits — not a separate commit. Specifically:
- **Commit 3** adds reply/forward/draft mock surfaces + 3 new describe blocks.
- **Commit 4** extends the sendMail mock to capture attachments + adds the attachment describe block.

This matches the Slice 6 / Slice 7 / Slice 13 (HubSpot) pattern where e2e ships in the same feat commit as the handler.

---

## 9. Commit sequence

Per the accepted batch plan (audit §13):

| # | Commit | Files changed (explicit path staging) | Gates |
|---|---|---|---|
| **1** (this) | `docs(outlook-mail): plan 2.1 compose and drafts` | `docs/slices/parity/outlook-mail-2-1-compose-drafts-plan.md` (new). Doc-only. | Full unit gate suite. |
| **2** | `feat(outlook-mail): expand manifest with Mail.ReadWrite scope` | `integrations/microsoft-outlook/manifest.ts` (mod); `tests/unit/integrations/microsoft-outlook/manifest.test.ts` (mod). Manifest-only — no handler / wrapper changes. | Full unit gates. |
| **3** | `feat(outlook-mail): add reply, forward, and create_draft actions` | New: `integrations/microsoft-outlook/api/{replyMessage,forwardMessage,createMessage}.ts`; `integrations/microsoft-outlook/actions/{replyToEmail,forwardEmail,createDraftEmail}.{ts,schema.ts}`; corresponding `tests/unit/...` files. Mod: `services/execution/handlers/_registry.ts` (3 imports + 3 registry entries appended). E2E mock + spec extension (3 describe blocks). | Full unit gates + e2e walkthrough. |
| **4** | `feat(outlook-mail): add attachments support to send_email` | Mod: `integrations/microsoft-outlook/actions/sendEmail.ts` (+attachment handling); `integrations/microsoft-outlook/actions/sendEmail.schema.ts` (+FileRef[] field); `integrations/microsoft-outlook/api/sendMail.ts` (+attachment field passthrough). Possibly new: `services/files/createWorkflowFilesStorageAdapter.ts` + its test. Mod: `tests/unit/...` for sendEmail. E2E mock + spec extension (1 attachment scenario). | Full unit gates + e2e walkthrough. |

### Per-commit gates (every commit)

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2E gate only for commits 3 + 4 (which change provider behavior):
```bash
CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1
```

Run e2e twice for cross-run stability on commits that introduce per-run randomization.

### Explicit-path staging

Every commit uses `git add <specific files>` — **never `git add .`**. Pre-existing dirty files left untouched:
- Mailchimp WIP under `integrations/mailchimp/`, `integrations/_shared/mailchimp/`, `services/execution/handlers/_registry.ts` (the Mailchimp lines), `tests/unit/integrations/mailchimp/`.
- `docs/rules/database-security.md`.
- `PACKAGES.md`.

If a 2.1 commit happens to touch the same file Mailchimp WIP modified (e.g. `_registry.ts` for entry insertion), the diff MUST be inspected to ensure only the Outlook-specific lines change. Cancel + re-stage manually if Mailchimp lines drift in.

### Not pushed

Every commit lands locally on `v2-provider-port-local`. Marcus reviews + pushes once all 4 commits land.

---

## 10. Acceptance gates (per implementation commit)

Each commit individually:
- ✅ `npx tsc --noEmit` green.
- ✅ `npm run lint` green (pre-existing `_registry.ts` lines-warning is the only allowed remnant).
- ✅ `npm run lint:structure` green.
- ✅ `npm run lint:migrations` green.
- ✅ `npm test` — full suite passes (commit 3 adds ~70 new unit tests; commit 4 adds ~30 new unit tests; running total target ≥ 6700).
- ✅ E2E (commits 3 + 4 only) — slice-6 walkthrough green twice.

---

## 11. Risk callouts for 2.1

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-OM21-1** — `Mail.ReadWrite` scope addition causes Microsoft to require interactive re-consent for existing connected accounts. Old tokens (with `Mail.Read` only) still work for Mail.Read / Mail.Send operations but fail 403 for any Mail.ReadWrite endpoint. | High | Low | Expected behavior. Proactive-health system surfaces "reconnect required" — no special code. `create_draft_email` is the first 2.1 action to hit this; users who reconnect once cover everything in 2.1 + 2.2. |
| **R-OM21-2** — Q11 `replyAll` decision causes confusion for V1 users migrating workflows. V1 had no `replyAll` config; defaulted to non-reply-all. Workflow authors expect to keep the same behavior without reading docs. | Low | Low | The accepted Q11 contract is explicit: NO silent default. Existing-V1-workflow migrations (Phase 3 / 4) need to set `replyAll: false` explicitly to match V1 behavior. Migration tooling lives elsewhere. |
| **R-OM21-3** — FileRef → base64 encoding for the attachment payload requires materializing bytes in memory. A 25 MB total cap means worst-case ~33 MB base64 string + Graph JSON envelope. For Node.js this is fine; for serverless cold-start memory budgets it's a watchable footprint. | Medium | Low | Documented hard cap (25 MB total, 3 MB each). Anything beyond is a future Phase 7 upload-session ticket. Memory footprint per workflow execution is bounded and predictable. |

---

## 12. Exit checklist

Outlook Mail 2.1 is complete when:

- [ ] Commit 2 lands — manifest is `Mail.ReadWrite`-widened; tests pass.
- [ ] Commit 3 lands — `reply_to_email`, `forward_email`, `create_draft_email` registered; all unit + e2e tests pass.
- [ ] Commit 4 lands — `send_email` attachments work end-to-end with FileRef[] input; size caps enforced; tests pass.
- [ ] Running total: 4 commits on `v2-provider-port-local`, all green.
- [ ] No regression in pre-existing Outlook tests (Slice 6 baseline).
- [ ] `send_email` output shape unchanged (no bytes / base64 / Buffer in output).
- [ ] CLAUDE.md gains an "Outlook Mail 2.1" entry under the parity-changelog list.
- [ ] Outcomes captured in `docs/slices/parity/outlook-mail-2-1-outcomes.md` once 2.2 starts (or after 2.3 closes — Marcus's call).
- [ ] Marcus reviews and acknowledges 2.1 complete.

---

## 13. What's next after 2.1

After 2.1's 4 commits land:

1. **Outlook Mail 2.2 — Lifecycle & Search** opens (audit §13). Ships `move_email`, `delete_email` (D-OM2 enum), `add_categories`, `fetch_emails` (D-OM1 V1-shape).
2. **Outlook Mail 2.3 — Triggers & Attachments** follows. Ships `email_sent`, `email_flagged` (D-OM4 over-fire), `new_email` filters (D-OM3), `get_attachment` (P-O2 fileAttachment-only).
3. **Outcomes doc** for the full Outlook Mail parity arc.
4. **Audit ledger** updated — `parity-outlook-mail.md`'s §14 exit checklist boxes checked.

**Mailchimp remains active in another chat — do not touch.**
