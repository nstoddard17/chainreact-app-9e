# Builder OptionsSource — Multi-Parent Dependencies (BUILDER-OPTIONS-1)

**Slice:** 4.BUILDER-OPTIONS-1
**Type:** Shared Builder/options infrastructure. Implementation (code + tests + this doc).
**Date:** 2026-05-25
**Branch:** `v2-provider-docs-1`
**Unblocks:** AIRTABLE-META-2 (`airtable:fields` / `:views` / `:attachment_fields` resolvers — see [`airtable-metadata-coverage-plan.md`](./airtable-metadata-coverage-plan.md)), and any future provider/custom node whose option resolver depends on more than one upstream field.

## Why

An options resolver may need **more than one** parent value. The canonical case is Airtable's field-level pickers, which need both `baseId` AND `tableIdOrName` to enumerate a table's fields. The backend already modeled this — `OptionsResolver.requiredDeps` is an array and `/api/options` accepts `?deps[a]=…&deps[b]=…` — but the **Builder only collected a single parent**, so a 2-dep resolver always short-circuited with `MISSING_DEPENDENCY`. Rather than ship weaker Airtable metadata (hand-typed field names) and rework it later, we fix the shared infrastructure first.

## Where the single-parent limitation lived (exact locations)

| Layer | File | Status before | Change |
|---|---|---|---|
| Contract | [`contracts/actionMeta.ts`](../../../contracts/actionMeta.ts) | `dependsOn: z.string()` (single only) | now `string \| string[]` + `normalizeDependsOn()` helper + self/dup guards |
| Contract | [`contracts/triggerMeta.ts`](../../../contracts/triggerMeta.ts) | meta superRefine read `dependsOn` as one string | normalized loop |
| **Builder (the actual gap)** | [`features/workflow-builder/config-modal/SchemaForm.tsx:158-178`](../../../features/workflow-builder/config-modal/SchemaForm.tsx) | `deps = { [field.dependsOn]: parentValue }` — **one parent** | collects ALL parents; gates until all present; passes the full dep set |
| Builder | [`features/workflow-builder/config-modal/SchemaForm.tsx:62-75`](../../../features/workflow-builder/config-modal/SchemaForm.tsx) `buildChildrenByParent` | mapped one parent → child | registers a child under EACH parent (clear-on-any-parent-change) |
| Builder | [`features/workflow-builder/config-modal/fields/ComboboxField.tsx:277`](../../../features/workflow-builder/config-modal/fields/ComboboxField.tsx) | `parentHint = parentLabel ?? field.dependsOn` (string) | array-safe via `normalizeDependsOn` |
| Builder | [`features/workflow-builder/config-modal/fields/types.ts:31`](../../../features/workflow-builder/config-modal/fields/types.ts) | doc: "single-parent only" | doc updated to multi-parent |
| AI catalog | [`services/ai/tools/providerCatalog.ts:290`](../../../services/ai/tools/providerCatalog.ts) | `dependsOn: f.dependsOn ?? null` | added authoritative `dependsOnFields: string[]`; legacy `dependsOn` stays single |

**Already multi-dep capable — no change needed:** [`app/api/options/[source]/route.ts`](../../../app/api/options/[source]/route.ts) (`deps[<parent>]` extraction + `requiredDeps` loop), [`lib/api/options.ts`](../../../lib/api/options.ts) (`buildOptionsSourceUrl` takes a `deps` record), and [`features/workflow-builder/hooks/useOptionsSource.ts`](../../../features/workflow-builder/hooks/useOptionsSource.ts) (canonical-sorted dep key over all entries). The limitation was purely in the Builder's *collection* of deps.

## Chosen metadata shape — Option A (`string | string[]`)

```ts
// FieldMeta.dependsOn
dependsOn: z
  .union([
    z.string().min(1).max(128),                       // single parent (legacy)
    z.array(z.string().min(1).max(128)).min(1).max(8), // multiple parents
  ])
  .optional();
```

Chosen over Option B (a separate `dependsOnFields?: string[]`) because it keeps **one source of truth** — no risk of `dependsOn` and `dependsOnFields` drifting. Every consumer reads it through one helper:

```ts
export function normalizeDependsOn(
  dependsOn: string | readonly string[] | undefined,
): readonly string[] // undefined → [], "x" → ["x"], ["a","b"] → ["a","b"]
```

**Validation added** (cheap footgun guards): array rejects empties, duplicates, >8 parents, and self-reference (`["x", …]` on field `x`). Cross-field "parent must be a known sibling" validation (the existing meta-level check) now iterates the normalized list, so an unknown parent anywhere in the array fails at module load.

## Backward compatibility

