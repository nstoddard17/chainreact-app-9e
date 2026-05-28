# AI Cost Telemetry Validation + Prompt-Cache Readiness Audit

**Slice:** 4.AI-32
**Branch:** `builder-ui-v1-audit-1`
**Date:** 2026-05-28
**Audit / validation only.** No planner behavior change, no model routing change, no prompt caching wired, no model classifier wired. Docs + query examples only.

---

## A. Executive Summary

**Telemetry path is sound and complete.** AI-28 (per-section attribution), AI-30 (provider narrowing), and AI-31 (tier-routing) all write through one channel — `recordAiRouteEvents.ts` → `recordAiModelCallCompleted/Failed` → `recordAiCostEvent` → `sanitizeAiEventMetadata` → `ai_cost_events`. Verified field-by-field:

- `prompt_version` is a **top-level column** (set from `prompt.packetVersion` = `workflow-planner-v3`). Queryable without JSON extraction.
- `input_tokens` / `output_tokens` / `total_tokens` are **top-level columns** (set from the authoritative Anthropic `usage` response, not estimated).
- All AI-28/30/31 fields ride in `metadata` (jsonb), folded in `promptAttributionMetadata`.
- The sanitizer's denylist (`/token|secret|password|authorization|api[-_]?key|credential|prompt|completion|chain[-_]?of[-_]?thought|\bcot\b|body|file[-_]?content|config|\braw/i`) drops anything dangerous. **No AI-28/30/31 field name matches the denylist** — pinned by tests in `recordAiRouteEvents.test.ts` + `buildWorkflowPlanPrompt.tierRouting.test.ts`. (`classifierConfidence` is safe — `/config/i` requires the literal substring "config"; "confidence" has no "g".)

**Both optimizations are viable; recommend prompt caching (AI-32A) next, classifier (AI-32B) deferred.** Reasons in §E. The headline: prompt caching is lower risk (no model-quality surface, no extra call), but **needs a packet reorder first** because the current V2 layout puts the variable CONTEXT PACKET JSON immediately after the stable preamble, so there is no contiguous cacheable prefix today. A model classifier adds cost + latency + a new no-substitution risk surface and should wait until live telemetry proves deterministic narrowing has a real miss rate.

**Validation status: EXECUTED LIVE (AI-32-LIVE, 2026-05-28).** Marcus ran the §C smoke prompts in the browser; the resulting `ai_cost_events` rows were read back via the service-role client and analyzed. **All expectations pass — see §A-LIVE below.** No telemetry bug, no field mismatch, no data leak. The earlier "not yet executed" caveat is closed.

---

## A-LIVE. Live smoke validation results (2026-05-28)

Read the 25 most recent `workflow_creation` model-call rows. **5 rows carry `prompt_version = "workflow-planner-v3"`** (the AI-29→31 stack, all 2026-05-28 12:05–12:08 UTC); the other 20 are older (2026-05-26/27) with `prompt_version = null` and only the pre-AI-28 metadata shape (`tier` / `finishReason` / `code` / `stage`) — they predate the telemetry and are the legitimate full-catalog baseline.

**The 5 v3 rows map cleanly to Marcus's smoke prompts** (identified by `userRequestChars` + provider count — the raw prompt is correctly NOT stored):

| Time (UTC) | reqChars | mode | included/total | omitted | conf | tier | input_tokens | output | likely prompt |
|---|---:|---|---|---:|---|---|---:|---:|---|
| 12:08:25 | 20 | full-catalog | 26/26 | 0 | low | strong | **39,360** | 201 | "Create an automation" |
| 12:07:55 | 40 | narrowed | 4/26 | 22 | high | strong | **11,711** | 350 | "When I get an email send a Slack message" |
| 12:06:46 | 44 | narrowed | 3/26 | 23 | high | strong | **10,968** | 769 | "When Stripe payment fails send me a Slack DM" |
| 12:06:02 | 196 | narrowed | 2/26 | 24 | high | strong | **9,110** | 611 | (longer 2-provider prompt) |
| 12:05:20 | 18 | narrowed | 2/26 | 24 | high | strong | **9,067** | 657 | "Send me a Slack DM" |

