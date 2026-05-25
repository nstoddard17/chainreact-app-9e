# Phase 3 — Single-FileRef Metadata + FileField Plan

**Status:** Plan only. No contract / metadata / renderer changes in this slice.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**FileRef contract:** [`docs/slices/p-s3-file-output-contract-plan.md`](../p-s3-file-output-contract-plan.md).
**File-array companion plan:** [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md).

This plan closes out the remaining single-value FileRef metadata gaps (Slack file actions, Airtable `add_attachment`) and decides whether the current `file` FieldType + `FileField` placeholder can carry them or whether a minimal renderer upgrade should land first. The arc parallels Slices 3.21/3.22/3.23 for the array case but keeps single-value semantics separate — the existing `file` FieldType is the right home for these; `file-array` MUST NOT be reused.

---

## 1. Current single-file FieldType state

### 1.1 Contract

- **`contracts/actionMeta.ts`** ships `"file"` in `FieldTypeSchema` (one of the original 11; Slice 3.21 added the 12th, `"file-array"`). The single `"file"` type is **untouched** since the initial Slice 3.0 shape — no `multiple`, no `acceptedKinds`, no `maxSizeBytes`, no `providerUrlAllowed` hints.
- `ActionMeta.producesFileRef` / `consumesFileRef` flags exist and drive the variable-picker file icon. They are NOT type-aware filters at the picker level today (D-FRA-6 deferred that).
- `OutputTypeSchema` includes `"fileRef"` — producers like `gmail:get_attachment` already use it.

### 1.2 Renderer

- **`features/workflow-builder/config-modal/fields/FileField.tsx`** is a 65-line paste-text placeholder:
  - Single `<Input>` accepting a typed string.
  - Helper text reads "File picker / variable FileRef selection lands in Slice 3.7." Slice 3.7 shipped the variable picker but did NOT upgrade FileField — it stayed a paste-text fallback so other slices could ship.
  - No variable picker embedded.
  - No FileRef JSON parsing.
  - No chip / paperclip / filename display.
  - `value` is coerced to a string via `typeof value === "string" ? value : ""` — so a FileRef object literal would be silently rendered as `""` in the UI even though the underlying config holds the object.
- Tests: only one `FileField` case exists, in [`tests/unit/features/workflow-builder/config-modal/fields/text-style-renderers.test.tsx`](../../../tests/unit/features/workflow-builder/config-modal/fields/text-style-renderers.test.tsx) lines 219-238. It asserts the helper text + the labeled input exist. No interaction coverage.

### 1.3 Separation from `file-array`

- `file-array` is its own dedicated type (decision D-FRA-1). The two MUST NOT cross-pollinate:
  - `file` writes a SINGLE value (`FileRef` or `{{nodeId.path}}` token string).
  - `file-array` writes an ARRAY (`Array<FileRef | string>`).
  - Reusing `file` + `multiple: true` for the array case was explicitly rejected; same trap applies in reverse — `file-array` MUST NOT be repurposed for single-value slots.

---

## 2. Runtime surfaces consuming or producing single FileRef

### 2.1 Producers — emit a single `FileRef` output

| Key | Runtime output | Meta shipped? | Builder coverage |
| --- | --- | --- | --- |
| `gmail:get_attachment` | `{ file: FileRef, messageId, attachmentId, fileName, mimeType, sizeBytes }` | YES | `outputs[0] = { name: "file", type: "fileRef" }`, `producesFileRef: true`. Picker shows fileRef chip. **No action needed.** |
| `microsoft-outlook:get_attachment` | Same shape, provider="microsoft-outlook" | YES | Same pattern. **No action needed.** |
| `slack:download_file` | `{ file: FileRef, fileId, fileName, mimeType, sizeBytes }` | **NO** | No `.meta.ts`. Handler is registered in `services/execution/handlers/_registry.ts` but the builder cannot surface it. |

Producers do NOT need a `file` config field; they just declare `outputs[0]: { type: "fileRef" }` + `producesFileRef: true`. The picker side already supports them via the established `get_attachment` pattern. So `slack:download_file` is **the only producer gap**, and it doesn't need any FileField change.

