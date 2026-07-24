# AI-PROVIDER-5 — CS-5 Outcome: Analyze Document, the first ChainReact AI workflow action

**Type:** Implementation outcome (CS-5 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-2](./ai-provider-cs2-processor-outcome.md),
[CS-3](./ai-provider-cs3-billing-outcome.md), and
[CS-4](./ai-provider-cs4-builder-contract-outcome.md)). Local commit only; nothing
pushed, no flags enabled, no migration applied, no `db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (based on CS-4 `7ce4ea57a`)

`AI_PROCESSOR_ENABLED` remains **OFF** everywhere, so the action is registered but
unreachable: the catalog route returns an empty list and the picker hides the AI
section entirely.

---

## 1. What shipped

The first AI capability that executes **inside a workflow run**. One action, five
analysis modes, one billing feature, one bounded output surface.

```
core/documents/documentInput.ts          # PURE: classify FileRef | text | ParsedDocument
services/ai/processor/
├── analysisErrors.ts                    # typed throwables + the engine's name-based contract
├── extractionValidator.ts               # coercion, null policy, key stripping, confidence
├── resolveAnalysisDocument.ts           # input → parser → budget → DocumentTextPayload
└── runDocumentAnalysis.ts               # request build → executeAiAction → bounded output
integrations/ai/actions/
├── analyzeDocument.schema.ts            # strict resolved-config contract + per-mode rules
├── analyzeDocument.meta.ts              # builder metadata + dynamicOutputs declarations
└── analyzeDocument.ts                   # the handler (thin by construction)
```

Registry edits: `services/execution/handlers/_handlerInventory.ts` (+1 handler),
`services/discovery/_metaInventory.ts` (+1 meta),
`services/ai/tools/providerCatalog.ts` (the AI provider joins the planner catalog —
see §11).

### Final action metadata

| Field | Value |
|---|---|
| Key | `ai:analyze_document` |
| Provider | `ai` — **ChainReact AI** (connectionless, no manifest) |
| Display name | **Analyze Document** |
| Category | `ai` |
| `requiresIntegration` | `false` |
| `riskLevel` / `isDestructive` / `requiresConfirmation` | `low` / `false` / `false` |
| `consumesFileRef` / `producesFileRef` | `true` / `false` |
| Billing feature | `document_analysis` — 3 credits (standard) · 6 (higher quality) |
| Test mode | Runs (real, uncharged model call — owner decision 4) |

The description carries both required disclosures: the credit cost per run and
"Document content is processed by ChainReact's AI service" (plan §6 owner action item,
asserted by test).

---

## 2. Builder UX

**Setup (always):** Document · What should the AI do? · Extra instructions.

**Setup (revealed by mode, required when visible):**

| Mode | Revealed field | Editor |
|---|---|---|
| Summarize it | — | — |
| Pull out specific fields | Fields to pull out | `schema-fields` (CS-4) |
| Pull out a table of rows | Columns for each row | `schema-fields` (CS-4) |
| Sort it into a category | Categories (+ Allow "Other") | `string-array` + toggle |
| Answer a question about it | Question | textarea |

**Advanced:** Page range · Sheet name · Maximum pages · Maximum rows · Confidence
threshold · When confidence is low · Require every required field · Quality.

Rule-17 classification (every field, exactly one class) is recorded in the meta's own
header comment: `file`/`mode`/`instructions`/the four mode editors are **core user
decisions**, `allowOtherLabel` is a **conditional option**, the eight advanced entries
are **advanced controls**. There is no internal-implementation-detail field — the
author never sees a task name, model name, tier, registry key, or wire format.

Consequences that fall out of the shared contracts (all test-asserted):

- A hidden conditional field is **not** a readiness gap, so switching modes never
  leaves a phantom "needs setup" marker.
- Changing mode **clears** the previous mode's answer (SchemaForm's `visibleWhen`
  cascade), so a stale other-mode value can never trip the runtime superRefine.
- The `schema-fields` Save gate already runs provider-agnostically in
  `ConfigModalShell`, so an empty/invalid schema blocks Save in the extract modes and
  is ignored in the others.
- Advanced values are seeded by `deriveDefaultConfig` from the meta `defaultValue`s
  (mode=summarize, allowOtherLabel=true, maxRows=100, confidenceThreshold=0.7,
  onLowConfidence=flag, strictValidation=true, modelQuality=standard).

**AI node icon (CS-4 deferred this here):** `WorkflowNodeCard` and
`BuilderPreviewOverlay` now show the ChainReact brand mark for any *connectionless*
provider rather than the literal `"native"`, so an AI node renders as ChainReact
instead of an initials avatar. `data-provider` now reflects the real provider id
(`native` output is byte-identical; `ai` gets its own).

---

## 3. Supported inputs

One "Document" field accepts three shapes, classified by
`core/documents/documentInput.ts`:

| Shape | Handling |
|---|---|
| `FileRef` (`v2_storage` / `signed_url`) | bytes → `parseDocument` dispatch (PDF · DOCX · XLSX · CSV · TXT) |
| plain text | wrapped as a one-segment `ParsedDocument` |
| `ParsedDocument` | used as-is (no producer ships one yet; accepting it keeps a future parse step and the CS-7 sample path from needing a contract change) |

Anything else is **refused**, never stringified into a paid call. `provider_url` refs
get the structured remedy ("add that app's download step before this one"). Typed
parser failures (`UnsupportedDocumentTypeError`, `DocumentHasNoTextError` — i.e.
scanned/image-only PDFs, the explicit no-OCR boundary — `DocumentParseError`,
`DocumentTooLargeError`, `PageRangeError`) surface as author-facing config errors.

Order of narrowing: page range (PDF only) → `maxPages` cap → text budget. Selectors
that cannot apply produce an explicit warning and `pageRangeApplied: false` — never
silence. Budget overflow **truncates** for summarize/classify/answer and **fails with
guidance** for the extract modes (silently missing payroll rows is a correctness bug).

---

## 4. Validation behavior

Three layers, no duplication:

1. **Strict config schema** (`analyzeDocument.schema.ts`) — `.strict()`, plus the
   per-mode superRefine that mirrors the builder's required-when-visible rules, so a
   config assembled outside the builder (AI planner, template, API) is held to the
   same contract.
2. **Delivery contract** (CS-2 `responseSchemas.ts`) — the per-mode envelope the model
   reply must satisfy structurally.
3. **Extraction validator** (new) — semantic pass against the author's schema:
   - every declared key always present; not-found becomes explicit `null`;
   - undeclared/hallucinated keys stripped, never surfaced;
   - required-missing **fails** under `strictValidation` (default on), nulls when off;
   - narrow coercion: `$1,234.56` / `(1,234.56)` → number; yes/no/1/0/on/off → boolean;
     `YYYY-MM-DD`, `M/D/YYYY` (US), `July 4, 2026`, `4 Jul 2026` → `YYYY-MM-DD`.
     Anything ambiguous is a typed failure — we never guess.

Failures name **field names only** (`gross_pay: expected a number`,
`rows[0].amount: required value not found`) — never a document value.

**Confidence** is information, not an error. `confidenceThreshold` (default 0.7)
produces `lowConfidenceFields`; `onLowConfidence` decides what happens:
`flag` (default, report and continue) · `fail` (stop the run) · `blank` (null the
flagged values, keeping each row's `_confidence` so the run explains itself).

---

## 5. Processor integration

`runDocumentAnalysis` calls **`executeAiAction` only** — no handler-local billing,
gating, routing, or ledger code exists to drift. It supplies exactly four things:
registry key (`ai:analyze_document`), the run scope (account / user / workflow / run /
testMode), the built `AiProcessRequest`, and a strict validator. The tier is the one
boundary translation: `modelQuality` standard→`fast`, advanced→`strong`.

Execution order, proven by test against the **real** pipeline:

```
Document input → parser → ParsedDocument → text budget
  → executeAiAction ( registry → AI_PROCESSOR_ENABLED → tier ∈ supportedTiers
                      → credit price → aiCreditGate → resolveModelRoute
                      → AiProcessorClient.process → our validator → ai_cost_events )
  → confidence policy → bounded workflow output
