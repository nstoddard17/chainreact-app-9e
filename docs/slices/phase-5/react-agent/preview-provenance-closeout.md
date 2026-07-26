# REACT-AGENT-PREVIEW-PROVENANCE-CLOSEOUT-1 — the preview enrichment wire

**Status:** Complete locally, gates run, **not pushed**.
**Branch:** `billing-checkout-prod-1` (see §Branch note — this is not where the arc started).
**Migration:** none.

---

## 1. Plain-language result

The journey should now work end to end, with one honest caveat in §12.

Every layer this arc built already existed and was individually tested — the dynamic-output merger,
the semantic mapper, `enrichProposal`, the lifecycle gate, `usePreviewEnrichment`. **None of them ran
in the product**, because `usePreviewEnrichment` was never called from anywhere. A repo-wide search
found exactly two references to it: its own definition, and the provider-neutrality guard's file
list. It was complete, correct, and unreachable.

This batch connects it, and supplies the one input it could not be given before: **field
provenance** — a record of who decided each field, so enrichment can fill what the agent left
unresolved without ever touching what the user chose.

## 2. Provenance

**Identity** is `<nodeId>.<fieldPath>`, composed by one function
([`previewProvenance.ts`](../../../../core/workflows/mapping/previewProvenance.ts)) so there is
exactly one format. Nested paths (`hs.properties.email`) work by construction; repeated rows use
`rowFieldPath(field, rowId, subField)` so ownership follows the **row id**, never the array index —
a position would hand the user's edit to whichever row slid into that slot.

**Ownership is recorded when it happens, never inferred from the value.** That is the whole design.
A filled field may be the agent's guess or the user's deliberate choice; an empty one may be
untouched or deliberately cleared. `markUserOwned` therefore **takes no value argument at all** —
the signature itself prevents a future change from reintroducing a truthiness test. `""`, `false`
and `0` are explicit user decisions and are protected identically to any other value.

**Agent ownership differs per path**, because the evidence differs (`seedPreviewProvenance`):

| Path | Evidence | Why |
|---|---|---|
| EDIT proposal | `buildConfigDiff` → `addedFields` ∪ `changedFields` ∪ `missingRequiredFields`, **plus** the preview's `missingInputs` | The proposal carries the whole end-state graph *including the user's pre-existing config*, so node configs prove nothing. `missingInputs` is carried separately because a field the agent deliberately left out was neither added nor changed — the diff cannot see it, and those are exactly the fields enrichment exists to fill. |
| ADDITIVE proposal | the plan's own config + declared missing inputs | Every node is new; there is no ambiguity. |

An **unchanged inherited field appears in neither** and stays unrecorded — which means "not
eligible", the safe default. This is what stops a first form selection from overwriting an audience
the user set months ago.

## 3. Preview wiring

[`useBuilderPreview`](../../../../features/workflow-builder/hooks/useBuilderPreview.ts) calls
`usePreviewEnrichmentForOverlay`, which composes
[`usePreviewEnrichmentBridge`](../../../../features/workflow-builder/hooks/usePreviewEnrichmentBridge.ts)
→ `usePreviewEnrichment`.

The bridge exists because `usePreviewEnrichment` needs a resolved trigger schema and real registry
metadata, and the preview owner has neither. It **cannot** reuse `useUpstreamVariables`: that hook
reads `pendingNodes` — the LIVE draft — and a preview's nodes do not exist in the draft until Apply.
So resolution runs over `previewOverlay.proposedDefinition` instead.

Hook profile is fixed: `useProviderTriggers(null)` and `useProviderActionsForProviders([])` are the
established disabled forms, so an open builder with no preview issues **no extra requests**.

## 4. Ownership protection

`handlePreviewConfigChange` — the single canonical change handler the setup card already used —
applies the value and then marks that exact field user-owned. Every control routes through it: text,
select, async select (audiences, recipients, connections), variable mappings, booleans, numbers,
nested paths, structured rows, and clears. `toAgentOwnedFields` drops user-owned fields, and
`enrichProposal` only ever writes fields inside that set, so a user-owned value is unreachable to
enrichment by construction rather than by a check that could be forgotten.

## 5. Enrichment lifecycle

Unchanged from the existing `enrichmentLifecycle` gate, now actually driving the product. Enrichment
runs when a preview is active **and** the trigger declares `dynamicOutputSource` **and** a new schema
resolves. It skips with a typed reason for `not_applicable`, `waiting_for_config`, `loading`,
resolver failure, `empty`, `already_enriched`, and `preview_closed`.

Loop prevention is an **identity**, not a flag: `(proposal, trigger node, resource, sorted schema
keys)`. Enriching changes the proposal's content but not its identity, so the effect settles after
one pass — proven by asserting the overlay's `proposedDefinition` is object-identical after a
follow-up tick. A reordered schema is the same identity; a real resource change is a new one and
re-runs. Stale responses are impossible because `useOptionsSource` aborts in-flight requests on
change. A no-op enrichment does not push a new definition (`enriched.changed === false`).