**Pass checklist:**
- ✅ `prompt_version = workflow-planner-v3` on all 5.
- ✅ `input_tokens` / `output_tokens` / `total_tokens` populated as top-level columns from the real Anthropic `usage`.
- ✅ AI-28 attribution present (`catalogChars`, `rulesChars`=11,449, `totalPacketChars`, `connectedIntegrationsChars`=236, `userRequestChars`, + counts).
- ✅ AI-30 narrowing present (`providerNarrowingMode`, `catalogProviderCount`, `catalogProvidersTotal`=26, `providerNarrowingOmittedCount`, `providerNarrowingReason`).
- ✅ AI-31 tier-routing present (`plannerModelTier`=strong on all 5, `classifierUsed`=true, `classifierModelTier`=null, `classifierConfidence`, `tierRoutingReason`).
- ✅ Specific prompts narrowed (2–4 providers); broad prompt fell back to full catalog (`reason=ambiguous_broad_request`, `tierRoutingReason=narrowing_fallback_ambiguous_broad_request`).
- ✅ Planner stayed on `claude-sonnet-4-6` / strong for every call.
- ✅ **No-leak scan: 0 hits** for `ya29.` / `Bearer ` / `xoxb-` / `xoxp-` / `sk-ant-` / `accessToken` / `refreshToken` / `authorization` / `webhookSecret` / `apiKey`; zero `config`/`raw` substrings anywhere; zero array-valued metadata. 35 distinct metadata keys, all counts/enums/booleans/short strings.

**Live cost reduction confirmed:**
- Narrowed v3 calls: **avg 10,214 input tokens** (4 calls).
- Broad v3 fallback: **39,360 input tokens** (1 call).
- Pre-AI-28 full-catalog baseline (the 20 null-pv rows): **~37,700–38,700 input tokens** (the older steady-state).
- **Narrowed vs baseline ≈ 73% reduction** — matches the AI-30 ~75% projection within tokenizer variance.

**Section-proportion finding (validates the AI-32A caching thesis):** the per-row chars×tokens estimate shows the catalog's share of the packet collapsing as narrowing kicks in, and the **stable rules rising to match it** on tight prompts:

| call | pctCatalog | pctRules | est. catalog tok | est. rules tok |
|---|---:|---:|---:|---:|
| broad (26 prov) | 86.9% | 8.0% | ~34,216 | ~3,153 |
| 4-provider | 53.2% | 28.7% | ~6,230 | ~3,360 |
| 2-provider | 37.7% | 38.3% | ~3,415 | ~3,469 |

On a 2-provider narrowed call the **rules block (~3,469 tok) is now slightly LARGER than the catalog (~3,415 tok)** — empirical proof of the §D thesis that, post-AI-30, the stable rules+guides are the prime prompt-cache target.

**One expected (non-bug) observation:** the broad v3 fallback (39,360 tok) is marginally HIGHER than the pre-AI-28 baseline (~38,000 tok). That's the documented AI-29 +0.83% packet overhead (CONTEXT PACKET JSON + R1..R8 headers + the AI-30 narrowing-aware R1 clause; `rulesChars` grew 10,021→11,449) applied on top of the full catalog when a broad prompt falls back. It is the minority path; the narrowed-path savings dominate. Not a regression — the documented tradeoff.

---

## B. Telemetry validation queries

All against `public.ai_cost_events`. `metadata` is jsonb; `->>` extracts text, `->` extracts json. Reads are RLS-scoped to the calling user via `ai_cost_events_select_own`; owner-wide reads need the service-role client (no admin gate exists yet — AI-12 note).

### B.1 Average input tokens by prompt version (the headline AI-28/30 metric)

```sql
SELECT
  prompt_version,
  count(*)                          AS calls,
  round(avg(input_tokens))          AS avg_input_tokens,
  round(avg(output_tokens))         AS avg_output_tokens,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY input_tokens) AS median_input_tokens
FROM public.ai_cost_events
WHERE event_type = 'ai_model_call_completed'
  AND feature = 'workflow_creation'
GROUP BY prompt_version
ORDER BY prompt_version;
```

Expectation after AI-30: `workflow-planner-v3` rows should show **markedly lower `avg_input_tokens`** than any `workflow-planner-v2` / `v1` rows (if any historical rows exist), because narrowing cut ~75% of the catalog on typical requests. v3 average should sit well below the ~38k pre-AI-30 baseline once broad-prompt fallbacks are mixed in.

### B.2 Narrowing effectiveness (providers included vs total)

```sql
SELECT
  (metadata->>'providerNarrowingMode')                       AS narrowing_mode,
  (metadata->>'providerNarrowingReason')                     AS narrowing_reason,
  count(*)                                                   AS calls,
  round(avg((metadata->>'catalogProviderCount')::numeric))   AS avg_included,
  round(avg((metadata->>'catalogProvidersTotal')::numeric))  AS avg_total,
  round(avg((metadata->>'providerNarrowingOmittedCount')::numeric)) AS avg_omitted,
  round(avg(input_tokens))                                   AS avg_input_tokens
FROM public.ai_cost_events
WHERE event_type = 'ai_model_call_completed'
  AND feature = 'workflow_creation'
  AND prompt_version = 'workflow-planner-v3'
GROUP BY 1, 2
ORDER BY calls DESC;
```

