# Outlook Mail 2.2 — Lifecycle & Search plan

**Status:** Plan. **Doc-only commit (Commit 1 of 4).**
**Slice:** Outlook Mail 2.2 — Lifecycle & Search.
**Parent audit:** [`docs/slices/parity/parity-outlook-mail.md`](parity-outlook-mail.md) — commit `c4c779973`, accepted 2026-05-15.
**Prior slice:** [`outlook-mail-2-1-compose-drafts-plan.md`](outlook-mail-2-1-compose-drafts-plan.md) (plan) + [`outlook-mail-2-1-outcomes.md`](outlook-mail-2-1-outcomes.md) (outcomes).
**Branch:** `v2-provider-port-local` (local-only).
**V1 source:** `c:\Users\marcu\source\repos\nstoddard17\chainreact-app-9e`.
**V2 baseline:** [`integrations/microsoft-outlook/`](../../../integrations/microsoft-outlook/) (Slice 6 + Outlook Mail 2.1).

This is the second of three parity slices for Outlook Mail. 2.2 ships four new actions covering message lifecycle + search:

1. **`move_email`** — POST `/me/messages/{id}/move`.
2. **`delete_email`** — DELETE `/me/messages/{id}` OR POST `/move {destinationId:'deleteditems'}`, gated on a REQUIRED `deleteMode` enum (D-OM2).
3. **`add_categories`** — PATCH `/me/messages/{id}` with `categories[]`.
4. **`fetch_emails`** — GET `/me/messages` (or `/me/mailFolders/{id}/messages`) with V1-shape filters (D-OM1).

Triggers (`email_sent`, `email_flagged`, `new_email` filters), attachment downloads (`get_attachment`), and the `searchOutlookEmail` orphan are **out of scope for 2.2** — see §10.

---

## 1. Accepted Outlook Mail 2.1 summary

Outlook Mail 2.1 closed 6 surfaces:

| Surface | Status |
|---|---|
| `Mail.ReadWrite` scope (P-O1) | Manifest widened — required scope. Existing accounts reconnect via proactive-health `action_required`. |
| `reply_to_email` action | `replyAll` required (Q11). `body` may be empty. 202 No Content. |
| `forward_email` action | `to`/`cc` routed through `parseRecipients` (Q7). At-least-one-`to` enforced post-parse. `comment` optional — omitted from body when absent. Closes V1 O-R3 CSV-becomes-one-address bug. |
| `create_draft_email` action | `isHtml` + `importance` required (Q11). 201 returns full draft envelope mapped to `{draftId, subject, webLink, createdAt, to, cc, bcc}`. |
| `send_email` attachments | `FileRef[]` input. `fileAttachment` only (P-O2). 3 MB / 25 MB caps enforced handler-side. `signed_url` + `v2_storage` FileRef kinds supported; `provider_url` rejected. |
| E2E | 6/6 passing twice consecutively. Mock surface ships reply / replyAll / forward / draft / sendMail-with-attachments routes. |

Final 2.1 state: 4 actions (`send_email`, `reply_to_email`, `forward_email`, `create_draft_email`) + 1 trigger (`new_email`) on the manifest's 4 required scopes. Full unit suite: 679 suites / 6797 tests passing. Local only, not pushed.

2.2 builds on top of that surface — no manifest changes, no scope expansion, no new platform-tier work. Every endpoint 2.2 ships is gated by scopes already declared in the 2.1 manifest:
- `move_email`, `delete_email`, `add_categories` → `Mail.ReadWrite` (already in manifest).
- `fetch_emails` → `Mail.Read` (already in manifest).

---

## 2. Outlook Mail 2.2 scope

Four new V2 actions matching V1's `emailActions.ts:250-655`:

| # | Action key | V1 source | Endpoint |
|---|---|---|---|
| 1 | `microsoft-outlook_action_move_email` | [`emailActions.ts:250-341`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L250) `moveOutlookEmail` | POST `/me/messages/{id}/move` |
| 2 | `microsoft-outlook_action_delete_email` | [`emailActions.ts:346-434`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L346) `deleteOutlookEmail` | DELETE `/me/messages/{id}` OR POST `/move {destinationId:'deleteditems'}` |
| 3 | `microsoft-outlook_action_add_categories` | [`emailActions.ts:439-525`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L439) `addOutlookCategories` | PATCH `/me/messages/{id}` |
| 4 | `microsoft-outlook_action_fetch_emails` | [`emailActions.ts:532-655`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L532) `getOutlookEmails` | GET `/me/messages` (or `/me/mailFolders/{id}/messages`) |

V1 surface explicitly NOT closed by 2.2 (deferred to 2.3 or skipped permanently — see §10):
- `email_sent`, `email_flagged` triggers — 2.3.
- `new_email` filters — 2.3.
- `get_attachment` action — 2.3.
- `searchOutlookEmail` orphan — **permanent SKIP** (audit §7 + parent-audit acceptance).

Once 2.2 lands, V2's Outlook Mail surface is: **8 actions + 1 trigger** vs. V1's **9 actions + 3 triggers**. The remaining gap closes in 2.3.

---

## 3. D-OM1 — `fetch_emails` shape

### Accepted decision (audit §15 D-OM1)

**V1-shape ship.** Schema:

