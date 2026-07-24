# AI-PROVIDER-7 — CS-7 Outcome: Suggest Fields

**Type:** Implementation outcome (CS-7 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-4](./ai-provider-cs4-builder-contract-outcome.md),
[CS-5](./ai-provider-cs5-analyze-document-outcome.md), and
[CS-6](./ai-provider-cs6-transform-data-outcome.md)). Local commit only; nothing
pushed, no flags enabled, no migration, no `db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (based on CS-6 `1034374c6`)

`AI_PROCESSOR_ENABLED` remains **OFF** everywhere — the route refuses before any
read or charge, so the button is present but inert until the flag is on.

---

## 1. User experience

An author opens Analyze Document, picks "Pull out specific fields", and instead of
an empty editor and a blank stare there is a **Suggest fields** button next to
*Add field*.

1. **Click.** The button is the only trigger — nothing fires on mount, on
   re-render, or when a sibling field changes.
2. **"Reading your document to suggest fields..."** while the request is in
   flight; the button is disabled so a second click can't double-charge.
3. **A proposal**, described in the author's terms: *"ChainReact found 6 fields in
   payroll.pdf. Your current fields stay unless you replace them."*
4. **They decide.** With an empty editor: **Use these fields**. With existing rows:
   **Add these fields** (append only what's new) or **Replace my fields** (a
   deliberate second choice), plus **Dismiss**.
5. **The fields land as ordinary rows** — renameable, retypeable, removable,
   reorderable, and judged by the same validator as anything hand-typed. A short
   note says what happened: *"Added 2 fields. 1 you already had was left alone."*

Failures are recoverable and specific rather than generic:

| Situation | What the author sees |
|---|---|
| No document picked yet | "Pick the document or data for this step first — ChainReact reads it to suggest fields." |
| Document is a `{{step}}` token, never run | "Test this workflow once so ChainReact has a real example to read, then try again." |
| That step ran but produced nothing there | "The last test run didn't produce anything at that step. Run it again with real data, then try again." |
| Scanned / unreadable file | The document pipeline's own message ("No readable text found — scanned or image-only documents aren't supported yet.") |
| Out of AI credits | "You've used all AI credits for this billing period." |
| Transient failure | The message plus a **Try again** button |

A retry is offered only where a retry could actually help; "run the workflow first"
gets a Dismiss, not a button that would fail identically.

---

## 2. Where the sample comes from

The plan's primary source, implemented server-side:

1. **A literal saved in the node's own config** — a pasted FileRef or typed text.
   Works with no run at all.
2. **The author's own most recent TEST run** — when the document field holds a
   single `{{step.path}}` token, the value it pointed at is read from the run,
   through `buildLatestValuesBySource` (the same bridge the variable picker's
   latest-run previews use) + `resolveValueAtPath`.

`core/workflows/suggestionSample.ts` is the pure resolver for both, so the builder
and the route agree on "is there a sample yet?" without a round trip.

**The client never supplies a file reference.** A browser-supplied `FileRef` would
let any member point the server's fetcher at an arbitrary URL; the body carries
only `{ nodeId, sampleSourceField, instructions? }` and the server re-reads the
saved config and the run itself. Run-output access mirrors `toWorkflowRunDetail`
exactly — a step output is readable only on a **test** run the **caller** started —
so this cannot become a side channel onto a co-member's or a production run.

---

## 3. The AI request

`services/ai/processor/runSchemaSuggestion.ts`:

```
sample → resolveAnalysisDocument (CS-5 pipeline, WHOLE)
       → executeAiAction("ai:suggest_schema")
       → strict UserDefinedSchema validation
       → proposal
