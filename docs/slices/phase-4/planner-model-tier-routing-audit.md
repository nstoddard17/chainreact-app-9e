# Workflow Builder React Agent — Model-Tier Routing Audit + AI-31 Foundation

**Slice:** 4.AI-31
**Branch:** `builder-ui-v1-audit-1`
**Date:** 2026-05-27
**Conservative slice.** Documents the current routing, adds a deterministic classifier instrumentation seam, and adds tier-routing observability fields. **DOES NOT route patch generation to a cheaper model.** That decision is queued for AI-31B after live data is collected.

---

## A. Executive Summary

**Current routing.**

| Feature | Default tier | Model id (today) | Where decided |
|---|---|---|---|
| `creation` (Workflow Builder React Agent plan) | `strong` | `claude-sonnet-4-6` | `core/ai/models.ts` `FEATURE_DEFAULT_TIER` |
| `editing` | `strong` | `claude-sonnet-4-6` | same |
| `repair` | `strong` | `claude-sonnet-4-6` | same |
| `explanation` / `run_analysis` / `data_qa` / `discovery` | `fast` | `claude-haiku-4-5-20251001` | same |

Every patch-generating call is on the strong tier. The cheaper `fast` tier (Haiku 4.5) is wired but only used for read-side features today.

**Decision: keep patch generation on strong.** Until we have live data on how often plans fail under deterministic narrowing (AI-30) — and until we have a per-request signal that a cheaper model could safely substitute — moving patch generation to Haiku risks regressions in:

- `INVALID_PATCH` / `INVALID_CONFIG` rates (Haiku is more likely to violate the strict shape contract).
- No-substitution violations (R1 rule discipline is critical; Sonnet has handled it correctly through AI-12B → AI-30).
- Required-field discipline (AI-22 rule about not guessing required values).
- Variable-reference grounding (AI-16 — using only declared outputs).

These are the highest-leverage correctness rules in the system. AI-30 already cut **75% of the input bill** by narrowing the catalog before the strong model sees it; that is the cheaper win, and it preserves quality. The next cost lever (cheap planner) needs evidence first.

**AI-31 scope (conservative).** Three additive pieces, no behavior change to patch generation:

1. **Audit doc** (this file).
2. **Deterministic narrowing-classifier helper** (`services/ai/planner/narrowingClassifier.ts`) — typed instrumentation seam. Returns `{intentType, confidence, candidateProviders, triggerHints, actionHints, broadOrAmbiguous, source, modelTier}` derived purely from the existing narrowing decision + input shape. **No model call.** Establishes the interface a future model classifier (AI-31B) will satisfy.
3. **Tier-routing attribution fields** on `PlannerPromptAttribution` (folded into `ai_cost_events.metadata`): `plannerModelTier`, `classifierUsed`, `classifierModelTier`, `classifierConfidence`, `classifierProviderCount`, `deterministicProviderCount`, `finalProviderCount`, `fallbackToDeterministic`, `fallbackToFullCatalog`, `tierRoutingReason`.

All three pieces leave the model call shape, the patch parser, the WorkflowPatchSchema, the AI-5 preview, the AI-9B apply path, AI-22 enrichment, AI-30 narrowing semantics, and the no-substitution / required-field discipline untouched.

---

## B. Where tier is currently decided

Two seams already exist.

### B.1 Feature-default tier (the steady-state path)

[`core/ai/models.ts`](../../../core/ai/models.ts):

```ts
export const FEATURE_DEFAULT_TIER: Readonly<Record<AiFeature, ModelTier>> = {
  creation:    "strong",   // ← Workflow Builder React Agent plan
  editing:     "strong",
  repair:      "strong",
  explanation: "fast",
  run_analysis:"fast",
  data_qa:     "fast",
  discovery:   "fast",
};
```

`getModelForFeature(feature)` is called by the planner runtime client factory `createRuntimeModelClient` in [`services/ai/modelClients/createModelClient.ts`](../../../services/ai/modelClients/createModelClient.ts).

### B.2 Per-call tier override (the escape hatch)