| Field | Type | Required | Notes |
|---|---|---|---|
| `folderId` | string | no | Mail folder id. When absent → `/me/messages` (cross-folder). When present + non-`"inbox"` sentinel → `/me/mailFolders/{folderId}/messages`. Matches V1's `folderId !== 'inbox'` branch. |
| `query` | string | no | Full-text search. Maps to Graph `$search="<query>"`. Triggers V1's mutual-exclusion routing (see below). |
| `startDate` | string (ISO 8601) | no | Lower-bound on `receivedDateTime`. Server-side `$filter ge` when no query; client-side filter when query is set (Graph mutual-exclusion). |
| `endDate` | string (ISO 8601) | no | Upper-bound on `receivedDateTime`. Same routing as `startDate`. |
| `maxResults` | number | no | Bounded `1..50` (Graph `$top` ceiling preserved). Default — see below. |

**Do not wait for cross-provider `search_emails`** (audit recommendation accepted). Future Phase 5 / 7 unification can rename / fold without breaking the existing field set.

### Bounded output

`fetch_emails` returns a fixed-shape projection — no raw Graph envelope spread, matches CLAUDE.md rule against unbounded provider response leakage:

```ts
{
  messages: Array<{
    id: string;
    subject: string | null;
    from: { name?: string; address: string } | null;
    to: Array<{ name?: string; address: string }>;
    cc: Array<{ name?: string; address: string }>;
    receivedDateTime: string | null;
    bodyPreview: string | null;
    hasAttachments: boolean | null;
    importance: "low" | "normal" | "high" | null;
    isRead: boolean | null;
  }>;
  count: number;
}
```

