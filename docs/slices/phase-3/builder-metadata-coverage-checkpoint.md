# Phase 3 — Builder Metadata Coverage Checkpoint

**Status:** Checkpoint snapshot as of `37d4a6b63` (Slice 3.38 — Slack metadata-complete + COVERED_PROVIDERS flip). Doc-only.
**Branch:** `v2-provider-port-local` (local-only; do not push).
**Master plan:** [`docs/slices/phase-2-plan.md`](../phase-2-plan.md).
**Companion plans:** [`./file-ref-array-field-plan.md`](./file-ref-array-field-plan.md), [`./single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md), [`./options-source-plan.md`](./options-source-plan.md), [`./slack-action-metadata-plan.md`](./slack-action-metadata-plan.md).

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

**Resolver registry as of 3.38:** 2 entries — `native:examples` (fixture) + `slack:channels` (production). Provider resolvers are colocated under their integration tree (`integrations/<provider>/options/<resource>.ts`).

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
- **797 suites, 8662 tests** as of `37d4a6b63`. (Prior checkpoint: 788 / 8319.)

---

## 2. Providers with complete metadata coverage

`COVERED_PROVIDERS` in [`tests/structure/discovery-meta-coverage.test.ts`](../../../tests/structure/discovery-meta-coverage.test.ts) enforces 1:1 handler ↔ meta coverage for these — adding a runtime handler in any of them without a meta fails the structural test.

| Provider | Action handlers | Action metas | Trigger handlers | Trigger metas |
| --- | --- | --- | --- | --- |
| **native** | 5 (`http_request`, `format_transformer`, `delay`, `if_then_condition`, `router`) | 5 | 0 (manual + scheduled are activation-only) | 2 |
| **github** | 6 | 6 | 1 (`new_commit`) | 1 |
| **gmail** | 13 | 13 | 3 (`new_email`, `new_labeled_email`, `new_attachment`) | 3 |
| **microsoft-outlook** | 9 | 9 | 3 (`new_email`, `email_sent`, `email_flagged`) | 3 |
| **slack** | **31** | **31** | 1 (`file_uploaded`) + 9 shared-webhook activations | **10** |

Slack joined this list in Slice 3.38. It is the first larger provider to reach metadata-completeness via the Slice 3.34 plan + four implementation slices (3.35 → 3.38), and proves the metadata-completion process scales beyond the email-style providers (gmail / outlook) that anchored the earlier covered set.

---

## 3. Providers with partial metadata coverage

**None.** Every provider in `services/discovery/_registry.ts` either has full action coverage (the 5 listed above) or zero action coverage (the 14 listed in §4 below). Slack's old partial-coverage row is gone — it's metadata-complete.

This is a deliberately-narrow definition: a provider is "partial" only when ≥1 action meta exists alongside missing siblings. It does NOT mean "this provider has triggers but no actions" — those rows live in §4 instead.

---

## 4. Providers with zero action metadata that still ship a runtime surface

Every row below has a manifest in `integrations/_registry.ts` AND registered handlers in `services/execution/handlers/_registry.ts`, but ZERO action metas in `services/discovery/_registry.ts`. The builder shows no actions for them today (triggers may still surface where trigger metas exist, but none of these providers ship trigger metas either).

| Provider | Action handlers | Trigger handlers | Notes / business priority |
| --- | --- | --- | --- |
| **hubspot** | 26 | 1 | Largest single missing surface. CRM core for any sales-flavored workflow. Per the slack-action-metadata-plan-style audit cadence, this is the natural next batch. |
| **stripe** | 16 | 1 | Commerce + billing. Most Stripe fields are static / text, so this provider could ship without any new `optionsSource` resolver. |
| **notion** | 16 | 0 | Big knowledge-base provider — pages / databases / blocks. Notion has no V2 trigger handlers; metadata batch is action-only. |
| **mailchimp** | 14 | 7 | Lots of trigger handlers but no metas — marketing automation flows are blocked at the builder UI. |
| **google-sheets** | 12 | 2 | Top "data table" workflow surface. Spreadsheet → sheet → range chain naturally wants `optionsSource` + `dependsOn`. |
| **shopify** | 11 | 1 | Commerce. |
| **airtable** | 11 | 1 | Records + attachments. Plan §6.3 of [`single-file-ref-metadata-plan.md`](./single-file-ref-metadata-plan.md) explicitly defers `airtable:add_attachment` until broader Airtable coverage lands. Base → table → field chain naturally wants `optionsSource` + `dependsOn`. |
| **microsoft-excel** | 10 | 5 | Symmetric Microsoft equivalent of Google Sheets. |
| **trello** | 8 | 6 | Card-based PM workflows. |
| **microsoft-onedrive** | 7 | 1 | File storage; the `provider_url` arm of FileRef cross-references here. |
| **microsoft-teams** | 5 | 1 | Channel messaging mirror of Slack. Team → channel chain wants `optionsSource` + `dependsOn`. |
| **google-calendar** | 5 | 1 | Calendar + scheduling. |
| **google-drive** | 5 | 1 | File storage mirror of OneDrive. |
| **microsoft-outlook-calendar** | 5 | 1 | Sibling of `microsoft-outlook` mail provider. |

**Total uncovered action surface: 151 handlers across 14 providers.**

Net change vs the prior checkpoint:
- Slack moved out of this bucket (−29 from the 150 total at `f0aa79e74`).
- `google-sheets` gained one handler in the meantime (11 → 12) — accounts for the +1 swing.
- All other rows unchanged.

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
]);
```

5 of 19 providers cross the "every registered handler has a meta" line as of 3.38. The 14 listed in §4 remain outside.

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
| **Slack `post_interactive_blocks` with channel picker + Block Kit JSON paste textarea (new)** | ✅ Shipped (Slice 3.38) | `slack-post-interactive-blocks-config.test.tsx` |
| **Async combobox / `slack:channels` picker (new)** | ✅ Shipped (Slice 3.32) | All Slack channel-bearing integration tests above + `ComboboxField.test.tsx` |
| **dependsOn cascade (clear child on parent change, "select parent first" disabled state) (new)** | ✅ Shipped (Slice 3.33) | `SchemaForm.test.tsx` + `ComboboxField.test.tsx` |
| Variable picker (text-style insertion) | ✅ Shipped | `variable-picker-flow.test.tsx`, `variable-picker-latest-value.test.tsx` |
| Variable picker chip-append into file-array | ✅ Shipped | `variable-picker-file-array.test.tsx` |
| Latest-run output preview | ✅ Shipped | `latest-run-preview.test.tsx` |
| Slack trigger config (chip arrays, channel filters) | ✅ Shipped | `slack-provider-trigger-config.test.tsx` |
| Canvas ↔ config rail sync | ✅ Shipped | `canvas-config-sync.test.tsx` |

---

## 7. Remaining Builder UI gaps

Re-ordered from "infrastructure not started" → "polish". Items struck through landed since the prior checkpoint.

1. ~~**Async `optionsSource` loading.**~~ **Shipped (Slices 3.30–3.32).** `slack:channels` is the first production resolver. Contract + route + hook + renderer + helper all in place. Adding a new resolver is a single colocated file + one `_registry.ts` line.
2. ~~**Field cascading / dependsOn UX polish.**~~ **Shipped (Slice 3.33).** SchemaForm now clears direct dependents on parent change; ComboboxField surfaces a passive "Select &lt;parent&gt; first" trigger when the parent value is missing. Single-hop only (matches the FieldMeta contract).
3. **Provider-specific options resolvers beyond Slack channels.** Only `slack:channels` exists as a production resolver. Natural follow-ups: `slack:users` (3 user-id fields would benefit), `airtable:bases / airtable:tables` (the cascade test bed), `google-sheets:spreadsheets / google-sheets:sheets` (same shape), `microsoft-teams:teams / microsoft-teams:channels`, `hubspot:lists / hubspot:pipelines`, `notion:databases`. Each is the same cost as `slack:channels` was — one new file + one registry entry + a few tests.
4. **Variable picker type-aware filtering.** D-FRA-6 / D-SFR-10 still deferred. Picker shows all upstream outputs regardless of the focused field's type. Acceptable today; will need addressing when authors regularly hit "I picked the wrong thing and got rejected at execute time."
5. **FileRef sub-field drilling.** Picker can't expand a `fileRef`-typed output into `{{ref.name}}` / `{{ref.mimeType}}` / etc. Comment in `VariablePickerPopover.tsx:40` calls this out explicitly. Becomes more valuable as more providers ship FileRef-aware metas (Slack now ships 3 FileRef-aware metas: download_file, upload_file, get_file_info).
6. **Multi-select async combobox.** Slice 3.7 deferral. Today `invite_users_to_channel.users` ships as `string-array` instead of a multi-select picker; adding multi-select unblocks any future provider that needs picker-driven multi-pick.
7. **Local-file upload UI / storage picker.** Async drag-drop or `<input type="file">` → `v2_storage`. Neither plan ships this.
8. **Run / test UX.** Run-now + run-history panels exist (Slice 3.9 + 3.10) but the deeper "run a single node with synthetic inputs," "inspect step outputs," "replay a failed run" surfaces aren't built.
9. **Edge editing UX.** Canvas connects + drags; the edge-condition / on-failure routing UX beyond `native:router` isn't yet exposed.
10. **Template surface.** No template gallery / import path.
11. **AI builder helper / planner.** Out of Phase-3 scope by design.

---

## 8. Recommended next implementation candidates

Re-ranked after the Slack completion + async-options + dependsOn cascade unlocks. The "metadata-only" candidates that don't need new `optionsSource` resolvers move up; the ones that do are flagged.

| Rank | Candidate | Rationale | New resolver needed? | Approx. size |
| --- | --- | --- | --- | --- |
| 1 | **Notion metadata batch** (16 actions) | High knowledge-base / docs workflow value. Database / page id fields would BENEFIT from a `notion:databases` resolver but Notion has so many other "paste an id from the URL" fields that the batch can ship as text-first and gain the picker in a polish slice. No triggers to handle. | Optional `notion:databases` follow-up | 3-5 slices grouped by surface (pages / databases / users / search) |
| 2 | **Stripe metadata batch** (16 actions) | Commerce. Most Stripe fields ARE static / text (object ids), so this is the cleanest "no new resolver needed" batch in the queue. High direct revenue relevance — Stripe-driven workflows are common. | No | 3-4 slices grouped by resource (customers / charges / subscriptions / events) |
| 3 | **HubSpot metadata batch** (26 actions) | Biggest remaining single chunk — sales/CRM workflows. Will probably want `optionsSource` resolvers for object/list/pipeline pickers (`hubspot:lists`, `hubspot:pipelines`, `hubspot:object-schemas`). Landing those resolvers FIRST or alongside the metadata batch reduces meta churn. | **Yes** — 2-3 resolvers either before or during the batch | 4-6 slices |
| 4 | **Google Sheets metadata batch** (12 actions + 2 triggers) | Top "data table" workflow surface. Spreadsheet → sheet → range chain is the textbook `dependsOn` cascade. The Slice 3.33 cascade infra is built; this batch is the right place to exercise it on a real two-hop chain. | **Yes** — `google-sheets:spreadsheets` + `google-sheets:sheets` (`dependsOn: spreadsheetId`) | 3-4 slices |
| 5 | **Airtable metadata batch** (11 actions + 1 trigger) | Records + attachments. Base → table → field chain (three-hop). Plan §6.3 of `single-file-ref-metadata-plan.md` explicitly gates `airtable:add_attachment` on this batch. | **Yes** — 3 resolvers for the base → table → field chain | 4-5 slices |
| 6 | **`slack:users` resolver + flip 3 Slack user-id fields to combobox** | Polish on top of completed Slack coverage. Lands as documented in the Slack metadata plan §6 follow-up. Low risk, single small slice. | **Yes** (the resolver itself) | 1 small slice |
| 7 | **Microsoft Teams metadata batch** (5 actions + 1 trigger) | Channel messaging mirror of Slack. Team → channel cascade. | **Yes** — `microsoft-teams:teams` + `microsoft-teams:channels` | 2 slices |
| 8 | **Type-aware variable picker filtering** | Quality-of-life. Worth doing after 7-8 providers have FileRef-aware metas so the user-facing benefit shows up in real flows. Slack just added 3 FileRef-aware metas to the surface; we're closer than the prior checkpoint. | No | 2 slices |
| 9 | **Mailchimp / Shopify / Microsoft Excel + OneDrive / Trello / Google Drive / Google + Outlook Calendar metadata batches** | Each meaningful but lower-ROI than #1-#7. Sequence after the bigger commerce / data / CRM providers. | Mixed | per-batch |
| 10 | **FileRef sub-field drilling** | Same as #8 — sub-field picking becomes valuable only once `fileRef` outputs are pickable across many providers. | No | 1 slice |

---

## 9. Recommended near-term direction

**Recommendation: continue with provider metadata batches in priority order — Notion → Stripe → (resolver + HubSpot together) → (resolver + Google Sheets together) — then re-checkpoint. Don't pause for UX polish yet.**

Why not pause for UX polish:
- The provider gap is still dominant: 14 providers, 151 uncovered action handlers. The builder still feels half-empty for any non-email / non-Slack workflow.
- The Slack completion (29 metas in 4 slices) demonstrated the metadata-completion cadence is sustainable. Continuing it produces visible builder value per slice.
- The infrastructure unlocks needed for the next batches already exist: async `optionsSource` ships, `dependsOn` cascade ships. The "Notion + Stripe first" recommendation deliberately picks two providers that can land WITHOUT any new resolver, so we can validate the cadence on smaller batches before tackling the larger HubSpot+resolver pairing.

Why this ordering vs the prior checkpoint:
- The prior checkpoint recommended "Slack broader actions THEN options-source infra THEN one or two metadata batches THEN re-checkpoint." Slack is done; options-source shipped; the cascade shipped. The follow-on metadata batches are the natural next step.
- Notion + Stripe both punch above their resolver-cost weight: neither strictly needs a new resolver, both produce visible builder value, and together they cover the "docs / knowledge-base" and "commerce / billing" surfaces — the two most common workflow categories outside email and chat.
- HubSpot is bigger AND wants 2-3 new resolvers. Landing it third lets the resolver pattern get one more rep (after `slack:channels`) before the multi-resolver provider hits.

**Alternatives briefly considered:**

- **Pause metadata and ship the run-test / canvas-polish UX.** Reject: every shipped integration test demonstrates the canvas + config + run path is functional. The bottleneck is "I picked a provider but my action isn't here," not "the canvas doesn't draw."
- **Land `slack:users` resolver first as a tightly-scoped polish slice.** Acceptable as a low-risk warm-up if Marcus prefers a tiny next slice before the bigger Notion batch. Not the primary recommendation because it's polish on already-completed coverage, not new coverage.
- **Lead with Google Sheets to validate the `dependsOn` cascade on a real two-hop chain.** Reject as the lead: Sheets needs 2 resolvers + its own meta batch; better to land 1-2 resolver-free batches first to keep the slice diet moving. But strong candidate at #4.

---

## 10. Open questions for the next planning conversation

These are decisions worth surfacing explicitly so they don't get punted as "let's see when we get there":

- For the Notion batch: ship as resolver-free text-first (matches the recommendation) OR pre-build `notion:databases` resolver so the batch lands with picker UX from day one? The prior Slack-batch precedent (`text` first, picker polish later for users) argues for resolver-free; the Slack-channel-picker integration test demonstrates how much nicer the UX is when the picker exists on day one.
- For the HubSpot batch (rank #3): build all needed resolvers as a single "HubSpot pickers" slice BEFORE the metadata batch, or interleave resolver-per-sub-batch? The Slack precedent was "build the resolver once, then land metadata over multiple slices." HubSpot has 2-3 resolvers; interleaving may be cleaner.
- For the slack:users polish (rank #6): land it before Notion (tiny warm-up) or after Notion+Stripe (groups all polish work together)? Both are defensible; mention before starting the next batch so it doesn't get forgotten.
- The provider-route response shape is still flat (sorted by displayOrder). With 31 Slack actions + the Notion/HubSpot batches incoming, picker UX may want a category-grouped response shape. Worth designing now or wait until the picker shows visible bloat?

---

## 11. Snapshot summary

```text
INFRASTRUCTURE:        Complete for the 12 FieldType variants + discovery + canvas + picker
                       + async optionsSource resolvers + dependsOn cascade.
COMPLETE PROVIDERS:    native, github, gmail, microsoft-outlook, slack (5).
                       Slack is the first larger provider to reach metadata-completeness
                       (31 action metas + 10 trigger metas; flipped into COVERED_PROVIDERS
                       in Slice 3.38).
PARTIAL PROVIDERS:     None.
UNCOVERED PROVIDERS:   14 (hubspot, stripe, notion, mailchimp, google-sheets, shopify,
                          airtable, microsoft-excel, trello, microsoft-onedrive,
                          microsoft-teams, google-calendar, google-drive,
                          microsoft-outlook-calendar).
UNCOVERED HANDLERS:    151 actions across the 14 providers above.
                       (Prior checkpoint: 150 across the same 14 + Slack's 29 missing
                       at the time. Net: Slack -29, google-sheets +1.)
OPTIONS RESOLVERS:     2 registered — native:examples (fixture) + slack:channels (prod).
TESTS:                 797 suites, 8662 tests, all green at 37d4a6b63.
                       (Prior checkpoint: 788 / 8319.)
NEXT METADATA BATCH:   Notion (16 actions, no new resolver needed).
NEXT INFRA UNLOCK:     None blocking the next 2 metadata batches.
                       HubSpot batch (rank #3) will want 2-3 new resolvers.
                       Google Sheets batch (rank #4) will want 2 resolvers
                       to exercise the dependsOn cascade on a real two-hop chain.
```

The builder feels substantially more usable than at the prior checkpoint: a workflow author can compose every Slack flow that the runtime supports, the async channel picker eliminates the "type an id" friction, and the cascade infra is ready for the next two-hop provider (Google Sheets / Airtable). The remaining 14 providers are still the limiting factor — finishing Notion + Stripe + HubSpot would cover the largest non-email / non-Slack categories of real-world workflows.
