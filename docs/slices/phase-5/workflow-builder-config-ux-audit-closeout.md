# Workflow Builder Config UX Audit — Closeout (CONFIG-UX-AUDIT-1)

**Date:** 2026-07-06 · **Branch:** `v2-main` · **Local commit only, nothing pushed.**

## Why

Builder setup panels exposed raw JSON authoring and internal renderer errors to normal
users (Shopify webhook topics renderer error, HubSpot "Subscriptions (paste JSON)",
Excel "Values — single row (paste JSON)"). Product rule enforced by this slice: **the
user configures workflows visually; the app serializes to JSON internally; JSON entry
survives only as an explicitly advanced developer escape hatch, collapsed out of the
normal path.**

## Key finding beyond UX: paste-JSON was runtime-BROKEN, not just ugly

There is **no JSON-parse layer anywhere between the builder and runtime consumers**.
Verified end-to-end: the config slice stores what renderers commit; `updateWorkflow`
persists it verbatim; the engine (`services/execution/engine.ts`) resolves `{{...}}`
variables only (a standalone `{{ref}}` passes raw values through) and hands config
straight to handlers; trigger activation (`services/triggers/lifecycle.ts`) passes
`node.config` untouched.

So every "paste JSON" textarea saved a **string** into a field whose runtime contract
demanded a **real array/object**:

- HubSpot `subscriptions` → `activate.ts:parseSubscriptions` starts with
  `Array.isArray(raw)` → activation always failed for pasted literals.
- Excel `add_row.values`/`rows`, Sheets `append_row.values`/`update_row.values`,
  Stripe `lineItems`, Shopify `line_items`, Mailchimp `static_emails`/`conditions` →
  `z.array(...)` schemas rejected the string at execution time.
- Separately, the `keyvalue` renderer always committed `Array<{key, value}>` (the
  native-handler shape) while **10 fields' schemas expect `z.record`**: 8 Stripe
  `metadata` fields, Mailchimp `create_custom_event.properties`, Excel
  `update_row.values`. Those saves were also runtime-rejected.

Only wiring a `{{...}}` variable from an upstream array output ever worked. The visual
editors shipped here store the REAL shapes, fixing the UX and the correctness bug with
**zero backend handler/schema changes**.

## Searched patterns

`paste JSON` · `Paste a JSON` · `JSON array` · `JSON object` · `raw JSON` · `as JSON` ·
`JSON literal` · `JSON-encoded` · `Multi-select on type` · `not supported by this
renderer` · `unsupported by this renderer` · `not yet implemented` · `textarea` (per
provider meta) · `multiple: true` · `type: "select"` · `type: "combobox"` ·
`type: "keyvalue"` vs. schema `z.record` · `optionsSource` · `JSON.parse` across
`features/ services/ core/ workflow-engine/ integrations/` (to prove the no-parse-layer
finding).

## What was built

### Contract (`contracts/actionMeta.ts`)

- New FieldTypes **`object-list`** (repeater rows declared by `itemFields`, with
  row-local `visibleWhen` conditions) and **`keyvalue-list`** (rows of free-key
  column→value maps). `listMaxItems` cap hint.
- **`keyValueShape: "pairs" | "record"`** on `keyvalue` — same UI, correct serialized
  shape per schema.
- **`advanced: true`** — marks a developer escape hatch; SchemaForm collapses advanced
  fields behind an "Advanced" disclosure (auto-open when required or already filled).
- superRefines: itemFields only/required on object-list; visibleWhen references sibling
  sub-fields; select sub-fields need options; caps and shape flags type-gated. All
  metas revalidate at discovery-registry module load, so drift fails CI.

### Renderers (`features/workflow-builder/config-modal/`)

- **`MultiOptionsField`** (new): real multi-select for `select`/`combobox` +
  `multiple: true`. Static options → searchable check-toggle popover + label chips;
  async `optionsSource` → reuses StringArrayField's option-picker body (deps/enabled
  gating, owner-gating, manual entry all inherited). Commits `string[]`.
- **`ObjectListField`** (new): add/remove rows of text/number/select/boolean
  sub-fields; `visibleWhen` gates row fields; hidden/empty-optional keys omitted;
  numbers stored as numbers; empty list commits `undefined`.
- **`KeyValueListField`** (new): visual batch-row builder (Add row / Remove row / Add
  column); commits `Array<Record<string, string>>`; new rows seeded with the previous
  row's column names.
- **`KeyValueField`**: record mode added (`keyValueShape: "record"` → commits
  `Record<string, string>`, empty → `undefined`). Pairs mode byte-identical.
