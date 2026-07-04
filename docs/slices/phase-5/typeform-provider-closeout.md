# Typeform Provider Arc — Closeout (TYPEFORM-1 + Phase 13)

## Date

2026-07-04. Branch `v2-main`.

## Summary

- **Slice 5.TYPEFORM-1** shipped Typeform as the second net-new V2 provider
  (Asana pattern) and the first with a deliberately actions-less first slice:
  OAuth, the `typeform:forms` option source, the `typeform:new_response_in_form`
  per-form webhook trigger with full lifecycle, Apps/Builder/AI visibility,
  78 unit/route/discovery/connect-flow tests, and a direct-seed trigger smoke.
- **Phase 13 live certification** then proved the real provider boundary in
  production the same day: live OAuth + refresh-rotation persistence, live
  forms resolver, real webhook PUT/DELETE lifecycle, and a real public-form
  response producing exactly one successful production run. Status:
  **live-complete**.

## Completed commit chain

- `84921bc35` — feat(typeform): net-new provider slice 1, form-response
  webhook trigger (TYPEFORM-1) _(2026-07-04)_ — pushed + deployed
- `c649c776f` — docs(typeform): Phase 13 live certification PASSED, provider
  live-complete (TYPEFORM-P13) _(2026-07-04)_ — local at closeout-writing time;
  Marcus has approved pushing committed work

(The provider commit reached production via the approved `v2-main` push
`66ba3defa..fdcc07f40`, which also carried parallel-session action-smoke and
docs commits.)

## Current behavior

- Typeform appears on the Apps page under the new **Forms** category with a
  real Connect flow (generic OAuth dispatcher; confidential-client code flow,
  no PKCE — Typeform documents none). Connect resolves identity via `GET /me`
  and fails fast if the `offline` grant returns no refresh token.
- Tokens refresh through the shared `refreshAndRetry`/dispatcher path;
  Typeform ROTATES refresh tokens and V2 persists the rotated token on every
  refresh (proven live: both ciphertexts changed, new pair immediately usable).
- In the Builder, the `New Response in Form` trigger configures a form via the
  `typeform:forms` picker (search box doubles as Typeform's server-side
  `search` param). Activation PUTs a per-form webhook
  (`/forms/{id}/webhooks/{tag}`) carrying a V2-minted 32-byte secret and a
  deterministic `chainreact-<sha-prefix>` tag, so re-activation updates in
  place. No creation handshake exists; the config patch is the whole story.
- Deliveries hit `/api/webhooks/typeform?workflowId=&nodeId=` (strict direct
  lookup), are signature-verified over raw bytes (`Typeform-Signature` =
  `sha256=` + **base64** HMAC-SHA256) BEFORE parsing, and dedup on the stable
  response token (timestamp-free). The P-S2 formId filter narrows dispatcher
  fan-out. Non-`form_response` events are quiet-acked; the route never returns
  404/410 (Typeform disables webhooks instantly on those) and returns 5xx on
  dispatch failure so Typeform retries.
- The trigger payload is a bounded projection (ids, timestamps, form title,
  flattened `answers[]` with per-type value extraction, `hidden`, `score`).
  Deactivation best-effort DELETEs the webhook.
- **Zero actions ship** (`capabilities.actions: false`): the `form_response`
  payload is self-contained, so no read action was invented. `typeform` is
  deliberately NOT in `COVERED_PROVIDERS` (that gate requires >=1 ActionMeta);
  it flips in the first action slice.

## Live certification results (Phase 13, production)

Recorded as `LIVE_PASS` in
[`triggerCertificationSeed.ts`](../../../tests/trigger-smoke/triggerCertificationSeed.ts);
full table in the
[owner setup report](../../providers/typeform/owner-setup-report.md).

- OAuth: production connect row + live refresh with rotation persisted.
- `typeform:forms`: live form listed, safe labels, search pass-through.
- Activation: real PUT in 422ms; **`event_types` ambiguity RESOLVED live —
  optional**, omitting it yields a standard `form_response` webhook.
- Real response (public form UI) -> production signature verify -> dispatch ->
  cron drain -> **exactly one** terminal `succeeded` run; token-scoped
  eventId; `response_url` absent from the payload.
- Deactivation: rows cleaned; second DELETE read 404 (provider-side
  gone-proof — we deliberately hold no `webhooks:read`).
- Not live-forceable (direct-seed/unit-proven instead, same honesty boundary
  as Asana): redelivery dedup, wrong-form drop.

