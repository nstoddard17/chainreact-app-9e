# AI-PROVIDER-9 — CS-9 Outcome: End-to-End Certification & Rollout Readiness

**Type:** Certification / audit outcome (CS-9 of
[ai-provider-platform-plan.md](./ai-provider-platform-plan.md); certifies
CS-1..CS-8 as feature-complete). Local commit only; nothing pushed, no flag
enabled, no migration applied, no `db:push`.
**Date:** 2026-07-24 · **Branch:** `v2-main` (based on CS-8 `703e78c27`)

Both flags remain **OFF** everywhere: `AI_PROCESSOR_ENABLED` and
`ENABLE_AI_CREDIT_ENFORCEMENT`.

No architecture was redesigned. The only source-adjacent changes are a
self-identifying test guard (PDF §5), the new certification suite, and
documentation.

---

## 1. End-to-end certification

New suite — `tests/unit/services/execution/aiProviderEngineCertification.test.ts`
(**14 tests**, harness precedent: `truckBridgeFlagshipWalkthrough`) — runs the
plan §8 "mock-gateway engine E2E" through the **real WorkflowEngine**:

```
native:manual.run → ai:analyze_document (staged CSV via signed_url FileRef)
                  → ai:transform_data ({{analyze.rows}} → destination-action shape)
```

**Real:** the engine (BFS, readiness gate on the real discovery registry,
test-mode gate, error classification), the real handler registry and both AI
handlers, the real parser layer (papaparse actually parses the committed CSV
fixture, quoting and all), the real `executeAiAction` pipeline (registry → flag
→ tier → price → gate → route → gateway client → strict envelope → validators →
ledger calls), the real destination derivation against the live action registry
(`microsoft-outlook:send_email`), and the real `resolveStrict` resolver.
**Mocked:** the DB seams (workflow/run repos, billing collaborators with their
own suites, the credit-gate + ledger I/O) and `global.fetch`, which serves the
staged CSV and plays the gateway while capturing every request.

Certified stage by stage (input → parser → analyze → schema → dynamic outputs →
variable picker → transform → workflow outputs):

- **The chain works.** CSV parsed for real; extract_rows returns the author's
  columns with validator coercion applied (`"2"` → `2`); the single-template
  `{{analyze.rows}}` reaches Transform Data as the **raw array**
  (`inputCount: 2`); the destination-action transform returns a `record` keyed
  by the destination's own field names with real coercion (`isHtml: "no"` →
  `false`); every irrelevant output key is explicit `null`, never missing.
- **Every Analyze mode** ran through the engine: summarize · extract_fields ·
  extract_rows · classify · answer_questions — each with its mode-appropriate
  keys and nulls.
