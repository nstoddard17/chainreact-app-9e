# Outlook Mail 2.1 — Parity outcomes

**Status:** Shipped locally on `v2-provider-port-local`. **Retro.**
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md). Priority rank §3: **12**.
**Accepted audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`.
**Plan:** [`docs/slices/parity/outlook-mail-2-1-compose-drafts-plan.md`](outlook-mail-2-1-compose-drafts-plan.md) — commit `5fe0b066c`.
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 surface:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 baseline + Outlook Mail 2.1).

Outlook Mail 2.1 closes the first slice of the accepted parity arc: the **Compose & Drafts** batch. The slice landed in 4 commits (plan + manifest expansion + 3-action feat + send_email attachments). **Zero new platform-tier migrations, zero new providers, zero new mock-server provider state maps, one new generic service helper** (`createWorkflowFilesStorageAdapter` — reusable across Outlook 2.3 `get_attachment` + future Gmail / Drive / OneDrive attachment-consumer chains).

The qualitative shift continues V2's Outlook Mail stance established in Slice 6: V1's per-Microsoft-surface monolithic `MicrosoftGraphTriggerLifecycle` (838 LOC handling Outlook mail + calendar + contacts + Teams + OneDrive + Excel through one dispatch class) stays NOT PORTED; V2's per-trigger directory under `integrations/microsoft-outlook/triggers/newEmail/` absorbs net-new event-types via the same activate / deactivate / renew / normalize shape (this slice didn't ship new triggers — 2.3 will). V1's 741-LOC `emailActions.ts` monolith holding 8 mail handlers + the dead `searchOutlookEmail` export stays NOT PORTED; V2's per-action-split with sibling `.schema.ts` files absorbs the 3 net-new compose/draft handlers cleanly. V1's 9-scope Microsoft mega-list (mail + calendar + contacts + Files + User.Read all granted at first connection) stays NOT PORTED; V2's manifest widened additively from 3 → 4 mail-only scopes via P-O1 with no migration script.

The accepted **P-O2 SKIP** decisions stick: `itemAttachment` + `referenceAttachment` Graph subtypes are NOT supported in this slice's send-side direction (only `fileAttachment` ports), and the receive-side `get_attachment` slice (Outlook 2.3) will inherit the same SKIP boundary. The accepted **D-OM1..D-OM4** decisions stay deferred to 2.2 / 2.3 — see §9.

---

## 1. Commit chain

| # | Hash | Subject |
|---|---|---|
| 1 | `5fe0b066c` | `docs(outlook-mail): plan 2.1 compose and drafts` |
| 2 | `d641cdd5b` | `feat(outlook-mail): expand manifest with Mail.ReadWrite scope` |
| 3 | `dec91d3e3` | `feat(outlook-mail): add reply, forward, and create_draft actions` |
| 4 | `a460dc452` | `feat(outlook-mail): add attachments support to send_email` |
| 5 | (this) | `docs(outlook-mail): document 2.1 outcomes` |

All commits local on `v2-provider-port-local`. Not pushed.

---

## 2. Scope shipped

### Manifest scope expansion (Commit 2)

`integrations/microsoft-outlook/manifest.ts` — required scopes widened from 3 → 4:
- Pre-2.1: `["offline_access", "Mail.Send", "Mail.Read"]`
- 2.1: `["offline_access", "Mail.Send", "Mail.Read", "Mail.ReadWrite"]`

`Mail.ReadWrite` is a SUPERSET of `Mail.Read`; both declared so an IT-restricted Azure AD tenant that grants only the narrower scope can still run `send_email` + `new_email` without breaking. Calendar / Files / Teams / Contacts scopes remain explicitly excluded — Slice 6's "narrow mail-only" stance is preserved.

### Actions (3 net-new + 1 extended)

| Action | Endpoint | Wrapper module |
|---|---|---|
| `reply_to_email` | `POST /me/messages/{id}/{reply|replyAll}` | [`integrations/microsoft-outlook/api/replyMessage.ts`](../../../integrations/microsoft-outlook/api/replyMessage.ts) (new — endpoint switch in the wrapper) |
| `forward_email` | `POST /me/messages/{id}/forward` | [`integrations/microsoft-outlook/api/forwardMessage.ts`](../../../integrations/microsoft-outlook/api/forwardMessage.ts) (new) |
| `create_draft_email` | `POST /me/messages` | [`integrations/microsoft-outlook/api/createMessage.ts`](../../../integrations/microsoft-outlook/api/createMessage.ts) (new) |
| `send_email` (extended) | `POST /me/sendMail` (existing) — attachments field added | [`integrations/microsoft-outlook/api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts) (extended — new `GraphFileAttachment` interface + `message.attachments?` field) |

Registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts).
**V2 Outlook Mail action total after 2.1: 4** (1 Slice 6 + 3 Outlook Mail 2.1; `send_email` extended in-place).

### Trigger surface (unchanged)

**V2 Outlook Mail trigger total: 1** (`new_email` — Slice 6 baseline). Triggers ship in 2.3.

### API wrappers + helpers

- **3 new wrapper modules** under `integrations/microsoft-outlook/api/` (replyMessage / forwardMessage / createMessage). Each ~50–80 LOC, mirrors Slice 6 `sendMail` shape: `Unauthorized401Error` on 401, `surfaceGraphError` on other non-2xx, URL-encoded message ids, conditional-spread for optional body fields.
- **1 wrapper extension** — `sendMail.ts` gains `GraphFileAttachment` type + optional `message.attachments?: GraphFileAttachment[]` field. No code behavior change when `attachments` absent (JSON.stringify drops undefined).
- **1 new generic service helper** — [`services/files/createWorkflowFilesStorageAdapter.ts`](../../../services/files/createWorkflowFilesStorageAdapter.ts) (~55 LOC). Factory returning a `WorkflowFilesStorageAdapter` (narrow `download(storagePath)` contract from `core/files/fetchFileBytes.ts`) backed by the service-role Supabase client. Sanitized error messages — never echoes the storage path or any bucket URL.

### Tests

| Suite | Net-new tests |
|---|---|
| `tests/unit/integrations/microsoft-outlook/manifest.test.ts` | +1 (Mail.ReadWrite required) + 1 modified (4-scope assert); registry-contains assert extended to 4 actions |
| `tests/unit/integrations/microsoft-outlook/actions/replyToEmail.{schema,}.test.ts` | 9 schema + 9 handler |
| `tests/unit/integrations/microsoft-outlook/actions/forwardEmail.{schema,}.test.ts` | 12 schema + 13 handler |
| `tests/unit/integrations/microsoft-outlook/actions/createDraftEmail.{schema,}.test.ts` | 15 schema + 11 handler |
| `tests/unit/integrations/microsoft-outlook/actions/sendEmail.{schema,}.test.ts` | 9 schema (attachments cases) + 9 handler (attachments cases) |
| `tests/unit/integrations/microsoft-outlook/api/{replyMessage,forwardMessage,createMessage,sendMail}.test.ts` | 10 + 11 + 9 wrapper tests + 3 sendMail extensions |
| `tests/unit/services/files/createWorkflowFilesStorageAdapter.test.ts` | 5 (new helper) |

**Outlook unit-test total after 2.1: ~210 tests across ~24 suites** (Slice 6 baseline + 2.1 additions).

### E2E

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) extended with:
- 4 new test() blocks in the existing describe — 2 reply scenarios (replyAll false / true), 1 forward, 1 create_draft.
- 1 new test() block for send_email + attachments.
- Pre-existing scope assertion updated from 3-scope to 4-scope after P-O1 landing (caught at e2e — see §10).

**Slice 6 walkthrough total after 2.1: 6 tests** (1 baseline + 4 compose/draft + 1 attachment). Run with `--workers=1`; ran twice consecutively for cross-run stability on the last commit.

