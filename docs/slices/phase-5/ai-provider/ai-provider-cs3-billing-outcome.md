# AI-PROVIDER-3 — CS-3 Outcome: AI Credit Pricing, Ledger Contract & Billing Lockstep

**Type:** Implementation outcome (CS-3 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); builds on
[CS-2](./ai-provider-cs2-processor-outcome.md)). Local commit only; nothing pushed,
nothing enabled, migration NOT applied (`db:push` not run).
**Date:** 2026-07-24 · **Branch:** `v2-main` (on top of CS-2 `265c57311`)

## Final prices and tier behavior

| Capability | Feature key | Standard (`fast`) | Advanced (`strong`, ×2) |
|---|---|---:|---:|
| Analyze Document | `document_analysis` | 3 | 6 |
| Transform Data | `data_transform` | 2 | 4 |
| Suggest Fields | `schema_suggestion` | 1 | — (registry allows `fast` only) |

The existing `TIER_CREDIT_MULTIPLIER` (fast ×1, strong ×2) and
`ESCALATION_CREDIT_MULTIPLIER` are unchanged. Deterministic (non-LLM) work stays 0.
Tier vocabulary: the builder's **standard/advanced** labels map onto the internal
`ModelTier` **fast/strong** — the registry's `supportedTiers` and the policy's
multiplier both speak `ModelTier`, so there is exactly one boundary translation and it
lives in the action layer (CS-5/6), not in billing.

## Canonical feature ownership (one key, four consumers)

The three feature names are now identical across every layer, so one key drives the
model call, the credit charge, and the ledger row:

| Layer | Source of truth |
|---|---|
| Model call | `core/ai/modelTypes.ts` `AiFeature` (+ `FEATURE_DEFAULT_TIER` in `core/ai/models.ts`, all three default `fast`) |
| Credit price | `core/billing/aiCreditPolicy.ts` `FEATURE_BASE_CREDITS` |
| Ledger type | `repositories/aiCostEvents.ts` `AI_COST_FEATURES` (now a runtime `as const` array; `AiCostFeature` derives from it) |
| Database | `ai_cost_events_feature_chk` CHECK constraint |

`services/ai/processor/aiActionRegistry.ts` exports
`AiProviderFeature = AiFeature & AiCostFeature` — a **compile-time** lockstep: a
registry entry cannot name a feature the model client can't request or the ledger
can't record. Runtime lockstep against the policy and the DB is test-enforced.

## Lockstep result

`tests/unit/services/ai/processor/billingLockstep.test.ts` proves, against the REAL
registry/policy/migration (no duplicated expectation maps):

1. every registry feature has a model-layer default tier; 2. every registry feature is
explicitly priced; 3. every registry feature is in `AI_COST_FEATURES`; 4. every registry
feature is in the **latest** migration's CHECK values (parsed from SQL); 5. the ledger
type and the DB constraint allow exactly the same set; 6. the CS-3 migration preserved
all 11 previously-allowed values and added exactly 3; 7. each `ai:*` key appears exactly
once; 8. no registered capability can reach the generic fallback — each charge equals
`base × tierMultiplier` by provenance (note: a strong-tier charge may legitimately
*exceed* the 5-credit fallback base — e.g. `document_analysis` strong = 6 — so
magnitude proves nothing and `mapped === true` + exact derivation is the real assertion);
9. `supportedTiers` match the approved capability matrix.

## Migration added

`supabase/migrations/20260728000000_ai_cost_events_feature_add_ai_provider.sql` —
forward-only, non-destructive drop + recreate of `ai_cost_events_feature_chk` with the
same 11 values plus `document_analysis`, `data_transform`, `schema_suggestion`. No
table/RLS/policy/GRANT/data changes (the table's RLS + service-role grants are unchanged
from `20260525000001`). Guarded by a static SQL test
(`tests/unit/migrations/aiCostEventsFeatureAiProvider.test.ts`) that also asserts the
already-applied predecessor (`20260703000000`) was not modified.
**Not applied** — `npm run db:push` was deliberately not run per the slice brief.

## Placeholders and casts removed