- **Both Transform workflows** ran: destination-action (with the derived
  `destinationContext` asserted inside the actual gateway body) and
  custom-schema (output keys = the author's schema names, `destination: null`).
- **CS-8 bridge:** every variable path `applyDynamicOutputs` advertises to the
  picker (`rows[0].employee_name`, …) resolves against the **actual run
  output** — the builder's promise and the runtime's behavior are the same
  contract.
- **Suggest Fields** builder flow re-certified via its own CS-7 suites (route
  gate order, co-member/non-test-run isolation, merge rules, real editor) — all
  green in this pass.

## 2. Billing certification

**Structural:** the only call sites of `aiCreditGate` / `recordAiModelCall*`
outside their own modules are `executeAiAction` and the pre-existing
workflow-guidance route (a different, older feature). All three AI capabilities
(`runDocumentAnalysis`, `runDataTransform`, `runSchemaSuggestion`) call
`executeAiAction` and nothing else — no handler-local billing exists to drift.

**Behavioral (E2E + 667 suite tests re-run green):**

| Claim | Evidence |
|---|---|
| Credits deducted correctly | gate receives (`document_analysis`, fast) then (`data_transform`, fast) — once per step, in step order; ledger rows record 3 and 2 credits |
| No duplicate billing | exactly one gate call and one ledger row per executed AI step (asserted counts) |
| No skipped billing | every AI path is an orchestrator path; orchestrators have no billing bypass seam in production code (deps are test-injection only) |
| Test mode | real model call, gate short-circuits `test_mode`, ledger records `creditsCharged: 0` + `estimatedCredits: 3` + `testMode: true` |
| Ledger entries | account/user/workflow/run scope + modelTag + counts/enums-only metadata |
| Feature mapping / registry / tiers | `billingLockstep` suite: registry ↔ `FEATURE_BASE_CREDITS` ↔ `AiFeature` ↔ `AI_COST_FEATURES` ↔ migration CHECK all agree; 5-credit fallback unreachable; suggest_schema fast-only |
| Refusals | unknown key, disabled, unsupported tier, unpriced feature, credits refused — all before any model call (pipeline suite + E2E) |
| Exhausted credits | gate refusal → `AI_CREDITS_EXHAUSTED` run failure, zero gateway calls, zero completed-ledger rows; humanizer maps to "Out of AI credits" → `upgrade_plan` |

## 3. Privacy review

Egress inventory — document content leaves ChainReact at exactly TWO moments,
both to the ChainReact-owned gateway (or first-party model client), both
disclosed in the action descriptions ("…processed by ChainReact's AI service" —
verified present in both metas):

1. **Runtime execution** (Analyze / Transform requests).
2. **Builder-time Suggest Fields** (CS-7; the author's own saved literal or
   their own test-run value, server-resolved — the client can never point the
   fetcher at an arbitrary URL).

Verified in this pass (test-asserted, not just reviewed):

- **Gateway bodies** carry no account/user/workflow ids, no token, no storage
  URL (file **name** only), and an opaque `aip-*` requestId — asserted against
  the E2E's captured live bodies. The bearer token appears ONLY in the
  Authorization header and never in any serialized body.
- **Ledger** rows and metadata carry counts/enums only; the E2E asserts no
  document text, extracted values, file name, or URL in any recorded row
  (plus the aiCostEvents key-denylist sanitizer behind it, own suite green).
- **Logs:** the AI processor and parsing layers contain **zero** console
  logging (grep-verified). The engine's structured step-failure logs carry the
  classified safe message; analyze/transform failure messages name field names
  and remedies, never values (CS-5/CS-6 suites re-run green).
- **Errors / run history:** flag-off, credit-refused, unreadable-document, and
  429 paths all produce safe messages; the E2E asserts no document content in
  the full serialized run result.
- **Diagnostics:** run-history surfaces consume the classified failure codes +
  humanizer only (`AI_CREDITS_EXHAUSTED` → upgrade CTA), never raw provider or
  document material.
- **Server-only:** `ai-processor-server-only` structure guard green — the
  config/token module cannot be imported into client layers.

**Owner ratification still open (carried from CS-5, deliberate):** AI outputs
(`fields` / `rows` / `summary` / `answer`) are **not** marked `sensitive`, so
extracted values are visible in run details and picker previews. That is the
plan-§6 posture (authors must see extractions to trust them) — ratify or
reverse before GA. External owner items also open: vendor zero-data-retention
terms on the gateway path; data-processor documentation.

## 4. Feature flags

| Verified | How |
|---|---|
| `AI_PROCESSOR_ENABLED` unset → catalog route returns `[]` | route suite (auth gate ordering included) |
| → picker renders NO AI section at all (no heading, no teaser) | CS-4 picker suites, re-run |
| → engine step refuses BEFORE gate/network (zero spend, zero I/O) | E2E flag-off test |
| → suggest-schema route refuses before any read or charge | CS-7 route suite |
| Action registration is flag-independent (registry honesty) | meta/handler lockstep suites — registered but unreachable is the designed OFF state |
| `ENABLE_AI_CREDIT_ENFORCEMENT` OFF = recording-only (no deduction, no refusal) | aiCreditGate suite |
| Rollout-order report | `describeAiProcessorRolloutReadiness()` suite: `gaReady` only when processor enabled + configured + enforcement ON; lists blocking var NAMES only |

Both flags plus the four `AI_PROCESSOR_*` vars and the two gateway vars are now
documented in `.env.example` (the CS-2/CS-5/CS-7 carry-over, closed — including
the rollout-order warning). The gateway vars were previously undocumented for
the guidance path too.

## 5. PDF investigation — root cause found; not a defect

| Question | Answer |
|---|---|
| Root cause | `unpdf` resolves its serverless PDF.js bundle via dynamic `import()`. Inside Jest's VM that needs Node's `--experimental-vm-modules` flag. `npm test` **has passed that flag since CS-1** (`package.json`), and CS-1 documented it in `docs/rules/testing-strategy.md`. The CS-5..CS-8 sessions ran **bare `npx jest`**, which omits the flag → `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG` → unpdf's open fails → `parsePdf` maps it to the generic "couldn't be read as a PDF" → 5 confusing failures. |
| Did the implementation change? | No. Parser code untouched since CS-1. |
| Did dependency behavior change? | No. `unpdf@1.6.2` works in plain Node v22 and under `npm test` — verified both in this pass. |
| Are the fixtures invalid? | No. `multi-page.pdf` parses to 3 labeled pages with the expected text. |
| Did parser behavior change? | No. **17/17 fixture tests pass** via `npm test`; all five "failing" cases green. |

**Fix applied (test-layer hardening, since the cause is invocation, not code):**
`parsers.fixtures.test.ts` now probes unpdf in `beforeAll` and fails with the
actual remedy ("run via `npm test`…") instead of five misleading parse errors.
The CS-5 outcome doc's known-failures row gained a resolution note. Production
is unaffected — Next.js does not execute this path inside a Jest VM.

## 6. Documentation updates

- `.env.example`: full ChainReact-AI section (§4) — staged surgically so the
  unrelated in-flight WIP line in that file stays uncommitted.
- CS-5 outcome doc: PDF known-failure row annotated with the CS-9 resolution.
- This document (certification record + rollout checklist below).
- Reviewed CS-2..CS-8 outcome docs against the implementation during this pass;
  no other drift found. Planning docs not duplicated.

## 7. Remaining risks

1. **Model quality is still unproven** — every test mocks the model boundary.
   The gateway (CS-0, Render) is not deployed; extraction quality on real
   payroll PDFs is unknowable until it is. This is the single biggest unknown.
2. **Unmetered-spend ordering** (R2): enforcement must precede the processor
   flag in prod; the readiness reporter says so but nothing hard-blocks.
3. **Outputs-sensitivity posture** needs explicit owner ratification (§3).
4. **Recipients gap** (CS-6): `to`/`cc`/`bcc` are `string-array`, so top email
   destinations can't have recipients auto-mapped. Honest ceiling, documented.
5. **Picker array-child tokens** (`{{node.rows.item}}`) don't resolve at
   runtime without an index — platform-wide behavior; the CS-10 loop is the
   real consumer.
6. **The billing migration is not applied anywhere** — an enabled processor
   would have every ledger write rejected by the CHECK constraint (writes are
   fail-open, so actions would succeed **unrecorded**: revenue-relevant).
7. **Suggest-Fields sample upload fallback** deferred — first-use friction
   (test run required) remains.

## 8. Rollout checklist (recommended order)

1. **Apply the migration** `20260728000000_ai_cost_events_feature_add_ai_provider.sql`
   (`npm run db:push`) to dev, verify, then prod. *Not applied in CS-9 per brief.*
2. **Deploy CS-0** — the Render gateway `/api/hermes-agent/process`
   implementing the CS-2 wire contract; its contract tests are the committed
   fixtures in `tests/fixtures/ai-processor/`.
3. **Set env (prod):** `CHAINREACT_AI_GATEWAY_URL` / `CHAINREACT_AI_GATEWAY_TOKEN`
   (shared with guidance), `AI_PROCESSOR_PROVIDER=gateway`, defaults for
   timeout/budget unless tuned.
4. **Enable `ENABLE_AI_CREDIT_ENFORCEMENT` FIRST.** Verify
   `describeAiProcessorRolloutReadiness()` reports only the processor flag
   blocking.
5. **Enable `AI_PROCESSOR_ENABLED`** (ideally staged: owner account first — no
   per-account gating exists, so "staged" = a short window with the owner
   watching).
6. **Live certification pass ("Phase 13"-style):** one real run per mode +
   both transform workflows + one Suggest Fields click against the live
   gateway; verify the `ai_cost_events` rows and credit deductions in the
   dashboard; verify a scanned PDF fails with the no-OCR message.
7. **Owner items:** vendor ZDR terms; data-processor doc; ratify
   outputs-sensitivity.
8. **Post-launch monitoring:** `ai_cost_events` volume/feature mix and
   estimated-vs-charged drift; `AI_CREDITS_EXHAUSTED` and
   `TRANSIENT_PROVIDER_ERROR` rates in run history; gateway 429/5xx rates and
   p95 latency vs the 60 s timeout; any `feature_not_priced` or
   `unknown_action` refusals (should be zero — each indicates a registry/pricing
   regression); Suggest Fields spend (1 credit/click, no client throttle beyond
   single-flight).

## 9. Go / No-Go

**Code: GO.** Every certification gate passed; no implementation defect was
found anywhere in the arc (the one open "regression" turned out to be test
invocation, §5). Registration, billing, privacy, flags, variable propagation,
and dynamic outputs behave as designed, proven through the real engine.

**Production enablement: NO-GO today**, on three external blockers, none of
them code: the unapplied billing migration (risk 6 — silently unrecorded
spend), the undeployed CS-0 gateway, and unverified live model quality. Flip to
GO by walking §8 in order.

## 10. Hard boundaries (what CS-9 did NOT do)

- No push, no deploy, no PR; no feature flag enabled; `db:push` not run.
- No new npm dependency; no migration written or modified.
- No architecture, contract, processor, billing, parser, or builder redesign.
- CS-10 (`native:for_each`) not started.
