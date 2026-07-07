# Typeform Follow-up Arc — Closeout (TYPEFORM-2 + Phase 13)

## Date

2026-07-07. Branch `v2-main`.

## Summary

- **TYPEFORM-2** shipped the approved read-action family for the already
  live-complete Typeform provider: `typeform:list_responses` and
  `typeform:get_response` over `GET /forms/{id}/responses`, behind ONE new
  least-privilege scope (`responses:read`). First Typeform actions
  (TYPEFORM-1 was deliberately actions-less); `typeform` joined
  COVERED_PROVIDERS in the same slice. Product scope source:
  [asana-typeform-catalog-audit.md](./asana-typeform-catalog-audit.md).
- **Phase 13 live certification** then proved the real provider boundary in
  production the next day: post-deploy reconnect granted the new scope, both
  actions passed through the real workflow execution path (including the
  fake-token `found:false` run), pagination/filters verified live, rotation
  refresh keeps the widened grant. Status: **live-complete**.

## Completed commit chain

- `1a3df91f0` — feat(typeform): TYPEFORM-2 read-action family -
  list_responses + get_response, responses:read scope (TYPEFORM-2)
  _(2026-07-06)_ — pushed + deployed (Marcus-approved `v2-main` push
  `03930dfb2..69666b142`, which also carried parallel-session config-UX and
  trigger-cert commits)
- `c2a92adf3` — docs(typeform): TYPEFORM-2 Phase 13 live certification
  PASSED, actions live-complete (TYPEFORM-2-P13) _(2026-07-07)_ — local at
  closeout-writing time; Marcus has approved pushing committed work

## Current behavior

- **`typeform:list_responses`** — lists COMPLETED responses for a picked
  form, newest first, one bounded page per run (`pageSize` 1..100, default
  25). Filters: `since` / `until` (datetime-utc) and `query` (Typeform
  server-side search across answers/hidden fields). Pagination: `before`
  response-token cursor in, `nextBefore` out — set only when the page is
  full; a short page is the last page. `response_type` and `sort` are never
  sent (partials are plan-gated + excluded; `sort` is incompatible with
  cursor traversal).
- **`typeform:get_response`** — looks up one response by token (mapped from
  `{{trigger.responseToken}}` or a prior list run). Typeform has NO dedicated
  GET-one endpoint, so this is honestly `included_response_ids` +
  `page_size=1` with a defensive exact-token match. Unknown token →
  `{ found: false }` with null fields and the run still SUCCEEDS (Stripe
  find_* precedent) so workflows can branch; a bad formId still surfaces as
  a provider error.
- Both outputs are bounded projections: per-response
  `{responseToken, submittedAt, landedAt, answers, hidden, score}` with
  answers flattened to `{fieldId, fieldRef, fieldType, answerType, value}`
  by the SAME shared extractor the webhook trigger uses
  ([answers.ts](../../../integrations/_shared/typeform/answers.ts) — an
  import-only refactor of the certified normalizer). One honest difference:
  action answers carry NO `fieldTitle` (the Responses API returns no
  `definition` block — omitted rather than permanently null).
