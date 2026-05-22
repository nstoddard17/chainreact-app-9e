# Phase 3 — Builder Metadata Coverage Checkpoint

**Status:** Checkpoint snapshot as of `f0aa79e74` (Slice 3.27 Slack upload_file). Doc-only.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Companion plans:** [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md).

This is a CEO-level snapshot of where Phase-3 Builder UI metadata stands across all V2 providers, what's missing, and what should happen next. Every claim below was verified by reading the live registry, `services/execution/handlers/_registry.ts`, the `integrations/` tree, and the discovery test suite — not from memory.

---

## 1. Completed Builder infrastructure

### 1.1 Contracts (`contracts/`)

- **`actionMeta.ts`** — `ActionMetaSchema`, `FieldTypeSchema` (12 variants), `FieldMetaSchema` (incl. `dependsOn`, `optionsSource`, `numeric`, `multiple`, `stringArrayMaxItems`, `fileArrayMaxItems`), `OutputTypeSchema` (incl. `"fileRef"`), `ActionCategorySchema` (14 categories). Strict mode + Zod `superRefine` invariants (e.g. `multiple` only on select/combobox, `fileArrayMaxItems` only on file-array).
- **`triggerMeta.ts`** — `TriggerMetaSchema`, activation/payloadShape, parallel `payloadShape` items typed via `OutputMeta`.
- **`file.ts`** — `FileRefSchema` (3-arm discriminated union: `provider_url` / `v2_storage` / `signed_url`), strict per-arm.

### 1.2 Discovery layer

- **`services/discovery/_registry.ts`** — hand-maintained module-load-validated registry. Imports each meta explicitly; rejects duplicate keys at module load; freezes lookup maps.
- **`services/discovery/`** accessors — `listAllActionMetas`, `listActionMetasForProvider`, `getActionMeta`, mirrored for triggers. Sort by `(displayOrder asc, displayName asc)`.
- **`app/api/providers/[id]/actions`** + **`app/api/providers/[id]/triggers`** routes return JSON with shape matching the contract.
- **`lib/api/discovery.ts`** — typed client for the builder UI.
- **`services/execution/handlers/_registry.ts`** — handler registry that the structure tests pair 1:1 against the meta registry for `COVERED_PROVIDERS`.

### 1.3 Builder UI shell (`features/workflow-builder/`)

| Surface | File(s) | State |
| --- | --- | --- |
| Top-level shell | [`WorkflowBuilder.tsx`](../../../features/workflow-builder/WorkflowBuilder.tsx) | Shipped |
| Canvas (ReactFlow) | [`canvas/WorkflowCanvas.tsx`](../../../features/workflow-builder/canvas/WorkflowCanvas.tsx), [`canvas/NodeList.tsx`](../../../features/workflow-builder/canvas/NodeList.tsx), [`canvas/adapters.ts`](../../../features/workflow-builder/canvas/adapters.ts), [`canvas/nodes/WorkflowNodeView.tsx`](../../../features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx) | Shipped (Slice 3.5) — graphSlice is source of truth |
| Picker panels | [`panels/TriggerPicker.tsx`](../../../features/workflow-builder/panels/TriggerPicker.tsx), [`panels/ActionPicker.tsx`](../../../features/workflow-builder/panels/ActionPicker.tsx), [`panels/AddNodeMenu.tsx`](../../../features/workflow-builder/panels/AddNodeMenu.tsx) | Shipped |
| Run / lifecycle | [`panels/LifecycleActions.tsx`](../../../features/workflow-builder/panels/LifecycleActions.tsx), [`panels/RunNowPanel.tsx`](../../../features/workflow-builder/panels/RunNowPanel.tsx), [`panels/RunResultsPanel.tsx`](../../../features/workflow-builder/panels/RunResultsPanel.tsx), [`panels/RunHistory.tsx`](../../../features/workflow-builder/panels/RunHistory.tsx) | Shipped |
| Config modal shell | [`config-modal/ConfigModalShell.tsx`](../../../features/workflow-builder/config-modal/ConfigModalShell.tsx), [`config-modal/SchemaForm.tsx`](../../../features/workflow-builder/config-modal/SchemaForm.tsx) | Shipped |
| State slices | [`state/graphSlice.ts`](../../../features/workflow-builder/state/graphSlice.ts), [`state/configSlice.ts`](../../../features/workflow-builder/state/configSlice.ts), [`state/runSlice.ts`](../../../features/workflow-builder/state/runSlice.ts) | Shipped |
| Discovery / variable hooks | [`hooks/useNativeActions.ts`](../../../features/workflow-builder/hooks/useNativeActions.ts), [`hooks/useNativeTriggers.ts`](../../../features/workflow-builder/hooks/useNativeTriggers.ts), [`hooks/useProviderActions.ts`](../../../features/workflow-builder/hooks/useProviderActions.ts), [`hooks/useProviderTriggers.ts`](../../../features/workflow-builder/hooks/useProviderTriggers.ts), [`hooks/useUpstreamVariables.ts`](../../../features/workflow-builder/hooks/useUpstreamVariables.ts), [`hooks/useActiveNodeUpstreamVariables.ts`](../../../features/workflow-builder/hooks/useActiveNodeUpstreamVariables.ts), [`hooks/useLatestRunPolling.ts`](../../../features/workflow-builder/hooks/useLatestRunPolling.ts) | Shipped |