Mock surface added:
- `POST /v1.0/me/messages/{id}/reply` + `/replyAll` (record body, 202 No Content)
- `POST /v1.0/me/messages/{id}/forward` (record body, 202 No Content)
- `POST /v1.0/me/messages` (record body, 201 Created with synthetic `mock-draft-N` envelope including `webLink` + `createdDateTime`)
- `GET /__file/{name}` (synthetic deterministic-bytes endpoint for the attachment scenario — serves `mock-outlook-attachment:<name>:` × 8 UTF-8 bytes)

3 new `RecordedReplyMessage` / `RecordedForwardMessage` / `RecordedCreateDraft` types added to `MockMicrosoftHandle.calls`. `draftMessageCounter` added to `MutableState` for synthetic draft id generation.

---

## 3. Durable decisions worth preserving

### 3.1 P-O1 — Mail.ReadWrite scope expansion (no migration script)

`Mail.ReadWrite` was added as a REQUIRED scope (not optional). Existing connected accounts on the original Slice 6 3-scope set need to re-grant consent the first time they hit a `Mail.ReadWrite` endpoint (`create_draft_email` in 2.1; `move_email` / `delete_email` / `add_categories` in 2.2). The proactive-health system surfaces this automatically: Graph 403 → `action_required` → reconnect UX runs the standard OAuth flow → new scopes granted. **No special re-auth-prompt code, no migration script, no data backfill.** Matches the Gmail-parity-accepted P-G1 pattern exactly.

The manifest is the single source of truth (honest-state convention from Slice 6 §"Scopes"). The authorize-scope assertion in the e2e (`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`) pins the 4-scope set; any drift from this set fails the walkthrough.

### 3.2 Compose/draft schema rules — Q11 enforced at parse time

Every new handler ships with `.strict()` Zod schema. Q11 explicit-required choices:
- `reply_to_email.replyAll`: REQUIRED boolean. No default. V1 silently defaulted to `false` — workflow author MUST choose explicitly. Endpoint switches on this (`/reply` vs `/replyAll`).
- `create_draft_email.isHtml`: REQUIRED boolean. Mirrors `send_email` policy.
- `create_draft_email.importance`: REQUIRED enum (`"low" | "normal" | "high"`). Mirrors `send_email` policy. V1 silently defaulted to `"normal"`.

Workflow authors that paste V1-shape config get an immediate Zod error at builder time, not at runtime.

### 3.3 Q7 multi-recipient parsing on forward + draft (closes V1 O-R3)

`forward_email.to` / `forward_email.cc` / `create_draft_email.to` / `.cc` / `.bcc` all route through `core/integrations/parseRecipients.ts`. CSV strings split, arrays flatten, empties drop. **At-least-one parsed `to` recipient is enforced AFTER parsing** in both handlers — the schema's `.min(1)` catches "no value at all" but not whitespace-only CSVs like `"   ,   "`, so the post-parse check fires a clean handler error (`forward_email: at least one address in \`to\` is required (after parsing CSV / array).`).

This closes the V1 O-R3 finding from the parity audit: V1's `forwardOutlookEmail` passed CSV strings verbatim to Graph as `toRecipients`, which Graph treated as ONE address.

### 3.4 Bounded output projection — no raw provider response spread

Every new handler returns only a load-bearing typed subset:
- `reply_to_email`: `{ replied: true, replyAll, originalEmailId }`. Graph 202 No Content; nothing to project beyond the boolean choice and the original message id.
- `forward_email`: `{ forwarded: true, originalEmailId, to: string[], cc: string[] }`. Echoes parsed recipient lists for downstream iteration (e.g. confirmation summary).
- `create_draft_email`: `{ draftId, subject, webLink: string | null, createdAt: string | null, to, cc, bcc }`. `draftId` is the load-bearing field — downstream actions chain to send / patch the draft via `{{nodeId.draftId}}`.