### 2.2 Consumers — accept a single `file: FileRefSchema` config field

| Key | Runtime config | Meta shipped? | Notes |
| --- | --- | --- | --- |
| `slack:upload_file` | `{ channel, file: FileRefSchema, title?, initialComment?, threadTs? }` | **NO** | Handler rejects `kind=provider_url` arms at runtime (cross-provider URL fetch unsupported per P-S3 §10 #1). |
| `airtable:add_attachment` | `{ baseId, tableIdOrName, recordId, fieldName, file: FileRefSchema, filename? }` | **NO** | Same `provider_url`-arm rejection. Replaces (not appends to) Airtable attachment field. |

These are the only V2 consumers that take a single FileRef in their config schema. Both need a working `type: "file"` field in their meta — and today's FileField is a string-only paste box.

### 2.3 No other single-FileRef surfaces found

`grep`-confirmed scan of `integrations/**/*.ts` for `FileRefSchema` / `FileRef` usage shows the surfaces above plus:
- `integrations/gmail/triggers/newAttachment/extractAttachmentMetadata.ts` — extraction helper used by the trigger; the trigger's `payloadShape` already advertises the FileRef.
- `integrations/microsoft-outlook/api/getAttachment.ts` — internal API helper for the producer.
- `integrations/airtable/actions/_fieldInput.schema.ts` — internal helper for record-field shapes.
- `integrations/native/actions/formatTransformer.ts` — passes through values, no FileRef field of its own.
- `integrations/_shared/airtable/fields.ts` — internal field-value parsers.

None of those introduces a NEW single-FileRef builder field.

---

## 3. Provider-coverage context (real picture before we name a rollout)

A FileRef-only rollout cannot ignore the broader metadata gap around these providers.

| Provider | Action metas shipped | Trigger metas shipped | What single-FileRef rollout means in this provider |
| --- | --- | --- | --- |
| **Slack** | **0** | 10 (Slice 3.11) | Slack appears in the trigger picker but not the action picker at all. Adding 2 file action metas (`upload_file`, `download_file`) would make Slack's action picker non-empty for the first time — but with only 2 file-only entries, no `send_channel_message`, `add_reaction`, `pin_message`, etc. that exist at runtime. |
| **Airtable** | **0** | 0 | Airtable is completely absent from the builder. Adding `add_attachment` would introduce Airtable to the builder via its niche-est action — no `create_record`, `update_record`, `find_record`, `delete_record` (all of which exist at runtime). |

This is product-thinking territory, not just engineering. Shipping `slack:upload_file` + `slack:download_file` as the only Slack actions is awkward. Shipping `airtable:add_attachment` as the only Airtable surface is worse.

Two scope options:
- **Option α (FileRef-first).** Land Slack's two file actions + Airtable's `add_attachment` as isolated metas. Acceptable for Slack (provider already in trigger picker; users see "2 actions" rather than "0 actions"). Awkward for Airtable (it'd be the only Airtable presence).
- **Option β (Bundle with broader provider coverage).** Defer Airtable file action until basic Airtable action coverage (`create_record`, `find_record`, `update_record`, `delete_record`) lands. Slack file actions can ship sooner since the provider already exists in the builder.

Per the brief: "if Airtable has many actions without metadata, do not expand full Airtable coverage yet" — so a broader Airtable coverage slice is NOT part of this arc, but the brief also lets us defer `airtable:add_attachment` until that broader slice happens. We pick **Option β-lite**: Slack file actions ship in this arc; `airtable:add_attachment` defers to the future Airtable action-coverage arc.

---

## 4. Contract direction — recommendation

### 4.1 Keep `"file"` as-is

- No new FieldType. The existing `"file"` covers single-FileRef. `file-array` covers arrays. Two FieldTypes, two value shapes — no overlap.
- No new `multiple` flag for `file`. The contract already forbids `multiple` on non-select/combobox fields, and the file-array precedent intentionally avoided overloading `multiple` semantics.

### 4.2 No new FieldMeta hints in this slice

Brief asked us to consider `acceptedKinds`, `maxSizeBytes`, `providerUrlAllowed`, `helper copy only`. Recommendation: **none of these in this slice**.

- **`acceptedKinds` (`provider_url` / `v2_storage` / `signed_url` arm allowlist).** Tempting because `slack:upload_file` and `airtable:add_attachment` both reject `provider_url` at runtime. But (a) the renderer cannot enforce arm-kind on a `{{nodeId.path}}` token — the upstream value's arm is only known at execute time. (b) the resolved-config Zod parse + handler error already deliver a clear failure message. (c) the brief explicitly says "recommend minimal/no contract change unless the audit proves a real need" — no real bug surfaced yet. **Defer until a future slice has concrete UX feedback.**
- **`maxSizeBytes`.** Slack upload has no documented cap on the handler side beyond what the Slack API enforces. Airtable has Airtable-side caps that are field-config-dependent. Encoding a per-meta byte cap is misleading — neither handler enforces a static number. The file-array case kept this in handler-only territory (`fileArrayMaxItems` is item count, not bytes). Same call for `file`. **Defer.**
- **`providerUrlAllowed`.** Same reasoning as `acceptedKinds`. **Defer.**
- **Helper copy.** Belongs in `FieldMeta.description`, not a new field. The existing description-rendering pipeline is enough.

**Conclusion:** zero contract change in the implementation arc.

---

## 5. Renderer direction — small FileField upgrade

### 5.1 Why the current FileField is not enough

Today's FileField:
1. Renders an Input that coerces non-string `value` to `""` — so a FileRef object literal saved in the workflow JSON would silently appear as an empty field in the UI.
2. Has no variable picker — authors who want to wire `{{gmailAttachment.file}}` into Slack `upload_file.file` have to hand-type the token, no autocomplete, no validation.
3. Has no FileRef JSON parsing — pasting a literal FileRef object body produces a stringified-as-text input.
4. Has no chip / paperclip / filename display — the user sees the raw token or raw JSON, not the filename.

That UX is strictly worse than the file-array case. Single-FileRef consumers (Slack, Airtable) would inherit this worse UX. Shipping the metas before fixing the renderer would mean users see two divergent behaviors for "FileRef in a config field" depending on whether it's array or single — a confusing inconsistency.

### 5.2 Recommended upgrade — mirror FileRefArrayField, single-value semantics

The same primitives. Rendered as a SINGLE chip (or empty placeholder) above a single input row:

- **Empty:** placeholder text + empty chip placeholder + input row with paste-text + Add (or Replace) + variable picker button. Helper text below.
- **One value (chip):** paperclip + filename (or token shorthand) + ✕ remove. Input row disabled or hidden until ✕.
- **Disabled / error:** standard FieldShell behaviors (matches file-array).

Behavior:

- Value type: `string | FileRef | undefined`. Strings are canonical `{{nodeId.path}}` tokens; objects are `FileRefSchema`-valid refs.
- **Coerce on mount:** if the prop value is a valid token OR a valid FileRefSchema parse, render as the chip; otherwise (malformed JSON, empty, non-string non-object) render empty. Filter, don't crash. Never manufacture a value on mount — untouched optional field stays `undefined`.
- **Initial mount no-onChange:** same regression guard as file-array.
- **Add path (single auto-detecting input):** paste token → token chip; else `JSON.parse` + `FileRefSchema.safeParse` → FileRef chip; else silent reject + clear input. Identical detection logic to FileRefArrayField — should be extracted to a shared helper to avoid drift.
- **Variable picker button:** embed the same `VariablePickerButton` next to the input. On insert, **REPLACE** (not append) the value with the canonical token. Single-value semantics.
- **Replace semantics on chip-already-present:** picker insert REPLACES the existing chip without warning (matches text-field text-insert which replaces selected text without warning).
- **Remove (✕):** sets value back to `undefined`. The next picker insert can populate it again.
- **No type-aware picker filtering** (D-FRA-6 inherited).
- **No cap.** Single value — no `fileArrayMaxItems`-equivalent needed.

### 5.3 Shared helper extraction

`isExactToken`, `tryParseFileRef`, and `entryKey` are duplicated between the upgraded `FileField` and `FileRefArrayField`. Extract them into a single file (e.g. `features/workflow-builder/config-modal/fields/_fileRefEntry.ts`) so the two renderers stay in lockstep. Both renderers then import the same parsers.

### 5.4 Scope-fence

The upgrade is intentionally small. Out of scope:
- Local file upload (drag-drop or file-input). Stays a paste-text + picker model.
- Storage browsing. No fetching of `workflow-files` bucket listings.
- Signed-URL minting. The renderer never touches a transport.
- Provider-specific behaviors (per-provider helper copy, etc.).

---

## 6. Metadata rollout

### 6.1 `slack:download_file` — producer, ships first

Builder meta shape (parallels `gmail:get_attachment`):

```ts
// integrations/slack/actions/files/downloadFile.meta.ts (follow-up slice — NOT this slice)
{
  key: "slack:download_file",
  provider: "slack",
  type: "download_file",
  displayName: "Download File",
  description:
    "Download a Slack file by id and stage its bytes as a FileRef in v2 storage. The FileRef is consumable by any downstream action that accepts file inputs.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "fileId",
      label: "File id",
      description: "Slack file id (F-prefixed). Source from the file_uploaded trigger payload or another Slack file action.",
      type: "text",
      required: true,
    },
  ],
  outputs: [
    { name: "file", type: "fileRef", description: "Staged FileRef (kind=v2_storage, provider='slack')." },
    { name: "fileId", type: "string" },
    { name: "fileName", type: "string" },
    { name: "mimeType", type: "string" },
    { name: "sizeBytes", type: "number" },
  ],
  producesFileRef: true,
  consumesFileRef: false,
  displayOrder: 10,
}
```

Does NOT require the FileField upgrade (it's a producer).

### 6.2 `slack:upload_file` — consumer, ships AFTER FileField upgrade

```ts
// integrations/slack/actions/files/uploadFile.meta.ts (follow-up slice — NOT this slice)
{
  key: "slack:upload_file",
  provider: "slack",
  type: "upload_file",
  displayName: "Upload File",
  description:
    "Upload a file to a Slack channel from an upstream FileRef output. Provide a FileRef via the variable picker (e.g. gmail:get_attachment, slack:download_file). Slack's handler rejects FileRef(kind=provider_url) — stage bytes through an upstream get_/download_ action first.",
  category: "files",
  requiresIntegration: true,
  fields: [
    {
      name: "channel",
      label: "Channel",
      description: "Slack channel id (C…/G… for channels, D… for DMs).",
      type: "text",
      required: true,
      placeholder: "C01A1B2C3D4",
    },
    {
      name: "file",
      label: "File",
      type: "file",
      required: true,
      placeholder: "Paste a {{...}} token or FileRef JSON",
    },
    {
      name: "title",
      label: "Title",
      type: "text",
      required: false,
      description: "Optional display title. Falls back to the file's name.",
    },
    {
      name: "initialComment",
      label: "Message",
      type: "textarea",
      required: false,
    },
    {
      name: "threadTs",
      label: "Thread timestamp",
      type: "text",
      required: false,
      description: "Optional Slack thread ts to reply into.",
    },
  ],
  outputs: [
    { name: "file", type: "fileRef" },
    { name: "fileId", type: "string" },
    { name: "permalink", type: "string" },
    { name: "channelIds", type: "array" },
  ],
  producesFileRef: true,
  consumesFileRef: true,
  displayOrder: 20,
}
```

`channel` stays a `text` field for now — a future Slack channel picker (`optionsSource: "slack:channels"`) is its own slice; not bundled here.

### 6.3 `airtable:add_attachment` — defer

Airtable is not in the builder at all today. Shipping `add_attachment` as the only Airtable surface is bad UX. Defer until a basic Airtable action-coverage slice lands (`create_record`, `find_record`, `update_record`, `delete_record` at minimum). That slice should pick up `add_attachment` alongside.

Predicted shape for when it lands (only documented here to lock semantics, not to act on):

```ts
{
  key: "airtable:add_attachment",
  provider: "airtable",
  type: "add_attachment",
  displayName: "Add Attachment to Record",
  description:
    "Replace an Airtable attachment field's contents with a single file. Provide the file via the variable picker. Airtable's handler rejects FileRef(kind=provider_url) — stage bytes through an upstream get_/download_ action.",
  category: "data",
  requiresIntegration: true,
  fields: [
    { name: "baseId", label: "Base id", type: "text", required: true },
    { name: "tableIdOrName", label: "Table id or name", type: "text", required: true },
    { name: "recordId", label: "Record id", type: "text", required: true },
    { name: "fieldName", label: "Attachment field name or id", type: "text", required: true },
    { name: "file", label: "File", type: "file", required: true },
    { name: "filename", label: "Filename override", type: "text", required: false },
  ],
  outputs: [...], // baseId, tableIdOrName, recordId, fieldName, attachmentCount, attachments
  producesFileRef: false,
  consumesFileRef: true,
  displayOrder: 20,
}
```

---

## 7. Testing plan

### 7.1 FileField unit tests (Slice 3.25 — renderer upgrade)

New file: `tests/unit/features/workflow-builder/config-modal/fields/FileField.test.tsx`. The existing single case in `text-style-renderers.test.tsx` is removed / migrated to the new file. Mirrors `FileRefArrayField.test.tsx`:

- Empty / undefined value renders empty chip placeholder + input.
- Existing valid FileRef literal renders a chip with filename.
- Existing valid `{{nodeId.path}}` token renders a chip with token shorthand.
- Non-array / non-string / malformed object value renders empty (no crash, no chip).
- Initial mount with a non-empty value does NOT fire onChange.
- Initial mount with undefined value does NOT fire onChange (no `null`/`undefined` manufacture).
- Paste token → chip.
- Paste FileRef JSON → chip.
- Paste invalid input → silent reject + clear input.
- Picker insert REPLACES existing chip with the new token (single-value semantics).
- ✕ removes the chip and emits `undefined`.
- Disabled state shows chip, hides controls.
- Error renders via FieldShell.
- Placeholder renders.

### 7.2 Shared `_fileRefEntry.ts` helper tests

New file: `tests/unit/features/workflow-builder/config-modal/fields/_fileRefEntry.test.ts`. Pure-function tests for `isExactToken` / `tryParseFileRef` / `entryKey`. Lets both renderers rely on the same parsers.

### 7.3 Integration tests

`tests/integration/features/workflow-builder/slack-upload-file-config.test.tsx` (Slice 3.27):

- Builds a workflow: manual trigger with `payloadShape.file = fileRef` + `slack:download_file` upstream + `slack:upload_file` consumer.
- Opens `slack:upload_file` config; picks an upstream FileRef via the variable picker; chip appears in the `file` field.
- Modal Save writes `file: "{{download.file}}"` into `pendingNodes[].config`.
- Toolbar Save persists the same shape through `updateWorkflow`.
- `channel`, `title`, `initialComment`, `threadTs` round-trip as expected text/textarea values.

`tests/integration/features/workflow-builder/slack-download-file-config.test.tsx` (Slice 3.26):

- Builds a workflow with `slack:download_file` action.
- Asserts the `outputs[0]` is consumable from a downstream config (regression guard via the variable picker).

### 7.4 Discovery registry tests

`tests/unit/services/discovery/_registry.test.ts` gains:

- `slack:download_file` is listed under provider `slack`; `producesFileRef: true`.
- `slack:upload_file` is listed under provider `slack`; `consumesFileRef: true`; `fields[].file.type === "file"`.

### 7.5 No runtime handler tests

The Slack + Airtable handlers already have shipped tests in `tests/unit/integrations/slack/actions/files/**` and `tests/unit/integrations/airtable/**`. The metadata slices do not touch runtime; no new handler tests needed.

---

## 8. Out of scope

- **Local file upload UI.** Drag-drop or `<input type="file">` browse + upload to `v2_storage` bucket → FileRef. Future slice.
- **Storage picker.** Browsing the `workflow-files` bucket. Future slice.
- **Signed-URL minting from the renderer.** Handlers mint URLs at runtime.
- **Provider-specific file pickers.** Slack channel file browser, Airtable attachment browser, etc.
- **Gmail attachment runtime work.** `gmail:send_email.attachments` / `reply_to_email.attachments` etc. are gated on Gmail 2.3 runtime accepting the field; this plan does NOT modify any Gmail schema.
- **Broad Slack action coverage.** Out of scope per brief and per realistic slice sizing.
- **Broad Airtable action coverage.** Same — and this is what gates the `airtable:add_attachment` meta.
- **`FileRefSchema` contract changes.** No new arms, no new fields. The contract is settled.
- **New FieldMeta hints** (`acceptedKinds`, `maxSizeBytes`, `providerUrlAllowed`). Defer until concrete UX feedback proves a need.
- **Variable picker type-aware filtering.** Still deferred. Picker continues to surface all upstream outputs regardless of type (D-FRA-6).
- **`file-array` ↔ `file` cross-renderer reuse.** Stays separate by decision.

---

## 9. Recommended implementation sequence

Each step is its own slice and ships independently.

1. **This plan (Slice 3.24).** Locked.
2. **Slice 3.25 — FileField renderer upgrade.** Extract `_fileRefEntry.ts` helpers. Rewrite `FileField.tsx` to mirror FileRefArrayField (chip + picker, single-value, replace-not-append). Add unit tests. Migrate the existing single FileField case out of `text-style-renderers.test.tsx`.
3. **Slice 3.26 — `slack:download_file` metadata.** Producer; needs no FileField upgrade. Could ship before Slice 3.25, but bundling them keeps the Slack file-actions arc clean.
4. **Slice 3.27 — `slack:upload_file` metadata.** Consumer; depends on Slice 3.25. Adds the matching integration test.
5. **(Later, separate arc) Airtable action coverage** lands `create_record` / `update_record` / `find_record` / `delete_record` / `add_attachment` together. NOT this plan's scope; documented here only so the `add_attachment` shape is locked when it lands.

---

## 10. Decisions locked by this plan

- D-SFR-1: Single FileRef stays on the existing `"file"` FieldType. NO new FieldType.
- D-SFR-2: No new FieldMeta hints (`acceptedKinds` / `maxSizeBytes` / `providerUrlAllowed`) in the implementation arc. Defer until UX feedback proves a need.
- D-SFR-3: `FileField` MUST be upgraded before any single-FileRef consumer meta ships. Upgrade mirrors `FileRefArrayField` with single-value (replace-not-append) semantics.
- D-SFR-4: Shared `isExactToken` / `tryParseFileRef` / `entryKey` helpers extracted into `_fileRefEntry.ts`; both renderers import them to stay in lockstep.
- D-SFR-5: Value type on disk for `file` fields is `string | FileRef | undefined`. Untouched optional fields stay `undefined`. No `null` ever emitted.
- D-SFR-6: Variable picker insertion REPLACES the FileField chip (no append). Mirrors how text-field picker insertion replaces selected text.
- D-SFR-7: Renderer never constructs FileRef object literals field-by-field — same constraint as D-FRA-7 for the array case.
- D-SFR-8: `slack:download_file` ships as the first new single-FileRef meta (producer, no renderer dependency). `slack:upload_file` follows after the FileField upgrade.
- D-SFR-9: `airtable:add_attachment` does NOT ship as a standalone meta. It defers to a future Airtable action-coverage slice that brings the rest of the provider in.
- D-SFR-10: No type-aware variable picker filtering. The picker stays general-purpose; the resolved-config Zod parse + handler error are the authoritative rejection layer for type mismatches.
