# AI-PROVIDER-ROLLOUT-1 — Production Rollout Outcome: ChainReact AI Provider LIVE

**Type:** Production rollout record (executes the CS-9 checklist). **The ChainReact
AI provider is ENABLED in production** as of 2026-07-24.
**Branch:** `v2-main` · **Owner approval:** Marcus approved the full push scope
in-session; rollout steps were executed in the CS-9-mandated order.

---

## 1. What is now live

- `v2-main` pushed to origin (previously ~52 local commits across the AI provider
  arc, Dual Builder, Fleetio/Truck-Bridge, billing lifecycle, and fixes). First
  rollout push: `02f736d31..8fccaf26d`; defect fix push: `9fd5df56f`
  ("activation gate now skips the connectionless ai provider").
- Vercel production deployments: `chainreact-9o47a5jqb` (initial rollout build),
  two env-flag redeploys, and `chainreact-e1rlfl07l` (final, aliased to
  `https://chainreact.app` / `www`, certified 28/28).
- Production env (Vercel): `AI_PROCESSOR_PROVIDER=gateway`,
  `AI_PROCESSOR_TIMEOUT_MS=60000`, `AI_PROCESSOR_MAX_INPUT_CHARS=150000` added;
  then **`ENABLE_AI_CREDIT_ENFORCEMENT=true` (Step A, deployed + verified)**, then
  **`AI_PROCESSOR_ENABLED=true` (Step B, deployed + verified)** — the mandated
  order. Gateway URL/token were already present (shared with the guidance path;
  Vercel "sensitive" type — verified behaviorally, see §3/§6).
- Billing migration `20260728000000_ai_cost_events_feature_add_ai_provider.sql`:
  **already applied** to the production Supabase project `qcepijemjlkssfkvzlio`
  (swept in by the earlier Fleetio `db:push --include-all`; migration history
  local == remote, nothing pending). Verified directly against the live DB: the
  `ai_cost_events_feature_chk` CHECK contains all 11 prior values + the 3 AI
  features; RLS enabled with its policy; no other schema change.

## 2. Gateway contract verification (before any enablement) — 12/12 PASS

Against `chainreact-ai-gateway-prod.onrender.com` with the production bearer
token and the canonical CS-2 fixtures:

`/health` 200 · `/guidance` still works · missing auth → 401 · bad auth → 401 ·
`analyze_document` extract_rows fixture → strict success envelope with correctly
shaped rows · `transform_data` fixture → output keys drawn from the
`destinationContext` field names · `suggest_schema` → contract-shaped proposal
(identifier-safe names, closed type set) · unknown task → `UNSUPPORTED_TASK`
(400) · non-JSON body → typed `INTERNAL` (500; typed either way — the client
maps it to a retryable provider error; acceptable, noted).

## 3. Ordered enablement verification

| Step | Verified |
|---|---|
| Pre-enablement (new build live, flags off) | signed-in `/api/ai/actions` returned `[]`; workflows API healthy |
| Step A (enforcement on, processor off) | app healthy; catalog still empty; non-AI surfaces unaffected; enforcement later PROVEN live by real deductions and a real `AI_CREDITS_EXHAUSTED` refusal (§5) |
| Step B (processor on) | catalog exposes exactly `ai:analyze_document` + `ai:transform_data`, both `requiresIntegration:false` (no Connect affordance); no phantom actions |

## 4. Genuine defect found and fixed during certification

First activation of an AI workflow in production failed:
`INTEGRATION_NOT_CONNECTED — "Connect ai before activating this workflow."`
Root cause: `core/integrations/nonOauthProviders.ts` (`NON_OAUTH_PROVIDERS`,
consumed by activation/resume preconditions, planner availability, and
connection diagnostics) still said `["native"]` — a second connectionless list
that CS-4's generalization never touched, and that no local suite exercised
because the CS-9 engine E2E seeds workflows already `active`. Fixed by deriving
the set from `CONNECTIONLESS_PROVIDERS` (single source of truth), with the
derivation and both set-level and consumer-level regressions pinned by test.
Commit `9fd5df56f` (pushed + deployed mid-rollout). Focused suites 313/313,
typecheck/lint clean.

## 5. Controlled live certification — 28/28 PASS

Run against production with the smoke account and non-sensitive fixture data
only (final pass; two earlier partial attempts diagnosed script fixtures, the
activation defect, and a genuine credit exhaustion — see §7 notes):

- **Analyze Document, every mode live**: summarize · extract_fields ·
  extract_rows · classify · answer_questions — real gateway calls (test mode),
  correct per-mode outputs. Extract_rows also ran **charged**: 2 rows with the
  author's columns, coerced types, `_confidence`, `overallConfidence`, warnings.