The `$select` whitelist on the Graph call MUST be `id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead` — matches V1 [`emailActions.ts:551`](file:///c:/Users/marcu/source/repos/nstoddard17/chainreact-app-9e/lib/workflows/actions/microsoft-outlook/emailActions.ts#L551). Full body never fetched at this action (the workflow author chains a downstream fetch if they need it).

### Default for `maxResults`

V1 defaults `maxResults = 10`. Q11 says "no hidden defaults for high-risk fields." `maxResults` is **not** a high-risk field (it bounds an output, doesn't drive a side effect). Decision: **schema-level default `10`** — matches V1 user expectation. Documented in the schema's doc-comment so a workflow author skim-reading the field knows what they get when they leave it blank. Bounded `1..50` at the schema layer; `0` and negative values rejected.

### `$filter` vs `$search` mutual-exclusion routing

Microsoft Graph mandates `$filter` and `$search` cannot be combined. V1 routes around this:

- **No `query`:** server-side `$filter` with `receivedDateTime ge/le` + `$orderby receivedDateTime desc` + `$top maxResults`.
- **`query` present:** server-side `$search="<query>"` + `$top = maxResults * 3` (capped at 100) + NO `$orderby` (also incompatible with `$search`). Client-side date filtering applied after response. Result trimmed to `maxResults`.

V2 preserves the V1 routing. The wrapper exposes a single function but the path differs at construction time. See §5.4.

**Header note:** Graph's `$search` requires `ConsistencyLevel: eventual` header. V1 always sets it; V2 will too — handler always passes the header, wrapper accepts and forwards. Setting it for the `$filter`-only path is harmless (Graph ignores it when not needed).

### Paging behavior

V1 does NOT page. V2 does NOT page either — this is a **single-page action** by design:

- Max 50 results per call (the bounded `maxResults` ceiling).
- Graph's `@odata.nextLink` is IGNORED by both V1 and V2.
- Workflow authors who need >50 results compose multiple `fetch_emails` calls with date-window slicing.

A future `fetch_emails_paged` or `iterate_emails` action could ship later, but is out of scope for 2.2. Documented in the schema doc-comment + handler comment so the constraint is visible at code-read time.

### Q-contracts applied

- **Q3** — `refreshAndRetry` wraps the principal `GET /me/messages` call. 401 → one refresh + retry; persistent 401 → `action_required` health signal.
- **Q7** — N/A (no multi-recipient parsing).
- **Q11** — `query` / `startDate` / `endDate` / `folderId` / `maxResults` are all optional non-high-risk fields. `maxResults` schema default of `10` is a UX-defensible non-high-risk default.
- **Idempotency (Q4)** — N/A (read-only action; no side effect to dedupe).

### V1 rot the V2 port closes

- V1 leaks a permissive type (`maxResults = 10` with no upper bound enforced — V1 `Math.min(Math.max(1, maxResults), 50)` happens at HTTP-call time but a schema-level cap is missing). V2 enforces `1..50` at schema layer.
- V1 inlines `getDecryptedAccessToken` + inline 401-retry. V2 uses `refreshAndRetry`.
- V1 returns the full Graph response shape (`from: msg.from?.emailAddress` etc.) without normalizing nullability. V2's bounded output uses explicit `| null` for fields Graph may omit.

---

## 4. D-OM2 — `delete_email` shape

### Accepted decision (audit §15 D-OM2)

**Single action with REQUIRED `deleteMode` enum.** No default.

| Field | Type | Required | Notes |
|---|---|---|---|
| `emailId` | string (non-empty) | yes | Graph message id. URL-encoded inside wrapper. |
| `deleteMode` | enum `"trash" \| "permanent"` | **yes (Q11)** | No default. Q11 destructive-default rule. |

### `deleteMode` semantics

- `"trash"` — POST `/me/messages/{id}/move` with body `{ destinationId: "deleteditems" }`. Reversible (user can restore from Deleted Items folder). Returns the moved-message envelope; V2's handler maps it to bounded output.
- `"permanent"` — DELETE `/me/messages/{id}`. **Irreversible.** 204 No Content. V2's handler returns the same bounded output shape with no provider envelope (matches the 204).

### Bounded output

```ts
{
  deleted: true;
  emailId: string;        // echo of input
  mode: "trash" | "permanent";
}
```

V1's output:
```ts
{ deleted: true, emailId, permanent: boolean }
```

V2 swaps `permanent: boolean` → `mode: enum` to keep symmetry with the input field name and avoid the boolean/enum mismatch. Downstream workflow refs to `{{node.permanent}}` from V1 workflows need migration — **out of scope for 2.2** (covered by Phase-3/4 migration tooling).

### Why single-action over two-action split

Audit §15 D-OM2 listed:
- **(a)** Single action + required `deleteMode` enum — **ACCEPTED**.
- (b) Two separate actions (`delete_email` always-trash + `permanently_delete_email`).

Marcus locked (a) at audit acceptance. Reasoning: matches Gmail's accepted `deleteMode: "trash" | "permanent"` enum shape — cross-provider symmetry. Two-action split would also work but expands registry surface for a single switch.

### Q-contracts applied

- **Q3** — `refreshAndRetry` wraps the principal call. The `trash`/`permanent` branch happens INSIDE the wrapper based on the input flag; only ONE outbound request per handler invocation; `refreshAndRetry` retries that one request.
- **Q11** — `deleteMode` required. NO default. Schema parse fails if the field is absent.
- **Q4** — Idempotency: out of scope for 2.2. Q4 within-session dedup is engine-layer concern. The `delete_email` handler does not need handler-level idempotency wrapping — V2's engine threads `executionSessionId` + `nodeId` + `actionType` and the engine's idempotency wrapper (when wired to the action via `meta?`) handles the cached-replay. This action does NOT receive `meta?` today (none of Outlook's 2.1 actions did either); idempotency happens at the engine layer via the session_side_effects pattern — defer per-handler Q4 wrapping until the unified engine consolidation lands.

### V1 rot the V2 port closes

- V1 defaults `permanentDelete = false` (Q11 violation — destructive hidden default).
- V1 accepts `'true'` / `'false'` string variants (legacy coercion). V2's schema parses as a strict enum.
- V1 lazily unwraps array inputs (`Array.isArray(emailId) ? emailId[0]?.id || emailId[0] : emailId`). V2's engine pre-resolves variables before handler dispatch — schema-level enforcement is `z.string().min(1)`, no array-coercion. Workflows that wired array inputs in V1 need migration tooling (out of scope).

---

## 5. API wrapper plan

Four new wrapper files. All mirror Slice 6 / 2.1 wrapper shape — 401 → `Unauthorized401Error`, else 4xx/5xx → `surfaceGraphError` + generic `Error`.

### 5.1 New: `integrations/microsoft-outlook/api/moveMessage.ts`

```ts
export interface MoveMessageInput {
  accessToken: string;
  /** Graph message id. URL-encoded inside this wrapper. */
  messageId: string;
  /** Destination mail folder id (well-known: "deleteditems", "inbox", "drafts", "sentitems", etc. — or custom folder id). */
  destinationId: string;
}

export interface MovedMessage {
  /** New message id assigned by Graph in the destination folder. */
  id: string;
  /** Echo of the destination — Graph returns parentFolderId on the moved envelope. */
  parentFolderId?: string;
}

export async function moveMessage(input: MoveMessageInput): Promise<MovedMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(input.messageId)}/move`;
  // POST with body { destinationId }. Graph returns 201 Created with the moved envelope.
  // 401 → Unauthorized401Error; 404 → surfaceGraphError → "Email not found"-style message.
}
```

~55 LOC including doc comment. Reused by `move_email` AND `delete_email` (the `"trash"` mode is mechanically a move-to-`deleteditems`).

### 5.2 New: `integrations/microsoft-outlook/api/deleteMessage.ts`

Permanent-delete only. The two-mode `delete_email` handler dispatches: `"trash"` → `moveMessage(destinationId: "deleteditems")`, `"permanent"` → `deleteMessage`. This keeps each wrapper single-purpose (Slice 6 convention — one wrapper, one endpoint).

```ts
export interface DeleteMessageInput {
  accessToken: string;
  /** Graph message id. URL-encoded inside this wrapper. */
  messageId: string;
}

export async function deleteMessage(input: DeleteMessageInput): Promise<void> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(input.messageId)}`;
  // DELETE. Graph returns 204 No Content.
  // 401 → Unauthorized401Error; 404 → surfaceGraphError → "Email not found"-style message.
}
```

~45 LOC.

### 5.3 New: `integrations/microsoft-outlook/api/patchMessage.ts`

PATCH `/me/messages/{id}` is broader than just categories — it can update `isRead`, `flag`, `inferenceClassification`, `internetMessageHeaders`, etc. 2.2 only exercises the `categories` field; the wrapper is structured so a future `set_read_status` / `set_flag` action can reuse it without a new wrapper.

```ts
export interface PatchMessageInput {
  accessToken: string;
  /** Graph message id. URL-encoded inside this wrapper. */
  messageId: string;
  /** Partial Graph message fields to PATCH. Only fields explicitly set are sent. */
  patch: {
    categories?: string[];
    // Future: isRead?, flag?, inferenceClassification?, etc.
  };
}

export interface PatchedMessage {
  id: string;
  categories?: string[];
  // Graph returns the full envelope; the wrapper types only the read-back fields we project.
}

export async function patchMessage(input: PatchMessageInput): Promise<PatchedMessage> {
  const url = `${graphApiBase()}/v1.0/me/messages/${encodeURIComponent(input.messageId)}`;
  // PATCH with body = input.patch (only fields explicitly present).
  // Graph returns 200 OK with the updated message envelope.
  // 401 → Unauthorized401Error; 404 → surfaceGraphError → "Email not found".
}
```

~55 LOC.

**Discriminated-union alternative considered + rejected:** modeling `patch` as a discriminated union over `kind: "categories" | "read_status" | ...` would make the type stricter but locks future callers into a fixed schema. The open-shape `patch: { categories?: ... }` is good enough for 2.2; the future action that adds `isRead` extends the shape without breaking 2.2's wrapper consumers.

### 5.4 New: `integrations/microsoft-outlook/api/listMessages.ts`

This is the larger wrapper — it owns the `$filter` vs `$search` mutual-exclusion routing.

```ts
export interface ListMessagesInput {
  accessToken: string;
  /** When set, scopes to /me/mailFolders/{folderId}/messages. */
  folderId?: string;
  /** Maps to Graph $search="<query>". Mutually exclusive with $filter at Graph level. */
  query?: string;
  /** Lower-bound ISO 8601. Server-side when no query; client-side when query. */
  startDate?: string;
  /** Upper-bound ISO 8601. Same routing as startDate. */
  endDate?: string;
  /** 1..50. Caller already bounded by schema; wrapper re-clamps defensively. */
  maxResults: number;
}

export interface GraphMessage {
  id: string;
  subject: string | null;
  from: { emailAddress: { name?: string; address: string } } | null;
  toRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name?: string; address: string } }>;
  receivedDateTime: string | null;
  bodyPreview: string | null;
  hasAttachments: boolean | null;
  importance: "low" | "normal" | "high" | null;
  isRead: boolean | null;
}

export interface ListMessagesResult {
  /** Graph-shape messages. Handler maps to bounded output. */
  value: GraphMessage[];
}

export async function listMessages(input: ListMessagesInput): Promise<ListMessagesResult> {
  // 1. Base URL: /me/messages or /me/mailFolders/{folderId}/messages.
  // 2. Build URLSearchParams with $select whitelist + $top + $search OR $filter+$orderby branch.
  // 3. Set ConsistencyLevel: eventual header (required for $search; harmless for $filter).
  // 4. GET. 401 → Unauthorized401Error; else → surfaceGraphError.
  // 5. Return { value } verbatim (handler does client-side date filter + slice).
}
```

~110 LOC. Single wrapper that owns the URL-construction branching — keeps the handler simple.

### Reused types

`GraphRecipient` and `GraphRecipientField` already live in [`api/sendMail.ts`](../../../integrations/microsoft-outlook/api/sendMail.ts). For 2.2, the wrappers introduce a sibling `GraphMessage` shape — it's structurally distinct (full Graph envelope shape vs. send-side payload shape), so it lives in `listMessages.ts` next to its consumer. If `getMessage.ts` (2.1's webhook helper) and `listMessages.ts` both grow a `GraphMessage` type, factor to `api/types.ts` later — not now.

