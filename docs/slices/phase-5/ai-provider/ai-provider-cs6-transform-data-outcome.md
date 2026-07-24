# AI-PROVIDER-6 — CS-6 Outcome: Transform Data, and the destination-action workflow

**Type:** Implementation outcome (CS-6 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-2](./ai-provider-cs2-processor-outcome.md),
[CS-3](./ai-provider-cs3-billing-outcome.md),
[CS-4](./ai-provider-cs4-builder-contract-outcome.md), and
[CS-5](./ai-provider-cs5-analyze-document-outcome.md)). Local commit only; nothing
pushed, no flags enabled, no migration, no `db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (based on CS-5 `1e53dfed2`)

`AI_PROCESSOR_ENABLED` remains **OFF** everywhere: the action is registered but
unreachable — the catalog route returns an empty list and the picker hides the AI
section entirely.

---

## 1. What shipped

The second flagship ChainReact AI action, and the piece that turns the AI provider
from "a smart step" into a mapping layer between every app ChainReact supports.

```
core/workflows/
├── deriveDestinationContext.ts     # PURE: an action's metadata → schema + model context
└── transformInput.ts               # PURE: classify + serialize the incoming data
integrations/ai/
├── actions/transformData.schema.ts # strict resolved-config contract
├── actions/transformData.meta.ts   # builder metadata + dynamicOutputs
├── actions/transformData.ts        # the handler (thin by construction)
└── options/destinationActions.ts   # `ai:destination_actions` picker resolver
services/ai/processor/
├── resolveTransformDestination.ts  # server-side re-derivation + typed refusals
├── runDataTransform.ts             # request build → executeAiAction → bounded output
├── extractionValidator.ts          # + validateTransformedRecord
└── analysisErrors.ts               # + TransformInputError · DestinationResolutionError
                                    #   · AiCreditsExhaustedError · refusalError()