- All three form pickers (trigger + both actions) carry the approved static
  draft-form hint ("Draft or unpublished forms may appear here but will not
  receive responses until published in Typeform.") — description text only;
  no data-driven filtering (the API exposes no reliable draft flag).
- The manifest now declares `responses:read` and honest
  `capabilities.actions: true`; the actions appear in the Builder library
  and AI discovery via the standard meta registries.

## Security / no-leak guarantees

- Bounded projection at the API-wrapper boundary: respondent `metadata`
  (user_agent/referer/network_id fingerprint), `variables`, `landing_id`,
  `response_id`, `response_url`, and unknown provider keys never enter
  handler outputs. Live-verified by a forbidden-key scan of the persisted
  run outputs.
- `answers` + `hidden` are marked `sensitive: true` in both action metas
  (same posture as the trigger payloadShape) → run-details redaction +
  variable-picker warning.
- Bearer token travels in the Authorization header only; no token/secret in
  URLs, outputs, or logs (unit-asserted no-leak tests + live scan).
- `responseToken` (config input) is exempted in the field-sensitivity
  guardrail as a documented heuristic false positive (response ID, not
  credential material) — the runtime key-name heuristic still blocks AI
  auto-writes to it (guard-only exemption).
- 403 on a missing grant maps to `InsufficientScopeError` → re-consent UX
  (proven live: the pre-reconnect token got `INTEGRATION_SCOPE_REQUIRED`
  end-to-end through the engine).

## Data / RLS / model notes

- **No migrations, no new tables, no RLS/GRANT changes.** Reuses the
  existing integrations/workflow-runs model. Nothing unapplied.
- **No feature flags** added or used by this arc.
- Scope-grant mechanics recorded for future scope-adding slices: Typeform
  apps have NO per-app scope allowlist (nothing to change in the portal);
  the deployed manifest's authorize URL is authoritative; refresh does NOT
  widen an existing grant (reconnect/re-consent required); rotation refresh
  KEEPS the widened grant afterwards.

## UI behavior

- Two new Builder actions under Typeform (category "data", low risk,
  read-only, no destructive flags): form combobox backed by the real
  `typeform:forms` resolver, numeric-bounded page size, datetime-utc
  window filters, plain-text search + cursor fields, and a text
  `responseToken` field designed for variable mapping. No fake or
  unsupported controls; no JSON-entry fields.

## Deferred / known limitations

- Completed responses only — partial responses stay excluded (plan-gated,
  multiple deliveries per respondent; rejected by the catalog audit).
- No response-token option source (would enumerate PII-bearing tokens for
  little value; the token is trigger-fed or list-fed).
- `fields` / `answered_fields` projection params not exposed (no clear
  workflow value yet).
- EU data-center accounts remain unsupported (TYPEFORM-1 limitation,
  `api.typeform.com` only).
- Live quirk (documented in
  [research.md](../../providers/typeform/research.md)): the Responses API
  returns `calculated.score: 0` for the same response whose webhook
  delivery carried no score — `score: 0` from the read actions does not
  mean "scored".
- Exact-multiple collections can yield one final empty page under cursor
  traversal (documented, harmless).

## Verification baseline

Run this session (Phase 13, 2026-07-07):

- Live probe (`scripts/trash/typeform2-live-probe.ts`, ×2 pre/post refresh):
  scope grant, pageSize bound, exclusive `before` cursor, `since`/`query`
  filters, `included_response_ids` real→match / fake→empty — all PASS.
- Workflow-live sweep `SMOKE_PROVIDER=typeform` (real engine,
  `testMode=false`): list run `5bdf1e52-…` + get run `fcf076b1-…`
  (found:true, token match) + fake-token run `ba10ae80-…` (found:false,
  run succeeded) — all terminal `succeeded`, gate OK; post-flip re-run
  CERT-SKIPs both.
- Persisted-output readback (`typeform2-run-output-readback.ts`): bounded
  keys only, forbidden-key scan clean.
- Live refresh/rotation (`typeform-live-refresh-check.ts`): rotation
  persisted, rotated pair usable and still scope-widened.
- Focused Jest (typeform units + certification suites): 15 suites /
  118 tests PASS. `npm run typecheck` PASS. `npm run lint:structure` PASS.

Inherited from `1a3df91f0` (2026-07-06, not re-run this session): the full
TYPEFORM-2 unit/mocked baseline — 29 typeform-scoped tests, full
smoke-actions suite (79 suites / 808 tests), `npm run lint` (0 errors), and
the full-jest attribution (45 failing suites verified PRE-EXISTING on a
clean-HEAD worktree — dev-DB RLS/migrations/billing suites, parallel-session
config-UX surfaces, and the known slack-token baseline; not typeform).

Certification seed: both actions LIVE_PASS (2026-07-07); matrix pins
307 registered / 273 LIVE_PASS / 0 FAIL / 13 BLOCKED_ENV
([certification-seed-split.test.ts](../../../tests/unit/smoke-actions/certification-seed-split.test.ts)).

## Cleanup / disposition

Read-only certification — nothing created provider-side. The response used
is the harmless TYPEFORM-1 artifact ("crsmoke live cert response
2026-07-04", the only response on form `KRVNz1KP`); it remains. Smoke
env pins (`SMOKE_TYPEFORM_CONNECTED/FORM_ID/RESPONSE_TOKEN`) live in
`.env.local`. Probe scripts live in `scripts/trash/` (deletable; the folder
is at 30+ files and is due a prune).

## Recommended next tracks

- **Calendly CALENDLY-2** (scheduling-link + reads) — audited and awaiting
  Marcus approval; the only provider follow-up already scoped.
- **Asana sections** stays blocked on Asana shipping a granular scope (do
  not build).
- Provider foundation is otherwise launch-shaped; the stronger next work is
  outside the provider track (per the production config owner checklist).

## Closeout confirmation

Docs-only. Nothing pushed at closeout-writing time (push follows as a
separately approved step). Doc:
[docs/slices/phase-5/typeform-2-closeout.md](./typeform-2-closeout.md).