```

Nothing is spent before the document is known to be readable: an unusable input throws
**before** the gate is ever called (test-asserted, zero gate calls, zero requests).

**Engine failure mapping.** Handlers throw; the engine classifies. Retryable processor
failures (TIMEOUT / RATE_LIMITED / retryable PROVIDER_ERROR) throw `AiTransientError`,
whose `name` is `"TimeoutError"` — the engine's name-based contract (plan §7) —
yielding `TRANSIENT_PROVIDER_ERROR`. Everything else (config errors, refusals,
validation failures, non-retryable provider errors) yields `HANDLER_FAILED` with a
safe message.

---

## 6. Output contract

One fixed key set, present on **every** mode (irrelevant keys `null`), so a downstream
reference never breaks when the author switches mode:

`mode · sourceName · detectedType · summary · keyPoints · fields · rows · rowCount ·
label · answer · overallConfidence · lowConfidenceFields · truncated ·
pageRangeApplied · segmentsAnalyzed · warnings`

- `fields` is a flat `{ declared_name: value }` map — the value, not a
  `{value, confidence}` wrapper — so `{{node.fields.employee_name}}` resolves to what
  the author expects. Confidence lives in `overallConfidence` + `lowConfidenceFields`.
- `rows` is a **flat-object array** plus the reserved `_confidence` per row. This is
  the frozen interface the sibling loop node (`native:for_each`, CS-10) iterates.
- Naming follows the plan's fixed key set: the classification result is `label` and
  the single confidence key is `overallConfidence` (the CS-5 brief's
  "classification"/"confidence" examples map onto these).
- No bytes, no base64, no provider hosts, no `...result` spread.

`dynamicOutputs` is declared exactly as planned and stays **inert** — CS-8 owns
synthesis:

```
{ configField: "expectedFields", attachUnder: "fields", whenField: "mode", whenValueIn: ["extract_fields"] }
{ configField: "rowSchema",      attachUnder: "rows",   whenField: "mode", whenValueIn: ["extract_rows"] }
```

---

## 7. Tests

**New — 82 tests across 6 suites, all passing:**

| Suite | Covers |
|---|---|
| `tests/unit/core/documents/documentInput.test.ts` (13) | classification matrix, refusals, no value in a refusal reason |
| `tests/unit/services/ai/processor/extractionValidator.test.ts` (14) | full coercion matrix, key stripping, strict/lenient, low-confidence labels, blanking |
| `tests/unit/services/ai/processor/resolveAnalysisDocument.test.ts` (14) | all three input kinds, provider_url remedy, typed parser failures, page range / maxPages / budget truncate-vs-reject |
| `tests/unit/services/ai/processor/runDocumentAnalysis.test.ts` (23) | all five modes, request shape per mode, **real pipeline** billing wiring, failure mapping, low-confidence policy |
| `tests/unit/integrations/ai/analyzeDocument.test.ts` (11) | config defaults, strictness, per-mode requirements, handler wiring |
| `tests/unit/integrations/ai/analyzeDocumentMeta.test.ts` (21) | registration, registry lockstep, test-mode posture, conditional fields, readiness, Save gate, outputs, dynamicOutputs |
| `tests/unit/features/workflow-builder/config-modal/AnalyzeDocumentConfigForm.test.tsx` (11) | the real config panel: per-mode surface, mode-switch clearing, Advanced tab |

The orchestrator suite deliberately runs the **real** `executeAiAction` (real registry
lookup, flag check, tier resolution, credit pricing, gate ordering, routing seam,
ledger write) and injects only the external model boundary plus the credit-gate and
ledger I/O seams — the repo's E2E philosophy applied at unit scale. It asserts the
gate receives `feature: "document_analysis"` with the right planned tier, and that the
ledger row carries the workflow/run scope and credits charged.

**Regression re-run:** structure suites · `tests/unit/services/ai/**` ·
`tests/unit/contracts` · `tests/unit/core/documents` · `tests/unit/core/billing` ·
`tests/unit/services/billing` · `tests/unit/services/discovery` ·
`tests/unit/services/execution` · `tests/unit/features/workflow-builder` (194 suites).

---

## 8. Verification (exactly what ran)

- `npx tsc --noEmit` — **0 errors**
- `npm run lint` — **0 errors**, 22 pre-existing `max-lines` warnings, none in CS-5 files
- `npm run lint:structure` — OK (every leaf folder ≤ 50 files)
- CS-5 focused suites — **82/82 pass**
- Builder regression — **2365 pass / 192 suites** (2 pre-existing failures, below)
- Structure + discovery + execution + AI + billing regression — **2690 pass**

### Known unrelated failures (all pre-existing in this working tree)

| Suite | Cause |
|---|---|
| `WorkflowCanvas`, `NodeInspectorPanel` | in-flight dual-builder WIP (same two CS-4 recorded) |
| `structure/no-tracked-import-of-untracked-file` | 13 untracked dual-builder WIP modules (`useDestructivePreview`, `documentAgentContext`, `DestructiveApplyConfirm`, …) |
| `structure/client-server-boundary` | `features/auth/*` + `features/marketing/PricingPage` import values from `services/` |
| `structure/field-sensitivity-coverage`, `structure/resource-field-discovery-coverage`, `structure/sensitive-output-coverage` | `linear:*` metas (`relatedTo`, `parentId`, `issueId`, `add_comment.body`) |
| `structure/no-literal-slack-token-fixtures` | 10 `xoxb-…` literals in dual-builder / agent WIP test files |
| `unit/services/execution/staleWorkflowRunSweep` | `errorClassification.action` now `"retry_later"` |
| `unit/services/documents/parsing/parsers.fixtures` (5 PDF cases) | `parsePdf` throws `DocumentParseError` on the CS-1 fixture. **The fixture bytes are byte-identical to HEAD and CS-5 changed no parser code** — CS-1/CS-2 recorded these green on 2026-07-23/24, so something environmental (unpdf/pdfjs under the current Node) regressed. Worth a follow-up before enabling the flag, since it is the PDF read path this action depends on. |

None of these were touched by CS-5, and none are caused by it.

---

## 9. Deviations from the CS-5 brief / plan

1. **Corrective re-ask deferred.** Plan §4.7 specifies one internal corrective re-ask
   on schema violation. A re-ask is a second model call, which under the "no handler
   ever bypasses billing" rule means a second `executeAiAction` — i.e. a second
   charge — or a deliberate unmetered retry. That is a billing decision, not an
   implementation detail, so CS-5 fails cleanly with `ExtractionValidationError`
   naming the fields instead. Flagged for owner ruling; the seam is a single call site.
2. **One "Document" field, not separate file/text fields.** The brief lists FileRef,
   ParsedDocument, and Text as accepted inputs. Modelling them as three fields would
   create an XOR readiness problem for no user benefit, so the plan's single `file`
   field accepts all three and `classifyDocumentInput` produces the typed refusal.
3. **`maxPages` added (brief) though absent from the plan's field list.** It caps
   pages/sheets after the page range, sets `truncated: true`, and emits a
   `max_pages_applied` warning — an explicit author choice, never silent.
4. **`onLowConfidence` has three values, not two.** The plan names `fail | null_fields`
   but also states low confidence must not fail by default, which needs a third
   default: `flag` (default) · `fail` · `blank`.
5. **The AI provider joined the React-Agent planner catalog.**
   `tests/structure/react-agent-field-coverage` enforces that every registered
   `ActionMeta` is visible to the planner (a node the registry accepts must never be
   invisible to it). `getProviderCatalog` now appends both connectionless providers
   from metadata instead of special-casing `native`. Consequence: the builder AI can
   propose an Analyze Document node — which is the intended direction, but it is a
   product-visible change worth naming.
6. **`integrations/ai/` is exempted from the manifest structure test.** Same reason and
   same mechanism as `native`, formalizing CS-4's manifest-less decision (plan open
   question **O2**) now that the folder exists. The exemption comment points at the
   CS-4 outcome doc.
7. **Parsers are loaded lazily** (`await import(...)` inside `resolveAnalysisDocument`)
   rather than statically. A static import puts unpdf/exceljs/mammoth/papaparse into
   the handler-registry import graph, which every execution path — and every test that
   touches the registry — loads eagerly; exceljs's transitive ESM `uuid` broke ~11
   suites on the first attempt. Lazy loading also keeps the parser stack out of the
   two non-file input paths and reduces the plan's R1 bundling exposure.
8. **Outputs are NOT marked `sensitive`.** Extracted values can be PII (the plan says
   so explicitly for payroll). Marking `fields`/`rows`/`summary`/`answer` sensitive
   would redact them in run details and the variable picker — which is exactly what an
   author needs to see to trust a new extraction step. Plan §6 enumerates the enforced
   controls (nothing in logs / errors / the ledger) and does not include output
   redaction, so CS-5 follows the plan rather than inventing a behavior. **This is an
   owner decision worth ratifying in CS-9** alongside the privacy note.
9. **`.env.example` untouched.** The four `AI_PROCESSOR_*` vars are still undocumented
   there — the file carries unrelated staged WIP that a docs edit would drag into this
   commit (same reason CS-2 deferred it). Carry-over for CS-9.
10. **The validation drawer's `schema_fields_invalid` rule is still dormant.** CS-4
    listed CS-5 as the slice that wires `schemaFieldsByType`. Supplying it means a new
    `build…ByType` helper threaded RSC→`WorkflowBuilder`→7 call sites, several of which
    sit in files with in-flight dual-builder WIP. The rule is redundant today: the
    `ConfigModalShell` Save gate (provider-agnostic, already live) and readiness both
    cover the AI node's schema editors, and the drawer's job is to restate them. Left
    for a focused builder-plumbing slice rather than risking a merge tangle here.

---

## 10. Risks

1. **The PDF fixture regression above.** The action's most important input format has
   5 failing parser tests in this working tree that predate CS-5. Diagnose before
   `AI_PROCESSOR_ENABLED` goes on anywhere.
2. **No live gateway yet.** CS-0 (the Render `/api/hermes-agent/process` endpoint) is
   still outside this repo. Every CS-5 test mocks at the client boundary; the first
   real end-to-end proof needs CS-0 deployed.
3. **Date coercion is US-first.** `7/4/2026` reads as July 4. Non-US documents need
   `YYYY-MM-DD` guidance in the field description. Documented in code; no silent
   locale guessing.
4. **Numeric coercion treats a comma as a thousands separator**, so `1,5` reads as 15.
   Deliberate (guessing decimal commas is worse), but it is a real edge for
   European-formatted spreadsheets.
5. **Unmetered spend if the flags are enabled in the wrong order.** Unchanged from
   CS-3: `ENABLE_AI_CREDIT_ENFORCEMENT` must go on **before** `AI_PROCESSOR_ENABLED`
   in production. `describeAiProcessorRolloutReadiness()` reports it.
6. **The planner can now propose a metered node** (deviation 5). Worth a look at
   whether the React Agent should be steered away from AI actions until pricing copy
   exists in the rail.

---

## 11. Readiness for CS-6, CS-7, CS-8

- **CS-6 (Transform Data)** — unblocked. `executeAiAction`, the extraction validator,
  the tier translation, the error taxonomy, and the connectionless-provider plumbing
  are all shared and provider-agnostic. CS-6 still owns `deriveDestinationContext`,
  the action-catalog `optionsSource`, and the additive `AI_CREDITS_EXHAUSTED` engine
  code (CS-5 falls back to `HANDLER_FAILED` for credit refusals, per the plan's slice
  split).
- **CS-7 (Suggest Fields)** — unblocked. `ai:suggest_schema` is already registered and
  priced; the `SchemaFieldsField` merge extension point is unchanged from CS-4; the
  document-resolution helper (`resolveAnalysisDocument`) is reusable for the sample
  path.
- **CS-8 (Dynamic outputs)** — unblocked and now has a real consumer: two declarations
  on a shipped meta, plus a live `schema-fields` config to synthesize from. Nothing
  about the declaration changed.
- **CS-10 (`native:for_each`)** — the `rows` shape is now frozen: a flat-object array
  with a reserved `_confidence` key per row.

---

## 12. Hard boundaries (what CS-5 did NOT do)

- No push, no deploy, no PR.
- No feature flag enabled (`AI_PROCESSOR_ENABLED` and
  `ENABLE_AI_CREDIT_ENFORCEMENT` both remain OFF).
- No migration written or applied; `npm run db:push` not run.
- No new npm dependency.
- No change to the processor, registry, billing, routing, or builder contracts from
  CS-1..CS-4 — only additive consumption of them (the two exceptions, both additive:
  the planner catalog gained the AI provider, and the manifest structure test gained
  the `ai` exemption).
- Transform Data, Suggest Fields execution, dynamic-output synthesis, OCR, image
  understanding, loop support, context sharing, and runtime action generation were not
  started.