### 1.4 Field renderer registry (`features/workflow-builder/config-modal/fields/`)

12 FieldType variants → 12 renderers, all registered + tested:

| FieldType | Renderer | Slice |
| --- | --- | --- |
| `text` | `TextField.tsx` | 3.1 / 3.7 (picker) |
| `textarea` | `TextareaField.tsx` | 3.1 / 3.7 (picker) |
| `select` | `SelectField.tsx` | 3.1 / 3.19 (Radix Select test helper) |
| `combobox` | `ComboboxField.tsx` | 3.1 |
| `keyvalue` | `KeyValueField.tsx` | 3.1 |
| `number` | `NumberField.tsx` | 3.1 |
| `boolean` | `BooleanField.tsx` | 3.1 |
| `file` | `FileField.tsx` | 3.1 (placeholder) → **3.25 upgrade** (chip + picker + replace) |
| `cron` | `CronField.tsx` | 3.1 |
| `router-routes` | `RouterRoutesField.tsx` | 3.6 |
| `string-array` | `StringArrayField.tsx` | 3.13 |
| `file-array` | `FileRefArrayField.tsx` | **3.21** (contract+renderer) / **3.22** (picker chip-append) |

Supporting infra:

- [`config-modal/fields/FieldShell.tsx`](../../../features/workflow-builder/config-modal/fields/FieldShell.tsx) — shared label/required/description/error wrapper.
- [`config-modal/fields/VariablePickerButton.tsx`](../../../features/workflow-builder/config-modal/fields/VariablePickerButton.tsx) + [`VariablePickerPopover.tsx`](../../../features/workflow-builder/config-modal/fields/VariablePickerPopover.tsx) — Slice 3.7 picker.
- [`config-modal/fields/_fileRefEntry.ts`](../../../features/workflow-builder/config-modal/fields/_fileRefEntry.ts) — Slice 3.25 shared helpers (`isExactToken`, `tryParseFileRef`, `entryKey`, `entryLabel`, `coerceFileRefArray`, `coerceSingleFileRef`) used by both `FileField` and `FileRefArrayField`.
- [`config-modal/fields/_insertAtCursor.ts`](../../../features/workflow-builder/config-modal/fields/_insertAtCursor.ts) — cursor-position insertion helper for text-style fields.
- [`config-modal/fields/_variableValidator.ts`](../../../features/workflow-builder/config-modal/fields/_variableValidator.ts) — design-time `{{...}}` reference validation.
- [`config-modal/fields/_routesValidator.ts`](../../../features/workflow-builder/config-modal/fields/_routesValidator.ts) — router-routes validator.

### 1.5 Test infrastructure additions

