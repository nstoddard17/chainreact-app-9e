# Phase 3 — Builder Metadata Coverage Checkpoint

> **⚠️ SUPERSEDED snapshot — note added 2026-05-25 (Slice 4.PROVIDER-DOCS-1).** This is a point-in-time snapshot at **Slice 3.42 (6 covered providers)** and is now **out of date**. Current live state: **17 covered providers** (`native, github, gmail, microsoft-outlook, slack, notion, stripe, google-sheets, hubspot, mailchimp, discord, google-docs, microsoft-onenote, monday, dropbox, facebook, google-analytics`) and **9 pending-metadata launch-scope providers** (`microsoft-excel, airtable, shopify, trello, microsoft-onedrive, microsoft-teams, google-calendar, google-drive, microsoft-outlook-calendar`). Source of truth for "covered" = `COVERED_PROVIDERS` in `tests/structure/discovery-meta-coverage.test.ts`. The current, maintained tracker is [`../phase-4/provider-metadata-launch-gap-tracker.md`](../phase-4/provider-metadata-launch-gap-tracker.md). Read the §2–§5 counts below as historical.

**Status:** Checkpoint snapshot as of `ffbe1fdda` (Slice 3.42 — Notion metadata-complete + COVERED_PROVIDERS flip). Doc-only.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Companion plans:** [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md), [`./options-source-plan.md`](./options-source-plan.md), [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md), [`./notion-action-metadata-plan.md`](./notion-action-metadata-plan.md).

This is a CEO-level snapshot of where Phase-3 Builder UI metadata stands across all V2 providers, what's missing, and what should happen next. Every claim below was verified by reading the live registries (`services/execution/handlers/_registry.ts`, `services/discovery/_registry.ts`, `services/options/_registry.ts`), the `integrations/` tree, and the discovery test suite — not from memory.

---

## 1. Completed Builder infrastructure

### 1.1 Contracts (`contracts/`)

- **`actionMeta.ts`** — `ActionMetaSchema`, `FieldTypeSchema` (12 variants), `FieldMetaSchema` (incl. `dependsOn`, `optionsSource`, `numeric`, `multiple`, `stringArrayMaxItems`, `fileArrayMaxItems`), `OutputTypeSchema` (incl. `"fileRef"`), `ActionCategorySchema` (14 categories). Strict mode + Zod `superRefine` invariants.
- **`triggerMeta.ts`** — `TriggerMetaSchema`, activation/payloadShape, parallel `payloadShape` items typed via `OutputMeta`.
- **`file.ts`** — `FileRefSchema` (3-arm discriminated union: `provider_url` / `v2_storage` / `signed_url`).

### 1.2 Discovery layer

- **`services/discovery/_registry.ts`** — hand-maintained module-load-validated registry. 60+ explicit imports; rejects duplicate keys at module load.
- **`services/discovery/`** accessors — `listAllActionMetas`, `listActionMetasForProvider`, `getActionMeta`, mirrored for triggers. Stable `(displayOrder asc, displayName asc)` sort.
- **`app/api/providers/[id]/{actions,triggers}`** routes — JSON shape matching the contract; typed via [`lib/api/discovery.ts`](../../../lib/api/discovery.ts).
- **`services/execution/handlers/_registry.ts`** — handler registry paired 1:1 against the meta registry for `COVERED_PROVIDERS`.

### 1.3 Async options-source infrastructure (Slices 3.30 → 3.33 — **shipped since the last checkpoint**)

The single biggest infrastructure unlock since the previous snapshot. Closes the long-standing `FieldMeta.optionsSource` gap.