## 6. Readiness UI

New pure read-model
([`previewReadiness.ts`](../../../../core/workflows/mapping/previewReadiness.ts)) → six distinct
states, rendered by `BuilderPreviewSetupCard`, ordered by severity:

`invalid` → `ambiguous` → `missing` → `needs_user` → `waiting` → `mapped`.

Precedence within a field is deliberate: an invalidated mapping outranks everything (it is the only
"used to be right, now wrong" case), and a field enrichment mapped is no longer listed as a user
decision. Resolver trouble renders as safe copy plus a retry (only when retrying can actually help —
reconnect states get no retry button). No message contains a raw provider error, a config value, or
a `{{…}}` token.

## 7. Provider neutrality

The structural guard
([`dynamic-outputs-provider-neutral.test.ts`](../../../../tests/structure/dynamic-outputs-provider-neutral.test.ts))
gained the six new generic files — provenance, readiness, config overlay, bridge, preview owner, and
setup card. All 17 cases pass. The integration test uses a **fictional `acme_sheets` columns
trigger** with no Typeform anywhere; it resolves dynamic outputs, enriches agent-owned fields,
preserves user-owned ones, reports missing fields, invalidates removed outputs after a resource
change, and applies stable generic references.

## 8. Preview safety

Enrichment mutates only the overlay's `proposedDefinition`. The applied test asserts the live draft's
node config is still `{}` and `isDirty` is `false` after a full enrichment pass. Node ids, edge ids,
node count, plan, and `agentChangeId` are all asserted unchanged — no second preview, no regenerated
graph, no re-submitted prompt.

## 9. Apply behavior — a real bug fixed

The two apply paths were **not symmetric**, and this batch fixes it. The additive path seeded
`previewConfig` into new nodes via `planToBuilderPatch`; the EDIT path handed `proposedDefinition`
straight to `replaceGraphLocal` and **silently discarded every value the user typed into the setup
card**. The values at stake are exactly the ones enrichment is forbidden to choose — the audience,
the recipient, the consent flag — so losing them at the last step defeated the ownership model
entirely.

[`previewConfigOverlay.ts`](../../../../core/workflows/mapping/previewConfigOverlay.ts) folds the
user's values into the proposal before the replace. Node ids are the preview ids on this path, so the
keys line up exactly. Provenance is cleared on apply, discard, supersede, and workflow switch — it is
preview-only editor state and never reaches workflow runtime configuration.

## 10. Runtime proof

Unchanged from the previous batch and still passing: `typeformStablePathRuntime.test.ts` drives the
REAL canonical resolver against a REAL normalized webhook event. Design-time candidates resolve, one
email feeds two destinations, a summary body resolves with no `{{` left, a skipped question shifts
nothing, and a missing one raises the canonical `MissingVariableError`.

## 11. Backward compatibility

`answers[]` is untouched. No existing reference was rewritten, no payload shape changed, and the
whole Typeform + workflow-engine variable suite passes (599 tests). The setup card renders
identically when no `enrichment` prop is supplied, so every existing call site is unaffected — pinned
by a test.

## 12. What is NOT proven here

- **The four-provider Typeform journey was not executed end to end in the product.** It cannot be
  locally: it needs live Typeform, Mailchimp, HubSpot and Gmail connections. What is proven is the
  full chain through real internals on a generic fixture, plus the Typeform runtime resolution.
- **Native and AI action nodes contribute no `nodeSpecs`.** The bridge resolves PROVIDER catalogs
  only (the disabled-form hooks avoid a global native-catalog fetch on every builder mount). Every
  provider in the acceptance journey is a provider node, but a native destination would not be
  enriched. Deliberate, and worth revisiting if a native node ever needs mapping.
- **Gmail recipient / Mailchimp audience / consent / duplicate-handling remain unresolved by
  design** — they are user decisions, and the readiness UI now asks for them explicitly.

## 13. Structural note

`tests/unit/core/workflows` sat exactly at the 50-file leaf cap; this batch's three new suites pushed
it to 53. Fixed per rule 16 by splitting the mapping suites into `tests/unit/core/workflows/mapping/`
(mirroring `core/workflows/mapping/`) — 47 and 6.

`useBuilderPreview.ts` now trips the **400-line soft warning at 412** (it did not before). Every
cohesive unit was extracted into its own module — the bridge, the overlay composition, and three pure
core helpers; the remaining excess is the preview owner's own orchestration, and splitting further
would have made it worse rather than smaller. Recorded as a known new warning, not silently absorbed.

## 14. Branch note

The arc's five commits (`a70a957d8`…`5cfff3c3f`) lived on `react-agent-multistep-data-mapping-1`,
not on the checked-out `billing-checkout-prod-1`, and none of the prerequisite modules existed on the
latter. On Marcus's explicit instruction the React Agent branch was **merged into the current
branch** and the work committed there. Unrelated in-progress billing/Stripe changes in the same
working tree were left untouched and excluded from the commit.
