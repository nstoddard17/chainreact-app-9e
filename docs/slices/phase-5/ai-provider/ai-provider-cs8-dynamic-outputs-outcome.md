# AI-PROVIDER-8 — CS-8 Outcome: Dynamic Outputs

**Type:** Implementation outcome (CS-8 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-4](./ai-provider-cs4-builder-contract-outcome.md),
[CS-5](./ai-provider-cs5-analyze-document-outcome.md),
[CS-6](./ai-provider-cs6-transform-data-outcome.md), and
[CS-7](./ai-provider-cs7-suggest-fields-outcome.md)). Local commit only; nothing
pushed, no flags enabled, no migration, no `db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (based on CS-7 `ed707a524`)

`AI_PROCESSOR_ENABLED` remains **OFF** everywhere.

This slice completes the AI schema pipeline: define fields (CS-4), suggest
fields (CS-7), extract fields (CS-5/CS-6) — and now **use those fields in later
workflow steps with no manual variable registration**.

---

## 1. What shipped

The synthesis half of the CS-4 `dynamicOutputs` contract. One new pure helper,
two consumers, zero contract changes:

```
core/workflows/dynamicOutputs.ts        # applyDynamicOutputs(meta, config) — PURE
features/workflow-builder/hooks/
  useUpstreamVariables.ts               # every action branch resolves outputs through it