- **Live text-based PDF**: the CS-1 fixture staged into the real
  `workflow-files` bucket, read via `signed_url` FileRef → `detectedType: pdf`,
  3 segments, rows extracted. (Parser suites also green locally via `npm test`,
  the correctly-flagged runner.)
- **Transform Data, both workflows**: destination-action mode → `record` keyed
  exactly `subject/body/isHtml/importance` with `destination:
  microsoft-outlook:send_email` (destinationContext confirmed reaching the
  gateway during §2); custom-schema mode → keys exactly the author's schema,
  `destination: null`. **Invalid destination (`ai:*`) refused before any model
  spend** (failed run, zero ledger rows).
- **Suggest Fields**: real sample → contract-shaped proposal; the saved schema
  untouched (no auto-commit); 1 credit charged.
- **Dynamic variables**: the extract_rows output carried exactly the
  schema-declared paths (`rows[0].employee_name`, …) the CS-8 picker advertises.
- **Test mode**: real model call, `ai_credits_charged: 0`,
  `estimatedCredits: 3` + `testMode: true` recorded.
- **Credit exhaustion (controlled)**: smoke account set to `used = limit` →
  run failed with step error `AI_CREDITS_EXHAUSTED`, **zero** gateway/ledger
  activity; billing state restored afterward.

## 6. Billing / ledger verification (live DB)

Per charged action: **exactly one** `ai_cost_events` row — `document_analysis`/3,
`data_transform`/2 (both modes), `schema_suggestion`/1 — correct feature, `fast`
tier, `modelTag` recorded, metadata keys only
`mode task tier source testMode usageSource routeProvider estimatedCredits
creditPolicyVersion` (no content; asserted against the sample strings). No
duplicate and no skipped billing across every charged call. Enforcement is
demonstrably ON: deductions moved `ai_credits_used`, and exhaustion refused
before spend. Certification totals reconcile exactly:
`document_analysis` 21 rows / 9 credits (3 charged runs; the rest test-mode
zero-charge records), `data_transform` 2/4, `schema_suggestion` 3/3.

## 7. Privacy / log review

- Vercel runtime logs (final deployment): scanned for document text, extracted
  values, prompts, gateway/bearer tokens, service-role key, storage URLs, and
  the smoke password — **all absent** (108 lines captured via CLI; deeper
  dashboard review remains available to the owner).
- Ledger metadata verified content-free **in the database itself** (stronger
  than log grep).
- Gateway request bodies were verified in CS-9's engine E2E (no ids/token/URL;
  name-only document reference) and the live gateway echoes nothing sensitive
  in its envelopes.
- **Render-side log review was NOT possible from this environment** (no Render
  access) — owner follow-up: confirm the gateway logs request IDs/counts only.
- Certification hygiene: temp workflows soft-deleted; staged PDF removed from
  storage; the smoke account's `ai_credits_used` counter was reset once during
  certification (it had genuinely exhausted its 20-credit limit — itself a live
  proof of enforcement) and ended at 8, reflecting this pass's real spend.

## 8. Rollback plan (unchanged, verified available)

`AI_PROCESSOR_ENABLED=false` in Vercel + redeploy → catalog empties and every AI
step refuses before read/charge/network (behavior test-asserted in CS-9 and
verified live pre-Step-B). Credit enforcement stays ON unless a billing defect
appears. The CHECK-constraint migration is backward-compatible and needs no
rollback. **No rollback was needed or performed.**

## 9. Remaining risks / owner follow-ups

1. Model-quality guardrail: an invalid model reply (e.g. plural answers to a
   scalar extract_fields ask) fails the step with a safe message **after** the
   charge — the CS-5 deferred corrective-re-ask decision. Observed once live.
   Monitor `HANDLER_FAILED` on AI steps; revisit the re-ask/refund decision if
   frequent.
2. Render-side log audit (§7) — owner.
3. Vendor ZDR terms + data-processor documentation + outputs-sensitivity
   ratification — carried from CS-9, still open, now more pressing since live.
4. Post-launch monitoring per the CS-9 checklist: ledger volume/drift,
   `AI_CREDITS_EXHAUSTED` and transient-error rates, gateway 429/5xx + latency
   vs the 60 s timeout, `feature_not_priced`/`unknown_action` (expect zero).
5. The smoke account's 20-credit AI allowance is small for future live passes.

## 10. GO / NO-GO

**GO — live.** Both flags enabled in the mandated order, on a verified gateway,
with the billing migration confirmed in place, 28/28 live certification, exact
billing, and a clean privacy scan. The one defect found was fixed, deployed,
and regression-pinned during the rollout.