[`services/ai/planner/planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) accepts `PlanWorkflowFromPromptInput.modelTier` and forwards it to the runtime factory. No production caller passes a non-default tier today; the route at [`app/api/workflows/[id]/ai/plan/route.ts`](../../../app/api/workflows/[id]/ai/plan/route.ts) takes the default. The override is a tested seam (covered in `planWorkflowFromPrompt.test.ts`).

### B.3 Recorded metadata

Every plan call already emits via [`recordAiRouteEvents.ts`](../../../services/ai/events/recordAiRouteEvents.ts):

- top-level `modelName` (e.g. `claude-sonnet-4-6`) → analytics `modelProvider` derived via `getModelById`
- `metadata.tier` (`"strong"` | `"fast"`)
- `metadata.finishReason`

Plus AI-28's per-section attribution + AI-30's narrowing fields. The tier dimension is already queryable in `ai_cost_events`, but it lives under `metadata.tier` rather than a named `plannerModelTier` field. AI-31 surfaces it under a stable name so dashboards don't have to disambiguate against other `tier` usages.

---

## C. Why a model classifier is NOT wired in this slice

A cheap classifier (Haiku reading the user request + connected integrations + canvas, returning a JSON envelope of `{intentType, candidateProviders, confidence}`) is the textbook AI-31. We're not shipping it yet for three concrete reasons:

1. **AI-30's deterministic narrowing already covers the typical specific request** at zero classifier cost. Slack-only / Stripe+Slack / ambiguous-email requests narrow to 2–4 providers (−75% packet) without any model call. A model classifier adds COST on top — only justified when deterministic narrowing systematically picks the wrong subset.
2. **No live data yet on AI-30's miss rate.** Until `ai_cost_events` show non-trivial counts of "narrowing chose a subset, the model still produced unsupportedRequests / INVALID_PATCH because a needed provider was missing," we don't know the classifier's break-even point. AI-31 adds the metadata fields to measure this.
3. **Each AI surface added is one more thing to test for no-substitution and required-field discipline.** A classifier that subtly biases the strong model toward a wrong provider is a regression the R1 rule was designed to catch — but we shouldn't ship the bias and then patch it.

The AI-31 deterministic instrumentation is the safe step: it gives us the SHAPE a future model classifier would return (so AI-31B can swap in a Haiku call behind the same interface) and it gives us the OBSERVABILITY to decide whether the swap is worth it.

---

## D. Deterministic classifier shape

The deterministic helper [`runDeterministicNarrowingClassifier`](../../../services/ai/planner/narrowingClassifier.ts) returns:

```ts
interface NarrowingClassifierResult {
  intentType: "create" | "edit" | "repair" | "help" | "unknown";
  confidence: "high" | "medium" | "low";
  candidateProviders: readonly string[];
  triggerHints: readonly string[];   // deterministic: empty (model classifier will fill)
  actionHints: readonly string[];    // deterministic: empty (model classifier will fill)
  broadOrAmbiguous: boolean;
  source: "deterministic" | "model";
  modelTier: ModelTier | null;       // null for deterministic
}
```

Derivation (deterministic, pure, no I/O):

- **intentType.** `canvasNodeCount > 0 && (explicit || alias)` → `"edit"`; `canvasNodeCount === 0 && (explicit || alias || ambiguous)` → `"create"`; matches `/\b(fix|repair|broken|failed|stuck)\b/i` → `"repair"`; matches help phrases → `"help"`; else → `"unknown"`.
- **confidence.** `explicit.length > 0` → `"high"`; any of `alias / ambiguous / connected / canvas / nativeLogicHit` → `"medium"`; otherwise → `"low"`.
- **candidateProviders.** Mirror of `narrowing.providerIds` (the deterministic classifier doesn't suggest providers narrowing didn't already include).
- **triggerHints / actionHints.** Empty arrays. A future model classifier will fill these with `provider:type` keys it expects to see used; today narrowing doesn't have that signal.
- **broadOrAmbiguous.** `narrowing.mode === "full-catalog" && fallbackReason in {"ambiguous_broad_request", "complex_canvas_vague_edit", "no_provider_mention"}`.
- **source / modelTier.** `"deterministic"` / `null` — distinguishes from a future model classifier emission.

The deterministic classifier is **purely advisory** today. It DOES NOT add or remove providers from the catalog — narrowing's `providerIds` set is still authoritative. The classifier's `candidateProviders` is recorded for future comparison: when a model classifier ships, dashboards can compute `(model.candidateProviders ∪ narrowing.providerIds) − narrowing.providerIds` to see whether the model is adding signal.

---

## E. Tier-routing attribution fields

Added to [`PlannerPromptAttribution`](../../../services/ai/planner/types.ts):

| Field | Today's value | Future semantic |
|---|---|---|
| `plannerModelTier: "fast" \| "strong"` | `"strong"` (creation feature) | Whichever tier the model call actually used |
| `classifierUsed: boolean` | `true` (deterministic classifier runs) | `true` whether deterministic or model classifier ran |
| `classifierModelTier: "fast" \| "strong" \| null` | `null` (deterministic) | Tier of the model classifier when one was used |
| `classifierConfidence: "high" \| "medium" \| "low" \| null` | from helper | Same |
| `classifierProviderCount: number \| null` | `candidateProviders.length` | Same |
| `deterministicProviderCount: number` | narrowing's included count | Same |
| `finalProviderCount: number` | equal to `deterministicProviderCount` today | Could differ when a classifier overlay adds providers |
| `fallbackToDeterministic: boolean` | `false` today (no classifier-driven path that could fail) | `true` when a model classifier failed/threw and we fell back to deterministic |
| `fallbackToFullCatalog: boolean` | mirrors `providerNarrowingFallbackUsed` | Same |
| `tierRoutingReason: string` | `"feature_default_strong"` (no override) | `"classifier_low_confidence_promoted_to_strong"`, `"user_override"`, etc. |

All field names pass the existing `sanitizeAiEventMetadata` denylist (`/token|secret|password|authorization|prompt|config|body|raw/i`). No raw user text. No model classifier raw output (none produced today). Counts + enums only.

---

## F. Safety / fallback behavior

- **Classifier failure** — wrapped in a try/catch in the prompt-builder seam. If the deterministic helper ever throws (which it shouldn't — pure derivation from already-validated inputs), `fallbackToDeterministic` is set `true`, `classifierConfidence` / `classifierProviderCount` are `null`, narrowing continues unaffected. A future model classifier will use the same wrapping.
- **Classifier disabled** — `ENABLE_AI_NARROWING_CLASSIFIER=false` short-circuits the helper. Attribution still records `classifierUsed: false`, `tierRoutingReason: "classifier_disabled"`. Behavior identical to AI-30 (the cost lever).
- **Narrowing fallback** — when `narrowing.mode === "full-catalog"`, both `fallbackToFullCatalog: true` and `tierRoutingReason: "narrowing_fallback_<reason>"` are set so dashboards can group plan outcomes by fallback class.

The classifier interface **never** removes providers from the narrowed set. It can only `candidateProviders ⊇ narrowing.providerIds`. The wiring enforces this: when the classifier's `candidateProviders` is a strict subset of narrowing's set, the union (= narrowing's set) is used; explicit / canvas / connected / native always survive.

---

## G. What we measure

After AI-31 lands, `ai_cost_events.metadata` carries enough information to answer:

- **Tier mix.** `count(*) GROUP BY plannerModelTier` — confirms creation/editing/repair is 100% strong.
- **Confidence distribution.** `count(*) GROUP BY classifierConfidence` — frequency of high/medium/low requests.
- **Narrowing-vs-classifier divergence.** `(classifierProviderCount, deterministicProviderCount)` per request — when the deterministic classifier suggests something different from narrowing.
- **Fallback rates.** `fallbackToFullCatalog` rate by tier, by confidence. `fallbackToDeterministic` rate (today 0%).
- **Failure correlation.** Join `ai_model_call_failed` rows against `classifierConfidence` to see whether low-confidence requests fail (parse/validation) more often than high-confidence ones.

Once `low-confidence requests` have a measurable failure correlation, AI-31B can ship a model classifier to lift those into the right narrowed catalog before they hit the strong model — at that point we'll know the break-even point per request.

---

## H. What this slice does NOT do

| Thing | Status |
|---|---|
| Route patch generation to Haiku | NO — explicitly deferred to AI-31B after live data |
| Add a model classifier (Haiku stage) | NO — interface defined, no model call wired |
| Change the narrowed catalog the model sees | NO — narrowing's `providerIds` is still authoritative |
| Change `PLANNER_PACKET_VERSION` | NO — packet shape unchanged; this is attribution-only |
| Change the no-substitution rule | NO — R1 unchanged |
| Change required-field discipline (AI-22) | NO |
| Change variable-reference grounding (AI-16) | NO |
| Touch provider metadata | NO |
| Touch billing/tasks | NO |
| Change workflow execution | NO |
| Build the general app help assistant | NO |
| DB migration | NO |

---

## I. Rollback

`ENABLE_AI_NARROWING_CLASSIFIER=false` in env disables the deterministic classifier entirely. Behavior reverts to AI-30 exactly. Attribution still emits the structural fields (`plannerModelTier`, `classifierUsed: false`, `tierRoutingReason: "classifier_disabled"`, the rest null/0/false) so the schema is stable.

`ENABLE_AI_PROVIDER_NARROWING=false` (AI-30 flag) still independently restores the full catalog.

`ENABLE_STRUCTURED_PROMPT_PACKET=false` (AI-29 flag) still independently restores the V1 prose packet.

The three flags are independent. No interaction.

---

## J. Next slice (AI-31B candidate, NOT this slice)

After 1–2 weeks of `ai_cost_events` data, decide whether to:

1. **AI-31B-LITE** — Route narrowing-classifier to Haiku for low-confidence requests only. Cost: one Haiku call per request where the deterministic helper returned `"low"`. Adds providers the deterministic helper missed. Patch generation still on strong.
2. **AI-31B-FULL** — Route all narrowing-classification to Haiku. Cost: one Haiku call per request. Higher classifier accuracy, higher classifier bill.
3. **Defer further.** If deterministic narrowing's fallback rate is already low and the failures correlate with truly ambiguous prompts (not with narrowing misses), no classifier is needed.

The decision will be data-driven; no commitment to a path until the metadata shows the picture.

---

## K. AI-34C — model classifier WIRED (OpenAI fast-tier, additive only)

AI-34C took option (1)'s spirit but on **OpenAI `gpt-4.1-mini`** (the AI-34A/34B-verified adapter) instead of Haiku, because the OpenAI provider is the one Marcus is currently A/B-evaluating. It plugs into the §D seam directly — `runModelNarrowingClassifier` returns a `NarrowingClassifierResult` with `source:"model"` / `modelTier:"fast"`, exactly the shape §D reserved for AI-31B.

**What changed vs §C "why a model classifier is NOT wired."** §C deferred a model classifier pending telemetry. AI-34C wires it behind a **default-off flag** (`ENABLE_AI_MODEL_NARROWING_CLASSIFIER`) so it ships dormant — the telemetry-gated decision is now "flip the flag for an experiment," not "write the code."

**Additive-only (the safety story §F promised).** The model classifier's candidate providers are UNIONED into the deterministic narrowed set ([`resolvePromptClassifier.ts`](../../../services/ai/planner/resolvePromptClassifier.ts) `augmentNarrowingWithModelCandidates`). It can only ADD valid catalog ids — never removes a deterministic / explicit / connected / canvas provider, never shrinks a `full-catalog` fallback, ignores unknown ids. So `finalProviderCount ≥ deterministicProviderCount` ALWAYS, and a wrong/low-confidence model result cannot hide a provider the user named. The deterministic narrowing (and AI-33 R1 ambiguity rule) remain the floor.

**Tier-routing fields (§E), now populated for real:**
- `classifierModelTier: "fast"` (was always `null` in AI-31).
- `classifierConfidence` / `classifierProviderCount` from the model result.
- `finalProviderCount` = union size (can now exceed `deterministicProviderCount`).
- `fallbackToDeterministic: true` on `model_failed` / `openai_not_configured` (was always `false`).
- `tierRoutingReason` adds `classifier_model_succeeded` / `classifier_model_failed` / `openai_not_configured`; the AI-31 vocabulary is preserved for the disabled/undefined path.
- `classifierUsed` keeps its AI-31 meaning (deterministic OR model produced a result) — the model-ran signal is `classifierModelTier` + `tierRoutingReason`.

**Gating + fallback (extends §F).** Three flags required: `ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true` + `ENABLE_OPENAI_PROVIDER=true` + `OPENAI_API_KEY`. Missing any → deterministic classifier (AI-31) runs unchanged. `runModelNarrowingClassifier` NEVER throws — any model/parse error returns `model_failed` and the plan proceeds on deterministic narrowing.

**Telemetry hygiene.** The tiny classifier prompt carries only the user request + provider ids + connected/canvas ids (NO full catalog, NO config fields, NO secrets, NO chat history). The classifier RESULT and `ai_cost_events` store COUNTS + ENUMS only — never raw classifier text.

**The PLANNER is untouched.** `getModelForFeature("creation")` / `getModelForTier("strong")` still resolve Anthropic; patch generation, preview, and Apply never touch OpenAI. AI-34C only augments the catalog the Anthropic planner sees.

**Rollback.** `ENABLE_AI_MODEL_NARROWING_CLASSIFIER` unset/false → the model classifier never runs; behavior is byte-identical to AI-31. Independent of the AI-29/AI-30/AI-31 flags.