```

Registry edits: `_handlerInventory.ts`, `_metaInventory.ts`,
`services/options/_registry.ts` (first connectionless option source with a real
product job). Engine: the additive `AI_CREDITS_EXHAUSTED` failure code the plan
assigns to this slice (§7), wired end to end.

### Final action metadata

| Field | Value |
|---|---|
| Key | `ai:transform_data` |
| Provider | `ai` — **ChainReact AI** (connectionless, no manifest) |
| Display name | **Transform Data** |
| Category | `ai` · `requiresIntegration: false` · `riskLevel: low` |
| Billing feature | `data_transform` — 2 credits (standard) · 4 (higher quality) |
| FileRef | neither produces nor consumes |
| Test mode | Runs (real, uncharged model call — owner decision 4) |

---

## 2. Builder UX

**Setup, in order:** Data to transform · What shape should the result be? ·
*(destination picker or schema editor)* · How many results? · Extra instructions.

| Field | Type | Visible when |
|---|---|---|
| `input` | textarea (variable token) | always |
| `destinationMode` | select, **default `action`** | always |
| `destinationAction` | combobox, `optionsSource: ai:destination_actions` | mode = action |
| `destinationSchema` | `schema-fields` (CS-4 editor) | mode = custom |
| `outputShape` | select, default `rows` | always |
| `instructions` | textarea, optional | always |

**Advanced:** Maximum results · Confidence threshold · When confidence is low ·
Require every required field · Quality.

Rule-17 classification lives in the meta's header comment. The one worth calling
out: `destinationAction` is a **static provider resource** and therefore a
registered picker, never a hand-typed key. `allowManualEntry` is deliberately
**off** — an action key is an internal identifier, and the picker already covers
every real destination.

Behaviors inherited from the shared contracts (all test-asserted): a hidden
conditional field is not a readiness gap; switching mode clears the other mode's
answer, so a stale `destinationAction` can never trip the runtime superRefine; the
`schema-fields` Save gate blocks an empty schema in custom mode and ignores it in
action mode; Advanced is seeded from `deriveDefaultConfig`.

---

## 3. The destination-action workflow (the primary experience)

The author picks **one thing** — the step this data is headed for — and ChainReact
does the rest:

1. **Pick.** `ai:destination_actions` lists every registered action from the
   discovery registry, labeled `"<App> — <Action>"`, searchable, with a
   decision-useful description: *"4 fields can be filled automatically."* It is
   `requiresIntegration: false` on purpose — choosing a destination SHAPE is a
   metadata question, so an author can design "transform these rows into
   QuickBooks Create Employee" **before** connecting QuickBooks.
2. **Derive.** `deriveDestinationContext(meta)` reads the destination's own
   `ActionMeta` — the same metadata that renders its config panel — and produces
   both the enforced output schema and the advisory model context.
3. **Re-derive at run time.** The server always re-derives from the live registry.
   The builder sends only the action KEY; a client-supplied schema is ignored even
   when present (test-asserted). This is both a trust boundary (the schema decides
   what the model may emit) and a staleness guard (a provider slice can change a
   destination's fields between save and run).

Worked example — destination `microsoft-outlook:send_email`:

| Derived schema | Reported as unfillable |
|---|---|
| `subject` (string) · `body` (string) · `isHtml` (boolean) · `importance` (string, enum low/normal/high) | `to` `cc` `bcc` (`string-array` → phase-1 gap) · `attachments` |

Not offered in the picker at all: `ai:*` actions (a cost loop with no product
meaning) and actions with zero mappable fields.

---

## 4. The custom-schema workflow

`destinationMode: "custom"` swaps the picker for the **shared** CS-4
`schema-fields` editor and the committed `UserDefinedSchema` contract — no second
schema implementation exists anywhere in the arc. The author names each field
(name · type · required · description); those names become the output keys and the
`{{node.record.x}}` / `{{node.rows[0].x}}` path segments. This is the mode CS-7's
Suggest Fields will hang off, unchanged.

---

## 5. DestinationContext contract

Product metadata only, and structurally so — the derivation reads `ActionMeta`,
which is compiled into the app, and never touches config values, workflow data,
account state, credentials, or provider resources. A test enumerates the ONLY keys
a context field may carry, so a future metadata addition cannot smuggle runtime
state into a model request.

```jsonc
{
  "action": { "key": "microsoft-outlook:send_email", "displayName": "Send Email",
              "description": "…" },
  "fields": [
    { "name": "importance", "label": "Importance", "type": "string", "required": true,
      "description": "How urgent the message is.",
      "options": [ {"value":"low","label":"Low"}, {"value":"normal","label":"Normal"},
                   {"value":"high","label":"High"} ],
      "defaultValue": "normal" },
    { "name": "retries", "label": "Retries", "type": "number", "required": false,
      "numeric": { "min": 0, "max": 5, "integer": true } },
    { "name": "detail", "label": "Detail", "type": "string", "required": false,
      "onlyWhen": { "field": "mode", "valueIn": ["advanced"] } }
  ],
  "excludedFields": [ { "name": "to", "label": "To", "reason": "unsupported_type" } ]
}
```

`outputSchema` (compiled by CS-2's `responseSchemas`) stays the machine-enforced
contract; `destinationContext` is advisory richness — decision 11 — and it is what
lets the model know that `importance` must be one of three literals rather than
any string.

### Exclusions, and why each one is right

| Reason | What it covers | Why |
|---|---|---|
| `sensitive` | `sensitivity: secret` / `connection` | An AI transform must never invent a credential or re-point an account. |
| `provider_resource` | any field with an `optionsSource` | The model cannot know the user's real ids; a plausible invented id is worse than an empty field the author picks on the destination step. |
| `composite` | `renderedBy` fields | Committed by another field's composite editor. |
| `advanced` | `advanced: true` | Not on the destination's normal Setup path (plan §4.9). |
| `multi_value` | `multiple: true` | Array-valued; phase 1 maps scalars. |
| `unsupported_type` | `file` · `file-array` · `string-array` · `keyvalue*` · `object*` · `json` · `schema-fields` · `spreadsheet-rows` · `router-routes` | No scalar equivalent. The `string-array` case (email recipients) is the most-felt gap. |
| `unsupported_name` | names outside `^[a-zA-Z][a-zA-Z0-9_]{0,63}$`, or a case-insensitive duplicate | `FieldMeta.name` is a loose 128-char string; a user-schema name is a workflow-variable path segment. Dropped and reported rather than failing the whole request at build time. |

Every exclusion is REPORTED, never silent: `excludedFields` becomes
`destination_field_skipped:<name>:<reason>` in the run's `warnings` output, and the
picker shows the mappable-field count before the author commits. Type mapping note:
only `date` becomes `date`; `datetime` / `datetime-utc` / `time` stay `string`
because normalizing them to `YYYY-MM-DD` would destroy the time component.

---

## 6. Processor integration

`runDataTransform` calls **`executeAiAction` only**. It supplies the registry key,
the run scope, the built `TransformDataProcessRequest`, and a strict validator —
nothing else. Billing, gating, tier resolution, routing, model choice, and the
`ai_cost_events` write all stay in the shared pipeline.

```
input → classifyTransformInput (serialize once, ≤ 1 MiB)
      → resolveTransformDestination (LIVE registry re-derivation)
      → executeAiAction ( registry → AI_PROCESSOR_ENABLED → tier ∈ supportedTiers
                          → credit price → aiCreditGate → resolveModelRoute
                          → AiProcessorClient.process → our validator
                          → ai_cost_events )
      → confidence policy → bounded workflow output