Handler tests explicitly assert NO extra keys leak even when the wrapper returns a richer envelope (e.g. `create_draft_email` test passes `sensitivity` / `bodyPreview` / `changeKey` from the mock — handler ignores them).

### 3.5 `forward_email` cc / comment — conditionally spread, never `undefined`

V1's `forwardOutlookEmail` hard-defaulted `comment` to `""` and always passed `cc` (even when empty) as Graph `ccRecipients: []`. V2 conditionally spreads both into the wrapper-call object:
- `cc`: spread only when parsed list is non-empty (`...(ccAddresses.length > 0 && { ccRecipients: toGraph(ccAddresses) })`).
- `comment`: spread only when supplied (`...(config.comment !== undefined && { comment: config.comment })`). Empty string IS accepted and forwarded — only absence is omitted.

The wrapper itself further drops `null` / `undefined` from the JSON body. Observable shape at the handler-to-wrapper boundary is clean (`"ccRecipients" in callArg === false` when absent).

### 3.6 `send_email` attachments — FileRef[] only, no inline bytes

`send_email` now accepts optional `attachments: FileRef[]` (the `FileRefSchema` from `contracts/file.ts`). The schema's strict-arms REJECT any inline-bytes shape (`content` / `bytes` / `base64` / `data`) at parse time — the schema layer guarantees no raw bytes reach the handler.

Per-kind behavior:
- **`signed_url`**: handler calls `fetchFileBytes(ref, { storage: undefined })`. The P-S3 helper makes a direct `fetch(url)` (no auth header). Storage adapter NOT constructed.
- **`v2_storage`**: handler lazily constructs the workflow-files storage adapter via the new `createWorkflowFilesStorageAdapter` helper, threads it into `fetchFileBytes(ref, { storage })`. Adapter creation is lazy — handler only constructs it when at least one FileRef has `kind === "v2_storage"`. All-`signed_url` payloads never touch the service-role client.
- **`provider_url`**: handler short-circuits BEFORE any byte fetch — throws `UnsupportedProviderFetchError(provider)` from `core/files/fetchFileBytes`. No Graph call, no token decrypt, no storage adapter constructed. P-S3 plan §10 #1 message verbatim (`'provider_url' for provider 'X' is not supported yet. Stage the bytes through services/files/stageFileToStorage or use a 'signed_url' ref.`).

### 3.7 `send_email` attachment size caps — hard, no upload-session flow

Handler enforces:
- `MAX_ATTACHMENT_SIZE_BYTES = 3 * 1024 * 1024` (3 MB per attachment)
- `MAX_TOTAL_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024` (25 MB total across all attachments)

Checked AFTER byte fetch but BEFORE base64 encoding + the wrapper call — so failures don't burn a Graph 401-retry cycle. Error messages cite the attachment name + observed byte count for the per-attachment failure; total-cap error reports total bytes.

Graph supports a larger-attachment upload-session flow (`POST /me/messages/{id}/attachments/createUploadSession`) for files above 3 MB; that is **deferred** per accepted P-O2 — Outlook Mail 2.1 fails loud rather than implementing the multi-step protocol.

### 3.8 P-O2 — `fileAttachment` only; `itemAttachment` + `referenceAttachment` SKIP

Graph attachments come in three subtypes (`@odata.type`): `fileAttachment` (bytes + contentType), `itemAttachment` (embedded message / event — no contentBytes; has `item: {@odata.type, ...}` instead), `referenceAttachment` (link to OneDrive / SharePoint file — has `sourceUrl`).

Outlook Mail 2.1 ports **only `fileAttachment`** for the SEND direction. The send-side handler constructs `{@odata.type: "#microsoft.graph.fileAttachment", name, contentType, contentBytes}` envelopes from FileRef[] inputs.

`itemAttachment` + `referenceAttachment` are SKIPped because:
- `itemAttachment` has no clean FileRef shape (the FileRef contract has 3 kinds: workflow-file, signed-url, raw-bytes — none model nested-protocol payloads).
- `referenceAttachment` resolution requires a separate provider call (OneDrive / SharePoint).