- **Single-string `dependsOn` is unchanged** end-to-end: `normalizeDependsOn("p") → ["p"]`, one parent, identical `deps`, identical `enabled` gating, identical "Select \<parent\> first" hint wording. Every existing provider (Excel, OneNote, Monday, Dropbox, HubSpot, Mailchimp, Google Sheets, …) keeps working with zero meta edits — verified by re-running their resolver + cascade tests (18 suites / 191 tests, all green).
- The AI catalog's `NodeOptionsSourceDep.dependsOn` stays `string | null` (set only when there's exactly one parent), so existing planner consumers are unaffected; `dependsOnFields` is purely additive.

## Behavior — multi-parent

- **Gating:** the field stays disabled (passive "Select … first" trigger; async hook never mounts) until **every** declared parent has a non-empty string value.
- **Deps:** once all parents are present, SchemaForm passes the **full** `{ [p1]: v1, [p2]: v2, … }` record to `useOptionsSource` → `/api/options?deps[p1]=…&deps[p2]=…`. The resolver's `requiredDeps` are satisfied.
- **Hint:** names only the **still-missing** parent(s), joined (e.g. "Select Table first" when Base is set; "Select Base, Table first" when neither is).
- **Reset cascade:** a multi-parent child is registered under each parent, so changing **any** one parent clears the child's stale value (single-hop, as before).
- **Backend defense-in-depth:** the route still returns `MISSING_DEPENDENCY` (naming the missing dep) if a partial dep set ever reaches it.
- **q filtering** is unchanged (orthogonal to deps; the hook merges `q` + `deps`).

## How providers declare multi-parent deps

```ts
// In an ActionMeta/TriggerMeta field:
{
  name: "fieldName",
  label: "Field",
  type: "combobox",
  required: true,
  optionsSource: "airtable:fields",
  dependsOn: ["baseId", "tableIdOrName"], // ← array; names must match sibling field names verbatim
}
```

```ts
// In the resolver (services/options/types.ts):
{
  source: "airtable:fields",
  provider: "airtable",
  requiresIntegration: true,
  requiredDeps: ["baseId", "tableIdOrName"], // ← must match the field's dependsOn set
  resolve(ctx) { /* ctx.deps.baseId, ctx.deps.tableIdOrName both present */ },
}
```

Rules: the field's `dependsOn` names must be exact sibling field names (validated at module load); the resolver's `requiredDeps` should match the field's `dependsOn` so the frontend gate and backend guard agree. Nested forms / array-item sub-fields are out of scope (the cascade operates on the flat field list); no existing field uses them.

## Tests

- **Contract** ([`tests/unit/contracts/actionMeta.test.ts`](../../../tests/unit/contracts/actionMeta.test.ts)): `normalizeDependsOn` (3); field cardinality — single string accepted, array accepted, empty array / >8 / empty entry / duplicate / self-ref (single + array) rejected; cross-field — array of known siblings accepted, unknown parent in array rejected.
- **SchemaForm** ([`tests/unit/features/workflow-builder/config-modal/SchemaForm.test.tsx`](../../../tests/unit/features/workflow-builder/config-modal/SchemaForm.test.tsx)): passes all parent values as deps once all present; waits for the 2nd parent / the 1st parent (order independent, no fetch, names the missing one); names both when neither set; clears the child when either parent changes. Single-parent suite retained → backward-compat proof.
- **/api/options** ([`tests/unit/app/api/options/options-route.test.ts`](../../../tests/unit/app/api/options/options-route.test.ts)): a synthetic 2-dep resolver → `MISSING_DEPENDENCY` (names the missing one) when either is absent; resolver invoked with **both** dep values when present.
- **Regression:** Excel / OneNote / Monday / Dropbox resolver tests + Google-Sheets / HubSpot / Mailchimp cascade integration tests all pass unchanged.

No provider API calls in UI/contract tests (the hook is mocked; the route test mocks the resolver boundary); no secrets/config values leaked (resolver errors stay sanitized — existing route guards).

## Airtable follow-up

AIRTABLE-META-2 can now add the field-level resolvers properly:
- `airtable:fields` — `requiredDeps: ["baseId", "tableIdOrName"]`; backs `list_records.fields` (combobox+multiple) and `add_attachment.fieldName`.
- `airtable:views` — `requiredDeps: ["baseId", "tableIdOrName"]`; backs `list_records.view`.
- `airtable:attachment_fields` — `requiredDeps: ["baseId", "tableIdOrName"]` (attachment-type fields only); backs `add_attachment.fieldName` with a tighter list.

All three are now wireable through the Builder. The Airtable plan's §3 deferral rationale ("single-parent cascade blocker") is resolved; see the updated note there.