services/ai/tools/variables.ts          # the AI planner's variables tool applies the same synthesis
```

An author who commits

```
mode: extract_fields
expectedFields: { fields: [employee_name, gross_pay, department] }
```

on an Analyze Document node immediately sees, on every downstream step:

```
fields.employee_name   fields.gross_pay   fields.department
```

in the variable picker — typed, described, insertable — and the same paths in
the soft reference validator and the React-Agent planner's variable inventory.
Likewise `rows.<column>` for row schemas, and `rows.<name>` / `record.<name>`
for Transform Data's custom-destination schema.

## 2. Runtime synthesis (how outputs are generated)

`applyDynamicOutputs(meta, config)`:

1. **Fast path.** A meta with no `dynamicOutputs` returns `meta.outputs` **by
   reference** — zero allocation for the ~40 existing providers, and referential
   identity the builder's memos can rely on.
2. **Gate.** Each declaration's `whenField`/`whenValueIn` is evaluated against
   the committed config, falling back to the field's declared `defaultValue`
   when uncommitted (an untouched Analyze Document node is `mode: "summarize"`,
   so nothing synthesizes). `whenField` without `whenValueIn` is a presence
   gate. A gated-off declaration contributes nothing — a stale schema left in
   config by a mode switch can never leak through.
3. **Validate.** The `configField` value is parsed with the committed
   `UserDefinedSchemaSchema` — the SAME contract the runtime request builder
   enforces. Anything invalid (bad name, case-insensitive duplicate, unknown
   type, >200 rows, unknown keys, wrong shape) synthesizes **nothing**; the
   static childless output stands.
4. **Attach.** Valid schema rows become child `OutputMeta` under the declared
   `attachUnder` output, in schema-row order, fully typed
   (`string→string · number→number · boolean→boolean · date→string ·
   currency→number` — mirroring the extraction validator's coercions) with the
   author's description carried through. Static children win a name collision
   (duplicate outputs prevented); untouched outputs keep their object identity.

**Sources of truth: committed config + static metadata, nothing else.** Prompts,
AI responses, and runtime values are never consulted, so the tree is identical
on every surface and stable across runs. Stale outputs cannot exist — the tree
is derived on read, never stored, so removing/renaming a schema field removes
the old child on the next render.

## 3. Variable picker behavior

The single builder touchpoint is `useUpstreamVariables`' meta resolution: every
action branch (AI, native, provider) now resolves outputs through
`applyDynamicOutputs(meta, node.config)` — metadata-driven, no provider
special-case. The picker (`VariablePickerPopover`) and the soft reference
validator (`_variableValidator`) already consume that source tree, so both
inherited the children with **zero component changes**:

- Children render nested under `fields` / `rows` / `record` with type chips and
  descriptions; clicking inserts the canonical `{{node.fields.employee_name}}`.
- Updates are immediate: a schema commit updates `pendingNodes`, the source
  memo recomputes, and the picker re-renders. **No refetch** — the catalog
  fetch count is asserted unchanged across schema edits.
- A renamed schema field turns stale downstream references into the existing
  soft `missing_field` warning ("… is not a declared output of …"), and the new
  name resolves cleanly. Uncommitted/invalid schemas leave the parent output
  opaque, so an author mid-setup gets no false warnings.

The AI planner's `getAvailableVariablesForAI` applies the same synthesis, so
agent-proposed wiring sees exactly what the picker shows.

## 4. Validation

| Rule (brief) | Where enforced |
|---|---|
| referenced schema field exists | meta-level `checkDynamicOutputsReferences` (CS-4, unchanged) rejects declarations naming unknown config fields/outputs at module load; synthesis double-guards unknown `attachUnder` at run |
| duplicate outputs prevented | `UserDefinedSchemaSchema` rejects case-insensitive duplicates inside a schema; synthesis skips children colliding with static children (static wins) |
| invalid metadata rejected | committed value re-parsed with the strict contract; any failure → no synthesis, static outputs unchanged |
| stale outputs removed | derived-on-read: schema change/removal/mode-switch drops the children on the next computation, nothing persisted |

## 5. Performance considerations

- Identity fast path: metas without declarations pay one `undefined` check and
  return the same array reference. The sources memo's downstream consumers see
  unchanged references.
- Synthesis runs only for ancestors whose meta declares `dynamicOutputs`
  (today: the two AI metas), inside the existing `useMemo` that already
  recomputes on graph changes — no new subscriptions, no new fetches, no new
  hook state. Cost is O(declarations × schema rows) with a ≤200-row contract
  cap.
- When every synthesized name collides with a static child, the helper still
  returns `meta.outputs` by reference (asserted by test).

## 6. Tests (42 new / extended, all passing)

| Suite | Covers |
|---|---|
| `tests/unit/core/workflows/dynamicOutputs.test.ts` (28) | identity fast paths, defaultValue gate fallback, both REAL metas (fields/rows/record, type mapping, descriptions, order, reorder, stale removal, action-mode asymmetry), the full invalid-value rejection matrix, hand-built-meta edges (presence gate, collision dedup, unknown attachUnder) |
| `tests/unit/features/workflow-builder/hooks/useUpstreamVariables.dynamicOutputs.test.tsx` (6) | the real hook + real graphSlice: fields appear, update immediately with **no refetch**, disappear on mode switch, empty schema, row schema + reorder, Transform Data custom vs action |
| `tests/unit/features/workflow-builder/config-modal/fields/VariablePickerPopover.dynamicOutputs.test.tsx` (8) | the REAL picker renders/inserts synthesized children (`{{ai1.fields.employee_name}}`), type chips, non-extract modes; the REAL soft validator: rename → `missing_field`, no false warnings mid-setup, row typos |
| `tests/unit/services/ai/tools/variables.test.ts` (+2) | the planner tool exposes `fields.employee_name` (typed) from a committed schema against the real registry; none without one |

Only the catalog-fetch boundary is mocked in the hook suite (the same boundary
every hook test mocks); the metas, contracts, synthesis, graph store, picker,
and validator are all real.

## 7. Verification (exactly what ran)

- `npx tsc --noEmit` — **0 CS-8 errors** (4 pre-existing errors in in-flight
  vehicle-links / notifications WIP files: `suggestWorkflowRepair.ts`,
  `runReport.ts`, `buildWorkflowFailurePayload.ts` ×2 — none touched here)
- `npm run lint` — **0 errors**, 22 pre-existing `max-lines` warnings, none in
  CS-8 files
- `npm run lint:structure` — OK (`core/workflows` at 49/50 after the new file)
- CS-8 focused suites — **42 tests pass** (28 + 6 + 8, plus the extended
  variables tool suite 7/7)
- Builder hooks + config-modal regression — **968 pass / 77 suites**
- AI integrations + services/ai + core/workflows + contracts regression —
  **2245 pass / 173 suites** (1 pre-existing skip)
- Builder + workflow routes + structure regression — **3123 pass / 251 suites**

### Known unrelated failures (all pre-existing in this working tree)

| Suite | Cause |
|---|---|
| `WorkflowCanvas`, `NodeInspectorPanel` | in-flight dual-builder WIP (recorded since CS-4) |
| `structure/no-tracked-import-of-untracked-file`, `no-literal-slack-token-fixtures` | untracked dual-builder / vehicle-links WIP modules and fixtures |
| `structure/client-server-boundary` | `features/auth/*` + `features/marketing/PricingPage` |
| `structure/field-sensitivity-coverage`, `resource-field-discovery-coverage`, `sensitive-output-coverage` | `linear:*` metas |
| `structure/leave-account-scope`, `transfer-ownership-scope` | in-flight account-deletion / billing-lifecycle WIP (these scan account routes CS-8 never touches; new to the tree since CS-7's run, same WIP family CS-7 recorded as typecheck failures) |

**Still open from CS-5:** the 5 failing `parsePdf` fixture cases (environmental;
not re-run here — no parser code is on this slice's path).

## 8. Deviations

1. **The AI planner's variables tool got the same synthesis** (3-line change +
   tests) even though the plan named only the builder touchpoint. The tool is a
   first-class consumer of "which variables can node X reference?"; leaving it
   blind would have the agent proposing against a narrower world than the
   author sees. Metadata-driven and identity-preserving like the builder path.
2. **`whenField`-without-`whenValueIn` is defined as a presence gate** (active
   when the gate field has a committed non-empty value). The CS-4 contract
   allowed the combination without fixing its meaning; both shipped metas use
   the full form, so this only pins behavior for future metas — documented in
   the helper and pinned by test.
3. **Static children win name collisions.** No shipped target output declares
   static children today; the rule exists so a future meta that does cannot
   have its typed static contract shadowed by a user schema row.
4. **`_confidence` is NOT synthesized as a row child.** The per-row reserved
   key is real at runtime (CS-5 froze it), but it is not part of the author's
   schema, and the brief's rule is "the schema is the source of truth."
   Hand-typed `rows[0]._confidence` still resolves at runtime, and the
   validator's index-opacity keeps it warning-free.

## 9. Remaining limitations

1. **Renames do NOT rewrite downstream references.** The builder has no
   reference-rewrite-on-rename machinery for output paths (node-id references
   have `resolveEditableGraphRefs` for AI mutation, but nothing rewrites
   `{{node.fields.x}}` when a schema row is renamed). Per the brief's
   instruction, CS-8 **fails safely instead of inventing a partial solution**:
   a rename leaves old references intact, the soft validator flags them
   inline (`missing_field`) at design time, and the runtime resolver fails the
   run with `MissingVariableError` rather than silently substituting. A
   rename-propagation slice would need a single rename event (the editor
   currently commits a whole-array value) plus a graph-wide token rewrite.
2. **Transform Data's destination-ACTION mode stays discovery-blind** (the
   CS-6 asymmetry, unchanged): its output shape comes from the destination
   registry, not a `schema-fields` field, so today's declaration contract
   cannot express it. Runtime resolution of hand-typed paths works; only
   picker discovery is affected. Fixing it means either a second declaration
   source kind (`derived-destination`) or server-evaluated output contracts —
   both compatible evolutions of the CS-4 contract.
3. **Array children insert dotted paths** (`{{node.rows.item}}`), following the
   platform-wide picker convention for array outputs (Airtable `records`,
   OneDrive `items`, …). The runtime resolver needs an explicit index
   (`rows[0].item`) or the CS-10 loop's `{{loop.item.item}}`. This is
   pre-existing picker behavior CS-8 deliberately did not redesign; it is the
   discovery surface for "what columns exist," and the loop node is the real
   consumer of row children.
4. **The validation drawer's `schema_fields_invalid` rule remains dormant**
   (`schemaFieldsByType` still unwired — CS-5 deviation 10, unchanged). The
   Save gate and readiness continue to cover it.

## 10. Risks

1. **Picker-inserted array-child tokens don't resolve at runtime** (limitation
   3). Pre-existing platform-wide, but the AI rows surface will make it more
   visible once the flag is on; the CS-10 loop node is the mitigation.
2. **Synthesis is client-evaluated in the builder.** The run-details and
   redaction surfaces read static metas only; synthesized children carry no
   `sensitive` flags, which is consistent with CS-5's outputs-not-sensitive
   decision (still awaiting the CS-9 ratification).
3. **A future meta pointing `dynamicOutputs` at a non-`schema-fields`-shaped
   config value synthesizes nothing silently** — deliberate fail-safe, but a
   meta author could misread it as broken; the meta-level superRefine catches
   the declaration-side mistakes at module load.

## 11. Readiness for the remaining slices

- **CS-9 (E2E + rollout)** — unblocked. Carries: `.env.example` AI vars, the
  outputs-sensitivity ratification, mock-gateway E2Es, the privacy note
  (including CS-7's build-time disclosure), and the CS-5 PDF fixture diagnosis
  before any flag-on.
- **CS-10 (`native:for_each`)** — unblocked; `rows` children are now
  discoverable, and the frozen flat-object row shape is unchanged.

## 12. Hard boundaries (what CS-8 did NOT do)

- No push, no deploy, no PR.
- No feature flag enabled; `AI_PROCESSOR_ENABLED` and
  `ENABLE_AI_CREDIT_ENFORCEMENT` both remain OFF.
- No migration; `db:push` not run; no DB access of any kind.
- No new npm dependency.
- No contract redesign: the CS-4 `dynamicOutputs` declaration, the AI metas'
  declarations, the processor, billing, routing, parser, and all existing AI
  actions are byte-unchanged except doc comments pointing at the now-live
  synthesis.
- No picker/validator component changes — both inherited synthesis through the
  existing source tree.
- OCR, loop support, AI context sharing, additional AI actions, gateway
  changes, and rename-propagation were not started.
