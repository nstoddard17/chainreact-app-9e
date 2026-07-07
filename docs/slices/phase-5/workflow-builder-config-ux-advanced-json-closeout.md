# Workflow Builder Config UX — Advanced JSON Correctness (CONFIG-UX-AUDIT-2)

**Date:** 2026-07-06 · **Branch:** `v2-main` · **Local commit only, nothing pushed.**
**Predecessor:** CONFIG-UX-AUDIT-1 (`0cb7c101c`) — untouched, not rewritten.

## Why

AUDIT-1's honest caveat: the advanced JSON textareas still saved literal STRINGS, and
object/array-expecting runtime schemas (`z.array` / `z.object` / `z.record`) rejected
them at activation/run. Pasted literals silently failed later; only whole-value
`{{...}}` variables worked. That violated the product rule that the JSON escape hatch
must validate and show friendly errors, never silently save something broken.

## What shipped

### New `json` FieldType + `jsonShape` (contracts/actionMeta.ts)

- `json` is now the ONLY sanctioned raw-JSON entry surface. A contract superRefine
  requires every `json` field to be `advanced: true` (escape hatch only) and gates
  `jsonShape` (`"array" | "object" | "any"`) to `json` fields. All metas revalidate at
  discovery-registry load, so drift fails CI.

### `JsonField` renderer + shared `_jsonFieldValue.ts` logic

- Raw editor text lives in local state — invalid JSON never destroys what the user
  typed.
- Commit rules: valid JSON of the declared shape → the PARSED array/object; pure
  `{{...}}` variable → the string token (the runtime resolver replaces a standalone
  token with the referenced raw value); empty → `undefined`; invalid/mismatched text →
  the raw string stays in the draft **and the Save gate blocks**.
- Friendly copy only: "This needs valid JSON. Check for missing quotes, commas, or
  brackets." / "This field needs a list — start with [ and end with ]." / "This field
  needs an object — start with { and end with }." No SyntaxError, Zod internals, or
  renderer names anywhere (test-asserted).
- Mixed JSON + variable text is rejected with copy explaining variables must reference
  the whole value — the resolver would string-concatenate mixed templates, which the
  schemas reject, so it is not supported rather than half-supported.
- The variable picker sets the WHOLE value to the picked token (matching the
  whole-value rule).

### Save gate (ConfigModalShell)

- Extended the existing router-routes blocking pattern into the promised per-field-type
  validator: `collectJsonFieldBlockingError(fields, values)` disables Modal Save while
  any json field holds an unfixed string draft, and the footer shows
  "Fix "<Field label>" before saving." (testid `config-modal-json-blocking`).

## Advanced JSON fields audited (all 35; every one now parses/validates)

| Provider | Fields | jsonShape |
|---|---|---|
| Airtable | create_record.fields, update_record.fields | object |
| Airtable | create_multiple_records.records, update_multiple_records.records, list_records.sort | array |
| Google Sheets | batch_update.updates | array |
| Google Sheets | format_range.numberFormat | object |
| Mailchimp | create_audience.contact, .campaign_defaults | object |
| Monday | add_column.defaults, create_item.columnValues, create_subitem.columnValues, update_item.additionalColumns | object |
| Notion | create_page.parent/.properties/.icon/.cover, create_database_entry.properties/.icon/.cover, create_database.properties, update_page.properties/.icon/.cover, query_database.filter, search.filter | object |
| Notion | create_page.children, create_database_entry.children, append_block_children.children, query_database.sorts | array |
| Shopify | create_order.shipping_address, .billing_address | object |
| Slack | post_interactive_blocks.blocks | array |
| Stripe | create_checkout_session.automaticTax, create_payment_link.afterCompletion | object |

No fields were replaced with purpose-built editors in this slice — purpose-built
editors for these grammars (Notion property DSL, Airtable typed maps, Monday column
values, Block Kit, addresses, Sheets batch ranges) remain the deliberate follow-up;
this slice makes the escape hatch CORRECT in the meantime. Deferred honestly, same
reasons as AUDIT-1: each needs a designed editor, not a generic one.

Monday note: its schemas accept `string | record` unions (handler parses strings), so
the old behavior was not runtime-broken there — but committing parsed objects is
strictly better and now uniform with the rest.

## Tests

**New:** `fields/jsonFieldValue.test.ts` (13 — parse/shape/variable/mixed/empty rules,
committed-draft re-validation, round-trip, Save-gate collector, no parser internals in
copy); `fields/JsonField.test.tsx` (7 — array commit, object commit, invalid-JSON
friendly error + typed-text survival + raw-draft commit, shape mismatch, pure variable,
clear→undefined, hydrate-pretty-print). Slack `post_interactive_blocks` integration
test extended with 2 new E2E cases: invalid JSON + wrong-shape JSON disable Modal Save
with friendly copy and no internals; whole-value variable stays a string with Save
enabled while mixed JSON+variable blocks.

**Updated to pin the new contract:** slack/notion(×4)/monday/stripe/airtable/sheets/
mailchimp discovery + builder integration tests (textarea → json + jsonShape +
advanced assertions; literal-string persistence → parsed-value persistence); copy
guard (advanced fields must be `json` with explicit array/object shape; `json` never
appears outside the disclosure); fields registry count 21.

**AUDIT-1 regression (required):** Shopify topics multi-select, HubSpot subscription
rows, Excel Add Row visual editor — all pass unchanged.

## Commands run and results

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 13 pre-existing warnings (none in slice files; also fixed
  the AUDIT-1 `MultiOptionsField` useMemo warning).
- `npm run lint:structure` — OK.
- Focused Jest: `tests/unit/features/workflow-builder` + `tests/integration/features/
  workflow-builder` + `tests/structure` + `tests/unit/services/discovery` → **3398
  passed / 7 failed, all inherited** (see below; airtable-discovery was fixed in-slice
  after conversion). Fields suite standalone: 415/415. New unit tests: 23/23.

**Inherited failures (reproduced without this slice in AUDIT-1's baseline check):**
`notion-list-comments-config`, `hubspot-create-contact-config`,
`variable-picker-file-array` (selector-discovery commit d31fb8cbd),
`no-literal-slack-token-fixtures` (documented baseline), `WorkflowCanvas` action-bar
test (parallel-session "History" tab). None touched by this slice.

## Remaining deferred

1. Purpose-built editors for the 35 advanced grammars (unchanged follow-up from
   AUDIT-1) — the escape hatch is now correct, not gone.
2. Pre-existing saved drafts holding raw JSON strings now surface the inline error +
   Save block on next open (pre-launch dev data; no migration).
3. `jsonShape: "any"` has no current consumer — kept as the documented escape valve.

## Push status

Local commit only. **Nothing pushed.** No migrations.