Expectation: a `narrowed` row with `avg_included` ≈ 2–5 / `avg_total` ≈ 26 and low `avg_input_tokens`; plus `full-catalog` rows with reasons `ambiguous_broad_request` / `no_provider_mention` / `complex_canvas_vague_edit` showing `avg_included` ≈ `avg_total` and high `avg_input_tokens`.

### B.3 Narrowing enabled / fallback rates

```sql
SELECT
  (metadata->>'providerNarrowingEnabled')      AS enabled,
  (metadata->>'providerNarrowingFallbackUsed') AS fallback_used,
  count(*)                                     AS calls
FROM public.ai_cost_events
WHERE event_type = 'ai_model_call_completed'
  AND feature = 'workflow_creation'
GROUP BY 1, 2;
```

Expectation: `enabled=true` dominant; `fallback_used=true` is the broad/vague slice. A high fallback rate = deterministic narrowing is missing common phrasings → evidence FOR a model classifier (AI-32B). A low fallback rate = deterministic narrowing is sufficient → classifier not worth it.

### B.4 Tier-routing distribution (AI-31)

```sql
SELECT
  (metadata->>'plannerModelTier')   AS planner_tier,
  (metadata->>'classifierUsed')     AS classifier_used,
  (metadata->>'classifierConfidence') AS classifier_confidence,
  (metadata->>'tierRoutingReason')  AS tier_routing_reason,
  count(*)                          AS calls,
  round(avg(input_tokens))          AS avg_input_tokens
FROM public.ai_cost_events
WHERE event_type = 'ai_model_call_completed'
  AND feature = 'workflow_creation'
GROUP BY 1, 2, 3, 4
ORDER BY calls DESC;
```

Expectation: `planner_tier=strong` for 100% of plan calls (confirms patch generation stays on Sonnet 4.6). `classifier_confidence` distribution (high/medium/low) is the signal for whether a model classifier would help — a large `low` bucket that correlates with failures (§B.6) is the case for AI-32B.

### B.5 Estimated section proportions (chars → token attribution)

Tokens-per-section aren't stored (the denylist would drop them and they'd be estimates). Compute them from the section CHARS + the authoritative `input_tokens`:

```sql
SELECT
  prompt_version,
  round(avg((metadata->>'catalogChars')::numeric
        / nullif((metadata->>'totalPacketChars')::numeric, 0)) * 100, 1)  AS pct_catalog,
  round(avg((metadata->>'rulesChars')::numeric
        / nullif((metadata->>'totalPacketChars')::numeric, 0)) * 100, 1)  AS pct_rules,
  round(avg((metadata->>'connectedIntegrationsChars')::numeric
        / nullif((metadata->>'totalPacketChars')::numeric, 0)) * 100, 1)  AS pct_connected,
  round(avg((metadata->>'currentCanvasChars')::numeric
        / nullif((metadata->>'totalPacketChars')::numeric, 0)) * 100, 1)  AS pct_canvas,
  -- Approximate catalog tokens = input_tokens * (catalogChars / totalPacketChars).
  round(avg(input_tokens
        * (metadata->>'catalogChars')::numeric
        / nullif((metadata->>'totalPacketChars')::numeric, 0)))           AS approx_catalog_tokens
FROM public.ai_cost_events
WHERE event_type = 'ai_model_call_completed'
  AND feature = 'workflow_creation'
  AND prompt_version = 'workflow-planner-v3'
GROUP BY prompt_version;
```

Expectation post-AI-30: `pct_catalog` should be **much lower than the pre-AI-30 88.3%** on narrowed calls (the rules block becomes a larger share of a smaller packet). `pct_rules` rising relative to `pct_catalog` is exactly the signal that the **stable rules are now the biggest cacheable win** (§D).

### B.6 Failure correlation with classifier confidence

```sql
WITH calls AS (
  SELECT
    (metadata->>'classifierConfidence') AS confidence,
    event_type
  FROM public.ai_cost_events
  WHERE event_type IN ('ai_model_call_completed', 'ai_model_call_failed')
    AND feature = 'workflow_creation'
    AND prompt_version = 'workflow-planner-v3'
)
SELECT
  confidence,
  count(*) FILTER (WHERE event_type = 'ai_model_call_failed')    AS failed,
  count(*)                                                       AS total,
  round(100.0 * count(*) FILTER (WHERE event_type = 'ai_model_call_failed')
        / nullif(count(*), 0), 1)                               AS fail_pct
FROM calls
GROUP BY confidence
ORDER BY fail_pct DESC;
```

This is the **decision query for AI-32B**: if `low`-confidence requests fail (parse / validation) materially more than `high`-confidence ones, a model classifier that lifts low-confidence prompts into the right narrowed catalog has a clear payoff. If failure is flat across confidence, the classifier won't help.