```

- **No duplicate parsing.** FileRef → bytes → format dispatch → parser → text
  budget is CS-5's `resolveAnalysisDocument`, unchanged, called with the
  `summarize` overflow policy (a proposal only needs to see enough of a document to
  name its fields). A scanned PDF therefore fails here with the same message it
  would fail with in Analyze Document — and there is still no OCR.
- **Task** `suggest_schema` with the parsed document and no schema (there is
  nothing to enforce yet — that's the point of the call).
- **Billing** is `executeAiAction`'s: registry key `ai:suggest_schema` → feature
  `schema_suggestion`, 1 credit, `fast` tier only (the registry allows no other).
  There is no credit logic in the route or the handler.

---

## 4. Generated schema contract

The proposal IS a `UserDefinedSchema` — `SuggestSchemaResultSchema` is literally
`UserDefinedSchemaSchema` — so a suggestion is held to exactly the contract a
hand-typed schema is held to:

- identifier-safe names (`^[a-zA-Z][a-zA-Z0-9_]{0,63}$`), case-insensitively unique;
- the closed primitive type set (`string` · `number` · `boolean` · `date` ·
  `currency`) — no nested schemas, no objects, no arrays;
- optional `required` and `description` per field.

Anything else is a **rejected reply**, not a silently-cleaned one. The single
accommodation is volume: a proposal longer than `MAX_SUGGESTED_FIELDS` (40) is
truncated rather than failed — an over-eager model shouldn't cost the author their
suggestion.

On the way into the editor, proposed names run through the SAME
`normalizeSchemaFieldName` the editor applies to hand-typed names
(`Employee Name` → `employee_name`, `2024 Total` → `f_2024_total`), so a proposal
can never introduce an identifier the author could not have typed themselves.

---

## 5. Validation

Nothing bypasses the CS-4 rules:

| Layer | Owns |
|---|---|
| `BodySchema` (`.strict()`) | the request shape; a client-supplied `accountId` is a 400 |
| `resolveSuggestionSample` | is there a sample, and what should the author do if not |
| `resolveAnalysisDocument` | can the document be read at all |
| `SuggestSchemaResultSchema` | the proposal is a legal `UserDefinedSchema` |
| `mergeSuggestedFields` | normalization, case-insensitive de-duplication, the 200-row cap |
| `validateSchemaFieldsValue` (CS-4) | the merged result, exactly as before |
| `collectSchemaFieldsBlockingError` (CS-4) | the Save gate, exactly as before |

The merge rules are pure and separately tested: **add** never removes or reorders
an existing row, a name the author already has is skipped (not overwritten),
duplicates inside the proposal collapse, unusable names are dropped, and the row
cap is respected with a count of what didn't fit.

---

## 6. Builder integration

- `FieldMeta.sampleSourceField` (additive, optional) names the sibling field
  holding the document. `ai:analyze_document`'s two editors declare `"file"`;
  `ai:transform_data`'s `destinationSchema` declares `"input"`. Declarative rather
  than heuristic: guessing "which input is the document" would be right for today's
  two actions and silently wrong for the third. Meta-level `superRefine` enforces
  that the name is a real sibling and that only a `schema-fields` field declares it.
- `useSchemaSuggestion` owns the request state machine (idle → loading →
  proposal | error) with abort-on-unmount and a guard against concurrent clicks.
- `SchemaFieldsSuggestPanel` renders the transient states and **nothing at all**
  when idle, so an author who never clicks sees the byte-identical CS-4 editor.
- `SchemaFieldsField` gained the button plus two apply paths, both going through
  the same `commit()` every manual edit already used — which is what makes
  validation, normalization, ordering, and the Save gate behave identically for
  suggested and hand-typed rows.
- The button hides itself entirely when the meta declares no sample source, or
  when there is no saved workflow / open node for the server to read.

---

## 7. Tests

**New — 79 tests across 5 suites, plus additions to 3 existing suites:**

| Suite | Covers |
|---|---|
| `core/workflows/suggestionSample.test.ts` (16) | literals, tokens, trigger alias, deep paths, every "no sample" arm, actionable copy |
| `services/ai/processor/runSchemaSuggestion.test.ts` (18) | **real pipeline**: registry key, `schema_suggestion` feature, fast tier, request shape, FileRef reuse, gate ordering, credits-exhausted, and the full proposal-validation matrix (duplicates · illegal names · unsupported types · nested shapes · empty · oversized) |
| `app/api/workflows/suggest-schema-route.test.ts` (18) | gate order, strict body, disabled-before-read, no-leak 404, freeze, node-not-found, sample resolution, **co-member / non-test runs are never sampled**, failure mapping, response no-leak |
| `config-modal/fields/schemaFieldsSuggestion.test.ts` (11) | the merge rules, in isolation |
| `config-modal/fields/SchemaFieldsSuggest.test.tsx` (15) | the REAL editor: availability, loading, error, retry, add vs replace, dismiss, and that suggested rows stay ordinary editable rows |
| + `contracts/actionMetaAiProvider.test.ts` | `sampleSourceField` validation (unknown sibling · self-reference · wrong field type) |
| + both AI meta suites | each shipped editor points at the right document field |

Only the model boundary and the network boundary are mocked; the shared pipeline,
the parser dispatch, the merge rules, and the CS-4 validator all run for real.

---

## 8. Verification (exactly what ran)

- `npx tsc --noEmit` — **0 CS-7 errors**
- `npm run lint` — **0 errors**, 22 pre-existing `max-lines` warnings, none in CS-7 files
- `npm run lint:structure` — OK
- CS-7 focused suites — **79 tests pass**
- Structure + AI + contracts + core/workflows + integrations/ai + workflow routes +
  billing + discovery + options regression — **4611 pass / 293 suites**
- Builder regression — **2432 pass / 197 suites**

### Known unrelated failures (all pre-existing in this working tree)

| Suite | Cause |
|---|---|
| `WorkflowCanvas`, `NodeInspectorPanel` | in-flight dual-builder WIP (the same two CS-4→CS-6 recorded) |
| `structure/no-tracked-import-of-untracked-file` | untracked dual-builder / vehicle-link WIP modules |
| `structure/client-server-boundary` | `features/auth/*` + `features/marketing/PricingPage` |
| `structure/field-sensitivity-coverage`, `resource-field-discovery-coverage`, `sensitive-output-coverage` | `linear:*` metas |
| `structure/no-literal-slack-token-fixtures` | `xoxb-…` literals in WIP test files |

Also unrelated, and NEW since CS-6 (both belong to in-flight WIP that appeared
mid-session, neither is in this commit): typecheck errors in
`tests/unit/services/resourceLinks/vehicleLinkService.test.ts` and in three
account-deletion / purge test files.

**Still open from CS-5:** the 5 failing `parsePdf` fixture cases. CS-7 leans on
that exact pipeline, so a PDF sample cannot be suggested from until it is
diagnosed. Text, CSV, DOCX, and XLSX samples are unaffected.

---

## 9. Deviations

1. **No React Agent capability entry.** The plan calls for a `schema_suggestion`
   capability in `services/ai/reactAgent/capabilities.ts` behind
   `runAuthorizedCapability`. That seam's contract is explicit that **the ROUTE
   owns `aiCreditGate`** — but for an AI action `executeAiAction` owns it, so
   registering there would have meant either two gates (a double charge) or two
   sources of truth for the credit feature. `executeAiAction` already provides the
   governance the capability registry exists to provide: a frozen allow-list of
   keys, fail-closed lookup, and an `ai_cost_events` row with feature/tier/model
   attribution. Registering the capability is a no-op at best and a billing bug at
   worst, so it was deliberately skipped.
2. **Workflow-scoped route, not account-scoped.** `POST /api/workflows/[id]/ai/
   suggest-schema` rather than `/api/accounts/[id]/ai/suggest-schema`. The credits
   belong to the account that OWNS THE WORKFLOW — exactly the account
   `executeAiAction` charges when the same AI step runs — not to whichever account
   the caller happens to have active. Deriving it from the workflow makes that
   impossible to get wrong and keeps the builder from needing an account id it
   deliberately does not hold client-side. Membership, freeze, and no-leak-404
   behavior are unchanged.
3. **The one-off sample UPLOAD fallback is deferred.** The plan lists it as source
   (b) behind the latest-run path. It needs an upload surface, staging into
   `workflow-files`, and its own TTL/cleanup story — none of which the CS-7 brief
   asks for. The two shipped sources cover the real case, and when neither exists
   the UI says exactly what to do. Recorded as remaining CS-7 scope, not silently
   dropped.
4. **`FieldMeta.sampleSourceField` is a new (additive, optional) contract field.**
   The brief says not to redesign builder contracts; this is an addition in the
   same style as CS-4's `dynamicOutputs` and the existing `batchRowsField` /
   `renderedBy`, validated at module load. The alternative — inferring the document
   field by type heuristics — would have been guesswork encoded in a renderer.
5. **`buildLatestValuesBySource` accepts a structural run source.** A type widening
   only (`LatestValuesRunSource`), so the route can pass a server-side run record
   without converting it to the client run-detail DTO. No behavior change; every
   existing caller compiles and behaves identically.
6. **A proposal longer than 40 fields is truncated, not rejected.** The contract's
   own ceiling is 200; 40 is the suggestion-specific bound, because a suggestion is
   a starting point and failing the author over model verbosity would be the wrong
   trade.

---

## 10. Risks

1. **The CS-5 PDF regression gates the flagship demo.** "I uploaded my payroll
   report" is a PDF story; until `parsePdf` is fixed in this environment the
   suggestion path can't read one.
2. **Proposal quality is unproven.** Every test mocks at the model boundary. How
   good the field names actually are on a real payroll PDF is unknown until CS-0's
   gateway is deployed — and it is the whole value of the feature.
3. **A sample needs a prior test run** in the common case (the document is a
   runtime token). That is a real first-use friction: the author must run once
   before suggestions help. The copy says so plainly; the upload fallback
   (deviation 3) is the eventual fix.
4. **Suggestions cost a credit each.** Cheap (1) and gated, but a author clicking
   repeatedly on a poor document spends real money. There is no client-side
   throttle beyond "one request at a time".
5. **Document text crosses to the AI service at BUILD time, not just run time.**
   Same posture and same disclosure as the actions themselves, but it is a new
   moment for it to happen — worth a line in the CS-9 privacy note.

---

## 11. Deferred work for CS-8

CS-8 (dynamic-output synthesis) is unblocked and unaffected: this slice changed
how rows get INTO the `schema-fields` editor, never the value it commits, and
`dynamicOutputs` reads that committed value. The four declarations across the two
shipped metas are untouched, including CS-6's recorded asymmetry (the
destination-ACTION mode has no `schema-fields` field, so its children can't be
expressed by today's declaration contract).

Also still open for CS-9: the sample-upload fallback, the `.env.example` entries
for the four `AI_PROCESSOR_*` vars, the outputs-sensitivity decision carried from
CS-5, and an E2E for each AI action against a mocked gateway.

---

## 12. Hard boundaries (what CS-7 did NOT do)

- No push, no deploy, no PR.
- No feature flag enabled; `AI_PROCESSOR_ENABLED` and
  `ENABLE_AI_CREDIT_ENFORCEMENT` both remain OFF.
- No migration written or applied; `db:push` not run.
- No new npm dependency.
- No change to the processor, billing, routing, registry, parser, or Transform Data
  implementation — only additive consumption, plus the one additive optional
  `FieldMeta` property and a type widening in `latestRunValues`.
- Dynamic outputs, runtime synthesis, OCR, loop support, AI context sharing, and
  additional AI actions were not started.
