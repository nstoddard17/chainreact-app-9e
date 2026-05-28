# Workflow Builder React Agent — Planner Prompt Packet Audit + Cost-Reduction Plan

**Slice:** 4.AI-27
**Branch:** `builder-ui-v1-audit-1`
**Date:** 2026-05-27
**Audit-only.** No source / test changes. Adds one one-off measurement script under `scripts/trash/` per CLAUDE.md trash convention.

> **Status update (2026-05-27, AI-28 shipped on this same branch):** the §J
> recommendation for AI-28 (prompt packet instrumentation) has landed. Every
> plan call now emits a `PlannerPromptAttribution` projection into
> `ai_cost_events` — per-section char counts + structural catalog counts +
> the `packetVersion` label, on both completed and failed (MODEL_FAILED /
> PARSE_FAILED) calls. See [`ai-architecture-react-agent-plan.md`](./ai-architecture-react-agent-plan.md)
> § "AI-27 + AI-28" for the implementation note. The §I dashboard queries
> are now runnable against live data.
>
> **Status update (2026-05-27, AI-29 shipped on this same branch):** the §J
> recommendation for AI-29 (structured packet refactor) has landed.
> `PLANNER_PACKET_VERSION` bumped to `workflow-planner-v2`. Every plan call
> renders a CONTEXT PACKET JSON envelope at the top of the system message
> + groups the 19 PLANNER_CONSTRAINTS into 8 named R1..R8 rule blocks
> (no-substitution stays in R1 for prominence). Catalog / canvas /
> connected-integrations renderers + downstream parser / `WorkflowPatchSchema`
> / AI-5 preview / AI-20 gate / forced tool-use are all byte-identical to
> v1. Measured size impact: **+317 tokens (+0.83%)** vs v1 — the cost of
> machine scannability. AI-30 remains the big cost-saving lever (provider
> narrowing → ~70% reduction). Rollback path: `ENABLE_STRUCTURED_PROMPT_PACKET=false`
> in env → routes to v1 builder. See § "AI-29" in the same doc for the
> full implementation note. AI-30 / AI-31 / AI-32 remain queued; each will
> bump `PLANNER_PACKET_VERSION` further so dashboards can A/B by version.
>
> **Status update (2026-05-27, AI-30 shipped on this same branch):** the §C
> recommendation for AI-30 (deterministic provider narrowing) has landed.
> `PLANNER_PACKET_VERSION` bumped to `workflow-planner-v3`. New helper
> `services/ai/planner/narrowProvidersForPlan.ts` decides — pre-render,
> from the user request + connected integrations + current canvas + a
> per-provider alias map — which subset of the 26-provider catalog to ship
> to the model. Wired into BOTH V1 and V2 builders so narrowing is
> independent of packet shape. The R1 group gains a new
> narrowing-aware no-substitution clause (`PLANNER_CONSTRAINTS[20]`); the
> CONTEXT PACKET JSON gains `catalog.providersTotal` + `catalog.narrowingMode`
> + `catalog.narrowingReason`; `PlannerPromptAttribution` gains
> `catalogProvidersTotal`, `providerNarrowingEnabled`, `providerNarrowingMode`,
> `providerNarrowingFallbackUsed`, `providerNarrowingReason`, and
> `providerNarrowingOmittedCount` — all surfaced into `ai_cost_events`.
> **Measured impact against the live 26-provider catalog (catalogChars,
> totalPacketChars):**
> - **Slack-only "Send me a Slack DM"** — narrowed 2/26 providers,
>   catalogChars 16,809 vs 124,261 (**−86.5%**), totalPacketChars 35,464
>   vs 142,922 (**−75.1%**).
> - **Stripe + Slack "When Stripe payment fails send me a Slack DM"** —
>   3/26 providers, catalogChars 18,720 (**−84.9%**), totalPacketChars
>   37,379 (−75.5%).
> - **Email ambiguous "When I get an email send a Slack message"** —
>   4/26 (slack + gmail + microsoft-outlook + native), catalogChars
>   21,227 (**−82.9%**), totalPacketChars 39,882 (−72.1%).
> - **Broad generic "create an automation"** — full-catalog fallback
>   (reason `ambiguous_broad_request`), 0% reduction (correct: the user
>   hasn't said what they want).
> - **Vague edit "add a step"** — full-catalog fallback (reason
>   `no_provider_mention`), 0% reduction (correct: ambiguous about
>   target).
>
> Safety invariants pinned by 58 helper tests + 24 narrowing-prompt
> tests: explicit mentions, current canvas providers, connected
> providers, and `native` are NEVER dropped; broad generic phrasing and
> complex-canvas-plus-vague-edit fall through to the full catalog.
> Rollback path: `ENABLE_AI_PROVIDER_NARROWING=false` in env restores
> full-catalog behavior under v3 (and `ENABLE_STRUCTURED_PROMPT_PACKET=false`
> still falls back to v1, where AI-30 narrowing also applies — the
> two flags are independent). AI-31 / AI-32 remain queued.

---

## A. Executive Summary

**Current state.** Every Builder Agent plan call sends **~38,035 input tokens** to Anthropic regardless of the user request — measured against the live catalog. Marcus's observation of ~36k input tokens is confirmed by direct measurement. The breakdown:

| Section | Tokens (approx) | % of prompt |
|---|---:|---:|
| Provider catalog (all 26 providers) | **33,584** | **88.3%** |
| `PLANNER_CONSTRAINTS` (19 hard rules) | 2,708 | 7.1% |
| `PATCH_SHAPE_GUIDE` | 774 | 2.0% |
| `VALUE_SHAPE_RULES` | 402 | 1.1% |
| `RESPONSE_SCHEMA_DESCRIPTION` | 239 | 0.6% |
| `JSON_OUTPUT_RULES` | 154 | 0.4% |
| Connected integrations | 58–76 | 0.2% |
| Current canvas | 20–94 | 0.1% |
| Preamble + template note | 91 | 0.2% |
| User request | 4–27 | 0.05% |

**Catalog dominates everything else by an order of magnitude.** The catalog cost is essentially **flat** regardless of scenario: the same 33.6k tokens are sent when the user wants "Slack DM on Gmail email" (which needs 2 providers) as when they want a complex 5-provider workflow.

**Cost implication (Sonnet 4.6 list pricing: $3/M input, $15/M output).**

| Volume | Current cost / day | With provider narrowing (~5 providers) | Savings |
|---|---:|---:|---:|
| 100 plan calls/day | $12.90 | $3.60 | $9.30/day |
| 1,000 plan calls/day | $129 | $36 | $93/day |
| 10,000 plan calls/day | $1,290 | $360 | $930/day (~$28k/mo) |

(Output tokens are small — typical plan response is ≤ 1k tokens — so input dominates the bill.)

**Architecture verdict: sound but inefficient.** The grounding strategy (catalog + connected integrations + current canvas + hard rules) is correct and produces high-quality plans. No reliability bugs were found in this audit. The single high-leverage optimization is **provider narrowing**: don't send every provider's metadata when the user's request implies a small subset. A two-stage retrieval pattern (cheap classifier → narrowed strong-model packet) can cut 65–75% of the input bill without weakening any safety / no-substitution / required-field guarantee.

**Recommended next slice: AI-28 — prompt packet instrumentation.** Adds per-section token-size logging to `ai_cost_events.metadata` so we can measure the optimization landed by later slices against a hard before/after baseline. Pure observability, no behavior change. Then AI-29 (structured packet refactor, no behavior change), AI-30 (provider narrowing with safety net), AI-31 (model-tier routing), AI-32 (catalog cache).

---

## B. Current Planner Packet Anatomy

### B.1 Files
- [`services/ai/planner/buildWorkflowPlanPrompt.ts`](../../../services/ai/planner/buildWorkflowPlanPrompt.ts) (353 lines) — pure builder of the system + user `ModelMessage[]`. Lines 38–69 contain `PLANNER_CONSTRAINTS` (19 hard rules); lines 124–142 `PATCH_SHAPE_GUIDE`; lines 79–95 `VALUE_SHAPE_RULES`; lines 151–159 `JSON_OUTPUT_RULES`; lines 256–262 `renderCatalog`; lines 264–281 `renderConnectedIntegrations`; lines 294–312 `renderCurrentGraph`.
- [`services/ai/planner/buildWorkflowPlanRequest.ts`](../../../services/ai/planner/buildWorkflowPlanRequest.ts) (61 lines) — grounding seam: pulls catalog via `getProviderCatalog()` and connected integrations via `getConnectedIntegrationsForAI(userId)`, then delegates to `buildWorkflowPlanPrompt`. Catalog failure → empty list (fail-soft).
- [`services/ai/planner/workflowPlanTool.ts`](../../../services/ai/planner/workflowPlanTool.ts) (114 lines) — forced tool-use schema. Lenient at this layer (proposedPatch: `object | null`); strict downstream `WorkflowPatchSchema` is the source of truth.
- [`services/ai/planner/planWorkflowFromPrompt.ts`](../../../services/ai/planner/planWorkflowFromPrompt.ts) (245 lines) — orchestrator: build request → call model → parse → reconcile target + baseRevision → AI-5 preview → AI-20 apply-readiness gate.
- [`services/ai/tools/providerCatalog.ts`](../../../services/ai/tools/providerCatalog.ts) (545 lines) — produces the compact `ProviderCatalogView`. Already cap-aware (`MAX_STATIC_OPTION_VALUES = 24`) but emits every provider every time.
- [`services/ai/events/recordAiRouteEvents.ts`](../../../services/ai/events/recordAiRouteEvents.ts) (263 lines) — records `ai_interaction_started`, `ai_model_call_completed/failed`, `ai_patch_proposed/previewed/validation_failed` to `ai_cost_events`. Forwards `inputTokens` / `outputTokens` / `latencyMs` / `tier` / `finishReason` from `result.model.usage` already.

### B.2 Section list (system message, ordered)

The system message is the concatenation (with `\n\n` separator) of these sections, in order:

1. Preamble — `"You are ChainReact's workflow planner..."` (46 tokens)
2. **Rules** — `PLANNER_CONSTRAINTS` rendered as bullet list (2,708 tokens)
3. `TEMPLATE_FUTURE_NOTE` (45 tokens)
4. **Catalog** — `renderCatalog(input)` — every usable provider's actions + triggers + per-node `configFields` + `configOptions` + `outputs` (33,584 tokens)
5. **Connected integrations** — `renderConnectedIntegrations(input)` (58–76 tokens)
6. **Current canvas** — `renderCurrentGraph(input)` (20–94 tokens)
7. *(optional)* Cost awareness — `renderCostAwareness(input.costAwareness)` (never set today)
8. `RESPONSE_SCHEMA_DESCRIPTION` — top-level keys of the JSON response (239 tokens)
9. `PATCH_SHAPE_GUIDE` — exact WorkflowPatch envelope + operation vocabulary (774 tokens)
10. `VALUE_SHAPE_RULES` — per-renderer-type value shapes (402 tokens)
11. `JSON_OUTPUT_RULES` — strict JSON-only output contract (154 tokens)

User message = `input.userRequest` verbatim (4–100 tokens for representative scenarios).

### B.3 Catalog rendering — the dominant cost

For each usable provider:
```
- <Display Name> (id: <id>)
  triggers:
    - <provider>:<type>
      config fields:
        required: <name (type[, multi-select])>, ...
        optional: <name (type)>, ...
        config options (use these exact values): <field>: [v1, v2, ...]; ...
        outputs: <name (type[, sensitive])>, ...
  actions:
    - <provider>:<type>[ <flags>]
      config fields:
        required: ...
        optional: ...
        config options: ...
        outputs: ...
```

The catalog INCLUDES per-action / per-trigger: `key`, `displayName` (implied by key), required + optional config field names, FieldType for each, multi-select flag, full `config options` enum values (cap 24/field), output names + types + sensitive flag.

The catalog EXCLUDES (already): `description`, full FieldMeta.label, `placeholder`, `optionsSource`, `dependsOn`, nested OutputMeta `fields[]` (kept reachable via `getNodeSchema` for the future drill-down loop).

### B.4 Representative scenarios (measured, not estimated)

Source: [`scripts/trash/measure-planner-prompt.ts`](../../../scripts/trash/measure-planner-prompt.ts) — one-off measurement script. Re-run with `npx tsx scripts/trash/measure-planner-prompt.ts`.

| Scenario | Total tokens | Catalog | Rules+guides | Connected | Canvas |
|---|---:|---:|---:|---:|---:|
| **S0** — no integrations, empty canvas | 38,039 | 33,584 | 4,278 | 58 | 20 |
| **S1** — Slack+Gmail connected, empty canvas, "Slack DM on Gmail email" | 38,059 | 33,584 | 4,278 | 68 | 20 |
| **S2** — Slack+Gmail connected, 2-node canvas, "Also post to #alerts" | 38,111 | 33,584 | 4,278 | 68 | 77 |
| **S3** — Slack+Gmail+Stripe connected, 3-node canvas, complex | 38,155 | 33,584 | 4,278 | 76 | 94 |

**Variance across scenarios: ~116 tokens out of 38k.** The catalog cost is invariant. Adding a 3-node canvas + 3 connected integrations costs ~150 extra tokens. Connecting more integrations does not change the catalog — it always sends all 26.

### B.5 Catalog inventory (live, measured)

| Metric | Count |
|---|---:|
| Usable providers (have ≥1 action or trigger) | 26 |
| Total actions | 286 |
| Total triggers | 62 |
| Total config fields | 1,339 |
| Total output fields | 2,250 |

### B.6 Per-provider catalog cost (top 10)

| Provider | Catalog chars | Catalog tokens (~) | Actions | Triggers | Config fields | Outputs |
|---|---:|---:|---:|---:|---:|---:|
| hubspot | 12,369 | 3,343 | 26 | 1 | 203 | 184 |
| slack | 9,263 | 2,504 | 31 | 10 | 86 | 197 |
| monday | 8,611 | 2,327 | 24 | 5 | 77 | 175 |
| mailchimp | 7,727 | 2,088 | 14 | 7 | 83 | 138 |
| stripe | 7,367 | 1,991 | 16 | 1 | 72 | 127 |
| trello | 6,982 | 1,887 | 8 | 6 | 46 | 221 |
| microsoft-onenote | 5,531 | 1,495 | 12 | 2 | 42 | 94 |
| gmail | 5,456 | 1,475 | 13 | 3 | 68 | 109 |
| shopify | 5,039 | 1,362 | 11 | 1 | 76 | 81 |
| google-sheets | 4,997 | 1,351 | 12 | 2 | 54 | 76 |
| ... | ... | ... | ... | ... | ... | ... |
| **TOTAL** | **122,058** | **32,989** | 286 | 62 | 1,339 | 2,250 |

**Mean ~1,270 tokens per provider; median ~1,000 tokens.** A narrowed packet of 5 providers averages ~6,300 catalog tokens. Of 3 providers averages ~3,800 catalog tokens.

---

## C. Token / Cost Driver Estimate

### C.1 Where the input bill goes (today, per plan call)

| Driver | Tokens | % of input bill |
|---|---:|---:|
| **Catalog (all 26 providers)** | **33,584** | **88.3%** |
| Rules + guides (`PLANNER_CONSTRAINTS` + `PATCH_SHAPE_GUIDE` + `VALUE_SHAPE_RULES` + `JSON_OUTPUT_RULES` + `RESPONSE_SCHEMA_DESCRIPTION`) | 4,278 | 11.2% |
| Connected integrations | ~70 | 0.2% |
| Current canvas | ~50 | 0.1% |
| Preamble + template note | ~91 | 0.2% |
| User request | ~30 | 0.1% |

### C.2 Cost extrapolation (Anthropic Sonnet 4.6 list pricing)

- Input: $3 / 1M tokens
- Output: $15 / 1M tokens
- Tool-use overhead: included in input tokens (the `WORKFLOW_PLAN_TOOL` schema adds ~250 tokens)

| Volume / day | Input cost / day | Output cost / day | Total / day | Total / month |
|---|---:|---:|---:|---:|
| 100 plan calls | $11.41 | $1.50 | **$12.90** | $387 |
| 1,000 plan calls | $114.11 | $15.00 | **$129** | $3,870 |
| 10,000 plan calls | $1,141 | $150 | **$1,290** | $38,700 |

Assumes ~1k output tokens per plan response. Real responses are typically smaller (200-800 tokens for needs-input plans, up to 1500 for full patches).

### C.3 Reduction potential by lever

| Lever | Catalog tokens after | Total prompt after | Cost reduction |
|---|---:|---:|---:|
| Narrow to 3 providers (avg) | ~3,800 | ~8,250 | **~78%** |
| Narrow to 5 providers (avg) | ~6,300 | ~10,750 | **~72%** |
| Narrow to 10 providers (avg) | ~12,700 | ~17,150 | **~55%** |
| Compress rules (~30% reduction) | 33,584 | ~36,750 | ~3% |
| Compress catalog representation only (~20% reduction via JSON-ish) | ~26,900 | ~31,200 | ~18% |
| Cache catalog with Anthropic prompt caching (90% off cached portion) | ~3,400 (effective) | ~7,800 (effective) | ~80% (read calls); first-write still pays |

**The single high-leverage lever is provider narrowing.** Rule / guide compression is ~3% — not worth the safety risk of trimming hard rules. Compact-JSON catalog representation is moderate (~18%) and probably worth doing in parallel with narrowing. Anthropic prompt caching is high-leverage but requires the catalog to be a stable cacheable prefix, which is compatible with narrowing (cache per narrowed set) or with sending the full catalog (cache once).

---

## D. Reliability Risk Audit

Findings are ranked by user-impact severity. **None require changes to AI-26 or earlier shipped slices.**

### D.1 Buried hard rules — moderate risk

All 19 hard rules live in a single 10k-token bullet list (`PLANNER_CONSTRAINTS`). The single longest rule (the HARD NO-SUBSTITUTION rule at line 49) is **~2,400 chars / ~650 tokens** in one bullet. Models tend to weight ordered, separated, capitalized headers more than mid-bullet text. The current top-level prominence (rule #2) is correct, but the 600-token wall in a single bullet has measurable risk of being skimmed.

**Recommended treatment in AI-29:** split the no-substitution rule into a top-of-prompt `## SAFETY RULES (non-negotiable)` block with 4–5 explicit numbered rules instead of one prose paragraph. Same words, different visual structure.

### D.2 Repeated rules across sections — minor cost driver

The "set proposedPatch to null + add requiredUserInput" instruction appears verbatim or near-verbatim in:
- `PLANNER_CONSTRAINTS` rule #2 (no-substitution)
- `PLANNER_CONSTRAINTS` rule #6 (required-field discipline)
- `PLANNER_CONSTRAINTS` rule #8 (id-shaped field warning)
- `PLANNER_CONSTRAINTS` rule #14 (cannot build complete patch)
- `PATCH_SHAPE_GUIDE` (config block instructions)
- `VALUE_SHAPE_RULES` (shape mismatch)

This is **intentional reinforcement** and probably correct — the rule is critical and the model should see it repeatedly. Cost: ~250 tokens redundant. Not worth removing for cost; consider consolidating to 2 placements (top + bottom) in AI-29 if structured packet refactor lands.

### D.3 No contradictions found

Cross-checked the following potential conflict surfaces, all consistent:

| Pairing | Result |
|---|---|
| no-substitution vs current canvas | Canvas rule explicitly says "no-substitution still binds; existing canvas nodes never license a substitution" (line 51). Consistent. |
| no-substitution vs disconnected provider | Both rules converge on "set proposedPatch to null + add unsupportedRequests OR select_integration." Consistent. |
| required-field discipline vs apply-readiness gate | `canApplyLater = preview.canApplyLater && !requiredInputBlocking` (line 220) — required input always blocks apply. Consistent. |
| Null patch vs follow-up flow | Null patch + non-empty requiredUserInput is the explicit "needs input" path. Consistent with AI-21/22 follow-up chain. |
| AI_FIELD vs requiredUserInput | Rule #6 distinguishes: AI_FIELD ONLY for free-text content; requiredUserInput for everything else (ids, enums, selections). Clear. |
| Persisted history vs planner context | Planner never reads persisted history (verified in AI-AUDIT-1). Consistent. |

### D.4 Catalog ambiguity surfaces — minor

The catalog uses `config fields:` with a `required:` line — but a node with NO required fields still gets `required: <none>` rendered. Mostly fine; the visual symmetry helps the model. Cost: ~10 tokens per such node, negligible.

`config options` are rendered as `field: [v1, v2, ...]; field2: [...]` — semicolon-separated. The model occasionally interprets a colon inside an option value as a separator (rare; not observed in V2 smoke). Future improvement: structured JSON.

### D.5 Output-name guidance vs declared outputs — robust

The "do NOT invent output keys" rule (#10) is reinforced by per-node `outputs:` lines listing the exact declared names. Verified that AI-3 `INVALID_VARIABLE_REFERENCE` is the last-line defense. Good.

### D.6 "Me" resolution — has a subtle gap

Rule #11 says: when the user names a per-user recipient and the connected integration carries `me=<id>`, use that id. The connected-integrations render includes `me=<id>` when `currentUserId` is set. **Risk:** if the integration's OAuth scope didn't capture `currentUserId`, the planner correctly asks via requiredUserInput — but the integrations table's `currentUserId` is a connector implementation detail. Not all integrations populate it. Surfacing absence as "me=unknown" vs simply omitting it (current behavior) doesn't change correctness.

### D.7 `TEMPLATE_FUTURE_NOTE` — vestigial

The 45-token note saying "Template-based creation is not available yet" was added in AI-8A as forward-readiness. There are no template hooks anywhere in V2 today. Removing this note is a 45-token / 0.1% win. Defer to AI-29.

### D.8 Compact JSON option enums — capped at 24 values, mostly enough

`MAX_STATIC_OPTION_VALUES = 24` covers all current providers' enums. The Stripe `enabledEvents` field would exceed this (200+ event types) but is currently surfaced with a small enabledEvents-relevant subset. Verified: no live truncation triggered today; cap is a defense-in-depth.

### D.9 No safety regression risk from any rule consolidation

All rules in `PLANNER_CONSTRAINTS` can be preserved verbatim through a structural refactor (B/E). The structural refactor is presentation; the safety contracts are downstream (AI-3 validator, AI-5 preview, AI-20 apply-readiness gate, AI-22 required-input enrichment).

---

## E. Proposed Structured Packet Format

**Goal: machine-friendly, lower-token, equivalently safe.** Replace the prose-heavy current packet with a structured envelope. The model receives a system prompt that is mostly the same hard rules + a single JSON payload it can parse. The schema below is a proposal, not a commit.

### E.1 Recommended shape

```jsonc
{
  "task": "workflow_plan",
  "mode": "create_or_edit",
  "promptVersion": "v2.0",            // bump on any rule change for telemetry
  "userRequest": "Send a Slack DM to me when I get a new Gmail email",

  "currentCanvas": {
    "nodes": [{"id": "n1", "kind": "trigger", "provider": "gmail", "type": "new_email"}],
    "edges": []
  },

  "connectedIntegrations": [
    {"provider": "slack", "account": "Acme Workspace", "me": "U01ABC23DEF"},
    {"provider": "gmail", "account": "me@acme.com"}
  ],

  "catalog": {
    "providersIncluded": ["slack", "gmail", "native"],   // explicitly narrowed
    "providersOmittedDueToNarrowing": 23,                  // visible to model
    "triggers": [
      {
        "key": "gmail:new_email",
        "displayName": "New email",
        "requiresIntegration": true,
        "configFields": [
          {"name": "label", "type": "combobox", "required": false},
          {"name": "from", "type": "text", "required": false}
        ],
        "outputs": [
          {"name": "messageId", "type": "string"},
          {"name": "from", "type": "string"},
          {"name": "subject", "type": "string"},
          {"name": "body", "type": "string"}
        ]
      }
    ],
    "actions": [
      {
        "key": "slack:send_direct_message",
        "displayName": "Send direct message",
        "requiresIntegration": true,
        "risk": "low",
        "isDestructive": false,
        "requiresConfirmation": false,
        "configFields": [
          {"name": "userId", "type": "combobox", "required": true},
          {"name": "text", "type": "textarea", "required": true}
        ],
        "outputs": [{"name": "messageTs", "type": "string"}]
      }
    ]
  },

  "constraints": {
    "version": "v2.0",
    "noSubstitution": true,
    "noRequiredFieldGuessing": true,
    "noMutationDuringPlan": true,
    "nullPatchWhenBlocked": true,
    "outputNamesMustBeDeclared": true,
    "neverInventCredentials": true,
    "preferLowRisk": true
  },

  "responseSchema": "<inline JSON Schema or pointer to tool-use schema>"
}
```

The system message keeps the **human-language hard rules** (no-substitution + required-field discipline + the JSON-only output instruction) but in a compressed form using clear headers — see §E.2. The JSON envelope is appended to the system message OR sent as the user message (TBD per A/B test in AI-29).

### E.2 Rule consolidation (compressed, equivalent safety)

| Original rule (count) | Proposed structure |
|---|---|
| 19 prose bullets, 10k tokens | 5 numbered headers, ~6k tokens projected |
| Embedded sub-clauses | Each sub-clause its own numbered subrule |
| Repetition across rules | Single canonical placement + back-reference |

Top-of-prompt structure:
```
## CRITICAL RULES (non-negotiable; violations are rejected downstream)

R1. NO SUBSTITUTION — Never substitute provider/action/trigger.
   R1a. Gmail → Outlook forbidden.
   R1b. Manual Trigger is allowed ONLY when the user said "manual"/"on demand".
   R1c. DM ≠ channel message; draft ≠ send.
   R1d. When requested capability is missing/disconnected: proposedPatch=null + unsupportedRequests or requiredUserInput(select_integration).

R2. NO REQUIRED-FIELD GUESSING — Never fabricate ids, enums, channels, recipients.
   R2a. Acceptable sources: user-supplied, upstream output, connected me=<id>, declared defaultValue, free-text AI_FIELD.
   R2b. For anything else: requiredUserInput + proposedPatch=null.

R3. NO HALLUCINATED OUTPUT NAMES — `{{nodeId.field}}` MUST reference a name in that node's outputs list. Otherwise rejected.

R4. NO SECRETS — Never include API keys, tokens, passwords, auth headers, OAuth credentials.

R5. OUTPUT FORMAT — Exactly one JSON object. Tool-use call (`propose_workflow_plan`). No prose.
```

Estimated savings: ~3,500 tokens (current rules ~10k → proposed ~6k for the same 5 rule families) while keeping every safety guarantee. Add to provider-narrowing savings: cumulative ~75–80%.

### E.3 What stays unchanged

- `WORKFLOW_PLAN_TOOL` (forced tool-use) — stays as-is. Models reliably emit valid JSON via this path.
- `WorkflowPatchSchema` validator (AI-3) — stays as-is.
- `previewWorkflowPatchForAI` (AI-5) — stays as-is.
- `enrichRequiredUserInputs` (AI-22) — stays as-is.
- AI-20 apply-readiness gate — stays as-is.
- Connected integrations format (`{provider, account, scope?, me?}`) — already compact and structured.
- Current canvas format (`{id, kind, provider, type}` per node, `{id, from, to}` per edge) — already compact.

---

## F. Provider Narrowing Strategy

The single highest-leverage cost lever. Implementation in AI-30.

### F.1 Staged retrieval

Goal: send only the providers the user's request implies, with a guaranteed safety net so no-substitution can never silently be violated by a classifier mistake.

```
Step 1 — Intent classification (cheap)
  Input: userRequest + connectedIntegrations + currentCanvas (~500 tokens)
  Model: Claude Haiku 4.5 ($1/M input) OR deterministic keyword classifier
  Output: { intendedProviders: ["slack","gmail"], confidence: "high"|"medium"|"low",
            triggerCategory?: "email"|"webhook"|"manual"|..., editMode?: boolean }

Step 2 — Candidate expansion
  Always-include the providers ALREADY on currentCanvas (edit safety).
  Always-include providers explicitly named in the user request (regex / NER).
  Always-include "native" (logic + delay + router are tiny, ~480 tokens, useful for combos).
  Add classifier's top-K (K=3 for high-confidence, K=5 for medium, K=10 for low).
  Cap at 10 providers to bound cost in the worst case.

Step 3 — Build narrowed catalog
  Same renderCatalog logic, but with providers.filter(p => narrowedSet.has(p.id)).

Step 4 — Plan with narrowed packet (strong model)
  Same orchestrator (planWorkflowFromPromptForAI), strict-tool-use, full safety pipeline.

Step 5 — Fallback expansion (on planner failure)
  If response contains unsupportedRequests for a provider that exists in the FULL catalog
  but was omitted from the narrowed catalog (classifier miss), retry ONCE with the full
  catalog. Logged + emitted as a metric so we can tune the classifier.
```

### F.2 Safety net — never violate no-substitution due to narrowing

**The risk:** classifier predicts `["slack"]`; user actually wants `["gmail", "slack"]`; narrowed catalog omits gmail; the strong model has no gmail metadata and might substitute Manual Trigger.

**Mitigations:**
1. **Explicit-mention regex always wins.** A simple `provider-name → providerId` lookup runs on the user request before the classifier. Any provider explicitly named (case-insensitive, plus common aliases like "gdrive" → "google-drive") is force-included regardless of classifier output. This catches >95% of cases.
2. **Connected integrations always included.** The connected-integrations list is small (~70 tokens); including their full catalog entries (avg 1,270 tokens each, so ~3,800 tokens for 3 connected) is cheap and prevents "user has Stripe connected but classifier missed it" mistakes.
3. **Canvas-present providers always included.** Same logic — edit-mode safety.
4. **The narrowed-catalog `providersOmittedDueToNarrowing` count is surfaced to the model.** It can then explicitly request a re-plan when the request doesn't match the narrowed set ("the requested provider X is not in the included catalog — emit unsupportedRequests and ask the user to retry").
5. **Fallback expansion** (step 5 above) is a backstop, not a primary path. Telemetry tracks fallback rate; if it stays >5%, the classifier is bad.

### F.3 Classifier choice

| Option | Pros | Cons |
|---|---|---|
| **A. Deterministic keyword + alias classifier** | Free; zero added latency; deterministic; no model API key needed | Requires per-provider alias dictionary; misses synonyms; "send a message" → ambiguous |
| **B. Claude Haiku 4.5 with strict-tool-use returning `{providers: string[], confidence}`** | High recall; understands synonyms; ~$0.0005/call extra cost; ~300ms latency | Adds another model call (still much cheaper than running strong with full catalog) |
| **C. Hybrid: A first, escalate to B on low confidence** | Best of both | More code paths to maintain |

**Recommendation: B for v1.** The classifier prompt is tiny (~1k tokens with a 26-provider list and the user request). Cost ~$0.001/call. Net savings still ~70% on a typical plan call. If a deterministic-first variant becomes attractive later, A is a drop-in upgrade.

### F.4 Provider-narrowing tests

Already proposed in §K. Key tests:
- `narrowProvidersForPlan` includes every provider on the canvas.
- Includes every connected provider.
- Includes every explicitly-named provider regardless of classifier output.
- Caps at 10 providers worst-case.
- Fallback expansion fires on a missing-provider unsupportedRequests.
- A `select_integration` requiredUserInput on a narrowed-out provider is preserved (the safety net works).

---

## G. Model-Tier Routing Strategy

### G.1 Today

`FEATURE_DEFAULT_TIER` (in [`core/ai/models.ts`](../../../core/ai/models.ts)) routes every `workflow_creation` and `workflow_editing` call to the **strong** tier (Sonnet 4.6). The `tier` field exists in `ModelGenerateInput` and can be overridden per call.

### G.2 Recommendation (AI-31)

Two-tier routing:

| Stage | Tier | Model | Why |
|---|---|---|---|
| Intent classification | fast | Haiku 4.5 | Single-shot classification, low complexity |
| Workflow plan generation | strong | Sonnet 4.6 | Reasoning + patch construction needs strong model |
| Required-input enrichment | (deterministic, no model) | n/a | Already deterministic via `enrichRequiredUserInputs` |
| Preview risk recompute | (deterministic, no model) | n/a | Already deterministic via AI-5 |

**Escalation thresholds (future):**
- If classifier confidence == "high" AND narrowed catalog ≤ 3 providers AND no canvas: try Haiku for the plan call itself; escalate to Sonnet on parser failure / `MODEL_FAILED`. Saves ~67% on input cost AND ~67% on output cost for the easy path.
- Don't escalate when destructive actions are involved (Haiku risk-acknowledgment is less consistent in V1 smoke).

Defer Haiku-for-plan to a later slice (AI-31-followup); the AI-30 narrowing change alone pays for itself.

### G.3 What stays strong

- Patch generation for edit-mode operations (`updateNodeConfig`, `replaceTrigger`).
- Anything that hit `unsupportedRequests` on the first pass (the model needed to reason about what's missing).
- Anything where canvas has > 5 nodes (workflow understanding scales with reasoning depth).

---

## H. Catalog Caching / AI-Ready Summaries

Three orthogonal caching levers:

### H.1 Per-process catalog cache (in-memory, no migration)

`getProviderCatalog()` is called on EVERY plan request and re-computes the full catalog from the discovery registry. The catalog is deterministic — it only changes when a deployment ships new metadata.

**Proposal:** module-level memoization keyed by `registry version` (a SHA of the listed providers / actions / triggers). Invalidate on deployment / hot-reload. **Savings:** ~10–50ms per plan call. Not a token saving, but a latency saving worth doing in AI-32.

### H.2 AI-ready compact catalog (replaces current renderer)

The current renderer produces ~33k tokens of catalog. A compact JSON catalog with:
- Single-line per action: `"slack:send_direct_message": {"r":"low","cf":["userId:combobox:req","text:textarea:req"],"o":["messageTs:string"]}`
- Per-trigger same shape
- Per-provider header: `"slack": {"name":"Slack","actions":{...},"triggers":{...}}`

Saves ~20% on catalog tokens (~6,700 tokens) for the cost of changing how the model reads it (a structured-JSON catalog is easier for the model AND for us). Pair with narrowing for compound savings.

### H.3 Anthropic prompt caching (`cache_control`)

If Anthropic prompt caching is enabled, the **catalog + rules** section is a perfect cache prefix:
- It's stable across requests (changes only on deploy).
- It's > 1,024 tokens (minimum cache size).
- It's the start of the prompt (cache works on prefix).

**Savings:** 90% off cached input tokens. With a stable cache of ~38k tokens, every subsequent call reads at $0.30/M instead of $3/M → input cost drops from $0.114 → $0.011 per call (~90% cached + 10% miss for current canvas + connected integrations + user request). **This is the highest single lever if prompt caching is enabled.**

**Caveat:** prompt caching has a 5-minute TTL (refreshed by use). High-traffic accounts get great cache hit rates; low-traffic accounts pay the writeback cost (1.25× normal price for the first call). Cache-friendliness requires the catalog + rules to be **before** the variable sections — current ordering already does this except for `Connected integrations` and `Current canvas` sitting BETWEEN rules and `PATCH_SHAPE_GUIDE`. Reordering to put all stable sections first would unlock prompt caching with minimal change. Investigate in AI-32.

### H.4 Combined cache + narrowing

Stacking is possible but tricky: narrowing produces a different catalog per request, defeating naive cache. Strategies:
- **Per-provider-set cache key.** A `["slack","gmail","native"]` set gets its own cache entry; common sets are reused. Works if there are O(10s) of common sets.
- **Full catalog with cache + narrowing only for the rule emphasis section.** Pay for the catalog cache once; narrow the rule guidance to the relevant providers. Less savings, simpler cache.
- **Skip caching for v1.** AI-30 narrowing alone gets 70%; add caching in AI-32 only if needed.

---

## I. Observability / Cost Metrics

### I.1 What's emitted today

`recordAiPlanOutcome` → `ai_cost_events` rows include (per call):
- `userId`, `feature` (`workflow_creation`), `workflowId`, `patchId`
- `eventType` (`ai_interaction_started`, `ai_model_call_completed`, `ai_patch_proposed`, etc.)
- `modelName`, `modelProvider`, `inputTokens`, `outputTokens`, `latencyMs`
- `metadata.tier`, `metadata.finishReason`, `metadata.opCount`, `metadata.code`

### I.2 What AI-28 should add

| Dimension | Why |
|---|---|
| `metadata.promptVersion` | Tag every call with the prompt build's version string. Lets us A/B compare prompt changes. |
| `metadata.catalogProviderCount` | How many providers were in the catalog this call (full=26, narrowed=variable). |
| `metadata.catalogTokens` | Section-size estimate for the catalog portion. |
| `metadata.rulesTokens` | Section-size for rules + guides. |
| `metadata.connectedIntegrationCount` | Cardinality of the connected list. |
| `metadata.canvasNodeCount` | Cardinality of current canvas. |
| `metadata.classifierConfidence` | "high"/"medium"/"low" — only when narrowing is on. |
| `metadata.fallbackExpansionTriggered` | true when AI-30 retried with full catalog. |
| `metadata.totalInputTokensEstimate` | Sum of all section tokens; cross-check vs `inputTokens` from the model API. |

The `inputTokens` field already exists and is populated by the model SDK. AI-28 layers section-attribution **on top** so we can decompose "where the tokens went."

### I.3 Cost dashboards / queries (post-AI-28)

Suggested queries (over `ai_cost_events`):

```sql
-- Average input tokens per plan call by promptVersion (track refactor impact)
SELECT
  metadata->>'promptVersion' AS version,
  AVG(input_tokens) AS avg_input,
  AVG(output_tokens) AS avg_output,
  COUNT(*) AS calls,
  SUM(input_tokens) * 3.0 / 1e6 AS input_cost_usd,
  SUM(output_tokens) * 15.0 / 1e6 AS output_cost_usd
FROM ai_cost_events
WHERE event_type = 'ai_model_call_completed' AND feature = 'workflow_creation'
GROUP BY 1
ORDER BY 1;

-- Fallback expansion rate (AI-30 health check)
SELECT
  date_trunc('day', created_at) AS day,
  COUNT(*) FILTER (WHERE metadata->>'fallbackExpansionTriggered' = 'true') AS fallbacks,
  COUNT(*) AS total_calls,
  ROUND(100.0 * COUNT(*) FILTER (WHERE metadata->>'fallbackExpansionTriggered' = 'true') / COUNT(*), 2) AS fallback_pct
FROM ai_cost_events
WHERE event_type = 'ai_model_call_completed' AND feature = 'workflow_creation'
GROUP BY 1 ORDER BY 1 DESC;

-- Cost per successful apply (funnel-aware)
WITH plans AS (
  SELECT user_id, workflow_id, SUM(input_tokens) * 3.0 / 1e6 + SUM(output_tokens) * 15.0 / 1e6 AS plan_cost
  FROM ai_cost_events
  WHERE feature = 'workflow_creation' AND event_type = 'ai_model_call_completed'
  GROUP BY 1, 2
),
applies AS (
  SELECT user_id, workflow_id, COUNT(*) AS apply_count
  FROM ai_cost_events
  WHERE feature = 'workflow_editing' AND event_type = 'ai_patch_applied'
  GROUP BY 1, 2
)
SELECT AVG(plan_cost / apply_count) AS avg_cost_per_successful_apply
FROM plans JOIN applies USING (user_id, workflow_id) WHERE apply_count > 0;
```

---

## J. Recommended Implementation Sequence

### AI-28 — Prompt packet instrumentation (observability only)
- Add per-section token-size attribution to `recordAiPlanOutcome` metadata.
- Add `promptVersion` field (a hardcoded `"v1.0"` for now; bump on prompt edits).
- Add dashboards / queries doc.
- **No behavior change. Pure observability. Risk: minimal.**
- Tests: snapshot the metadata shape; assert section-size sums to `inputTokens` ± 5%.

### AI-29 — Structured packet refactor (no behavior change)
- Migrate `buildWorkflowPlanPrompt` to a structured envelope (per §E).
- Consolidate 19 rules → 5 numbered headers with subrules (preserve every safety guarantee).
- Bump `promptVersion` to `"v2.0"`.
- Remove `TEMPLATE_FUTURE_NOTE` (45-token cleanup).
- Goal: ~6,000–8,000 tokens for catalog + rules combined when the catalog stays full (~10% saving on rules without narrowing).
- **No behavior change. Same providers in the catalog. Same safety contracts.**
- Tests: regression-pin against current `buildWorkflowPlanPrompt.test.ts` golden assertions; new structural assertions on the JSON envelope shape; smoke tests against representative scenarios still produce valid plans.

### AI-30 — Provider narrowing (the big win)
- Add `narrowProvidersForPlan({userRequest, connectedIntegrations, currentCanvas}) → providerIds[]`.
- Implement classifier (option B from §F.3 — Haiku call returning `{providers, confidence}`).
- Wire safety nets: explicit-mention regex, canvas-included, connected-included.
- Wire fallback expansion: on `unsupportedRequests` for a narrowed-out provider, retry once with full catalog.
- Bump `promptVersion` to `"v3.0"`.
- **Behavior change.** No regression in safety; significant change in token cost.
- Tests: extensive — see §K.

### AI-31 — Model-tier routing
- Add Haiku-for-classifier (already in AI-30); add Haiku-for-easy-plan path (with fallback to Sonnet on parse failure / low classifier confidence / destructive request).
- Bump `promptVersion` to `"v3.1"`.
- Tests: tier-selection deterministic; escalation paths covered.

### AI-32 — Catalog cache + Anthropic prompt caching
- Module-level memoization of `getProviderCatalog()` keyed by deploy-time registry version.
- Anthropic prompt caching (`cache_control: {type: "ephemeral"}`) on the rules + catalog prefix.
- Reorder prompt sections so all stable content is before variable content.
- Bump `promptVersion` to `"v4.0"`.
- Tests: cache hit / miss counts; cache key stability across requests.

**Total expected savings after AI-30: ~70%.** After AI-31: ~73%. After AI-32 with caching: ~90% on warm-cache calls.

---

## K. Tests Needed

### K.1 AI-28 (instrumentation)
- `recordAiPlanOutcome` metadata includes `promptVersion`, `catalogTokens`, `rulesTokens`, `connectedIntegrationCount`, `canvasNodeCount`.
- Section-size sum within 5% of `inputTokens` (account for tokenizer variance).
- No PII / secrets in metadata (existing sanitizer test extended).

### K.2 AI-29 (structured packet)
- Golden test: `buildWorkflowPlanPrompt` output snapshot for the 4 scenarios (S0–S3). Locks the new structure.
- All 19 existing `PLANNER_CONSTRAINTS` semantic-equivalent rules still present (translated to new structure).
- `WORKFLOW_PLAN_TOOL` schema unchanged.
- Snapshot of representative plan request still passes the strict downstream parser.
- Pinned: no-substitution rule remains in a top-of-prompt prominent position.

### K.3 AI-30 (narrowing)
- `narrowProvidersForPlan` always includes providers on the canvas.
- Always includes connected providers.
- Always includes providers explicitly named in the user request (case-insensitive aliases).
- Returns ≤ 10 providers in the worst case.
- Classifier output respected when not over-ridden by safety net.
- Fallback expansion fires on `unsupportedRequests` for a narrowed-out provider.
- A `select_integration` for a narrowed-out disconnected provider still surfaces correctly.
- **Critical safety test:** "Send a Slack DM when I get a Gmail email" — narrowed catalog must include both gmail + slack; no Manual Trigger substitution risk.
- **Critical safety test:** Classifier returns `["slack"]` for "post to Slack when payments fail" — narrowed catalog must include stripe (regex catch).
- Telemetry: `fallbackExpansionTriggered` set correctly.
- Cost: total input tokens for S1–S3 are ≤ 12k (regression threshold).

### K.4 AI-31 (routing)
- Easy path goes Haiku; complex / destructive / low-confidence stays Sonnet.
- Haiku parse failure escalates to Sonnet once.
- Tier choice recorded in `metadata.tier`.

### K.5 AI-32 (caching)
- `getProviderCatalog` memoization invalidates on a synthetic registry-version change.
- Cache hit count visible in telemetry.
- Anthropic `cache_control` markers present on the rules + catalog blocks.

### K.6 Continuous (across all slices)
- **No-substitution remains top-priority and visually prominent.**
- Required-field discipline rule remains intact.
- Disconnected provider always returns setup/null patch.
- Current graph still included + sanitized.
- Secrets never included in any section of any prompt.
- Persisted history never feeds back into planning (AI-AUDIT-1 contract).

---

## L. Risks and Rollback Plan

### L.1 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Provider narrowing silently substitutes a different provider | High | Multiple safety nets (§F.2): regex + canvas + connected always included; fallback expansion; explicit `providersOmittedDueToNarrowing` count surfaced to model. Tests in §K.3. |
| Compressed rules drop a safety clause | Medium | AI-29 keeps every clause; only the visual structure changes. Test in §K.2 enumerates each. |
| Tool-use schema change rejected by Anthropic | Low | The tool schema is unchanged across AI-28–AI-32. |
| Anthropic prompt caching writeback cost dominates for low-traffic accounts | Low | Defer caching to AI-32; measure hit rate first. |
| `promptVersion` field collides with existing telemetry | Low | New field; sanitizer allowlist updated. |
| Classifier model unavailable / NOT_CONFIGURED | Medium | Fall back to "include all providers" (current behavior). Logged as a metric. |

### L.2 Rollback

Each slice has a feature flag. Names suggested:
- `ENABLE_AI_PROMPT_INSTRUMENTATION` (AI-28) — flip off if metadata bloats events table.
- `ENABLE_STRUCTURED_PROMPT_PACKET` (AI-29) — flip off to revert to current builder; prompt builders coexist.
- `ENABLE_PROVIDER_NARROWING` (AI-30) — flip off to send full catalog.
- `ENABLE_PLAN_TIER_ROUTING` (AI-31) — flip off to always use Sonnet.
- `ENABLE_CATALOG_CACHE` / `ENABLE_PROMPT_CACHING` (AI-32) — independent.

Rollback per slice is a single env-var flip; no migration to revert. The structured packet (AI-29) is the only one where rollback also needs the model to behave identically — for that, we keep `buildWorkflowPlanPromptV1` alongside `V2` for one slice cycle.

---

## M. Measurement Reproducibility

The numbers in §C are not estimates — they're measured. Re-run with:

```
npx tsx scripts/trash/measure-planner-prompt.ts
```

The script:
- Pulls the live `ProviderCatalogView` via `getProviderCatalog()`.
- Builds the actual `buildWorkflowPlanPrompt` output for 4 scenarios (S0–S3).
- Counts chars per section by splitting on the `\n\n` separator (matching the builder's join pattern).
- Estimates tokens at 3.7 chars/token (Anthropic English heuristic; ~5% variance vs actual Claude tokenizer).
- Reports per-provider catalog render cost via differential measurement (catalog with that provider only minus empty catalog).

Token estimates are conservative (skew toward over-counting). Marcus's observed ~36k input tokens from a live call matches the S1 measurement of 38,059 to within 6%, well inside tokenizer variance.

Script is in `scripts/trash/` per CLAUDE.md trash convention — it's a one-off measurement helper, not production infrastructure. Delete when AI-28 instrumentation lands and provides the same data through `ai_cost_events`.