### B.7 Cost per successful apply

Plan calls (`workflow_creation`) and applies (`workflow_editing` / `ai_patch_applied`) are separate events. Cost-per-apply joins the model-cost of the creation funnel against applied patches:

```sql
WITH plan_cost AS (
  SELECT workflow_id, sum(estimated_cost_micros) AS plan_micros
  FROM public.ai_cost_events
  WHERE event_type = 'ai_model_call_completed'
    AND feature = 'workflow_creation'
  GROUP BY workflow_id
),
applies AS (
  SELECT workflow_id, count(*) AS applied
  FROM public.ai_cost_events
  WHERE event_type = 'ai_patch_applied'
  GROUP BY workflow_id
)
SELECT
  round(sum(p.plan_micros) / 1e6, 4)                            AS total_plan_usd,
  sum(a.applied)                                                AS total_applies,
  round(sum(p.plan_micros) / nullif(sum(a.applied), 0) / 1e6, 4) AS usd_per_apply
FROM plan_cost p
LEFT JOIN applies a USING (workflow_id);
```

Note: `estimated_cost_micros` is populated only if a cost is computed at record time — today the recorder leaves it `null` unless a caller passes `estimatedCostMicros`. If null in practice, derive cost from `input_tokens`/`output_tokens` × the model's per-token price (Sonnet 4.6 list: $3/M in, $15/M out). Surfacing `estimated_cost_micros` on plan calls is a small follow-up (NOT this slice).

---

## C. Manual validation smoke plan

Run against a dev server with `ANTHROPIC_API_KEY` set, signed in as a test user with (at least) Slack connected. After each prompt, run §B.2 + §B.4 filtered to the last few minutes.

| # | Prompt | Expected narrowing | Expected metadata |
|---|---|---|---|
| 1 | "Send me a Slack DM" | `slack` + `native` = 2 / 26 | `providerNarrowingMode=narrowed`, `catalogProviderCount≈2`, `classifierConfidence=high`, `tierRoutingReason=feature_default_strong`, low `input_tokens` |
| 2 | "When Stripe payment fails send me a Slack DM" | `stripe` + `slack` + `native` = 3 / 26 | `narrowed`, `catalogProviderCount≈3`, `classifierConfidence=high` |
| 3 | "When I get an email send a Slack message" | `gmail` + `microsoft-outlook` + `slack` + `native` = 4 / 26 | `narrowed`, `catalogProviderCount≈4`, ambiguous-email inclusion visible (gmail + outlook both present) |
| 4 | "Create an automation" | full catalog = 26 / 26 | `providerNarrowingMode=full-catalog`, `providerNarrowingReason=ambiguous_broad_request`, `tierRoutingReason=narrowing_fallback_ambiguous_broad_request`, `classifierConfidence=low`, high `input_tokens` |

**Pass criteria.**
- `prompt_version = 'workflow-planner-v3'` on all four.
- Prompts 1–3 show `input_tokens` roughly 25–30% of Prompt 4's (≈75% reduction confirmed live).
- Prompt 4 shows `input_tokens` near the full-catalog baseline.
- **No row's `metadata` contains** any of: a substring of the user's prompt, a provider id ARRAY, a config object, a token/secret. (Spot-check `SELECT metadata FROM ai_cost_events ORDER BY created_at DESC LIMIT 4;`.)
- `plannerModelTier='strong'` on all four (patch generation never went to Haiku).

**What mocks can't catch (why this is a MANUAL plan):** real env-var pickup, the real Anthropic `usage.input_tokens` populating the top-level column, real RLS-scoped reads, and the real sanitizer running over the real attribution object. The unit tests prove the SHAPE; the smoke proves the WIRE.

---

## D. Prompt-caching feasibility audit

### D.1 Can `cache_control` be used with the current fetch adapter?

**Yes, but it needs a structural change.** [`anthropicClient.ts`](../../../services/ai/modelClients/anthropicClient.ts) currently sends `system` as a **plain string** (`splitMessages` joins system parts with `\n\n`). Anthropic prompt caching requires `cache_control: { type: "ephemeral" }` on a **content block** — so `system` must become an array:

```jsonc
// today:
"system": "<one big string>"
// cache-ready:
"system": [
  { "type": "text", "text": "<stable prefix>", "cache_control": { "type": "ephemeral" } },
  { "type": "text", "text": "<variable suffix>" }
]
```

`tools` can also carry `cache_control` on the last tool definition (the `propose_workflow_plan` schema is stable across calls — a good secondary cache breakpoint). The `anthropic-version: 2023-06-01` header is already sent; prompt caching is GA and needs no beta header today, **but this must be verified live before implementing** (per the honesty rule — I have not made a live call from this environment).

### D.2 Which content is a stable prefix?