- Slice 3.19 — [`tests/integration/features/workflow-builder/helpers/selectField.ts`](../../../tests/integration/features/workflow-builder/helpers/selectField.ts) (`selectFieldOption` helper) + `jest.setup.ts` polyfills for `hasPointerCapture` / `setPointerCapture` / `releasePointerCapture` / `scrollIntoView` so Radix Select interaction works through `userEvent` in jsdom.
- Slice 3.25 — `tests/unit/features/workflow-builder/config-modal/fields/_fileRefEntry.test.ts` for pure helpers.
- 788/788 suites, **8319/8319 tests** as of `f0aa79e74`.

---

## 2. Providers with complete metadata coverage

`COVERED_PROVIDERS` in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) enforces 1:1 handler ↔ meta coverage for these — adding a runtime handler in any of them without a meta fails the structural test:

| Provider | Action handlers | Action metas | Trigger handlers | Trigger metas |
| --- | --- | --- | --- | --- |
| **native** | 3 (`http_request`, `format_transformer`, `delay`) + 2 logic (`if_then_condition`, `router`) registered as metas | 5 | 0 (manual + scheduled are activation-only) | 2 |
| **github** | 6 | 6 | 1 (`new_commit`) | 1 |
| **gmail** | 13 | 13 | 3 (`new_email`, `new_labeled_email`, `new_attachment`) | 3 |
| **microsoft-outlook** | 9 | 9 | 3 (`new_email`, `email_sent`, `email_flagged`) | 3 |

These four providers are "metadata-complete" in the V2 sense: a user can browse the entire shipped runtime surface from inside the builder picker.

---

## 3. Providers with partial metadata coverage

| Provider | Action handlers | Action metas | Trigger handlers | Trigger metas | Gap |
| --- | --- | --- | --- | --- | --- |
| **slack** | 31 | **2** (`download_file`, `upload_file`) | global-webhook activation (no per-trigger `index.ts`) | 10 | 29 action metas missing (messaging, channels, reactions, scheduled, search, user/channel info, files-info/get-file-info, etc.) |

Slack is intentionally NOT in `COVERED_PROVIDERS`. Triggers are complete. Action coverage is partial-by-design — the FileRef arc (Slices 3.26 / 3.27) only needed `download_file` (producer) + `upload_file` (consumer) to validate the single-FileRef FileField + the upgraded variable picker chip flow.

---

## 4. Providers with zero metadata that still ship a runtime surface

Every row below has a manifest in `integrations/_registry.ts` AND registered handlers in `services/execution/handlers/_registry.ts`, but ZERO metas in `services/discovery/_registry.ts`. The builder shows no actions / no triggers for them today.