| Layer | File(s) | Slice |
| --- | --- | --- |
| Server-side resolver contract + registry | [`services/options/types.ts`](../../../services/options/types.ts), [`services/options/_registry.ts`](../../../services/options/_registry.ts) | **3.30** |
| API route | [`app/api/options/[source]/route.ts`](../../../app/api/options/[source]/route.ts) | 3.30 |
| Typed client | [`lib/api/options.ts`](../../../lib/api/options.ts) | 3.30 |
| Client hook | [`features/workflow-builder/hooks/useOptionsSource.ts`](../../../features/workflow-builder/hooks/useOptionsSource.ts) — debounced, abortable, refetchable; states `idle / loading / ready / empty / error / disconnected` | **3.31** |
| `ComboboxField` async branch | [`features/workflow-builder/config-modal/fields/ComboboxField.tsx`](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx) | 3.31 |
| First real resolver — Slack channels | [`integrations/slack/options/channels.ts`](../../../integrations/slack/options/channels.ts) | **3.32** |
| `dependsOn` cascade in SchemaForm | [`features/workflow-builder/config-modal/SchemaForm.tsx`](../../../features/workflow-builder/config-modal/SchemaForm.tsx) — clears direct dependent fields on parent change; passes `deps` + `enabled` + `parentLabel` to renderers | **3.33** |
| Integration-test helper | [`tests/integration/features/workflow-builder/helpers/comboboxField.ts`](../../../tests/integration/features/workflow-builder/helpers/comboboxField.ts) — `pickComboboxOption` | 3.32 |

**Resolver registry as of 3.42:** 2 entries — `native:examples` (fixture) + `slack:channels` (production). Provider resolvers are colocated under their integration tree (`integrations/<provider>/options/<resource>.ts`). **Notion ships ZERO resolvers** as of Slice 3.42 — Notion ID fields all render as plain text. The first three Notion ideal-UX follow-up slices (`notion:databases`, `notion:pages`, `notion:users` — see §7) each add one resolver entry; only after that does Notion gain picker UX for typed-id fields.

### 1.4 Builder UI shell (`features/workflow-builder/`)

Unchanged since the prior checkpoint — shell / canvas / pickers / run-now / run-history / config-modal / state slices / discovery + variable hooks all still shipped. The async combobox UI lives inside the existing ComboboxField; no new top-level surface.

### 1.5 Field renderer registry

12 `FieldType` variants → 12 renderers, all registered + tested. Unchanged list, but two renderers were extended:

| FieldType | Renderer | Recent changes |
| --- | --- | --- |
| `combobox` | `ComboboxField.tsx` | **3.31** added async-mode branch with `useOptionsSource`; **3.33** added passive "Select &lt;parentLabel&gt; first" trigger when `enabled === false && dependsOn` set. |
| `select` | `SelectField.tsx` | Unchanged — stays static-only in v1 per the options-source plan. |

`FieldRendererProps` gained optional `deps`, `enabled`, `parentLabel` props in Slice 3.33; non-combobox renderers ignore them.

### 1.6 Test infrastructure additions since the prior checkpoint

- Slice 3.32 — [`tests/integration/features/workflow-builder/helpers/comboboxField.ts`](../../../tests/integration/features/workflow-builder/helpers/comboboxField.ts) (`pickComboboxOption`).
- Slice 3.32–3.38 — 5 new Slack integration tests: `slack-send-channel-message-config`, `slack-add-reaction-config`, `slack-invite-users-config`, `slack-post-interactive-blocks-config`, plus the extended `slack-upload-file-config` (channel field migrated to async combobox).
- Slice 3.41–3.42 — 4 new Notion integration tests: `notion-create-page-config`, `notion-query-database-config` (Slice 3.41); `notion-append-block-children-config`, `notion-list-comments-config` (Slice 3.42).
- **801 suites, 8725 tests** as of `ffbe1fdda`. (Prior checkpoint: 797 / 8662.)

---

## 2. Providers with complete metadata coverage

`COVERED_PROVIDERS` in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) enforces 1:1 handler ↔ meta coverage for these — adding a runtime handler in any of them without a meta fails the structural test.

| Provider | Action handlers | Action metas | Trigger handlers | Trigger metas |
| --- | --- | --- | --- | --- |
| **native** | 5 (`http_request`, `format_transformer`, `delay`, `if_then_condition`, `router`) | 5 | 0 (manual + scheduled are activation-only) | 2 |
| **github** | 6 | 6 | 1 (`new_commit`) | 1 |
| **gmail** | 13 | 13 | 3 (`new_email`, `new_labeled_email`, `new_attachment`) | 3 |
| **microsoft-outlook** | 9 | 9 | 3 (`new_email`, `email_sent`, `email_flagged`) | 3 |
| **slack** | 31 | 31 | 1 (`file_uploaded`) + 9 shared-webhook activations | 10 |
| **notion** | **16** | **16** | 0 (Notion has no programmatic webhook subscription API; manual-only) | 0 |