- `firstPartyClient.ts`: the interim `PLACEHOLDER_MODEL_FEATURE = "data_qa"` is gone.
  The adapter now receives the registry feature via `FirstPartyProcessorDeps.feature`
  and passes it to `createRuntimeModelClient` + `generateStructuredJson`.
- `executeAiAction.ts`: both `input.feature as AiCostFeature` casts are gone —
  `AiActionLedger` now types `feature` as `AiProviderFeature`, which the ledger accepts
  directly.
- `createAiProcessorClient(route, feature, deps)` threads the feature to the
  first-party path (the gateway path doesn't need it — the gateway owns vendor choice).

## Pipeline billing behavior

Unchanged in shape (CS-2 owns the design); CS-3 only made it real for all three
capabilities:

```
registry lookup → enabled flag → tier ∈ supportedTiers → explicit price lookup
→ aiCreditGate(feature, plannedTier, testMode) → resolveModelRoute → client.process
→ caller validation → sanitized ai_cost_events row
```

- The credit charge is computed **before** the gate and the exact feature + planned
  tier reach it (test-asserted).
- Gate refusal returns `preflight_refused/credits_refused` and the processor is never
  called.
- An unpriced feature still returns `preflight_refused/feature_not_priced` — kept
  deliberately so a future regression that deletes a price fails closed instead of
  silently charging the 5-credit fallback (test simulates exactly that regression).
- Success now reports both `creditsCharged` (what the gate actually deducted) and
  `estimatedCredits` (the policy price), and records both in ledger metadata — during
  the recording-only phase they differ, and "what this would have cost" stays queryable.
- Provider failure / invalid output / fail-open ledger behavior is unchanged from CS-2.

## Test-mode charging behavior

Unchanged and uncharged: `executeAiAction` passes `testMode` through to `aiCreditGate`,
which short-circuits with `skipped: "test_mode"` before any deduction. The outcome
reports `creditsCharged: 0` **and** `estimatedCredits: 3`, so a test run shows what a
live run would cost without charging for it. (This is consistent with the owner's
locked decision that test runs execute a real, uncharged model call.)

## Production rollout gate

New `describeAiProcessorRolloutReadiness()` in `services/ai/processor/config.ts`
implements plan risk **R2**: it reports `gaReady` only when the processor is enabled,
fully configured, **and** `ENABLE_AI_CREDIT_ENFORCEMENT` is on, listing blocking var
NAMES otherwise (never values). It is a **report, not a runtime block** — `aiCreditGate`
already owns per-call enforcement, and hard-blocking would break the intended
flag-on/enforcement-off staging step. Both flags remain **OFF** by default.

## Verification

`npm run typecheck` — 0 CS-3 errors · `npm run lint:migrations` OK · `npm run
lint:structure` OK · eslint on all CS-3 files clean · CS-2 + CS-3 focused suites
**83/83 pass** (config incl. rollout gate, gateway client, first-party parity, registry,
routing, pipeline, billing lockstep, migration guard) · dependent AI/billing regression
**499/499 pass** (`tests/unit/core/ai`, `tests/unit/core/billing`,
`tests/unit/services/billing`, ledger repo).

Pre-existing unrelated failures: 3 typecheck errors in actively-edited dual-builder WIP
(`features/workflow-builder/document/DocumentView.tsx` passes an `onSection` prop that
the in-flight `DocumentInsertMenu.tsx` no longer declares, plus its keyboard test).
Untouched by this slice.

## Readiness for CS-4 and later action slices

**CS-4 (builder identity + contract surface) is unblocked and independent** — it needs
no billing work; the `ai` category, `schema-fields` FieldType, and `dynamicOutputs`
declaration are pure contract/UI concerns.

**CS-5 / CS-6 / CS-7 (the action + Suggest Fields slices) are fully unblocked on
billing.** An action handler now only has to call `executeAiAction` with its registry
key, an account/user, the built `AiProcessRequest`, and a strict validator — pricing,
gating, deduction, routing, and ledger recording are done. No remaining CS-3 debt: all
four follow-ups listed in the CS-2 outcome doc are complete.

Before any live enablement: apply the migration to the target database, then flip
`ENABLE_AI_CREDIT_ENFORCEMENT` **before** `AI_PROCESSOR_ENABLED`
(`describeAiProcessorRolloutReadiness()` reports this).