- **`StringArrayField`**: removing the last chip now commits `undefined` (so optional
  fields drop out of saved config instead of tripping `.min(1)`/XOR refinements);
  option-picker body exported for MultiOptionsField.
- **`SelectField` / `ComboboxField`**: `multiple` delegates to MultiOptionsField — the
  internal "Multi-select on type 'select' is not supported by this renderer" /
  "not yet implemented (Slice 3.7)" errors are GONE. Missing-options fallbacks now use
  product copy ("The choices for this field aren't available right now…") with no
  implementation language.
- **`SchemaForm`**: unknown-FieldType fallback shows friendly copy only (internal type
  rides in `data-field-type` for developers); advanced fields render inside a
  collapsed `<details>` "Advanced" section.

### Provider metas converted to visual editors (runtime-shape fixes)

| Provider / field | Before | After |
|---|---|---|
| HubSpot `webhook_received.subscriptions` | required paste-JSON textarea (activation-broken) | `object-list`: event picker (12 options mirroring `HUBSPOT_ALLOWED_SUBSCRIPTION_TYPES`, compile-time count guard) + "Property to watch" shown only for `*.propertyChange` rows |
| Shopify `webhook_received.topics` | `select`+`multiple` → red renderer error | works via MultiOptionsField (meta unchanged; already product copy) |
| Excel `add_row.values` / `.rows` | two paste-JSON textareas (schema-broken) | `string-array` chips / `keyvalue-list` row builder (max 1000) |
| Excel `add_table_row.values` | paste-JSON textarea | `string-array` chips (schema's positional branch) |
| Excel `update_row.values` | keyvalue (pairs shape, schema-broken) | keyvalue `record` shape |
| Sheets `append_row.values`, `update_row.values` | paste-JSON textareas (schema-broken) | `string-array` chips; USER_ENTERED note for typed cells |
| Stripe `create_checkout_session.lineItems`, `create_payment_link.lineItems` | paste-JSON textareas (schema-broken) | `object-list` (Price ID + Quantity, caps 99/20) |
| Stripe `metadata` ×8, Mailchimp `create_custom_event.properties` | keyvalue pairs shape (schema-broken) | keyvalue `record` shape |
| Shopify `create_order.line_items` | paste-JSON textarea (schema-broken) | `object-list` (variant id + quantity, numeric) |
| Mailchimp `create_segment.static_emails` / `.conditions` | paste-JSON textareas (schema-broken) | `string-array` chips / `object-list` (field/comparison/value rows; free-text because valid combos vary per audience — Mailchimp's API stays authoritative) |
| GA `send_event.eventParams` | paste-JSON textarea | keyvalue `record` (schema already accepted records) |

Multi-select also un-breaks with no meta change: GA `run_report`/`run_pivot_report`/
`get_realtime_data` metrics+dimensions, Stripe `event_received.enabledEvents`, Trello
`create_card` members/labels, Airtable `list_records.fields`.

### Deferred fields — moved behind the Advanced disclosure (`advanced: true`) + copy cleanup

Notion `create_page` (parent/properties/children/icon/cover), `create_database_entry`
(4), `create_database.properties`, `append_block_children.children`,
`query_database.filter/sorts`, `update_page` (3), `search.filter`; Airtable
`fields`/`records` typed maps ×4 + `list_records.sort`; Monday `columnValues` ×2,
`updateItem.additionalColumns`, `add_column.defaults`; Slack
`post_interactive_blocks.blocks` (Block Kit is inherently developer-facing); Stripe
`automaticTax` + `afterCompletion`; Mailchimp `create_audience.contact` +
`campaign_defaults` (required → disclosure auto-opens); Sheets `batch_update.updates` +
`format_range.numberFormat`; Shopify `create_order` shipping/billing addresses.

**Honest reasons:** these are provider-specific grammars (Notion property/filter DSL,
Airtable typed field maps, Monday column-value JSON, Slack Block Kit, Sheets 2D batch
ranges) or fixed-key single objects (addresses, Mailchimp compliance objects) that need
purpose-built editors a follow-up slice should design deliberately. All labels lost
"(paste JSON)"; all descriptions now lead with product language ("Developer option. …
Enter the JSON value or insert a value from a previous step."). JSON mentions are
allowed ONLY on `advanced: true` fields (guard-tested). `native:http_request` is
allowlisted as a wholesale developer action.

**Known remaining runtime gap on deferred fields:** pasting a JSON *literal* into an
advanced textarea still saves a string, which object/array-expecting schemas reject at
run time with the schema's own message (variables work). Closing this needs either
per-schema string-acceptance (`z.preprocess`) or the purpose-built editors — deliberately
NOT hacked in here to avoid touching ~10 runtime schemas in a UI slice. Tracked as the
top follow-up.

## Before / after UX summary

- Before: Shopify topics showed a red internal renderer error; HubSpot demanded a JSON
  array with per-type rules the user had to read docs for (and activation then rejected
  it anyway); Excel demanded JSON in two competing textareas; select/combobox metas with
  `multiple` were un-usable; Stripe metadata silently saved a shape the API schema
  rejected.
- After: every builder-visible field either has a purpose-built visual editor (chips,
  repeater rows, row builder, multi-select with labels) or sits behind a collapsed
  "Advanced" disclosure with developer-labeled copy. No internal error strings are
  user-visible; renderer fallbacks use product language; meta/renderer drift is caught
  by contract superRefines + the copy guard in CI instead of at render time.

## Tests added / updated

**New:** `tests/structure/config-copy-guard.test.ts` (7 tests — label ban, normal-copy
JSON ban with advanced/dev allowlist, advanced-shape pin, multiple-has-options,
select/combobox options XOR source, internal-string ban);
`fields/MultiOptionsField.test.tsx` (4 — real Shopify topics meta: no renderer error,
string[] commits, chips, toggle-off); `fields/ObjectListField.test.tsx` (5 — rows,
visibleWhen show/hide + key omission, numbers, cap, undefined-on-empty);
`fields/KeyValueListField.test.tsx` (5 — record rows, column seeding, hydrate, Add
column, undefined-on-empty, no-JSON copy);
`microsoft-excel-add-row-config.test.tsx` (3 — meta guard + batch + single-row E2E
through the live builder, including `AddRowConfigSchema.parse` acceptance of the saved
config); SchemaForm advanced-disclosure tests (4) + friendly unknown-type test;
KeyValueField record-mode tests (3).

**Updated to pin new behavior:** SelectField/ComboboxField multi-select tests (assert NO
internal error + chips), discovery `_registry.test.ts` (Stripe/Sheets/HubSpot/Mailchimp
shapes), fields `_registry.test.ts` (20 FieldTypes), HubSpot webhook trigger integration
test (full visual-flow rewrite asserting the REAL array + conditional propertyName),
Stripe checkout + payment-intent integration tests (object-list flow, record metadata),
Sheets append-row integration test (chip flow, `string[]` persisted), GA send-event test
(record + legacy-string schema acceptance).

## Commands run and results

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors (14 pre-existing warnings, none in slice files after fixing
  one unused-var).
- `npm run lint:structure` — OK (≤50 files per leaf).
- Focused Jest: `tests/unit/features/workflow-builder`, `tests/integration/features/
  workflow-builder`, `tests/structure`, `tests/unit/services/discovery` → **3369
  passed / 6 failed, all 6 verified inherited** (see below); provider units
  `tests/unit/integrations/{hubspot,microsoft-excel,google-sheets,stripe,mailchimp,
  shopify,google-analytics,slack}` + `tests/unit/contracts` → 3202/3202;
  `tests/unit/services/ai` + `tests/unit/core/workflows` → 1071 passed / 1 skipped.

**Inherited failures (verified NOT from this slice — reproduced with this slice's
changes stashed):** `notion-list-comments-config` (blockId became combobox in the
selector-discovery commit d31fb8cbd; test not updated), `hubspot-create-contact-config`,
`variable-picker-file-array` (same commit family), `no-literal-slack-token-fixtures`
(documented pre-existing baseline), `WorkflowCanvas` action-bar test (a "History" tab
landed in parallel-session canvas work; no canvas file touched by this slice).

## Remaining risks / deferred

1. Advanced JSON textareas still save strings that object-expecting runtime schemas
   reject (literals only; variables fine) — needs `z.preprocess` string acceptance or
   dedicated editors. Top follow-up.
2. Visual editors commit **string** cell values (Excel/Sheets rows). Sheets
   USER_ENTERED re-types them server-side; Excel Graph writes text cells. Typed cells
   need variables or a future typed-cell editor. Documented in field copy.
3. Pre-existing draft configs holding JSON strings render as empty in the new editors
   (renderers coerce non-arrays to `[]`). Pre-launch dev data only; no migration
   written.
4. Mailchimp condition field/op are free-text (valid combos vary per audience);
   Mailchimp's API remains the validator.
5. Client-side inline JSON validation for advanced textareas (friendly parse errors
   while typing) not implemented — the guard here was scope, not the validation UX.
6. Inherited test failures listed above belong to the selector-discovery / canvas-tabs
   tracks and should be fixed there.

## Push status

Local commit only. **Nothing pushed.** No migrations, no db:push needed.
