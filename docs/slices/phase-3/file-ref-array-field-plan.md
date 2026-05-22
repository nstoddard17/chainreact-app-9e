# Phase 3 — FileRef-array FieldType plan

**Status:** Plan only. No contract / metadata / runtime changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Contract reference:** [`docs/slices/p-s3-file-output-contract-plan.md`](../p-s3-file-output-contract-plan.md).
**Builder precedent — closest parallel:** Slice 3.13 `string-array` (dedicated type, chip renderer, native `string[]` write).

This plan covers what is needed to add a generic FileRef-array builder field so workflow authors can configure actions that consume `FileRef[]` at runtime (Outlook `send_email.attachments` today; Gmail send/reply/draft attachments once Gmail 2.3's deferred-attachment work lands; any future provider whose runtime schema is `z.array(FileRefSchema)`). It is the FileRef analogue of Slice 3.13 — identify the gap, design contract + renderer, leave provider-by-provider rollout for follow-up slices.

---

## 1. Current FileRef metadata state

### 1.1 Contract layer

- **`contracts/file.ts`** ships a `FileRefSchema` discriminated union with three strict arms:
  - `provider_url` — provider-issued URL; consumer attaches the provider bearer.
  - `v2_storage` — bytes in our Supabase `workflow-files` bucket at `storagePath`.
  - `signed_url` — pre-signed URL (no auth headers needed).
  - Shared fields: `name`, `mimeType`, optional `sizeBytes`, optional `expiresAt`, optional `providerFileId`, optional `metadata` record. Each arm is `.strict()` — `content` / `bytes` / `base64` / `data` are rejected by construction.
- **`contracts/actionMeta.ts`** — the builder-facing contract:
  - `FieldTypeSchema` currently enumerates `text`, `textarea`, `select`, `combobox`, `keyvalue`, `number`, `boolean`, `file`, `cron`, `router-routes`, `string-array`. There is **no** `file-array` or any array form for FileRef-shaped values.
  - `ActionMeta.producesFileRef` / `ActionMeta.consumesFileRef` (default `false`) flag whether a handler emits or accepts FileRef-shaped data. They drive the variable-picker file icon — they do NOT change field validation.
  - `OutputTypeSchema` includes a `"fileRef"` arm so the variable picker can render a file chip on outputs typed that way. There is no `"fileRefArray"` output type today.

### 1.2 Renderer layer

- **`features/workflow-builder/config-modal/fields/FileField.tsx`** is a placeholder: a single `<Input>` accepting a text "FileRef id" so saves don't fail. The doc-comment explicitly defers the real file picker to "Slice 3.7." Slice 3.7 shipped the variable picker but not the file picker, so this remains a text-paste fallback.
- **`features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx`** renders a `fileRef` output-type chip but has an explicit out-of-scope comment for "File / FileRef sub-picking (deferred slice)." It inserts the canonical `{{nodeId.path}}` token; the consuming field is whatever the author has focused.

### 1.3 Producer / consumer flags in shipped action metas

| Provider           | Action                | `producesFileRef` | `consumesFileRef` | Runtime attachments? | Builder attachments? |
| ------------------ | --------------------- | ----------------- | ----------------- | -------------------- | -------------------- |
| Gmail              | `get_attachment`      | true              | false             | n/a (produces)       | n/a (produces)       |
| Microsoft Outlook  | `get_attachment`      | true              | false             | n/a (produces)       | n/a (produces)       |
| Microsoft Outlook  | `send_email`          | false             | **true**          | **YES** (`attachments: z.array(FileRefSchema).optional()`) | **NO** (omitted from `fields[]` — meta-level decision) |
| Gmail              | `send_email`          | false             | false             | NO (`.strict()` rejects; deferred to Gmail 2.3) | NO (deferred) |
| Gmail              | `reply_to_email`      | false             | false             | NO (deferred to Gmail 2.3) | NO (deferred) |
| Gmail              | `create_draft`        | false             | false             | NO (deferred to Gmail 2.3) | NO (deferred) |
| Gmail              | `create_draft_reply`  | false             | false             | NO (deferred to Gmail 2.3) | NO (deferred) |

The Outlook `send_email` row is the load-bearing inconsistency: runtime accepts a `FileRef[]` field, but the builder UI cannot configure it. Workflow authors must hand-edit workflow JSON to use it today. The Slice 3.17 meta comment names this gap explicitly and points at the missing FieldType.

---

## 2. Provider surfaces needing FileRef-array

### 2.1 Immediate (runtime already accepts `FileRef[]`)

- **`microsoft-outlook:send_email.attachments`** — runtime: `z.array(FileRefSchema).optional()` (3 MB per / 25 MB total handler-side caps; `provider_url` arm rejected at handler with a clean error). Meta `consumesFileRef: true` already advertised. **This is the canonical first consumer.**

### 2.2 Near-term (runtime deferred but contract-ready)

These four Gmail actions explicitly defer attachments to "Gmail 2.3" per the V1-parity ledger. Their runtime schemas currently `.strict()` reject `attachments`. Once the Gmail 2.3 commits land the matching `z.array(FileRefSchema).optional()` shape, the builder side is "drop the field meta in":

- `gmail:send_email.attachments`
- `gmail:reply_to_email.attachments`
- `gmail:create_draft.attachments`
- `gmail:create_draft_reply.attachments`

`microsoft-outlook:create_draft_email` / `reply_to_email` / `forward_email` have not exposed attachments at runtime either; they would join this near-term list when surfaced.

### 2.3 Producer-side (informational — these stay single-output, not FileRef-array)

- `gmail:get_attachment` — produces one `FileRef`. Already surfaced. No change.
- `microsoft-outlook:get_attachment` — produces one `FileRef`. Already surfaced. No change.

### 2.4 Single-FileRef gaps (out of scope here, but flagged)

Three V2 runtime handlers accept a single `FileRef` field but **have no `.meta.ts` at all** yet (handler is wired in `services/discovery/_registry.ts` for execution but the meta is missing, so the builder library panel doesn't surface them):

- `airtable:add_attachment` — accepts `file: FileRefSchema` (single).
- `slack:upload_file` — accepts `file: FileRefSchema` (single).
- `slack:download_file` — produces FileRef.

These are single-value, not array, so they would route through a (future improvement to) the existing `file` FieldType, not the new `file-array` type. Mentioned here only to show the FileRef metadata surface is broader than the array case — but **this slice's contract design does not aim to fix the single-file UX**; that is a separate later slice.

---

## 3. Contract direction — recommendation

### 3.1 Options considered

**Option A — new `file-array` FieldType (recommended).**
- Add `"file-array"` to `FieldTypeSchema` (post the `"string-array"` precedent).
- Value type written by the renderer: `FileRef[]` — never JSON string, never CSV.
- Renderer is a separate React file: `FileRefArrayField.tsx`.
- Optional `fileArrayMaxItems` (mirrors `stringArrayMaxItems`) for UI hint; runtime schema is authoritative.

**Option B — extend `file` with `multiple: true`.**
- Reuses one FieldType; renderer branches on `field.multiple`.
- Mixed semantics: today's `file` writes a `string` (paste-FileRef-id fallback); array form would write `FileRef[]`. So `file` with `multiple: true` would write a different value type than `file` with `multiple: false`. The same FieldType with two value shapes is exactly the trap `string-array` avoided in Slice 3.13.

**Option C — `array` meta wrapper around an inner field type.**
- Generic enough to subsume `string-array`, future `number-array`, `file-array`. Big-bang refactor of an already-shipped pattern (`string-array`) for a single new consumer.
- Disproportionate scope for one provider field.

### 3.2 Recommendation: Option A

Dedicated `file-array` FieldType:

- Mirrors `string-array` exactly (precedent already accepted, tested, shipped).
- Keeps value-type semantics one-to-one with FieldType — readers of `field.type === "file-array"` immediately know the renderer writes `FileRef[]`.
- Leaves the existing single-value `file` placeholder untouched; that field's UX can evolve independently in a later slice without coupling to the array case.
- Future array-shaped FieldTypes (number-array, object-array, …) follow the same precedent without a wrapper-vs-dedicated decision.

### 3.3 Contract patch sketch (for the follow-up implementation slice — not in this slice)

```ts
// contracts/actionMeta.ts (sketch — DO NOT implement in this slice)

export const FieldTypeSchema = z.enum([
  "text",
  "textarea",
  "select",
  "combobox",
  "keyvalue",
  "number",
  "boolean",
  "file",
  "cron",
  "router-routes",
  "string-array",
  "file-array",     // ← new
]);

// FieldMeta gains:
//   fileArrayMaxItems: z.number().int().positive().max(64).optional(),
// (smaller cap than string-array's 256 — file lists in real workflows
// are bounded by per-provider attachment-size policies; 64 is a UI
// hint, not a runtime cap, and the cap mirrors Outlook Graph's 25 MB
// total combined with realistic 200-500 KB attachments.)
//
// FieldMetaSchema.superRefine gains:
//   if (field.fileArrayMaxItems && field.type !== "file-array") {
//     ctx.addIssue({ ... "`fileArrayMaxItems` is only valid on `file-array` fields." });
//   }
```

No new `OutputType` arm is needed today — producers like `get_attachment` emit a single `FileRef`, not an array.

---

## 4. Renderer UX

### 4.1 Visual model

The renderer is a chip list (Slice 3.13's `StringArrayField` is the visual reference, adapted for FileRef tokens):

```
┌ Attachments ─────────────────────────────────────────────────┐
│                                                              │
│  [ logo.png ✕ ]  [ Q4-report.pdf ✕ ]  [ 📎 {{getAtt.file}} ✕ ]│
│                                                              │
│  ┌────────────────────────────────────────────┐  ┌────────┐  │
│  │ Insert {{previousAction.file}}…            │  │ + Add  │  │
│  └────────────────────────────────────────────┘  └────────┘  │
│                                                              │
│  Add attached files by inserting upstream FileRef outputs    │
│  from the variable picker. 25 MB combined cap; 3 MB per file.│
└──────────────────────────────────────────────────────────────┘
```

### 4.2 States

| State                 | Render                                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Empty**             | Helper text below the input row: "Insert upstream FileRef outputs via the variable picker." Input row + Add button still visible.                               |
| **One or more chips** | Chip row above the input. Each chip: paperclip icon + filename (or token shorthand for unresolved variables) + ✕ remove button.                                 |
| **Disabled**          | Chips render with reduced opacity; ✕ removed; input row + Add button hidden; existing chips remain visible (so the author can see the current state).           |
| **Validation error**  | Standard FieldShell error row. Error text comes from the resolved-config Zod parse on save; the renderer itself does only shape sanity checks (see §5.2).       |
| **At cap**            | Add button disabled; helper text swaps to "Max 25 files." `fileArrayMaxItems` is a UI hint; the runtime schema's per-provider cap stays authoritative.          |

### 4.3 Chip token shapes

A chip can render either of two FileRef sources:

1. **Variable token** — `{{nodeId.path}}` where the upstream output is `producesFileRef: true`. Display: paperclip + token shorthand (`{{getAtt.file}}`). This is the primary path — most attachments come from upstream actions (`get_attachment`, `download_file`, …).
2. **Literal FileRef id** — a paste-FileRef-id string fallback that mirrors today's single `file` field. Display: paperclip + filename if the literal parses as a FileRef shape, otherwise the literal id verbatim. Pasting a literal FileRef object is rare in author workflows and stays a power-user escape hatch.

Renderer does NOT attempt to resolve `{{nodeId.path}}` references to actual filenames at design time. Resolution happens at runtime against `workflow_runs.steps`; the variable picker preview (Slice 3.9) already shows latest values without resolving tokens.

### 4.4 Inserting via the variable picker (deferred to a later slice; design only here)

Today the variable picker inserts the canonical `{{nodeId.path}}` token into whichever field is focused. For `file-array`, the existing insert flow needs ONE adaptation:

- When the focused field's `type === "file-array"` AND the picked output's `type === "fileRef"`, insertion appends a **new chip** rather than text-replacing the input value.
- When the picked output is NOT `type === "fileRef"`, the picker still inserts (text mode); the resolved-config Zod parse rejects the non-FileRef value at save time. The picker does NOT pre-filter — it stays general-purpose. (Type-aware filtering can come later — see §6 — but it is a follow-up to this slice, not a blocker.)

This is the only variable-picker change needed. The picker's selection logic does not change.

### 4.5 Add-button interaction

The Add button shows a small popover with two options:
1. "Insert variable…" — opens the existing variable picker scoped to the focused field.
2. "Paste FileRef id…" — toggles the input row into a paste-text mode (mirrors today's single `file` field placeholder UX).

Single-button trigger keeps the chip shape consistent with `string-array` (which only has one input mode). Whether to consolidate the two modes into one input that detects token-vs-literal is a renderer-detail decision the implementation slice can revisit.

---

## 5. Write semantics

### 5.1 Value shape on disk

- The renderer writes `FileRef[]` directly into `pendingNodes[].config[fieldName]` via `useConfigSlice.getState().updateField`.
- Never JSON-encoded. Never CSV. Never base64. The runtime schema (`z.array(FileRefSchema)`) is authoritative.
- An empty list is `[]`, NOT omitted. If the field is untouched and optional, the renderer leaves it `undefined` (mirrors `StringArrayField` chip semantics: a never-touched chip field never manufactures `[]`).

### 5.2 In-renderer validation (light)

The renderer runs *only* the cheap shape sanity checks needed to give immediate feedback:

- Variable token chips: regex-validate the `{{nodeId.path}}` token shape via the existing `parseReference` / `formatReference` helpers (already used by Slice 3.7).
- Literal-paste chips: best-effort parse against `FileRefSchema` using a `safeParse` call. On failure, show the chip with a small warning badge but keep it in the list (the user might be mid-edit). The save-time Zod parse remains the authoritative reject.

The renderer NEVER fabricates a `kind`, `provider`, `url`, `storagePath`, `name`, or `mimeType`. Those come from the upstream output or the literal-paste payload.

### 5.3 No client-side resolution

The renderer does not attempt to fetch / sign / resolve any URL. Signed-URL minting happens server-side at handler-execution time (e.g. Airtable `add_attachment` mints a signed URL from a `v2_storage` ref inside the handler). The builder writes only the symbolic reference.

---

## 6. Variable picker integration

### 6.1 Scope for this slice

**Out of scope for this slice (design only).** The follow-up implementation slice for `file-array` itself will land the minimal change in §4.4 (route fileRef outputs to chip-append when the focused field is `file-array`). Nothing more.

### 6.2 Future iterations (NOT this plan)

A later, separate slice could add:
- Type-aware filtering: only show `fileRef`-typed outputs when the focused field is `file-array`.
- A dedicated "FileRef sub-picker" UX where producers like `gmail:get_attachment` expose drill-down into the FileRef's own shape (`{{getAtt.file.name}}`, `{{getAtt.file.mimeType}}`, …). The producer's `outputs[]` already supports nested fields via `OutputMeta.fields`, so this is rendering polish, not contract work.
- Drag-and-drop reordering of chips.

These are explicitly NOT prerequisites for shipping `file-array`. The chip renderer + canonical `{{nodeId.path}}` token + existing picker insertion path is enough end-to-end.

---

## 7. Metadata changes needed later

The contract + renderer slice does not change any provider metadata. A **separate follow-up slice per provider** adds the field. Predicted shape for the Outlook canonical case:

```ts
// integrations/microsoft-outlook/actions/sendEmail.meta.ts (follow-up slice — NOT this slice)
{
  name: "attachments",
  label: "Attachments",
  description:
    "Optional file attachments. Insert upstream FileRef outputs (e.g. gmail:get_attachment, slack:download_file) via the variable picker. 25 MB combined cap; 3 MB per file (handler-side).",
  type: "file-array",
  required: false,
  fileArrayMaxItems: 25,
}
```

And on the Outlook `send_email` integration test, the FileRef metadata-boundary assertion changes:
```ts
// Before (Slice 3.18 reality):
expect(outlookSendEmailMeta.fields.find((f) => f.name === "attachments"))
  .toBeUndefined();

// After (follow-up slice):
expect(outlookSendEmailMeta.fields.find((f) => f.name === "attachments"))
  .toEqual(expect.objectContaining({ type: "file-array" }));
```

Gmail send/reply/draft meta upgrades are gated on the matching Gmail 2.3 runtime work landing first (the runtime schemas reject `attachments` today).

---

## 8. Testing plan

### 8.1 Contract tests

Add cases to `tests/unit/contracts/actionMeta.test.ts`:

- `file-array` is a valid FieldType.
- `fileArrayMaxItems` is rejected on non-`file-array` types (mirrors `stringArrayMaxItems`'s superRefine guard).
- Duplicate field-name and dependsOn-references-unknown-field rules continue to apply to `file-array`.

### 8.2 Renderer unit tests

New file: `tests/unit/features/workflow-builder/config-modal/fields/FileRefArrayField.test.tsx`. Mirrors `StringArrayField.test.tsx`:

- Empty state renders helper text + Add button.
- Chips render for existing FileRef-shape values.
- Add via paste-text fallback appends a chip.
- Remove (✕) drops the chip and re-emits the trimmed `FileRef[]`.
- Cap state disables the Add button when `value.length >= fileArrayMaxItems`.
- Disabled state hides the Add button + ✕.
- Missing-mimeType / malformed-paste chips render with a warning badge but stay in the list.
- The renderer NEVER manufactures `[]` on untouched mounts when `value` is `undefined`.

### 8.3 Integration test (once Outlook meta upgrade lands)

New file: `tests/integration/features/workflow-builder/outlook-send-email-attachments.test.tsx`. Mirrors Slice 3.18's `outlook-send-email-config.test.tsx`:

- Adds a manual trigger + a `microsoft-outlook:send_email` action.
- Adds an upstream `gmail:get_attachment` action so a FileRef-producing variable is in the picker.
- Opens the Outlook config; inserts the upstream FileRef token into the `attachments` field via the variable picker.
- Modal Save writes the chip array as `FileRef[]`-shaped tokens into `pendingNodes[].config.attachments`.
- Toolbar Save persists the same shape through `updateWorkflow`.
- `attachments: []` is NEVER manufactured for an untouched field (regression guard).

### 8.4 Variable-picker insertion test

New case in `tests/integration/features/workflow-builder/variable-picker-flow.test.tsx`:

- Focused field is `file-array`. Picker insertion of a `producesFileRef: true` output appends a chip (not a text replacement).
- Focused field is `text`. Same picker insertion is text-inserted as today (no behavior change).

### 8.5 Structure / discovery tests

`tests/unit/contracts/actionMeta.test.ts` already validates ActionMeta shapes; `tests/structure/integration-manifests.test.ts` validates every provider's metas at module load. Both pick up the new FieldType automatically once the registry imports it.

---

## 9. Risks

1. **FileRef object shape complexity.** A `FileRef` is a 3-arm discriminated union with up to 9 fields per arm. Mishandling it in the renderer (string-coerce, lose arm discriminator, drop `kind`) breaks the runtime parse and is a silent footgun until the workflow runs. Mitigation: renderer NEVER constructs `FileRef` literals; it stores either canonical `{{...}}` tokens or pasted JSON whose only operation is `JSON.parse` + `FileRefSchema.safeParse`. No field-by-field construction.
2. **Secret / URL leakage.** `provider_url`-arm refs carry provider-issued URLs that may be token-protected; `signed_url`-arm refs carry temporarily-fetchable URLs that should not be cached anywhere outside the run record. Mitigation: the renderer displays `name` (filename) only by default, not `url` / `storagePath`. Workflow JSON view + variable picker tooltips redact URL-shaped strings the same way they redact other sensitive values today.
3. **Confusing producer vs consumer.** A field expects `FileRef[]` (consumer side) but the variable picker offers a single `fileRef` output (producer side). The chip-append behavior in §4.4 wraps the single ref into a one-element append — the contract reads as "insert THIS file as one chip in the list," which matches the user mental model. Misuse where the author tries to insert an *array* output into a `file-array` field is rejected at save (the resolved-config Zod parse rejects nested arrays); no special renderer logic needed.
4. **`provider_url` arm forwarding gap.** Several handlers (Outlook `send_email`, Airtable `add_attachment`) reject the `provider_url` arm at runtime because cross-provider URL fetching isn't supported. The renderer cannot prevent the author from pasting a `provider_url` literal — that one fails at save with the standard config-failure shape. The renderer's helper text mentions that upstream `get_*` actions yield `v2_storage` refs, the preferred path.
5. **Disabled vs runtime cap mismatch.** The renderer's `fileArrayMaxItems` UI hint can drift from the handler's authoritative cap. Mitigation: handler's resolved-config Zod parse is authoritative; renderer cap is a UX nudge labeled as such.

---

## 10. Recommended implementation sequence

Each step is its own slice and ships independently.

1. **Plan (this doc).** Locked.
2. **Contract + renderer.** Add `"file-array"` to `FieldTypeSchema`, add `fileArrayMaxItems` + its superRefine guard. Build `FileRefArrayField.tsx` mirroring `StringArrayField.tsx`. Register in `_registry.ts`. Add contract tests + renderer unit tests.
3. **Variable picker chip-append integration.** Minimal: route `producesFileRef`/`type === "fileRef"` insertions into a chip-append path when the focused field is `file-array`. Integration test covers this branch.
4. **Outlook `send_email.attachments` meta upgrade + integration test.** Drop the field into `sendEmailMeta.fields[]`. Update the existing Slice 3.18 assertion that asserts `attachments` is absent → assert it is `file-array`. Add the new `outlook-send-email-attachments.test.tsx` integration test.
5. **Gmail 2.3 attachments slice** — separate, gated on runtime schema update (per-action, four handlers). NOT this plan's scope; only call out when the runtime work lands.
6. **Single-FileRef metas (Airtable / Slack file actions)** — independent. Their FieldType is the existing `file`, not `file-array`. Out of scope here.

---

## 11. Explicit out-of-scope

This plan does NOT cover and the implementation slice MUST NOT bundle:

- **Async file upload UI.** Drag-drop a local file into the chip list, upload to `v2_storage` bucket, get back a `v2_storage` FileRef. Real product feature, separate slice (probably a P-S4 or builder-3.30+ surface).
- **Storage picker.** Browsing existing `workflow-files` bucket entries and picking one. Separate slice.
- **Signed-URL minting from the renderer.** Handlers mint URLs at runtime; the builder never touches the storage primitive.
- **Runtime provider changes.** Gmail 2.3 runtime attachment work is its own slice; this plan does NOT modify any `*.schema.ts` or `*.ts` handler file.
- **Variable-picker implementation changes beyond the minimal chip-append branch.** Type-aware filtering, drag-reorder, and sub-FileRef-field drilling are later slices.
- **Gmail send/reply attachment metadata.** Cannot ship until the matching `gmail:send_email.schema.ts` / `gmail:reply_to_email.schema.ts` / `gmail:create_draft.schema.ts` / `gmail:create_draft_reply.schema.ts` accept `attachments`.
- **Single-`file` FieldType upgrade.** The existing paste-FileRef-id placeholder UX stays as-is until a separate slice replaces it with a chip + variable-picker integration. Decoupling array vs single keeps each slice small.
- **Provider-specific attachment behaviors.** Per-provider size caps, MIME validation, encoding rules — those live in the handler schema + handler code. The renderer is provider-agnostic.

---

## 12. Decisions locked by this plan

- D-FRA-1: New dedicated FieldType `"file-array"`. No `file` + `multiple` reuse. (Mirrors Slice 3.13 string-array precedent.)
- D-FRA-2: Value type on disk is `FileRef[]`. Never JSON-encoded / CSV / base64.
- D-FRA-3: Empty untouched optional field stays `undefined`, NOT `[]`. (Matches `string-array` semantics.)
- D-FRA-4: New optional FieldMeta hint `fileArrayMaxItems` (cap 64). Runtime schema authoritative on the real cap.
- D-FRA-5: Variable picker insertion appends a chip when the focused field is `file-array` AND the inserted output is `type === "fileRef"`. Otherwise text-insert (no behavior change).
- D-FRA-6: Renderer does NOT pre-filter the variable picker. Type-aware filtering is a follow-up.
- D-FRA-7: Renderer NEVER constructs `FileRef` object literals field-by-field. Only canonical `{{...}}` tokens or pasted JSON parsed against `FileRefSchema`.
- D-FRA-8: First and only consumer in the implementation arc is `microsoft-outlook:send_email.attachments`. Gmail 2.3 metas land independently after their runtime work.
- D-FRA-9: No new `OutputType` arm in this slice. Producer outputs stay single `fileRef`.
- D-FRA-10: Disabled state shows existing chips with the ✕ + input row hidden; never hides the value itself.