The receive-side `get_attachment` action (Outlook Mail 2.3) will inherit the same SKIP boundary — only `fileAttachment` subtype materializes to bytes; the other two return metadata-only with a `skipped: true` flag (per the plan).

### 3.9 `send_email` output shape — UNCHANGED across 2.1

CLAUDE.md rule #1 (no bytes / base64 / Buffer / stream content in action outputs) preserved end-to-end. `send_email` output is the exact same 7-field shape before and after attachments support landed:

```
{
  sent: true,
  to: string[],
  cc: string[],
  bcc: string[],
  subject: string,
  isHtml: boolean,
  importance: "low" | "normal" | "high"
}
```

**No `attachments` key, no `contentBytes`, no `base64`, no `bytes`, no FileRef echoed.** Workflow authors that want attachment metadata downstream reference the upstream FileRef-producing node, NOT `send_email`'s output. Handler unit test pins this with explicit `"attachments" in output === false` / `"contentBytes" in output === false` / etc. assertions; e2e test reads `workflow_runs.steps[i].output` directly and asserts the same — proves no byte leakage through the engine's step-output persistence layer either.

### 3.10 Storage adapter is the reusable FileRef-consumer primitive

`services/files/createWorkflowFilesStorageAdapter.ts` is the first generic FileRef-CONSUMER helper. Slack 2.4 `download_file` is a FileRef PRODUCER (calls `stageFileToStorage` directly with the service-role client inside the service). The new adapter exposes the symmetric consumer shape — narrow `download(storagePath): Promise<Uint8Array>` matching `WorkflowFilesStorageAdapter` from `core/files/fetchFileBytes.ts`.

The same helper will be reused by:
- Outlook Mail 2.3 `get_attachment` (file-download direction; receive-side P-O2 carry-through).
- Future Gmail / Drive / OneDrive attachment-consumer chains.

Audit reason logging follows the `<provider>:<action> run=<runId> node=<nodeId>` shape — consistent with the `getServiceRoleClient` audit convention.

### 3.11 `searchOutlookEmail` orphan — NOT ported (audit §7 SKIP confirmed)

V1's `lib/workflows/actions/microsoft-outlook/index.ts` exports `searchOutlookEmail`, and `lib/ai/workflowAI.ts:216` references `microsoft-outlook_action_search_email`, but the handler is NOT registered in V1's `registry.ts` and NOT declared as a manifest node type. If V1's planner ever recommended this action, runtime would fail with "no handler for microsoft-outlook_action_search_email."

V2 confirms the audit's accepted SKIP — Outlook Mail 2.1 does not register a `search_email` handler. The manifest registry test pins the SKIP: `expect(registered.map(r => r.type).sort()).toEqual(["create_draft_email", "forward_email", "reply_to_email", "send_email"])`. Future provider work cannot accidentally register `search_email` without that test failing.

If `fetch_emails` ships in 2.2 per D-OM1 SHIP-V1-SHAPE, the search use-case is covered through its `query?` field; `searchOutlookEmail` remains permanently un-ported.

---

## 4. V1 rot — closed / not ported / deferred