**6 complete providers** (was 5 at the prior checkpoint). Notion joined in Slice 3.42 via the Slice 3.40 plan + two implementation slices (3.41 pages+databases, 3.42 blocks+comments+users). It's the second larger provider to reach metadata-completeness after Slack, and the first provider in the covered set with **zero trigger surface** — Notion has no V2 trigger handlers because Notion's webhook subscription API is manual-only (see [`integrations/notion/manifest.ts`](../../../integrations/notion/manifest.ts)).

**Important — metadata-complete ≠ ideal-UX-complete.** Notion ships 16 action metas, every registered handler is reachable from the builder, and the structural test enforces drift protection. But the Notion UX in Slice 3.42 leans on a **paste-JSON bridge** for nested-object fields (parent / properties / children / icon / cover / filter / sorts). That bridge is *correct* (the meta accurately mirrors the schema, the engine resolves values at runtime), but it is **not the final product direction**. The Notion ideal-UX follow-up path is documented in §7 and §8 below; do not treat Notion as UX-done.

---

## 3. Providers with partial metadata coverage

**None.** Every provider in `services/discovery/_registry.ts` either has full action coverage (the 5 listed above) or zero action coverage (the 14 listed in §4 below). Slack's old partial-coverage row is gone — it's metadata-complete.

This is a deliberately-narrow definition: a provider is "partial" only when ≥1 action meta exists alongside missing siblings. It does NOT mean "this provider has triggers but no actions" — those rows live in §4 instead.

---

## 4. Providers with zero action metadata that still ship a runtime surface

Every row below has a manifest in `integrations/_registry.ts` AND registered handlers in `services/execution/handlers/_registry.ts`, but ZERO action metas in `services/discovery/_registry.ts`. The builder shows no actions for them today (triggers may still surface where trigger metas exist, but none of these providers ship trigger metas either).