| Provider | Action handlers | Trigger handlers | Notes / business priority |
| --- | --- | --- | --- |
| **hubspot** | 26 | 1 | Largest single missing surface. CRM core for any sales-flavored workflow. |
| **stripe** | 16 | 1 | Commerce + billing — high direct revenue relevance, but most workflows that use Stripe are reactive (webhook → action) so meta coverage matters but triggers are already runtime-only. |
| **notion** | 16 | 0 | Big knowledge-base provider — pages / databases / blocks. |
| **mailchimp** | 14 | 7 | Lots of trigger handlers but no metas — marketing automation flows are blocked at the builder UI. |
| **shopify** | 11 | 1 | Commerce. |
| **google-sheets** | 11 | 2 | High-frequency workflow surface for data ops. |
| **airtable** | 11 | 1 | Records + attachments. Plan §6.3 of [`single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md) explicitly defers `airtable:add_attachment` until broader Airtable coverage lands. |
| **microsoft-excel** | 10 | 5 | Symmetric Microsoft equivalent of Google Sheets. |
| **trello** | 8 | 6 | Card-based PM workflows. |
| **microsoft-onedrive** | 7 | 1 | File storage; the `provider_url` arm of FileRef cross-references here. |
| **microsoft-teams** | 5 | 1 | Channel messaging mirror of Slack. |
| **google-calendar** | 5 | 1 | Calendar + scheduling. |
| **google-drive** | 5 | 1 | File storage mirror of OneDrive. |
| **microsoft-outlook-calendar** | 5 | 1 | Sibling of `microsoft-outlook` mail provider. |

**Total uncovered action surface: 150 handlers across 14 providers.** This is the headline number for "how much builder UI is invisible today."

---

## 5. Current `COVERED_PROVIDERS`

```ts
// tests/structure/discovery-meta-coverage.test.ts
const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
]);
```

The list expands as a provider crosses the "every registered handler has a meta" line. Slack will join when its remaining 29 action metas land. Any other provider joins when ALL its action + trigger handlers carry metas.

---

## 6. Rationale for not expanding Slack `COVERED_PROVIDERS` yet

- Slack's runtime surface today is 31 actions + 10 trigger metas + 1 file_uploaded trigger handler.
- 29 of those 31 actions have NO meta. Adding `slack` to `COVERED_PROVIDERS` would fail the "every registered handler in a covered provider has an ActionMeta entry" structural test immediately.
- The Slice 3.24 plan + Slice 3.26 / 3.27 commits deliberately ship partial coverage for the **FileRef workflow arc** without committing to the broader Slack surface. That's the right discipline — `COVERED_PROVIDERS` should mean "this provider is metadata-complete," not "this provider has something in the picker."

---

## 7. Current high-value user flows now supported or nearly supported

Verified by reading existing integration tests in [`tests/integration/features/workflow-builder/`](../../../tests/integration/features/workflow-builder/):

| Flow | Status | Verifier |
| --- | --- | --- |
| Native trigger + action config | ✅ Shipped | `native-node-config.test.tsx` |
| Native Router routes editor | ✅ Shipped | `native-router-routes-editor.test.tsx` |
| Gmail trigger config (string-array + chip) | ✅ Shipped | `gmail-new-email-string-array.test.tsx`, `gmail-provider-trigger-config.test.tsx` |
| Gmail `send_email` (string-array recipients, signatures, labels) | ✅ Shipped | `gmail-send-email-config.test.tsx` |
| Outlook `send_email` (recipients, isHtml, importance Q11) | ✅ Shipped | `outlook-send-email-config.test.tsx` |
| Outlook `send_email.attachments` (file-array via picker) | ✅ Shipped | `outlook-send-email-attachments.test.tsx` |
| Slack `download_file` ⇒ Outlook `send_email.attachments` | ✅ Shipped via Slice 3.26 (download_file is now picker-surfaceable as a FileRef output) | Slice 3.26 registry tests + the existing Outlook attachments integration test compose |
| Slack `upload_file` consuming upstream FileRef via FileField | ✅ Shipped | `slack-upload-file-config.test.tsx` |
| Variable picker (text-style insertion) | ✅ Shipped | `variable-picker-flow.test.tsx`, `variable-picker-latest-value.test.tsx` |
| Variable picker chip-append into file-array | ✅ Shipped | `variable-picker-file-array.test.tsx` |
| Latest-run output preview | ✅ Shipped | `latest-run-preview.test.tsx` |
| Slack trigger config (chip arrays, channel filters) | ✅ Shipped | `slack-provider-trigger-config.test.tsx`, `gmail-provider-trigger-config.test.tsx` |
| Canvas ↔ config rail sync | ✅ Shipped | `canvas-config-sync.test.tsx` |
| Native Router routes UX | ✅ Shipped | `native-router-routes-editor.test.tsx` |

---

## 8. Remaining Builder UI gaps

In order from "infrastructure not started" → "polish":

1. **Async `optionsSource` loading.** Contract supports it (`FieldMeta.optionsSource: z.string().min(1).max(128).optional()` in [`contracts/actionMeta.ts:147`](../../../contracts/actionMeta.ts)); ZERO metas use it; both `SelectField.tsx:15` and `ComboboxField.tsx:27` reference it as "lands in Slice 3.4" but Slice 3.4 has not shipped. Required for Slack channel pickers, Notion DB pickers, Google Sheets sheet/range pickers, Airtable base/table pickers, etc. — the entire "resource selector" UX class.
2. **Variable picker type-aware filtering.** D-FRA-6 / D-SFR-10 explicitly deferred. Picker shows all upstream outputs regardless of the focused field's type. Acceptable today; will need addressing when authors regularly hit "I picked the wrong thing and got rejected at execute time."
3. **FileRef sub-field drilling.** Picker can't expand a `fileRef`-typed output into `{{ref.name}}` / `{{ref.mimeType}}` / etc. Comment in `VariablePickerPopover.tsx:40` calls this out explicitly.
4. **Local-file upload UI / storage picker.** Async drag-drop or `<input type="file">` → `v2_storage`. Neither plan ships this.
5. **Field cascading / dependsOn UX polish.** `dependsOn` is in the contract; renderers don't currently auto-clear dependent fields on parent change (the SchemaForm hands the raw values through).
6. **Provider-specific resource selectors.** Slack channel browser, Notion DB browser, Airtable base browser, Google Sheets sheet/range pickers. Each blocked on §8.1 above.
7. **Run / test UX.** Run-now + run-history panels exist (Slice 3.9 + 3.10) but the deeper "run a single node with synthetic inputs," "inspect step outputs," "replay a failed run" surfaces aren't built.
8. **Edge editing UX.** Canvas connects + drags; the edge-condition / on-failure routing UX beyond `native:router` isn't yet exposed.
9. **Template surface.** No template gallery / import path.
10. **AI builder helper / planner.** Out of Phase-3 scope by design.

---

## 9. Recommended next implementation candidates

Ranked by `(unblocked workflow value) × (engineering size sanity check)`. None of these are blocked on each other except as noted.

| Rank | Candidate | Rationale | Approx. size |
| --- | --- | --- | --- |
| 1 | **Slack broader action metadata** (29 remaining: messaging, channels, reactions, scheduling, search, files-info) | Largest provider gap-by-handler-count; provider already exists in builder via triggers; can land incrementally without new infrastructure; flips Slack into `COVERED_PROVIDERS` at the end. Each meta is ~30-80 lines + a registry test stanza. Estimate: 2-3 slices grouped by category (messaging / channels / files-info+misc). |
| 2 | **Async `optionsSource` infrastructure (Slice 3.4 — never shipped)** | Single highest-leverage infra unlock. Without it, every Slack-channel / Notion-DB / Airtable-base / Sheets-sheet selector has to be hand-typed as a `text` field. The unblocking is broad: Slack action coverage gets channel-name typeahead, Airtable gets base-id picker, etc. Touches `useProviderActions`-like hook fan-out, a new `lib/api/options.ts` route, plus `SelectField`/`ComboboxField` async-mode branches. Estimate: 2-3 slices (contract + renderer + first-real consumer). |
| 3 | **Notion metadata batch** | 16 actions, 0 triggers (Notion's webhook story is V1-style). High knowledge-base / docs workflow value. No new field-type needs. |
| 4 | **HubSpot metadata batch** | 26 actions — biggest remaining single chunk. Sales/CRM workflows. Will probably want `optionsSource` for object/list pickers; landing it after #2 reduces meta churn. |
| 5 | **Google Sheets metadata batch** | 11 actions + 2 triggers. Top "data table" workflow surface. Same `optionsSource` dependency as HubSpot for sheet/range pickers — better after #2. |
| 6 | **Stripe metadata batch** | 16 actions. Commerce flows. Most Stripe fields are static / text, so this could ship without `optionsSource`. |
| 7 | **Airtable metadata batch (incl. `add_attachment`)** | 11 actions. Plan §6.3 of single-file-ref doc explicitly gates `airtable:add_attachment` on this slice. |
| 8 | **Trello / Shopify / Mailchimp / Microsoft Excel + OneDrive + Teams metadata batches** | Each meaningful but lower-ROI than #1-#7. Sequence later. |
| 9 | **Type-aware variable picker filtering** | Quality-of-life. Worth doing after >5 providers have FileRef-aware metas so the user-facing benefit shows up in real flows. |
| 10 | **FileRef sub-field drilling** | Same as #9 — sub-field picking becomes valuable only once `fileRef` outputs are pickable across many providers. |

---

## 10. Recommended near-term direction

**Recommendation: ship two foundational infrastructure slices (`optionsSource`-async + Slack-broader-action-batch), THEN do one or two more provider metadata batches, THEN re-checkpoint.**

Reasoning:

- The "provider with no metas" gap is dominant — 14 providers, 150 uncovered action handlers. Most of those metas will need `optionsSource` to be useful (channel pickers, base pickers, sheet pickers). Shipping more metas WITHOUT `optionsSource` produces metas that have to be re-touched later — that's the kind of "design for known immediate need" rework the CLAUDE.md principles flag.
- Slack is the cleanest first batch because (a) the provider is already half-exposed via 10 trigger metas + 2 file action metas, (b) its 29 missing actions don't all need `optionsSource` (most messaging actions take a channel-id which can land as a strict `text` field with picker-typeahead landing later), (c) finishing Slack flips it into `COVERED_PROVIDERS` and demonstrates the "metadata-complete-provider" cadence at a larger scale than gmail/outlook.
- After those two, a single metadata batch (likely Notion or HubSpot) gives concrete signal on whether more provider metas + the existing builder UX is enough for first-shipping the builder, or whether additional infra (type-aware filtering, FileRef sub-field drilling, async resource pickers) needs to come next.
- Defer canvas / edge-condition / run-test UX work until the metadata floor is high enough that a user can build a real workflow. The current Phase-3 surface composes well; the bottleneck is "I picked a provider but my action isn't here" — not "the canvas doesn't draw."

**Alternative direction (briefly considered, NOT recommended):** Pause metadata expansion and move to canvas / edge / run-test polish. Reject this because every existing integration test demonstrates that the canvas + config + run path is functional for the providers that DO have metas. Polishing UX before content arrives produces a beautiful builder with five providers — not what's needed.

---

## 11. Open questions for the next planning conversation

These are decisions worth surfacing explicitly so they don't get punted as "let's see when we get there":

- Should `optionsSource` infrastructure land BEFORE or alongside the Slack broader-action batch? Bundling them keeps Slack metas idiomatic from day one; separating them lets Slack metas ship faster but accepts known rework.
- For provider-trigger surfaces with zero handlers (e.g. Slack file_uploaded uses the global webhook), is the existing "exempt from activation-invariant test" pattern enough, or should the trigger-meta contract gain a `globalWebhookOnly: true` flag so the absence of an `index.ts` is documented at the meta level?
- How do we want to handle the partial-coverage providers in `app/api/providers/[id]/actions` ordering? Today Slack returns `[download_file, upload_file]` by displayOrder. When 29 more land, are the file actions still surfaced at the top, or do they sort into a `files` category section? The route currently doesn't group — it's a flat sorted list. May want a `category` group hint in the response shape.

---

## 12. Snapshot summary

```text
INFRASTRUCTURE:        Complete for the 12 FieldType variants + discovery + canvas + picker.
COMPLETE PROVIDERS:    native, github, gmail, microsoft-outlook (4).
PARTIAL PROVIDERS:     slack (10 trigger metas + 2 file action metas; 29 action gap).
UNCOVERED PROVIDERS:   14 (hubspot, stripe, notion, mailchimp, shopify, google-sheets,
                          airtable, microsoft-excel, trello, microsoft-onedrive,
                          microsoft-teams, google-calendar, google-drive,
                          microsoft-outlook-calendar).
UNCOVERED HANDLERS:    150 actions across the 14 providers above.
TESTS:                 788 suites, 8319 tests, all green at f0aa79e74.
NEXT INFRA UNLOCK:     async optionsSource (Slice 3.4 — never shipped).
NEXT METADATA BATCH:   Slack broader actions (29 → 0 over 2-3 slices, flips Slack into COVERED_PROVIDERS).
```