---

## 6. Schema + handler plan

Four new actions. All registered in [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) (append-only after entry 329).

### 6.1 Actions to create

| File | LOC est. | Purpose |
|---|---|---|
| [`integrations/microsoft-outlook/actions/moveEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~30 | Zod schema with `emailId` (`z.string().min(1)`) + `destinationFolderId` (`z.string().min(1)`). |
| [`integrations/microsoft-outlook/actions/moveEmail.ts`](../../../integrations/microsoft-outlook/actions/) | ~60 | Handler: parse → resolve accountId → wrap `moveMessage` in `refreshAndRetry` → return `{ moved: true, emailId, newId, destinationFolderId }`. |
| [`integrations/microsoft-outlook/actions/deleteEmail.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~35 | Schema with `emailId` (`z.string().min(1)`) + `deleteMode: z.enum(["trash", "permanent"])` (required — NO default). |
| [`integrations/microsoft-outlook/actions/deleteEmail.ts`](../../../integrations/microsoft-outlook/actions/) | ~80 | Handler: parse → branch on `deleteMode`: `"trash"` → `moveMessage({destinationId:"deleteditems"})`, `"permanent"` → `deleteMessage`. Both wrapped in `refreshAndRetry`. Return `{ deleted: true, emailId, mode }`. |
| [`integrations/microsoft-outlook/actions/addCategories.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~35 | Schema with `emailId` (`z.string().min(1)`) + `categories: z.union([z.string().min(1), z.array(z.string()).min(1)])` (CSV-string-or-array; min 1 enforces "at least one input"). |
| [`integrations/microsoft-outlook/actions/addCategories.ts`](../../../integrations/microsoft-outlook/actions/) | ~70 | Handler: parse → parse-CSV-or-array via shared helper → post-parse at-least-one-category guard → resolve accountId → wrap `patchMessage` in `refreshAndRetry` → return `{ categorized: true, emailId, categories: string[] }`. |
| [`integrations/microsoft-outlook/actions/fetchEmails.schema.ts`](../../../integrations/microsoft-outlook/actions/) | ~55 | Schema with all 5 V1-shape optional fields + `maxResults` default `10`, bounded `1..50`. ISO-8601 string validation via `z.string().datetime({offset:true})` or `.refine(d => !isNaN(Date.parse(d)))` — pick whichever passes Slice-6's existing date-validation conventions. |
| [`integrations/microsoft-outlook/actions/fetchEmails.ts`](../../../integrations/microsoft-outlook/actions/) | ~120 | Handler: parse → resolve accountId → wrap `listMessages` in `refreshAndRetry` → client-side date-filter when `query` was set (Graph mutual-exclusion fallback) → slice to `maxResults` → map Graph envelope to bounded output. |

### 6.2 CSV-or-array categories helper

Audit accepts "CSV-string-or-array parsing via shared helper" for `add_categories`. Implementation decision:

- **Reuse `parseRecipients`** ([`core/integrations/parseRecipients.ts`](../../../core/integrations/parseRecipients.ts)) — the logic is identical (split on `,`, trim, drop empties, flatten array-of-CSV). Naming mismatch ("recipients" vs "categories") is the only friction.
- **Alternative:** factor a generic `parseCsvList` helper at [`core/integrations/parseCsvList.ts`](../../../core/integrations/) — exact same impl as `parseRecipients`. `parseRecipients` delegates to it.

**Decision: factor `parseCsvList`** as a small new helper (≤20 LOC). Have `parseRecipients` become a thin re-export / wrapper for backward compatibility (callers in 2.1 / Slice 6 / Calendar / Gmail keep importing `parseRecipients`; `addCategories.ts` imports `parseCsvList`). Documents the broader semantic at the file boundary. Doc-comment cites Q7 + categories use case.

Test surface for the new helper: ~6 tests at `tests/unit/core/integrations/parseCsvList.test.ts` covering CSV / array / array-of-CSV / null / undefined / empty / whitespace-only.

### 6.3 Registry registration

Append to [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) after entry 329:

```ts
{ provider: "microsoft-outlook", type: "move_email", handler: moveOutlookEmail },
{ provider: "microsoft-outlook", type: "delete_email", handler: deleteOutlookEmail },
{ provider: "microsoft-outlook", type: "add_categories", handler: addOutlookCategories },
{ provider: "microsoft-outlook", type: "fetch_emails", handler: fetchOutlookEmails },
```

Plus 4 imports at the top of the file (matching the 2.1 import style — `import { moveEmail as moveOutlookEmail }` etc.).

---

## 7. Unit test plan

Mirrors 2.1 coverage shape: one schema test + one handler test per action; one wrapper test per wrapper. Approximate net-new test counts:

### 7.1 New test files

| File | ~Test count | Notes |
|---|---|---|
| `tests/unit/integrations/microsoft-outlook/actions/moveEmail.schema.test.ts` | ~10 | `emailId` required + non-empty; `destinationFolderId` required + non-empty; strict mode rejects unknowns; type-coercion off. |
| `tests/unit/integrations/microsoft-outlook/actions/moveEmail.test.ts` | ~12 | Happy path: wrapper called with `messageId` + `destinationId`. Output shape: `{ moved, emailId, newId, destinationFolderId }`. 401 → `refreshAndRetry` triggers refresh + retry. 404 → "Email not found"-style error from `surfaceGraphError`. AccountId resolution from trigger event. |
| `tests/unit/integrations/microsoft-outlook/actions/deleteEmail.schema.test.ts` | ~12 | `emailId` required; `deleteMode` required (Q11) — missing rejects; enum-only accepts `"trash"` / `"permanent"`; rejects `"true"` / `"false"` / boolean; strict mode rejects unknowns. |
| `tests/unit/integrations/microsoft-outlook/actions/deleteEmail.test.ts` | ~16 | `"trash"` → `moveMessage(destinationId:"deleteditems")` called; `"permanent"` → `deleteMessage` called; both wrapped in `refreshAndRetry`. Output shape: `{ deleted, emailId, mode }`. 401 retry in both modes. 404 → `surfaceGraphError`-style error. Schema-error path tested (`deleteMode` missing). |
| `tests/unit/integrations/microsoft-outlook/actions/addCategories.schema.test.ts` | ~14 | `emailId` required; `categories` CSV-string vs array vs empty-string vs empty-array; min-1 enforcement; strict mode rejects unknowns. |
| `tests/unit/integrations/microsoft-outlook/actions/addCategories.test.ts` | ~14 | CSV → split via `parseCsvList`; array → flattened; array-of-CSV → flattened; whitespace-only after parse → handler rejects; output `{ categorized, emailId, categories: string[] }` — categories is the parsed array; wrapper called with `patch: { categories: parsed }`; 401 retry. |
| `tests/unit/integrations/microsoft-outlook/actions/fetchEmails.schema.test.ts` | ~16 | All fields optional; `maxResults` default `10`; `maxResults` bounded `1..50` (rejects `0`, `51`, negative, non-integer); `startDate`/`endDate` ISO-8601 validation; `query` accepts empty string vs missing (treat as "no query"); strict mode rejects unknowns. |
| `tests/unit/integrations/microsoft-outlook/actions/fetchEmails.test.ts` | ~22 | No-query path: `$filter` only with date range; no-query no-date path: just `$top` + `$orderby`; `folderId` absent → `/me/messages`; `folderId` present → `/me/mailFolders/{id}/messages`; `query` present → `$search` with `$top * 3` cap 100, NO `$orderby`, `ConsistencyLevel: eventual` header set; `query + dates` → server-side `$search`, client-side date filter applied to response, results sliced to `maxResults`; 401 retry; bounded output shape; nullability on fields Graph may omit; empty result set returns `{ messages: [], count: 0 }`. |
| `tests/unit/integrations/microsoft-outlook/api/moveMessage.test.ts` | ~10 | URL construction `/me/messages/{id}/move`; `messageId` URL-encoded; 201 → parsed envelope; 401 → `Unauthorized401Error`; 404 → generic Error with `surfaceGraphError` message. |
| `tests/unit/integrations/microsoft-outlook/api/deleteMessage.test.ts` | ~10 | URL construction `/me/messages/{id}`; DELETE method; 204 → void; 401 / 404 / 500 mapping. |
| `tests/unit/integrations/microsoft-outlook/api/patchMessage.test.ts` | ~12 | URL construction; PATCH method; `patch: { categories: [...] }` body shape; absent fields omitted from body; 200 → parsed envelope; 401 / 404 mapping; extensibility test (e.g. unknown future patch field passes through). |
| `tests/unit/integrations/microsoft-outlook/api/listMessages.test.ts` | ~20 | URL: no folder vs folder; URL params: `$select` whitelist; `$top` no-query vs query (×3 cap 100); `$search="<query>"` shape (note: quoted); `$orderby` only in no-query path; `$filter` only in no-query path; date `ge`/`le` boundary inclusion; `ConsistencyLevel: eventual` header always present; 200 → `{ value: [...] }`; 401 / 400 / 500 mapping. |
| `tests/unit/core/integrations/parseCsvList.test.ts` (new helper) | ~8 | CSV / array / array-of-CSV / null / undefined / empty / whitespace-only / non-string entries. |

### 7.2 Updated test files

| File | Changes |
|---|---|
| (none — 2.2 introduces only new files; manifest is unchanged from 2.1) | — |

Total net-new: ~14 new files, ~170 new tests. Per-file density matches 2.1's ~12-16 tests per action / 10-12 per wrapper.

### 7.3 Test patterns to reuse from 2.1

- Mock for `refreshAndRetry`: per 2.1, mock `getActiveForExecution` + `decryptToken` + `dispatcher.refresh` to drive 401-retry path.
- Mock for Graph endpoints: `jest.spyOn(global, "fetch")` returning crafted `Response` objects.
- Schema-strict-mode tests assert the exact rejection shape (Zod's `.strict()` returns `unrecognized_keys`).
- AccountId resolution: tests cover both "trigger event from this provider" (use accountId) and "trigger event from another provider or absent" (null).

---

## 8. E2E plan

### 8.1 Mock surface extensions

[`tests/e2e/helpers/mockMicrosoftServer.ts`](../../../tests/e2e/helpers/mockMicrosoftServer.ts) needs:

| Endpoint | Method | Response | Notes |
|---|---|---|---|
| `/v1.0/me/messages/{id}/move` | POST | 201 Created + synthetic moved envelope | Record `messageId` + `destinationId` in `state.calls.moveMessage`. Increment internal counter so each move gets a distinct new id (`mock-moved-N`). |
| `/v1.0/me/messages/{id}` | DELETE | 204 No Content | Record `messageId` in `state.calls.deleteMessage`. |
| `/v1.0/me/messages/{id}` | PATCH | 200 OK + echoed envelope | Record `messageId` + parsed `patch` body in `state.calls.patchMessage`. Echo back `categories` from the request body. |
| `/v1.0/me/messages` | GET | 200 OK + `{value: [...]}` | Record `state.calls.listMessages` capturing the query params (whole `req.url`). Return a configurable list — by default, return an empty array unless control-plane `__injectMessage` has populated `state.messages`. The mock walks `state.messages` and returns the values; the test driver injects messages and asserts on the request URL's `$select` / `$top` / `$filter` / `$search` shape. |
| `/v1.0/me/mailFolders/{folderId}/messages` | GET | 200 OK + `{value: [...]}` | Same as above but with folder filter. Mock filters injected messages by `parentFolderId` matching `folderId`. |

State extensions:
- `state.calls.moveMessage: RecordedMoveMessage[]` (auth, messageId, destinationId, responseNewId).
- `state.calls.deleteMessage: RecordedDeleteMessage[]` (auth, messageId).
- `state.calls.patchMessage: RecordedPatchMessage[]` (auth, messageId, patch body).
- `state.calls.listMessages: RecordedListMessages[]` (auth, url, parsed query params, returnedCount).
- `state.moveCounter: number` (monotonic; resets on `__reset`).

Estimated mock delta: ~280 LOC across the existing file.

### 8.2 E2E spec extensions

[`tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts`](../../../tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts) gains **4 new `test()` blocks**:

| Block | What it asserts |
|---|---|
| **`move_email` happy path** | Build workflow: `new_email` trigger → `move_email`. Trigger via mock notification. Assert: 1) `state.calls.moveMessage` has one record; 2) `destinationId` matches workflow config; 3) workflow run succeeds; 4) output is `{ moved: true, emailId, newId, destinationFolderId }`. |
| **`delete_email` trash mode** | Workflow with `new_email` → `delete_email` with `deleteMode: "trash"`. Trigger. Assert: 1) `state.calls.moveMessage` records destination `"deleteditems"` (NOT `state.calls.deleteMessage`); 2) workflow succeeds; 3) output `mode: "trash"`. |
| **`delete_email` permanent mode** | Workflow with `new_email` → `delete_email` with `deleteMode: "permanent"`. Trigger. Assert: 1) `state.calls.deleteMessage` has one record (NOT `state.calls.moveMessage`); 2) workflow succeeds; 3) output `mode: "permanent"`. |
| **`add_categories` CSV parse** | Workflow with `new_email` → `add_categories` configured with `categories: "Important, Urgent, Follow-up"`. Trigger. Assert: 1) `state.calls.patchMessage` has one record; 2) `patch.categories` is `["Important", "Urgent", "Follow-up"]` (split + trim); 3) workflow succeeds. |
| **`fetch_emails` no-query** | Manual-trigger workflow (or new_email pass-through) → `fetch_emails` with `startDate` + `maxResults: 5`. Pre-inject 6 messages via `__injectMessage`. Trigger. Assert: 1) `state.calls.listMessages` records URL with `$filter`, `$top=5`, `$orderby`, NO `$search`; 2) action output has 5 messages (sliced); 3) output messages match the bounded shape (no Graph envelope leakage). |
| **`fetch_emails` with-query client-side date filter** | Manual-trigger workflow → `fetch_emails` with `query: "invoice"` + `startDate`. Pre-inject mixed-date messages. Trigger. Assert: 1) `state.calls.listMessages` URL has `$search="invoice"`, `$top=15` (5 * 3 cap 100), NO `$orderby`, NO `$filter`; 2) `ConsistencyLevel: eventual` header was set; 3) results client-side-filtered by `startDate`. |

That's 6 new test blocks. Spec total grows from 10 to 16. Each test uses per-run randomized message ids (matching 2.1's `webhook_event_dedup`-collision avoidance pattern). Spec runs twice for cross-run stability.

### 8.3 E2E execution

Standard command:
```bash
CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1
```

Run twice consecutively before declaring 2.2 complete (mirrors 2.1's accepted convention).

### 8.4 E2E commits

E2E mock + spec extensions ride alongside the implementation commits:

- **Commit 2** adds move/delete/patchMessage mock surfaces + 4 new test blocks (`move_email` + 2 `delete_email` modes + `add_categories`).
- **Commit 3** adds listMessages mock surface + 2 new test blocks (`fetch_emails` no-query + with-query).

Matches 2.1's "e2e ships in the same feat commit as the handler" cadence.

---

## 9. Commit sequence

| # | Commit | Files changed (explicit path staging) | Gates |
|---|---|---|---|
| **1** (this) | `docs(outlook-mail): plan 2.2 lifecycle and search` | `docs/slices/parity/outlook-mail-2-2-lifecycle-search-plan.md` (new). Doc-only. | `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test`. |
| **2** | `feat(outlook-mail): add move, delete, and add_categories actions` | New: `integrations/microsoft-outlook/api/{moveMessage,deleteMessage,patchMessage}.ts`; `integrations/microsoft-outlook/actions/{moveEmail,deleteEmail,addCategories}.{ts,schema.ts}`; `core/integrations/parseCsvList.ts`; corresponding `tests/unit/...`. Mod: `services/execution/handlers/_registry.ts` (3 imports + 3 registry entries appended); `core/integrations/parseRecipients.ts` (delegate to `parseCsvList`). E2E mock + spec (4 test blocks). | Full unit gates + e2e walkthrough. |
| **3** | `feat(outlook-mail): add fetch_emails action` | New: `integrations/microsoft-outlook/api/listMessages.ts`; `integrations/microsoft-outlook/actions/fetchEmails.{ts,schema.ts}`; corresponding `tests/unit/...`. Mod: `services/execution/handlers/_registry.ts` (1 import + 1 entry); E2E mock + spec (2 test blocks). | Full unit gates + e2e walkthrough. |
| **4** | `docs(outlook-mail): document 2.2 outcomes` | New: `docs/slices/parity/outlook-mail-2-2-outcomes.md`. Doc-only. Optionally `CLAUDE.md` parity-changelog entry. | Full unit gates. |

### Per-commit gates

```bash
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test
```

E2E gate only for commits 2 + 3:
```bash
CI=1 npx playwright test tests/e2e/slice-6-outlook-mail-walkthrough.spec.ts --workers=1
```

Run e2e twice on commits 2 + 3 for cross-run stability.

### Explicit-path staging

Every commit uses `git add <specific files>` — never `git add .`. Pre-existing dirty files left untouched:
- `docs/rules/database-security.md`
- `PACKAGES.md`
- Native-node audit / other WIP from another chat (if present)

If a 2.2 commit happens to touch a file another chat modified (e.g. `_registry.ts`), the diff MUST be inspected to ensure only Outlook-specific lines change. Cancel + re-stage manually if unrelated lines drift in.

### Not pushed

Every commit lands locally on `v2-provider-port-local`. Marcus reviews + pushes once all 4 commits land.

### Combined-batch alternative

The parent audit's §13 batch plan groups 2.2 into "3 commits" (`docs + 2 feats`). This plan splits the implementation into 2 feat commits (lifecycle trio + fetch) rather than one mega-commit because:

- **Lifecycle trio** shares the PATCH-shaped pattern + bounded outputs; tests bracket cleanly together (~120 unit tests + 4 e2e blocks).
- **`fetch_emails`** is the single largest handler in the slice — query routing, mutual-exclusion fallback, bounded paging — landing it alone keeps the diff reviewable (~80 unit tests + 2 e2e blocks).

Marcus can collapse 2 + 3 into one commit if preferred; the boundaries are clean either way.

---

## 10. Explicit deferred / out-of-scope

These surfaces are NOT touched in 2.2. Each has a defined home:

| Surface | Status | Where it ships |
|---|---|---|
| `microsoft-outlook_trigger_email_sent` | Deferred to 2.3 | Outlook Mail 2.3 — Triggers & Attachments. |
| `microsoft-outlook_trigger_email_flagged` | Deferred to 2.3 | Outlook Mail 2.3. D-OM4: V1-parity over-fire (no prior-state cache). |
| `new_email` per-trigger filters (from / subject / hasAttachment / folder / importance) | Deferred to 2.3 | Outlook Mail 2.3. D-OM3 design choices preserved. |
| `microsoft-outlook_action_get_attachment` | Deferred to 2.3 | Outlook Mail 2.3. P-O2 fileAttachment-only. Stages bytes to `workflow_files` and returns FileRef[]. |
| Upload-session flow for attachments >25 MB | Deferred indefinitely | Phase 7 or a dedicated follow-up. 2.1's 25 MB hard-cap stands. |
| `itemAttachment` / `referenceAttachment` Graph subtypes | Permanent SKIP | P-O2 decision (Outlook Mail 2.1 plan §3). Log-and-continue on receipt; not modeled in FileRef contract. |
| V1's `searchOutlookEmail` orphan | **Permanent SKIP** | Audit §7 + §15 + parent acceptance. Never registered in V1; AI planner reference at `lib/ai/workflowAI.ts:216` would have failed at runtime if invoked. `fetch_emails` with `query` covers the use case. |
| `fetch_emails` pagination via `@odata.nextLink` | Deferred indefinitely | Out of scope for 2.2 — single-page only (maxResults ≤ 50). Future `iterate_emails` action could ship later. |
| Q4 within-session idempotency wrapping for `delete_email` / `move_email` / `add_categories` / `fetch_emails` | Deferred until engine consolidation | Q4 wraps via `meta?` threading at engine layer. None of 2.1's handlers received `meta?` either. Deferred per the active v2-canonical-execution-engine consolidation. |
| Cross-provider `search_emails` unification | Deferred indefinitely | Audit §15 D-OM1 explicitly accepts "ship V1-shape now; do not wait for cross-provider search." Phase 5 / 7 cleanup if both providers need full search. |
| V1 boolean-string coercion (`'true'`/`'false'` for `permanentDelete`) | Permanent break with V1 | V2's strict enum schema rejects these. Workflow migration tooling owns the conversion (out of scope). |

---

## 11. Risk callouts

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R-OM22-1** — `fetch_emails` mutual-exclusion routing has subtle Graph quirks. Past examples: `$search` returns differently-ordered results (no `$orderby` allowed); per-folder `$search` is fully supported on /me/messages but some folder subpaths reject it. | Medium | Medium | Mock + unit + e2e tests cover all four combinations (no query / query / query+dates / folder+query). Real-world variation surfaces in e2e once the production OAuth flow exercises Graph directly — V2 doesn't run that pre-launch. Documented in handler doc-comment with link to Graph permission reference. |
| **R-OM22-2** — `delete_email` permanent mode is irreversible. A workflow author wiring it without understanding the enum could destroy production mail. | Low | High | Q11 `deleteMode` required — schema fails fast if missing. Builder UI (separate concern) ships a confirmation copy on the field label ("This permanently deletes mail. Use 'trash' to recover later."). Out of scope for this plan but tracked in the action's handler doc-comment. |
| **R-OM22-3** — `add_categories` PATCH-replaces the full `categories[]` array. A workflow that adds one category to an email with three existing categories REPLACES all four with the one. Both V1 and V2 follow the V1 semantics (matching what V1 documented). | Medium | Medium | Handler doc-comment explicitly calls out the PATCH-replace semantics. Future `append_categories` action (sibling to `add_categories` keeping V1 name) could ship later if user feedback demands additive semantics. 2.2 ships the V1-parity behavior. |
| **R-OM22-4** — `move_email`'s destination "well-known" folder names (`"deleteditems"`, `"sentitems"`, `"drafts"`, `"inbox"`) vs custom folder ids. V1 passes whatever the user wrote verbatim. V2 does the same. Graph 404 on an invalid folder name surfaces as "Email not found" via `ErrorItemNotFound`, which is misleading. | Low | Low | Handler doc-comment notes the well-known names + the custom-id path. `surfaceGraphError` returns the raw Graph error message verbatim; "Item not found" → "Email not found" mapping happens IF the handler decides to translate (V1 does for `ErrorItemNotFound` only). V2 will mirror the V1 translation in this handler — same logic as 2.1's wrappers. |

No risk warrants splitting the slice further. No risk warrants a feature flag.

---

## 12. Acceptance gates (per implementation commit)

Each commit individually:
- ✅ `npx tsc --noEmit` green.
- ✅ `npm run lint` green.
- ✅ `npm run lint:structure` green.
- ✅ `npm run lint:migrations` green.
- ✅ `npm test` — full suite passes. Commit 2 adds ~110 net-new unit tests; Commit 3 adds ~80 net-new unit tests. Running total target after 2.2 closes: ≥ 6900.
- ✅ E2E (commits 2 + 3 only) — slice-6 walkthrough green twice consecutively.

---

## 13. Exit checklist

Outlook Mail 2.2 is complete when:

- [ ] Commit 2 lands — `move_email`, `delete_email`, `add_categories` registered; all unit + e2e tests pass; `parseCsvList` helper landed.
- [ ] Commit 3 lands — `fetch_emails` registered; mutual-exclusion routing covered; bounded output stable.
- [ ] Commit 4 lands — outcomes doc captures the final 2.2 surface + accepted decisions + gate results.
- [ ] No regression in Outlook 2.1 tests (4 actions + 1 trigger baseline preserved).
- [ ] CLAUDE.md gains an "Outlook Mail 2.2" entry under the parity-changelog list (optional — Marcus's call; 2.3 outcomes might wait for the full arc to close).
- [ ] Marcus reviews and acknowledges 2.2 complete.

---

## 14. What's next after 2.2

After 2.2's 4 commits land:

1. **Outlook Mail 2.3 — Triggers & Attachments** opens (audit §13). Ships `email_sent` + `email_flagged` triggers + `new_email` filter expansion (D-OM3) + `get_attachment` (P-O2 fileAttachment-only with FileRef[] output via P-S3).
2. **Outcomes doc** for the full Outlook Mail parity arc.
3. **Audit ledger** updated — `parity-outlook-mail.md` §14 exit checklist boxes checked.

**Mailchimp remains active in another chat — do not touch. Native-node audit may be active elsewhere — do not touch unless assigned.**