| V1 finding | 2.1 disposition |
|---|---|
| **R1** — `emailActions.ts` 741 LOC monolith holding 8 handlers + 1 orphan | **CLOSED** — V2 ships per-action split (one file per action + sibling `.schema.ts`) under `integrations/microsoft-outlook/actions/`. |
| **R1** — `MicrosoftGraphTriggerLifecycle.ts` 838 LOC handling 6 Microsoft surfaces in one class | **CLOSED (Slice 6)** — V2 ships per-provider per-trigger lifecycle under `integrations/microsoft-outlook/triggers/newEmail/`. No new triggers in 2.1; carry-forward unchanged. |
| **R3** — 9-scope Microsoft mega-list at OAuth-time (bundles calendar + contacts + Files) | **CLOSED (Slice 6 + P-O1)** — manifest collapsed to 4 mail-only scopes (3 Slice 6 + `Mail.ReadWrite` widening in 2.1 Commit 2). Calendar / Files / Teams / Contacts excluded. |
| **R8 / Q11** — V1 `replyToOutlookEmail` defaults `replyAll = false`; `createOutlookDraftEmail` defaults `importance = "normal"` | **CLOSED** — Q11 schema-required at parse time on every new handler. Empty/missing rejects before any wrapper call. |
| **O-R3** — V1 `forwardOutlookEmail` passes CSV recipients verbatim; Graph treats whole CSV as one address | **CLOSED** — `forward_email` routes `to` + `cc` through `parseRecipients` (Q7). Handler test + e2e assert each CSV recipient becomes its own Graph address. |
| **O-R4** — V1 `forwardOutlookEmail.comment` hard-defaults to `""` | **CLOSED** — V2 omits `comment` from Graph body entirely when absent. Empty string still forwarded when explicitly supplied. |
| V1 `sendEmail` attachments from 5 source types (file / url / node / uploadedFiles legacy / Google Drive cross-provider) | **REPLACED** — V2 collapses to one shape: FileRef[] via `contracts/file.ts`. Producers (Slack `download_file`, future Drive / OneDrive `download_file`, future Outlook `get_attachment`) emit FileRefs; `send_email` consumes them uniformly. V1's per-source-type branching is permanently retired. |
| V1 `searchOutlookEmail` orphan (exported, never registered) | **NOT PORTED** — registry test pins the SKIP. Re-revisit only if `fetch_emails` shape can't cover the search use-case. |
| V1 `MicrosoftGraphSubscriptionManager` empty-accessToken-on-renewal bug (`subscriptionManager.ts:303`) | **CLOSED (Slice 6 renew.ts)** — token fetch wrapped in `refreshAndRetry`. Carry-forward unchanged in 2.1. |
| V1 inline `getDecryptedAccessToken` + `refreshMicrosoftToken` per handler (8 copies in `emailActions.ts`) | **CLOSED** — every new handler wraps the principal call in `services/oauth/refreshAndRetry.ts`. Token fetch is central. |
| Mail.Send-only OAuth restriction blocking drafts / lifecycle | **CLOSED** — P-O1 widening allows the broader endpoint set in 2.1 (`create_draft_email`) + 2.2 (`move_email` / `delete_email` / `add_categories`). |
| `itemAttachment` + `referenceAttachment` Graph subtypes | **SKIP (P-O2)** — per accepted audit decision. Not ported in 2.1 send-side; will not port in 2.3 receive-side either. |
| Upload-session flow for large attachments (>3 MB single or >25 MB total) | **DEFERRED** — handler fails loud rather than implementing the multi-step protocol. Re-revisit if a workflow needs it; would be its own slice. |
| V1's per-trigger filter logic at notification-receive time (sender / subject / hasAttachment / importance / folder) | **DEFERRED to 2.3** — D-OM3 accepted; Slice 6 baseline ships zero filter config; 2.3 ports all 5 V1 filters. |
| V1's `email_sent` + `email_flagged` triggers | **DEFERRED to 2.3** — both ports planned with `email_flagged` accepting V1-parity over-fire per D-OM4. |
| V1's `move_email` / `delete_email` / `add_categories` / `fetch_emails` actions | **DEFERRED to 2.2** — D-OM1 (V1-shape fetch_emails) + D-OM2 (deleteMode enum) decisions locked. |
| V1's `get_attachment` action | **DEFERRED to 2.3** — depends on P-O2 receive-side carry-through. |

Q4 session-side-effect idempotency is NOT threaded at the handler layer in 2.1 — deferred at the V2 engine level pending a broader slice (matches Slice 6, Slice 13, Sheets 2.1/2.2/2.3, Stripe 2.1, Airtable 2.1, Shopify 2.1, HubSpot 2.1, Mailchimp 2.1).

---

## 5. Reused unchanged from Slice 6