The V2 packet sections, classified:

| Section | Stable across calls? | Notes |
|---|---|---|
| Preamble | ✅ stable | identical every call |
| CONTEXT PACKET JSON | ❌ variable | counts / mode / narrowingReason differ per request |
| CRITICAL RULES R1..R8 | ✅ stable | `PLANNER_CONSTRAINTS` is constant |
| TEMPLATE_FUTURE_NOTE | ✅ stable | constant |
| Provider catalog | ❌ variable | AI-30 narrowing → different per provider-set |
| Connected integrations | ❌ variable | per user |
| Current canvas | ❌ variable | per request |
| Cost awareness | ❌ optional/variable | |
| Response schema | ✅ stable | constant |
| PATCH_SHAPE_GUIDE | ✅ stable | constant |
| VALUE_SHAPE_RULES | ✅ stable | constant |
| JSON_OUTPUT_RULES | ✅ stable | constant |

**The blocker:** caching caches a CONTIGUOUS prefix. Today the order is `preamble (stable) → CONTEXT PACKET (variable) → rules (stable) → … → catalog (variable) → … → guides (stable)`. The variable CONTEXT PACKET sits at position 2, so the cacheable prefix is just the preamble (~150 chars) — useless. The big stable blocks (rules ~10k chars, patch/value/json guides ~5k chars) are stranded AFTER variable content.

**To make caching useful, reorder the packet** so all stable content forms one contiguous prefix:

```
[ preamble + CRITICAL RULES + TEMPLATE note + response schema + PATCH_SHAPE_GUIDE + VALUE_SHAPE_RULES + JSON_OUTPUT_RULES ]  ← cache_control breakpoint here
[ CONTEXT PACKET JSON + catalog + connected + canvas + cost ]  ← variable tail
```

That is a `workflow-planner-v4` packet (a new version bump) and a behavior-adjacent change — **AI-32A scope, not this audit.** It must preserve the AI-12C recency win (JSON_OUTPUT_RULES is currently LAST for recency); moving it into the cached prefix trades recency for cacheability. That tradeoff needs a live A/B on parse-failure rate before committing — the recency placement was a real fix (AI-12C / AI-19).

### D.3 Does AI-30 narrowing reduce cache usefulness?

**Partially, and it's a deliberate, correct tradeoff.**

- **Pre-AI-30:** the full 26-provider catalog (~33.6k tokens) was IDENTICAL on every call → a massive cacheable block. Caching it would have given ~90% off ~33.6k tokens on warm reads.
- **Post-AI-30:** the catalog is small (narrowed to ~2–5 providers) AND varies per provider-set → each distinct narrowed catalog is a distinct cache entry, rarely reused across users. The catalog is no longer a good cache candidate.

But **narrowing is strictly better than caching for the catalog**: narrowing sends ~75% fewer catalog tokens (100% saved on the omitted providers), while caching only discounts cache READS by 90% and still pays a 1.25x WRITE premium + needs a warm cache within the 5-minute TTL. So:

- **Catalog:** narrowing wins. Don't try to cache the variable catalog.
- **Stable rules + guides (~4.2k tokens):** identical on EVERY call regardless of narrowing → the prime cache candidate post-AI-30. This is the cacheable win that survives narrowing.

So AI-30 didn't kill caching — it shifted the cache target from the catalog (now variable/small) to the rules+guides (still big/stable). The §B.5 query measures exactly this: as `pct_catalog` falls, `pct_rules` rises, and the rules become worth caching.

### D.4 Expected warm-cache savings

Stable rules + guides ≈ 4.2k tokens (rules ~2.7k + patch/value/json guides ~1.5k). Anthropic caching: writes 1.25x, reads 0.1x.

- Sonnet minimum cacheable prefix is 1024 tokens — 4.2k clears it.
- Warm read saves ~90% of 4.2k ≈ **~3.8k input tokens per call** equivalent.
- Against a narrowed ~9k-token packet, that's a further **~40% reduction on cache-hit calls**.
- TTL is 5 minutes → only bursty / multi-turn sessions (e.g. AI-21 follow-up chains) get warm hits. A single cold plan pays the 1.25x write premium with no offsetting read = slightly MORE expensive. Net savings depend on the hit rate, which §B.5 + a future cache-hit telemetry field would measure.

### D.5 Flags needed

- `ENABLE_PROMPT_CACHING` — gate the `cache_control` blocks in the adapter (default off until live-verified).
- `ENABLE_CATALOG_CACHE` — separate gate if a future slice decides to cache the (variable) catalog for the full-catalog-fallback case specifically (broad prompts ALL send the identical full catalog → that IS cacheable). This is a narrower, interesting sub-case: full-catalog fallbacks share one cache key.

---