| Provider | Action handlers | Trigger handlers | Notes / business priority |
| --- | --- | --- | --- |
| **hubspot** | 26 | 1 | Largest single missing surface. CRM core for any sales-flavored workflow. Will want 2-3 new resolvers (`hubspot:lists` / `hubspot:pipelines` / `hubspot:object-schemas`). |
| **stripe** | 16 | 1 | Commerce + billing. Most Stripe fields are static / text, so this provider could ship without any new `optionsSource` resolver. The cleanest "no new resolver needed" batch in the queue. |
| **mailchimp** | 14 | 7 | Lots of trigger handlers but no metas — marketing automation flows are blocked at the builder UI. |
| **google-sheets** | 12 | 2 | Top "data table" workflow surface. Spreadsheet → sheet → range chain naturally wants `optionsSource` + `dependsOn` (textbook two-hop cascade). |
| **shopify** | 11 | 1 | Commerce. |
| **airtable** | 11 | 1 | Records + attachments. Plan §6.3 of [`single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md) explicitly defers `airtable:add_attachment` until broader Airtable coverage lands. Base → table → field chain naturally wants `optionsSource` + `dependsOn` (three-hop). |
| **microsoft-excel** | 10 | 5 | Symmetric Microsoft equivalent of Google Sheets. |
| **trello** | 8 | 6 | Card-based PM workflows. |
| **microsoft-onedrive** | 7 | 1 | File storage; the `provider_url` arm of FileRef cross-references here. |
| **microsoft-teams** | 5 | 1 | Channel messaging mirror of Slack. Team → channel chain wants `optionsSource` + `dependsOn`. |
| **google-calendar** | 5 | 1 | Calendar + scheduling. |
| **google-drive** | 5 | 1 | File storage mirror of OneDrive. |
| **microsoft-outlook-calendar** | 5 | 1 | Sibling of `microsoft-outlook` mail provider. |

**Total uncovered action surface: 135 handlers across 13 providers.**

Net change vs the prior checkpoint:
- Notion moved out of this bucket (−16 from the prior 151 total at `37d4a6b63`) when Slice 3.42 flipped Notion into `COVERED_PROVIDERS`.
- The remaining 13 providers' counts are unchanged since the prior checkpoint.
- Verified against live [`services/execution/handlers/_registry.ts`](../../../services/execution/handlers/_registry.ts) by per-provider handler count — totals add to 215 entries (covered providers 80 + uncovered 135 = 215). The 6 covered providers ship 80 handlers; the 13 uncovered ship 135.

---

## 5. Current `COVERED_PROVIDERS`

```ts
// tests/structure/discovery-meta-coverage.test.ts
const COVERED_PROVIDERS: ReadonlySet<string> = new Set([
  "native",
  "github",
  "gmail",
  "microsoft-outlook",
  "slack",
  "notion",
]);
```

**6 of 19 providers** cross the "every registered handler has a meta" line as of Slice 3.42. The 13 listed in §4 remain outside.

---

## 6. Current high-value user flows now supported

Verified by reading existing integration tests in [`tests/integration/features/workflow-builder/`](../../../tests/integration/features/workflow-builder/). New Slack-driven rows added since the prior checkpoint are marked **(new)**.

| Flow | Status | Verifier |
| --- | --- | --- |
| Native trigger + action config | ✅ Shipped | `native-node-config.test.tsx` |
| Native Router routes editor | ✅ Shipped | `native-router-routes-editor.test.tsx` |
| Gmail trigger config (string-array + chip) | ✅ Shipped | `gmail-new-email-string-array.test.tsx`, `gmail-provider-trigger-config.test.tsx` |
| Gmail `send_email` (string-array recipients, signatures, labels) | ✅ Shipped | `gmail-send-email-config.test.tsx` |
| Outlook `send_email` (recipients, isHtml, importance Q11) | ✅ Shipped | `outlook-send-email-config.test.tsx` |
| Outlook `send_email.attachments` (file-array via picker) | ✅ Shipped | `outlook-send-email-attachments.test.tsx` |
| Slack `download_file` ⇒ Outlook `send_email.attachments` | ✅ Shipped | Slice 3.26 registry tests + Outlook attachments integration test compose |
| Slack `upload_file` consuming upstream FileRef via FileField + async channel picker | ✅ Shipped | `slack-upload-file-config.test.tsx` (channel field migrated to async combobox in Slice 3.32) |
| **Slack `send_channel_message` with async channel picker + textarea body (new)** | ✅ Shipped (Slice 3.35) | `slack-send-channel-message-config.test.tsx` |
| **Slack `add_reaction` with channel picker + ts + reaction (new)** | ✅ Shipped (Slice 3.36) | `slack-add-reaction-config.test.tsx` |
| **Slack `invite_users_to_channel` with channel picker + string-array users + boolean Q11 (new)** | ✅ Shipped (Slice 3.37) | `slack-invite-users-config.test.tsx` |
| **Slack `post_interactive_blocks` with channel picker + Block Kit JSON paste textarea** | ✅ Shipped (Slice 3.38) | `slack-post-interactive-blocks-config.test.tsx` |
| **Async combobox / `slack:channels` picker** | ✅ Shipped (Slice 3.32) | All Slack channel-bearing integration tests above + `ComboboxField.test.tsx` |
| **dependsOn cascade (clear child on parent change, "select parent first" disabled state)** | ✅ Shipped (Slice 3.33) | `SchemaForm.test.tsx` + `ComboboxField.test.tsx` |
| **Notion `create_page` with parent + properties + icon JSON paste textareas (new)** | ✅ Shipped (Slice 3.41) | `notion-create-page-config.test.tsx` |
| **Notion `query_database` with databaseId text + filter/sorts JSON paste + bounded pageSize (new)** | ✅ Shipped (Slice 3.41) | `notion-query-database-config.test.tsx` |
| **Notion `append_block_children` with dual block/page-id text + children BlockSpec[] JSON paste (new)** | ✅ Shipped (Slice 3.42) | `notion-append-block-children-config.test.tsx` |
| **Notion `list_comments` bounded-read shape (id + pageSize, server-managed cursor hidden) (new)** | ✅ Shipped (Slice 3.42) | `notion-list-comments-config.test.tsx` |
| **All 16 Notion actions (pages, databases, blocks, comments, users, search) discoverable in builder (new)** | ✅ Shipped (Slices 3.41 → 3.42) | Discovery registry + provider-route + structural-coverage tests; per-action UX still text-/JSON-first pending §7 follow-ups |
| Variable picker (text-style insertion) | ✅ Shipped | `variable-picker-flow.test.tsx`, `variable-picker-latest-value.test.tsx` |
| Variable picker chip-append into file-array | ✅ Shipped | `variable-picker-file-array.test.tsx` |
| Latest-run output preview | ✅ Shipped | `latest-run-preview.test.tsx` |
| Slack trigger config (chip arrays, channel filters) | ✅ Shipped | `slack-provider-trigger-config.test.tsx` |
| Canvas ↔ config rail sync | ✅ Shipped | `canvas-config-sync.test.tsx` |

---

## 7. Remaining Builder UI gaps

Re-ordered from "infrastructure not started" → "ideal-UX polish on metadata-complete providers" → "general polish". Items struck through landed since the prior checkpoint.

1. ~~**Async `optionsSource` loading.**~~ **Shipped (Slices 3.30–3.32).** `slack:channels` is the first production resolver. Contract + route + hook + renderer + helper all in place. Adding a new resolver is a single colocated file + one `_registry.ts` line.
2. ~~**Field cascading / dependsOn UX polish.**~~ **Shipped (Slice 3.33).** SchemaForm now clears direct dependents on parent change; ComboboxField surfaces a passive "Select &lt;parent&gt; first" trigger when the parent value is missing. Single-hop only (matches the FieldMeta contract).
3. **Provider-specific options resolvers beyond Slack channels.** Only `slack:channels` exists as a production resolver. Natural follow-ups, in priority order: `notion:databases` (flips 2 high-value Notion fields, see §8), `notion:pages` (flips ~10 Notion id fields), `notion:users` (flips `get_user.userId`), `slack:users` (3 user-id fields), `airtable:bases / airtable:tables / airtable:fields` (the three-hop cascade test bed), `google-sheets:spreadsheets / google-sheets:sheets` (two-hop), `microsoft-teams:teams / microsoft-teams:channels`, `hubspot:lists / hubspot:pipelines / hubspot:object-schemas`. Each is the same cost as `slack:channels` was — one new file + one registry entry + a few tests.
4. **Notion ideal-UX gaps (5 follow-ups).** Notion is metadata-complete (Slices 3.41 + 3.42) but lands its nested-object surfaces as **paste-JSON textareas** — an accepted *temporary coverage bridge*, not the final product direction. The five planned follow-up slices are (in recommended order):
   1. **`notion:databases` resolver** — upgrade `query_database.databaseId` + `create_database_entry.databaseId` from `text` to async combobox. Highest-leverage flip; backing API is `POST /v1/search` with `filter.value="database"`.
   2. **`notion:pages` resolver** — upgrade the ~10 page-id-bearing fields (`update_page.pageId`, `get_page.pageId`, `archive_page.pageId`, `restore_page.pageId`, `create_comment.pageId`, `create_database.parentPageId`, etc.). **Care needed:** several fields named `blockId` accept both block ids AND page ids (`append_block_children`, `get_block`, `get_block_children`, `list_comments`); do NOT blindly relabel — these stay text-or-block-picker until a true unified picker exists.
   3. **`notion:users` resolver** — upgrade `get_user.userId`. Backing API is `GET /v1/users`.
   4. **Notion database-schema-driven property editor** — the *real* ideal-UX endpoint for `create_page.properties`, `update_page.properties`, `create_database_entry.properties`. After the author picks a database, fetch its column schema and render typed property inputs per column (title / rich_text / number / select / checkbox / date / url / email / phone_number). Replaces the paste-JSON `properties` textarea. Long-term — requires both a resolver and a new FieldType for "schema-driven object editor".
   5. **Notion block builder / structured block editor** — long-term ideal-UX endpoint for `children` on `create_page` / `create_database_entry` / `append_block_children`. Replaces paste-JSON `BlockSpec[]` with an add-block-of-type UI. Requires a new FieldType and likely a separate panel.
5. **Variable picker type-aware filtering.** D-FRA-6 / D-SFR-10 still deferred. Picker shows all upstream outputs regardless of the focused field's type. Acceptable today; will need addressing when authors regularly hit "I picked the wrong thing and got rejected at execute time."
6. **FileRef sub-field drilling.** Picker can't expand a `fileRef`-typed output into `{{ref.name}}` / `{{ref.mimeType}}` / etc. Comment in `VariablePickerPopover.tsx:40` calls this out explicitly. Becomes more valuable as more providers ship FileRef-aware metas (Slack ships 3: download_file, upload_file, get_file_info; Notion ships 0).
7. **Multi-select async combobox.** Slice 3.7 deferral. Today `invite_users_to_channel.users` ships as `string-array` instead of a multi-select picker; adding multi-select unblocks any future provider that needs picker-driven multi-pick.
8. **Local-file upload UI / storage picker.** Async drag-drop or `<input type="file">` → `v2_storage`. Neither plan ships this.
9. **Run / test UX.** Run-now + run-history panels exist (Slice 3.9 + 3.10) but the deeper "run a single node with synthetic inputs," "inspect step outputs," "replay a failed run" surfaces aren't built.
10. **Edge editing UX.** Canvas connects + drags; the edge-condition / on-failure routing UX beyond `native:router` isn't yet exposed.
11. **Template surface.** No template gallery / import path.
12. **AI builder helper / planner.** Out of Phase-3 scope by design.

---

## 8. Recommended next implementation candidates

Re-ranked after Notion's metadata-completion. The big strategic question for the next slice is **"broad coverage momentum (Stripe) vs. Notion ideal-UX polish (`notion:databases` resolver)?"** — both are defensible; see §9 for the recommendation and the tradeoff.

| Rank | Candidate | Rationale | New resolver needed? | Approx. size |
| --- | --- | --- | --- | --- |
| 1 | **Stripe metadata batch** (16 actions) | Commerce / billing. Most Stripe fields ARE static / text (object ids), so this is the cleanest "no new resolver needed" batch in the queue. High direct revenue relevance — Stripe-driven workflows are common. Same shape as the Notion batch (paste-JSON-free since Stripe's surface is flat object ids), so it lands faster than Notion did. | No | 2-3 slices grouped by resource (customers / payments / subscriptions / etc.) |
| 2 | **`notion:databases` resolver + flip 2 fields** | Highest-leverage Notion ideal-UX win — `query_database.databaseId` and `create_database_entry.databaseId` flip from `text` to async combobox in one small slice. Validates the Notion ideal-UX path before the heavier work (schema-driven editor, block builder). | **Yes** — `notion:databases` | 1 small slice |
| 3 | **HubSpot metadata batch** (26 actions) | Biggest remaining single chunk — sales/CRM workflows. Will probably want `optionsSource` resolvers for object/list/pipeline pickers (`hubspot:lists`, `hubspot:pipelines`, `hubspot:object-schemas`). Landing those resolvers FIRST or alongside the metadata batch reduces meta churn. | **Yes** — 2-3 resolvers either before or during the batch | 4-6 slices |
| 4 | **`notion:pages` resolver + careful field flips** | Second Notion ideal-UX slice. Flips ~10 page-id-bearing fields to async combobox (`update_page.pageId`, `get_page.pageId`, `archive_page.pageId`, etc.). Care needed on the dual-meaning `blockId` fields — they accept page ids OR block ids, so they stay text until a unified picker exists. | **Yes** — `notion:pages` | 1 small slice |
| 5 | **Google Sheets metadata batch** (12 actions + 2 triggers) | Top "data table" workflow surface. Spreadsheet → sheet → range chain is the textbook `dependsOn` cascade. The Slice 3.33 cascade infra is built; this batch is the right place to exercise it on a real two-hop chain. | **Yes** — `google-sheets:spreadsheets` + `google-sheets:sheets` (`dependsOn: spreadsheetId`) | 3-4 slices |
| 6 | **Airtable metadata batch** (11 actions + 1 trigger) | Records + attachments. Base → table → field chain (three-hop). Plan §6.3 of [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md) explicitly gates `airtable:add_attachment` on this batch. | **Yes** — 3 resolvers for the base → table → field chain | 4-5 slices |
| 7 | **`slack:users` resolver + flip 3 Slack user-id fields** | Polish on top of completed Slack coverage. Documented in the Slack metadata plan §6 follow-up. | **Yes** — `slack:users` | 1 small slice |
| 8 | **`notion:users` resolver + flip `get_user.userId`** | Third Notion ideal-UX slice. Smallest of the three Notion resolver slices. | **Yes** — `notion:users` | 1 small slice |
| 9 | **Microsoft Teams metadata batch** (5 actions + 1 trigger) | Channel messaging mirror of Slack. Team → channel cascade. | **Yes** — `microsoft-teams:teams` + `microsoft-teams:channels` | 2 slices |
| 10 | **Type-aware variable picker filtering** | Quality-of-life. Worth doing after 7-8 providers have FileRef-aware metas so the user-facing benefit shows up in real flows. Slack ships 3 FileRef-aware metas; Notion ships 0. | No | 2 slices |
| 11 | **Mailchimp / Shopify / Microsoft Excel + OneDrive / Trello / Google Drive / Google + Outlook Calendar metadata batches** | Each meaningful but lower-ROI than #1-#9. Sequence after the bigger commerce / CRM / data providers. | Mixed | per-batch |
| 12 | **Notion database-schema-driven property editor** | Long-term Notion ideal-UX endpoint for `create_page.properties` / `update_page.properties` / `create_database_entry.properties`. After the author picks a database, fetch its column schema and render typed property inputs. Replaces the paste-JSON `properties` textarea. Requires both a resolver-style fetch AND a new FieldType. | **Yes** (resolver + new field type) | 3-4 slices |
| 13 | **Notion block builder / structured block editor** | Long-term Notion ideal-UX endpoint for `children` fields. Replaces paste-JSON `BlockSpec[]` with an add-block-of-type UI. Requires a new FieldType. | No (UI-only) | 3-4 slices |
| 14 | **FileRef sub-field drilling** | Same as #10 — sub-field picking becomes valuable only once `fileRef` outputs are pickable across many providers. | No | 1 slice |

---

## 9. Recommended near-term direction

**Recommendation: Stripe metadata batch next, then `notion:databases` resolver, then re-checkpoint.** This trades a little Notion UX delay for one more provider in the covered set, plus it validates that the metadata-completion cadence works on a provider where paste-JSON is *not* needed (Stripe's surface is flat object ids).

**Why Stripe before `notion:databases`:**

1. **Stripe metadata is the cleanest remaining "no-new-resolver" batch.** All 16 Stripe handlers take flat object ids (customer, payment intent, subscription) plus typed scalars. No nested JSON, no cross-provider chains, no resolver dependencies. Likely 2-3 slices and Stripe joins `COVERED_PROVIDERS`.
2. **Covered providers compound on each other.** Each new covered provider gets a permanent structural-test guardrail. 7 covered ≫ 6 covered for long-tail drift protection.
3. **`notion:databases` is small and lands cleanly *after* Stripe** as a single polish slice. The Notion UX gap doesn't grow while Stripe ships — Notion is already usable through paste-JSON and `{{...}}` references; the picker is a UX win, not a correctness fix.
4. **Stripe pairs naturally with the "commerce / billing" workflow category** which is currently zero-coverage (no Stripe, no Shopify metas, no Square). Landing it punches above its weight on the "what can the builder actually do?" surface.

**Tradeoff explicitly:** Stripe-first delays the first Notion ideal-UX improvement by ~1-2 slices. Acceptable because Notion's paste-JSON bridge is **functionally correct** — workflows work end-to-end today via JSON literals + variable references. The picker is polish, not a blocker. If a Notion-heavy user reports active friction with the paste-JSON UX before Stripe lands, swap to `notion:databases` first.

**Alternative: `notion:databases` first (defensible).** Lands Notion ideal-UX validation immediately, exercises the resolver pattern one more time before the HubSpot multi-resolver batch, and gives the Notion completion arc a satisfying "done + polished" closing slice. Pick this if the strategic goal is "make Notion *good*" rather than "broaden coverage."

**Why not other candidates:**

- **HubSpot now.** Reject: 26 actions plus 2-3 new resolvers is the biggest single slice queue in the backlog. Better to land Stripe (smaller) + `notion:databases` (tiny) first to keep the slice diet moving.
- **Google Sheets to exercise the cascade.** Reject as the lead: Sheets needs 2 resolvers + its own meta batch. Stronger candidate after Stripe + `notion:databases`.
- **Run-test / canvas polish.** Reject: the bottleneck is still "I picked a provider but my action isn't here," not "the canvas doesn't draw." 13 uncovered providers, 135 uncovered actions.
- **Notion database-schema-driven property editor.** Reject: requires a new FieldType (schema-driven object editor) and a separate panel; multi-slice infrastructure investment. Sequence after `notion:databases` + `notion:pages` + `notion:users` land, so the picker primitives are in place first.

---

## 10. Open questions for the next planning conversation

These are decisions worth surfacing explicitly so they don't get punted as "let's see when we get there":

- **Stripe-first vs `notion:databases`-first?** Recommendation is Stripe (see §9), but `notion:databases` is a strong second-place candidate if the strategic goal is "polish Notion" rather than "broaden coverage." Decide before starting the next slice.
- **For the HubSpot batch (rank #3):** build all needed resolvers as a single "HubSpot pickers" slice BEFORE the metadata batch, or interleave resolver-per-sub-batch? The Slack precedent was "build the resolver once, then land metadata over multiple slices." HubSpot has 2-3 resolvers; interleaving may be cleaner.
- **For the three Notion resolver slices (`notion:databases` / `notion:pages` / `notion:users`):** ship as three back-to-back small slices, or interleave with broader provider metadata batches (Stripe → Notion:databases → HubSpot batch → Notion:pages → ...)? Three back-to-back closes the Notion ideal-UX gap faster; interleaving balances coverage breadth and Notion depth.
- **For the long-term Notion schema-driven property editor (rank #12):** introduce it as a brand-new FieldType, or build it as an inline rendering branch on the existing `textarea` (auto-detect when a database id is set + load schema)? The former is cleaner architecturally; the latter is more incremental. Worth sketching before commitment.
- **`slack:users` polish (rank #7):** still pending. Decide whether to sequence before or after the Notion resolver path.
- **The provider-route response shape is still flat** (sorted by displayOrder). With 31 Slack + 16 Notion actions in the picker today, and HubSpot's 26 incoming, picker UX may want a category-grouped response shape. Worth designing now or wait until the picker shows visible bloat?

---

## 11. Snapshot summary

```text
INFRASTRUCTURE:        Complete for the 12 FieldType variants + discovery + canvas + picker
                       + async optionsSource resolvers + dependsOn cascade.
COMPLETE PROVIDERS:    native, github, gmail, microsoft-outlook, slack, notion (6).
                       Notion joined in Slice 3.42 — second larger provider to reach
                       metadata-completeness after Slack (16 action metas; flipped into
                       COVERED_PROVIDERS in Slice 3.42).
                       NOTE: Notion is metadata-complete but NOT ideal-UX-complete.
                       Five Notion follow-up slices documented in §7.4 (notion:databases
                       / notion:pages / notion:users resolvers + schema-driven property
                       editor + structured block builder).
PARTIAL PROVIDERS:     None.
UNCOVERED PROVIDERS:   13 (hubspot, stripe, mailchimp, google-sheets, shopify, airtable,
                          microsoft-excel, trello, microsoft-onedrive, microsoft-teams,
                          google-calendar, google-drive, microsoft-outlook-calendar).
UNCOVERED HANDLERS:    135 actions across the 13 providers above.
                       (Prior checkpoint: 151 across 14 providers. Net: Notion -16
                       moved into the covered set.)
OPTIONS RESOLVERS:     2 registered — native:examples (fixture) + slack:channels (prod).
                       Notion ships ZERO resolvers; the first three (notion:databases /
                       notion:pages / notion:users) are sequenced as polish slices.
TESTS:                 801 suites, 8725 tests, all green at ffbe1fdda.
                       (Prior checkpoint: 797 / 8662.)
NEXT METADATA BATCH:   Stripe (16 actions, no new resolver needed) — see §9.
                       Alternative: notion:databases resolver as a small polish-first slice.
NEXT INFRA UNLOCK:     None blocking the next 2 metadata batches.
                       HubSpot batch (rank #3) will want 2-3 new resolvers.
                       Google Sheets batch (rank #5) will want 2 resolvers
                       to exercise the dependsOn cascade on a real two-hop chain.
                       Notion's schema-driven property editor (rank #12) will need a
                       new FieldType + resolver-style fetch when Marcus prioritizes it.
```

The builder feels substantially more usable than at the prior checkpoint: every Notion knowledge-base flow that the runtime supports is now composable from the picker, joining the every-Slack-flow milestone that landed in 3.38. The remaining 13 providers are still the limiting factor — finishing Stripe + HubSpot would cover the largest non-email / non-Slack / non-Notion categories of real-world workflows.

**Don't lose sight of Notion's UX debt.** The 16-action metadata coverage means workflows CAN be built; the paste-JSON bridge for nested-object fields means they aren't yet *pleasant* to build. The five-slice follow-up path documented in §7.4 is the path from "complete" to "good." Capture this in the working memory of any future planning chat so Notion doesn't get filed as "done" prematurely.