- **Shared Microsoft OAuth** via [`integrations/_shared/microsoft/oauth.ts`](../../../integrations/_shared/microsoft/oauth.ts) — PKCE S256, multi-tenant `/common/` endpoints, refresh-token rotation/preserve-old.
- **`new_email` subscription-watch trigger** + per-trigger `activate` / `deactivate` / `renew` / `normalize` directory shape.
- **Webhook receive route** at `app/api/webhooks/microsoft-outlook/route.ts` with validation-token handshake + `clientState` verification.
- **Microsoft Graph base + error helpers** at `integrations/_shared/microsoft/api/{_base.ts,errors.ts,me.ts,subscriptions.ts}`.
- **`refreshAndRetry` 401-retry contract** at `services/oauth/refreshAndRetry.ts`.
- **`parseRecipients` Q7 helper** at `core/integrations/parseRecipients.ts`.
- **P-S3 contract** (`contracts/file.ts` `FileRefSchema` + `core/files/fetchFileBytes.ts` + `services/files/stageFileToStorage.ts`) — Outlook Mail 2.1 is the second V2 P-S3 CONSUMER after Slack 2.4 was the producer pioneer. Outlook is the first send-side P-S3 consumer.

---

## 6. E2E validation

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) — 6/6 tests passing, twice consecutively, with `--workers=1`:

| # | Scenario | Load-bearing assertion |
|---|---|---|
| 1 | (Slice 6 baseline) `new_email → send_email` walkthrough | OAuth + subscription + notification + dedup; preserved unchanged through 2.1 (post-Commit-2 e2e scope assertion fix accommodates the 4-scope manifest) |
| 2 | `new_email → reply_to_email` with `replyAll: false` | Mock recorded hit on `/reply`, body `{ comment: "..." }`, dedup row written |
| 3 | `new_email → reply_to_email` with `replyAll: true` | Mock recorded hit on `/replyAll` (Q11 endpoint selection load-bearing) |
| 4 | `new_email → forward_email` with CSV `to` | Mock recorded `toRecipients[]` has TWO Graph recipients (closes V1 O-R3 end-to-end); `cc` parsed; `comment` passed through |
| 5 | `new_email → create_draft_email` | POST `/me/messages` body asserts subject + HTML body + `importance: "high"` + parsed recipients; `bccRecipients` absent in body when not configured; `mock-draft-1` returned as draft id |
| 6 | `new_email → send_email` with signed_url FileRef attachment | Mock `/sendMail` body's `message.attachments[0]` has `@odata.type: "#microsoft.graph.fileAttachment"` + non-empty `contentBytes`; base64 round-trip verified against synthetic bytes; `workflow_runs.steps[action].output` exactly equals the pre-2.1 7-field shape (no `attachments` / `contentBytes` / `base64` / `bytes` keys) |

Pre-existing scope-assertion drift caught after Commit 2: the Slice 6 baseline test asserted the OAuth authorize scope as the 3-scope string. Updated in Commit 3 to assert the 4-scope string including `Mail.ReadWrite`. Unit tests caught the manifest expansion via `manifest.test.ts`; the e2e-only scope-string assertion was unique and would have flagged the manifest widening when the next pre-merge e2e run executed. Fixed proactively as part of the Commit 3 e2e extension.

---

## 7. Final Outlook Mail 2.1 surface (counts)

| Surface | Count |
|---|---|
| V2 Outlook Mail actions | **4** (1 Slice 6 + 3 Outlook Mail 2.1; `send_email` extended in-place for attachments) |
| V2 Outlook Mail triggers | **1** (`new_email` — Slice 6 baseline) |
| V2 Outlook Mail required scopes | **4** (`offline_access`, `Mail.Send`, `Mail.Read`, `Mail.ReadWrite`) |
| V2 Outlook Mail webhook subscriptions per trigger | 1 (`/me/messages`, changeType `created`, 70.5h expiration, 1h renewal threshold) |
| Outlook Mail unit-test suites | ~24 |
| Outlook Mail unit tests | ~210 |
| Outlook Mail e2e tests | 6 |