## E. Model-classifier next-step audit

### E.1 Is a real Haiku classifier worth adding after AI-30?

**Not yet — defer to AI-32B, decision-gated on §B.6.** The deterministic narrowing + alias map (AI-30) already handles the common specific requests at zero classifier cost. A model classifier only earns its keep if the §B.6 query shows `low`-confidence (deterministic-fallback) requests fail materially more often than `high`-confidence ones. Without that evidence, a classifier is cost + latency + risk for an unproven gain.

### E.2 Cost / latency it would add

- One Haiku call per plan (or per low-confidence plan if gated). Haiku 4.5 list: ~$1/M in, ~$5/M out. A classifier prompt (request + connected list + provider names, no full catalog) ≈ 1–2k input tokens, ≈ 100 output tokens → ~$0.002/call.
- Latency: one extra round-trip (~300–800ms) BEFORE the strong-model plan call. On a gated "low-confidence only" design, most requests skip it.

### E.3 What it would improve over deterministic aliases

- **Synonyms / paraphrases the alias map misses:** "ping my team's channel" (→ slack, no literal "slack"), "log it in my spreadsheet" (→ google-sheets / excel, ambiguous), "tell my CRM" (→ hubspot, no literal mention).
- **Multi-hop intent:** "when a customer pays, thank them and log it" → stripe + (email|slack) + (sheets|airtable) — deterministic narrowing catches none of these without explicit names.
- **`triggerHints` / `actionHints`:** the deterministic classifier returns these empty; a model could pre-identify the likely `provider:type` keys, shrinking the catalog further (only ship the hinted nodes' schemas).

### E.4 What mistakes it would catch

The current `no_provider_mention` / `ambiguous_broad_request` fallbacks send the FULL catalog "to be safe." A classifier could narrow many of those correctly, recovering the 75% saving on requests that today fall back. The §B.3 fallback rate quantifies the size of this opportunity.

### E.5 Should it run only on ambiguous prompts? Should deterministic stay primary?

**Yes to both.** The safe design: deterministic narrowing runs first (cheap, authoritative). The model classifier runs ONLY when deterministic returns `confidence: "low"` / a full-catalog fallback. The classifier's `candidateProviders` is then **unioned** with (never subtracted from) the deterministic set — preserving every AI-30 safety invariant (explicit / connected / canvas / native always survive; no-substitution intact). The classifier can only ADD providers to a low-confidence narrowing, never remove. On classifier failure/timeout → fall back to the deterministic full-catalog behavior (the `fallbackToDeterministic` field AI-31 already added flips true).

---

## F. Recommendation

**Recommended next slice: AI-32A — prompt caching for the stable rules+guides prefix.** Then collect 1–2 weeks of telemetry and run §B.6 to decide AI-32B.

| Factor | AI-32A (prompt caching) | AI-32B (model classifier) |
|---|---|---|
| Expected cost impact | ~40% further reduction on warm-cache calls (rules+guides ≈ 4.2k tokens at 0.1x); helps multi-turn AI-21 chains most | Recovers ~75% saving on the fallback slice (size = §B.3 fallback rate); adds ~$0.002 + ~500ms per classified call |
| Implementation risk | Medium — requires `system`-as-content-blocks in the adapter + a packet reorder (`workflow-planner-v4`) + a live A/B on parse-failure rate (recency tradeoff) | Higher — new model call, new JSON-parse surface, gating logic, union-merge logic |
| Safety risk | **Low** — no model-quality surface, patch generation unchanged, no-substitution untouched; caching is transport-layer only | **Higher** — a classifier that biases toward a wrong provider is exactly what R1 guards; needs careful "add-only, never subtract" wiring + tests |
| Tests needed | Adapter: cache_control blocks present when flag on / absent when off; system-as-array shape; tool cache breakpoint. Packet: stable prefix is contiguous + byte-identical across requests; recency A/B. Attribution: cache-hit field if added. | Classifier: low-confidence-only gating; union-merge never drops a deterministic provider; failure → deterministic fallback; no-substitution preserved; no raw prompt in classifier metadata; cost/latency recorded. |
| Blocking dependency | Live verification that GA caching works with `2023-06-01` + no beta header | §B.6 showing low-confidence correlates with failure |

**Alternative: defer both, do live product smoke + PR closeout.** If Marcus wants to ship the AI-29→AI-31 arc to production and gather real telemetry first, that's the lowest-risk path — AI-30 already delivered the big 75% win, and both further optimizations are best decided on live data rather than estimates. The §B queries + §C smoke are the closeout checklist for that path.

**My recommendation: do the live smoke (§C) + ship the arc first, THEN AI-32A.** Caching's payoff depends on a warm-cache hit rate we can't estimate without live multi-turn data, and the packet reorder carries a real recency-regression risk that should be A/B'd against live parse-failure rates — not guessed. Ship, measure (§B), then cache.

**Update (AI-32-LIVE, 2026-05-28):** the live smoke is DONE (§A-LIVE) and the telemetry passes cleanly — the AI-29→AI-31 arc is validated and safe to ship. The live section-proportion data (rules ≈ catalog on tight prompts) also empirically confirms the AI-32A caching target. **Next: branch closeout / PR prep for the AI-29→AI-31 arc, then AI-32A prompt caching.** AI-32B classifier stays deferred — the live `classifierConfidence` sample (4× high / 1× low) is far too small to justify a model classifier; revisit after production volume accumulates in the §B.6 query.

---

## G. What this slice did / did NOT do

| | |
|---|---|
| Validated the telemetry path against the real schema + recorder | ✅ |
| Documented runnable validation queries (§B) | ✅ |
| Documented a manual live smoke plan (§C) | ✅ |
| Audited prompt-caching feasibility (§D) | ✅ |
| Audited model-classifier next-step (§E) | ✅ |
| Produced a recommendation (§F) | ✅ |
| Changed planner behavior | ❌ |
| Routed patch generation to Haiku | ❌ |
| Wired prompt caching | ❌ |
| Wired a model classifier | ❌ |
| Touched provider metadata / billing / workflow execution | ❌ |
| Ran the §C smoke against live data | ✅ executed 2026-05-28 (AI-32-LIVE) — see §A-LIVE; all expectations pass, no leak, no bug |
| DB migration | ❌ |

---

# AI-COST-INCIDENT-1 + AI-35D — Cost Incident Findings & Dev Cost Guard

**Slice:** 4.AI-COST-INCIDENT-1 (audit) → 4.AI-35D (dev cost guard)
**Date:** 2026-05-28

## AI-COST-INCIDENT-1 — what the ~$0.98 was

Marcus's live QA produced ~$0.98 of Anthropic API cost. The audit pulled
`ai_cost_events` for the 2026-05-28 window and found it matched the Anthropic
dashboard **token-for-token**:

- **17 completed + 1 failed** Anthropic `claude-sonnet-4-6` planner calls (not ~6).
- **271,359 input / 7,364 output tokens** = dashboard exactly. **$0.9245** at
  Sonnet pricing ($3/MTok in, $15/MTok out).
- **3 full-catalog fallback calls (~40k input each) = 40% of the bill** from 17%
  of the calls. Triggered by broad/no-provider prompts (`ambiguous_broad_request`
  ×2, `no_provider_mention` ×1).
- 14 narrowed calls averaged ~10.8k input (~$0.0398/call). Provider narrowing
  was active + correct on every call.
- **Every follow-up answer re-runs the FULL planner** (`useBuilderAi.submitFollowUp`
  → `planWorkflow`), so follow-ups double the calls per task.
- **No** hidden Anthropic route, telemetry leak, broken narrowing, or OpenAI cost.
- Latent gap: an enabled OpenAI classifier (`ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true`)
  billed OpenAI with **no `ai_cost_events` row** — closed by AI-35D.

Root cause: expected Sonnet economics × too many calls per task (follow-up
re-plans, validation-failure re-prompts, QA iteration) + 3× full-catalog spikes.
Not a bug.

## AI-35D — dev cost guard + per-request visibility

Observability/cost-control only. No planner behavior change, no OpenAI patch
routing, no narrowing-semantics change, no billing/tasks/execution/metadata
change.

- **Cost helper** — `core/ai/modelPricing.ts` (pure): `estimateModelCostUsd(modelId, usage)`.
  Lists ONLY confirmed prices (`claude-sonnet-4-6` $3/$15). Unknown model → `null`
  (caller shows tokens, cost "unknown"). Never guesses OpenAI/Haiku prices.
- **Dev log** — `services/ai/events/aiCostDebug.ts`. After each recorded React
  Agent model call, `logAiCostDebug(...)` emits one safe, greppable `[ai-cost]`
  line: feature, event, provider/model, prompt_version, in/out/total tokens,
  estimated cost, narrowing mode/fallback/reason, provider count, planner tier,
  classifier used/tier, tier-routing reason, interaction kind, patch outcome,
  workflowId. SAFE-by-construction: the input type has no field for raw prompt,
  raw output, catalog, config values, account labels, or secrets.
- **Cost debug flag** — emits ONLY when `ENABLE_AI_COST_DEBUG === "true"` AND
  `NODE_ENV !== "production"`. Off by default; never in prod. Set
  `ENABLE_AI_COST_DEBUG=true` in `.env.local` to turn on locally.
- **Full-catalog warning (Part C)** — when a call is a full-catalog fallback OR
  `input_tokens >= 20000` OR `catalogProviderCount >= 20`, the line escalates to
  `console.warn` + "AI planner full-catalog call: this is expected for
  broad/ambiguous prompts but costs about 3x a narrowed call." Visibility only —
  the call is NOT blocked (no confirmation gate this slice).
- **Follow-up visibility (Part D)** — new value-free enum `plannerInteractionKind`
  (`initial_plan | follow_up | retry | unknown`) sent by `useBuilderAi` →
  `lib/api/ai` → plan route → recorder. Folded into the planner model-call
  `metadata.plannerInteractionKind` (queryable in `ai_cost_events`) and shown in
  the dev line, so a follow-up's full re-plan is attributable.
- **OpenAI classifier telemetry (Part E) — gap CLOSED.** `runModelNarrowingClassifier`
  now returns `telemetry`; the grounding layer threads it onto
  `PlannerPromptAttribution.classifierModelCall`; `recordAiPlanOutcome` emits a
  DISTINCT `ai_model_call_completed`/`ai_model_call_failed` row under feature
  `provider_discovery` (model_provider `openai`), with metadata
  `{ classifierOnly: true, classifierPurpose: "provider_narrowing",
  classifierOutcome, classifierConfidence, candidateProviderCount,
  validProviderCount }` — counts/enums only, no raw prompt/output. Feature
  `provider_discovery` (not `workflow_creation`) keeps the planner funnel +
  AI-32-LIVE baselines clean. Still gated off by default (the classifier only
  runs when `ENABLE_AI_MODEL_NARROWING_CLASSIFIER=true`); now it records when it
  does run.

## Next cost reducers (prioritized — NOT in AI-35D)

- **P1 — Prompt caching (AI-35C).** The single lever that cuts both the ~14k-char
  stable rules prefix on EVERY call and the 124k-char catalog on full-catalog
  fallbacks (the 40%-of-bill spikes). Needs the `workflow-planner-v4` prefix
  reorder + `system` as a content-block array (see §"Prompt-caching feasibility").
- **P1 — Deterministic follow-up patch completion (AI-35B).** When a follow-up
  only fills a config value the user just answered (Slack channel/text), patch it
  into the existing patch deterministically instead of re-running the full
  planner — removes a whole class of redundant Sonnet calls.
- **P2 — OpenAI planner A/B (AI-35A).** Route simple narrowed/low-risk plans to
  OpenAI, keep Anthropic for parse-failure/high-risk/full-catalog. Gate on
  confirming the real OpenAI model ids (AI-34A ids are scaffolding) + the
  AI-34B live-shape verification.
- **P2 — Clamp the full-catalog fallback.** Ask one clarifying question before
  shipping the full 124k-char catalog to Sonnet for broad prompts.

## AI-35D scope ledger

| Action | Done? |
|---|---|
| Cost estimate helper (Sonnet only; unknown→null) | ✅ |
| Dev cost line, flag-gated + dev-only | ✅ |
| Full-catalog dev warning (no block) | ✅ |
| `plannerInteractionKind` threaded + recorded | ✅ |
| OpenAI classifier telemetry recorded (gap closed) | ✅ |
| Changed default planner / routed to OpenAI | ❌ |
| Changed provider narrowing decisions | ❌ |
| Added prompt caching / deterministic follow-up | ❌ (next slices) |
| Touched billing/tasks / workflow execution / provider metadata | ❌ |
| Wrote `estimated_cost_micros` to the ledger | ❌ (dev-log only this slice) |
| DB migration | ❌ |

---

## AI-36 — planner provider is now OpenAI (telemetry impact)

As of AI-36 the React Agent planner uses OpenAI `gpt-4.1-mini` (Anthropic disabled at runtime; emergency flag only). Telemetry impact:

- `ai_cost_events` planner rows (`feature: workflow_creation`) now record `model_provider = openai`, `model_name = gpt-4.1-mini`. `getModelById` already resolves OpenAI ids (AI-34A), so the existing `recordAiRouteEvents.providerOf` mapping needed no change.
- `plannerModelTier` is now `"fast"` (gpt-4.1-mini) instead of `"strong"` (Sonnet).
- The AI-35D `aiCostDebug` line shows `provider=openai`. OpenAI cost estimation depends on `core/ai/modelPricing` having confirmed gpt-4.1-mini prices; if a price is not configured the line shows token counts with `cost=unknown` (never a guessed number).
- A planner-disabled (no flags) NOT_CONFIGURED failure carries a fast-tier placeholder model id (an Anthropic registry id) because no call is made — the configured path always reports OpenAI.
- Validation queries that filtered on `model_provider = 'anthropic'` for the React Agent planner will now return rows only from before the cutover (or from the emergency-fallback path). Filter on `model_provider = 'openai'` for current planner cost.