```

Both preconditions run **before** any spend: an unusable input or an unusable
destination throws with zero gate calls and zero model requests (test-asserted).

### `AI_CREDITS_EXHAUSTED` (the plan's CS-6 engine addition)

`refusalError()` — shared by both AI orchestrators so "out of credits" cannot mean
one thing in Analyze Document and another here — raises
`AiCreditsExhaustedError` (a **subclass** of `AiActionRefusedError`, so every
existing caller keeps working). The engine classifies on `err.name`, mapping it to
the new `AI_CREDITS_EXHAUSTED` code, and the humanizer renders *"Out of AI
credits"* → `upgrade_plan`. Deliberately distinct from `BILLING_EXHAUSTED` (task
quota — a different meter) and `PLAN_FEATURE_REQUIRED` (feature not in the plan):
here the feature IS included and the balance ran out, so run history points at
billing instead of at the step's configuration.

---

## 7. Validation

| Layer | Owns |
|---|---|
| `TransformDataConfigSchema` (`.strict()`) | shape + per-mode requirements (action ⇒ destination, custom ⇒ schema) + a `provider:type` key pattern + advanced bounds |
| `classifyTransformInput` | is this structured data at all, and does it fit the wire budget |
| `resolveTransformDestination` | does the destination exist, is it allowed, does it expose anything mappable |
| CS-2 `responseSchemas` | the per-shape reply envelope |
| `validateExtractedRows` / `validateTransformedRecord` | typing, coercion, null policy, undeclared-key stripping, confidence |

Refusal copy always names the remedy: *"Choose the step this data should be
transformed for."* · *"That destination step isn't available anymore."* ·
*"ChainReact AI steps can't be used as a transform destination."* ·
*"Send Email has no fields this step can fill in automatically."* ·
*"…the value is plain text, not structured data — use Analyze Document to turn text
into fields or rows first."* No refusal reason ever echoes the data (test-asserted).

**Supported inputs:** an array (→ rows, `inputCount` = length) · an object (→ one
record) · an Analyze Document output or parsed document (both are objects) · a
serialized payload string (re-parsed). **Refused:** free text, scalars, empty
lists, empty records, self-referencing values, anything over 1 MiB. Nothing is ever
`String(value)`-ed into a paid call.

Confidence semantics are identical to CS-5: `flag` (default) · `fail` · `blank`,
with `lowConfidenceFields` naming `rows[i]` entries or `record`.

---

## 8. Output contract

One fixed key set, present in **both** shapes (the irrelevant one `null`), so a
downstream reference survives an author switching between rows and record:

`rows · rowCount · record · inputCount · destination · overallConfidence ·
lowConfidenceFields · warnings`

- `rows`: flat objects keyed by the destination's own field names, plus the
  reserved `_confidence` per row — the same shape CS-5 froze for the loop node.
- `record`: one flat object keyed by the destination's field names 1:1.
- `destination`: the destination action key, or `null` in custom mode.
- `warnings`: the `destination_field_skipped:*` notes.

`dynamicOutputs` declares `destinationSchema → rows` and
`destinationSchema → record`, both gated on `destinationMode: "custom"`. It stays
inert until CS-8.

---

## 9. Tests

**New — 101 tests across 6 suites, plus 2 additions to existing suites:**

| Suite | Covers |
|---|---|
| `core/workflows/deriveDestinationContext.test.ts` (20) | type mapping, every exclusion reason, context richness, order, **a contract-valid schema for EVERY registered action**, product-metadata-only no-leak |
| `core/workflows/transformInput.test.ts` (20) | every supported shape, every refusal, size cap, no-echo |
| `services/ai/processor/resolveTransformDestination.test.ts` (10) | both modes, client-copy ignored, unknown / AI / unmappable destinations |
| `services/ai/processor/runDataTransform.test.ts` (23) | both output shapes through the **real pipeline**, destinationContext generation, billing wiring, credits-exhausted mapping, failure mapping, low-confidence policy |
| `integrations/ai/transformData.test.ts` (12) | config defaults, strictness, per-mode requirements, handler wiring |
| `integrations/ai/transformDataMeta.test.ts` (23) | registration, registry lockstep, conditional fields, readiness, Save gate, outputs, dynamicOutputs, **the option source against the real registry** |
| `features/workflow-builder/config-modal/TransformDataConfigForm.test.tsx` (10) | the real config panel: picker vs editor, friendly destination label, mode-switch clearing, Advanced |
| + `core/errors/humanizeActionError.test.ts` | `AI_CREDITS_EXHAUSTED` → `upgrade_plan`, never blames config |
| + `services/execution/engine.test.ts` | a handler throwing `AiCreditsExhaustedError` classifies as `AI_CREDITS_EXHAUSTED` |

The orchestrator suite runs the **real** `executeAiAction` and injects only the
model boundary plus the credit-gate/ledger I/O seams.

---

## 10. Verification (exactly what ran)

- `npx tsc --noEmit` — **0 errors**
- `npm run lint` — **0 errors**, 23 pre-existing `max-lines` warnings, none in CS-6 files
- `npm run lint:structure` — OK
- CS-6 focused suites — **118 tests pass**
- Structure + AI + billing + discovery + execution + options + contracts + documents
  regression — **4503 pass / 284 suites**
- Builder regression — **2406 pass / 195 suites**

### Known unrelated failures (all pre-existing in this working tree)

| Suite | Cause |
|---|---|
| `WorkflowCanvas`, `NodeInspectorPanel` | in-flight dual-builder WIP (the same two CS-4/CS-5 recorded) |
| `structure/no-tracked-import-of-untracked-file` | untracked dual-builder / Fleetio WIP modules |
| `structure/client-server-boundary` | `features/auth/*` + `features/marketing/PricingPage` |
| `structure/field-sensitivity-coverage`, `resource-field-discovery-coverage`, `sensitive-output-coverage` | `linear:*` metas |
| `structure/no-literal-slack-token-fixtures` | `xoxb-…` literals in WIP test files |
| `services/billing/personalPlan` | in-flight billing WIP |
| `services/execution/staleWorkflowRunSweep` | `errorClassification.action` now `retry_later` |
| `services/documents/parsing/parsers.fixtures` (5 PDF cases) | **the same environmental `parsePdf` regression CS-5 flagged.** Still unresolved; still the read path Analyze Document depends on. Diagnose before enabling the flag. |

Two guard files legitimately needed a CS-6 entry:
`tests/structure/field-sensitivity-coverage.test.ts` (the `destination*` fields are
recipient-heuristic FALSE POSITIVES — nothing is sent anywhere; exemption is
guard-only, the apply gate still blocks AI auto-writes) and
`tests/unit/integrations/ai/analyzeDocumentMeta.test.ts` (the AI catalog now has
two actions).

---

## 11. Deviations

1. **`examples` (few-shot pairs) deferred.** Plan §4.9 lists an advanced `json`
   field; the CS-6 brief says "No JSON editing." The brief wins. Few-shot examples
   can return later as a structured editor rather than a raw-value escape hatch —
   nothing in the request contract blocks it.
2. **Outputs add `destination` and `lowConfidenceFields`** to the plan's six-key
   list. `destination` makes a run self-describing (which step's shape was
   targeted); `lowConfidenceFields` is the surface CS-5 established and is required
   for `fail` / `blank` to be explainable. Both are `null`/`[]`-safe.
3. **`outputShape` values are `rows` / `record`**, not the plan's "rows|object" —
   matching the committed `TransformRowsResultSchema` / `TransformRecordResultSchema`
   names. Labels stay plain-language ("One result per item" / "A single result").
4. **The picker withholds unmappable destinations** rather than listing them and
   failing at run time, and shows a mappable-field COUNT on every option. Not in
   the plan; it is the difference between discovering a dead end before or after a
   paid run. Actions with exactly one mappable field (e.g. `airtable:create_record`
   → `typecast`) are still offered — the count says so, and silently hiding a
   legitimate destination would be a worse call.
5. **`allowManualEntry` is off on the destination picker.** Rule 17 normally keeps
   manual entry for power users, but the value here is an internal registry key,
   not a provider identifier a human would know.
6. **`AI_CREDITS_EXHAUSTED` shipped as an `AiActionRefusedError` subclass**, so
   CS-5's assertions and any existing refusal handling keep working while the
   engine can still single it out by `name`.
7. **A whitespace-only follow-up commit accompanies this slice.** CS-5's tooling
   normalized five files to uniform CRLF, turning small edits into whole-file
   diffs (`WorkflowNodeCard.tsx`, `BuilderPreviewOverlay.tsx`,
   `providerCatalog.ts`, `providerCatalog.test.ts`,
   `integration-manifests.test.ts`). Their original mixed endings are restored in a
   separate, content-identical commit (verified with `git diff --ignore-all-space`)
   so Marcus's in-flight builder work merges cleanly. CS-6's own edits preserve each
   file's existing endings.
8. **Auto-prefill of the destination step's config is NOT implemented** — the plan
   marks it a phase-2 enhancement, and the brief does not ask for it. Today the
   author wires `{{transform.record.subject}}` into the destination step by hand;
   the 1:1 key naming is what makes that mechanical.

---

## 12. Risks

1. **Recipients are the most-felt derivation gap.** `to` / `cc` / `bcc` are
   `string-array`, so the highest-value email destinations can't have their
   recipients mapped. Lifting it means either an array-valued user-schema type or a
   scalar-to-array coercion — a contract decision, not a bug fix.
2. **A one-mappable-field destination is a weak experience.** Airtable / Sheets /
   Trello-style actions put most of their inputs behind provider-resource pickers.
   Mitigated by the visible count, but the honest ceiling is real.
3. **Cross-app quality is unproven.** Every test mocks at the model boundary; how
   well a real model maps a messy payload into 4–15 derived fields is unknown until
   CS-0's gateway is deployed. The destination context is the main lever if it
   underperforms.
4. **The PDF fixture regression from CS-5 is still open** and gates flag-on
   readiness for the arc as a whole.
5. **`inputCount` counts INPUT items, not output rows.** A model that drops or
   merges rows shows `inputCount: 10, rowCount: 8`. That is deliberate (both facts
   are useful), but nothing currently fails the step on a mismatch — a possible
   future `strictRowCount` knob.
6. **Flag ordering unchanged:** `ENABLE_AI_CREDIT_ENFORCEMENT` must go on **before**
   `AI_PROCESSOR_ENABLED` in production.

---

## 13. Readiness for CS-7 and CS-8

- **CS-7 (Suggest Fields)** — unblocked. `ai:suggest_schema` is registered and
  priced; the `schema-fields` editor now has TWO consumers (`expectedFields` /
  `rowSchema` on Analyze Document, `destinationSchema` here), and the CS-4
  extension point (one `commit()` funnel) is untouched. The custom-destination mode
  is the third place a proposal will merge.
- **CS-8 (Dynamic outputs)** — unblocked, with four declarations across two shipped
  metas to synthesize from. One asymmetry to design for: the destination-ACTION
  mode has no `schema-fields` config field, so its children can't be expressed by
  today's declaration contract. Either CS-8 special-cases a derived-destination
  source, or the picker's shape stays discovery-blind (runtime resolution already
  works — only the variable picker is affected).
- **CS-9 (E2E + rollout)** — Transform Data now needs a mock-gateway E2E of its own,
  plus the still-open `.env.example` entries and the outputs-sensitivity decision
  carried over from CS-5.

---

## 14. Hard boundaries (what CS-6 did NOT do)

- No push, no deploy, no PR.
- No feature flag enabled; both `AI_PROCESSOR_ENABLED` and
  `ENABLE_AI_CREDIT_ENFORCEMENT` remain OFF.
- No migration written or applied; `db:push` not run.
- No new npm dependency.
- No redesign of the processor, billing, routing, registry, parser, or builder
  contracts — only additive consumption, plus the one additive engine failure code
  the plan assigns to this slice.
- Suggest Fields execution, dynamic-output synthesis, OCR, image understanding, loop
  support, AI context sharing, and runtime-generated actions were not started.