## Security / no-leak guarantees

- Personal credential class (`typeform: "personal"`): central option-source
  gating; co-member personal credentials never used or enumerated.
- Per-webhook secrets are V2-minted and stored encrypted (`encryptToken`);
  OAuth tokens encrypted; no token/secret logging (cert scripts print ids and
  statuses only); the client secret never appears in browser-visible URLs.
- Signature verified constant-time over raw bytes before any parse; secretless
  rows (aborted activation) never dispatch; unknown rows quiet-ack.
- Bounded payload projection — no raw provider spreading; `answers` + `hidden`
  marked `sensitive` in the payload shape; `response_url` (admin console URL)
  excluded from workflow variables; unknown/complex answer types (payment)
  carry `value: null` rather than raw structure.
- Minimum scopes only (`accounts:read forms:read webhooks:write offline`);
  negative probe confirmed publish/forms-write is impossible with our grant.

## Data / RLS / model notes

- **No migrations.** Reuses `integrations`, `trigger_resources`,
  `webhook_event_dedup`, `workflows`. No RLS/GRANT changes; nothing unapplied.
- **No feature flags** added; the provider is enabled via
  `manifest.isEnabled: true` with honest capabilities (`actions: false`).
- Account model unchanged: `tokenScope: "user"`, creator-pinned execution per
  the standard personal-provider rules.

## UI behavior

- Apps card renders with explicit category/description/icon (regression tests
  enforce this since the ASANA-1 gap); Connect uses the generic path and
  surfaces failures via a visible `role="alert"` (test-proven).
- Builder shows exactly one Typeform trigger and no actions; no fake or
  "coming soon" controls shipped.
- Known UX refinement (deferred): the forms picker also lists DRAFT forms,
  which cannot receive responses until published (live-observed).

## Deferred / known limitations

- **EU data centers unsupported** (`api.typeform.com` only) — region discovery
  at authorize time is under-documented; documented in research.md.
- **Actions**: none yet by design; first action slice flips
  `COVERED_PROVIDERS` and `capabilities.actions`.
- Partial-response webhooks (`form_response_partial`) out of scope
  (quiet-acked). Responses API backfill not shipped.
- Draft-form picker refinement (above). One harmless live-cert artifact: a
  test response remains on the owner's form (no `responses:write` by design).

## Verification baseline

Run **this session** (Phase 13 + closeout, 2026-07-04):

- Live cert scripts (`scripts/trash/typeform-live-cert.ts` phases list-forms /
  activate / await-run / deactivate; `typeform-live-submit.ts`;
  `typeform-live-refresh-check.ts`) — all passed against production + live
  Typeform.
- `npx tsc --noEmit` — clean.
- `npm run lint:structure` — clean after pruning `scripts/trash` 56 -> 28
  (deleted the 23 already-applied `6b-*` codemods from 2026-05-30).
- `npx jest tests/unit/trigger-smoke tests/unit/integrations/typeform tests/structure/trigger-meta-activation-invariant.test.ts` — 142/142 pass.

Inherited from `84921bc35` (run in the TYPEFORM-1 session, same day):

- 78/78 Typeform unit/route/discovery/connect-flow tests across 11 suites;
  structure suite 203/204; 1,636 sibling tests green; direct-seed trigger
  smoke PASS against the real dev DB; ESLint clean on all slice files.
- Known pre-existing baseline failure NOT from this arc:
  `tests/structure/no-literal-slack-token-fixtures.test.ts` fails at HEAD on 7
  committed literal `xoxb-` strings in unrelated test files.

Full `npm test`: not run this session.

## Recommended next tracks

1. **First Typeform action slice** (e.g. `get_responses`/`get_form`) — flips
   `COVERED_PROVIDERS` + `capabilities.actions`, adds `responses:read` scope.
2. **Draft-form picker refinement** — suffix or filter unpublished forms in
   `typeform:forms`.
3. **Slack-token fixture cleanup** — fix the 7 pre-existing literal `xoxb-`
   offenders so the structure suite is fully green again.
4. **Next net-new provider** via the provider-builder skill; the
   caller-minted-secret webhook pattern introduced here is the simpler default
   for providers whose webhook-create API accepts a client-supplied secret.

## Closeout confirmation

Docs-only. Nothing pushed by this closeout commit itself; Marcus has approved
pushing all committed items immediately after.

Doc: `docs/slices/phase-5/typeform-provider-closeout.md`