---

## 8. Final commit chain (recap)

```
5fe0b066c — docs(outlook-mail): plan 2.1 compose and drafts
d641cdd5b — feat(outlook-mail): expand manifest with Mail.ReadWrite scope
dec91d3e3 — feat(outlook-mail): add reply, forward, and create_draft actions
a460dc452 — feat(outlook-mail): add attachments support to send_email
(this)   — docs(outlook-mail): document 2.1 outcomes
```

5 commits total. Branch `v2-provider-port-local`. Local-only. Not pushed.

---

## 9. Deferred — Outlook Mail 2.2 / 2.3 + on-demand items

### Outlook Mail 2.2 — Lifecycle & Search (plan + 3 implementation commits)

| Item | Locked decision |
|---|---|
| `move_email` | PORT (Mail.ReadWrite — available now) |
| `delete_email` | PORT with `deleteMode: "trash" \| "permanent"` enum REQUIRED, no default (D-OM2 accepted) |
| `add_categories` | PORT (Mail.ReadWrite) — CSV-string-or-array parsing via shared helper |
| `fetch_emails` | PORT V1-shape (D-OM1 accepted) — `folderId?` + `query?` + `startDate?` + `endDate?` + `maxResults?`. Single-page response; workflow author paginates via cursor. |

### Outlook Mail 2.3 — Triggers & Attachments (plan + 3 implementation commits)

| Item | Locked decision |
|---|---|
| `email_sent` trigger | PORT — clone Slice 6 lifecycle with `resource: "/me/mailFolders/SentItems/messages"` |
| `email_flagged` trigger | PORT — V1-parity over-fire (D-OM4 accepted; no prior-state cache) |
| `new_email` filter expansion | PORT all 5 V1 filters (D-OM3 accepted): folder via subscription resource, the rest at notification-receive time. V1 defaults preserved (`subjectExactMatch: true`, `hasAttachment` enum-of-3, `importance` enum-of-4) |
| `get_attachment` | PORT after P-O2 carry-through — `fileAttachment` only; returns `FileRef[]` via the reusable `createWorkflowFilesStorageAdapter` helper. `itemAttachment` + `referenceAttachment` log-and-continue with `skipped: true` flag. |

### On-demand / open follow-ups

- **Upload-session flow** for attachments > 3 MB / > 25 MB. Currently fails loud. Open if a workflow needs to send large files.
- **`itemAttachment` / `referenceAttachment` body materialization** in send-side AND receive-side. Currently SKIP. Open if a workflow needs to forward an embedded message or download a OneDrive-linked attachment.
- **`email_flagged` prior-state cache** (D-OM4 fallback option b). Currently over-fires on every flagged-message update. Re-revisit if users report noise.
- **Cross-provider `search_emails` unification** with Gmail's accepted search shape. Currently deferred — Outlook ships V1-shape `fetch_emails` in 2.2; Gmail ships `searchEmails` in its parity arc. Unification is a Phase 5 / 7 candidate.
- **`searchOutlookEmail` orphan port** — would only revive if `fetch_emails` shape can't cover the search use-case AND a workflow needs a dedicated search action.

---

## 10. What's next

After this outcomes commit lands:
1. **Outlook Mail 2.2 plan opens.** Per the audit's batch plan (§13): 1 plan commit + 3 feat commits + 1 outcomes commit. D-OM1 and D-OM2 are pre-decided; the plan captures `move_email` / `delete_email` (Q11 deleteMode) / `add_categories` / `fetch_emails` shapes and identifies any net-new wrappers.
2. **CLAUDE.md gains an Outlook Mail 2.1 entry** alongside Slack / Gmail / Notion / Sheets / Excel / Airtable / Stripe / Shopify / HubSpot / Mailchimp entries. Captures durable rules from §3 above.
3. **No remote push.** All Outlook Mail 2.1 work stays local until Marcus pushes.
