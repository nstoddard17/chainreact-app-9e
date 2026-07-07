# Typeform Owner Setup Report

## Status
- Code status: TYPEFORM-1 **live-complete** (Phase 13 certified 2026-07-04); TYPEFORM-2 read actions **live-complete** (Phase 13 certified 2026-07-07 — see "TYPEFORM-2 live verification" below)
- Commit: `84921bc35` (TYPEFORM-1); `1a3df91f0` (TYPEFORM-2) — both pushed to v2-main + deployed; Phase 13 evidence commit is local until approved
- Push status: TYPEFORM-1 + TYPEFORM-2 pushed/deployed (Marcus-approved); TYPEFORM-2 cert-evidence commit local until approved
- Smoke status: trigger + both read actions fully live-certified against production credentials and the real Responses API
- Remaining owner action: none

## TYPEFORM-2 owner setup (2026-07-06) — new `responses:read` scope — DONE

TYPEFORM-2 ships the first Typeform actions (`typeform:list_responses`,
`typeform:get_response`) behind ONE new OAuth scope: `responses:read`.

Setup as executed (all steps complete 2026-07-07):

1. **Typeform developer app: NOTHING to change.** Typeform apps carry no
   per-app scope allowlist (registration = name, website, redirect URIs
   only) — scopes are requested at authorize time from V2's manifest.
   (Confirmed in practice: no portal change was made and the new scope
   was granted at reconnect.)
2. **Deploy:** TYPEFORM-2 commit `1a3df91f0` pushed to v2-main + deployed
   (Marcus-approved push 2026-07-07).
3. **Reconnect:** Marcus reconnected Typeform post-deploy; the re-consent
   granted `responses:read`. (Refresh does NOT widen a grant — verified
   2026-07-06 when the pre-TYPEFORM-2 token got
   `INTEGRATION_SCOPE_REQUIRED` on `GET /forms/{id}/responses`.)
4. **Smoke env:** `SMOKE_TYPEFORM_CONNECTED=1`,
   `SMOKE_TYPEFORM_FORM_ID=KRVNz1KP`, and `SMOKE_TYPEFORM_RESPONSE_TOKEN`
   (the real completed response's token, harvested live) set in
   `.env.local`.
5. **Phase 13 live certification: PASSED 2026-07-07** — see below. Both
   certification records flipped to LIVE_PASS.

No new env vars beyond the SMOKE_* test pins. No new webhook URLs. No DB
migrations.

## TYPEFORM-2 live verification (Phase 13, 2026-07-07)

Environment: production credential (reconnected post-deploy at
`https://chainreact.app`), live Typeform Responses API, real form
`KRVNz1KP`. Action runs executed through the REAL workflow execution
path (workflow-live sweep, `testMode=false`, real dev DB) — the
Asana/Typeform-proven orchestration pattern. Probe/readback scripts:
`scripts/trash/typeform2-live-probe.ts`,
`scripts/trash/typeform2-run-output-readback.ts`.

| Check | Result | Evidence |
|---|---|---|
| Deploy + scope grant | PASS | Reconnected credential lists responses (403 pre-reconnect → 200 post) — proves the deployed manifest requested `responses:read` and the grant landed. Token expiry ~1 week from reconnect. |
| `list_responses` via real engine | PASS | Run `5bdf1e52-…` terminal `succeeded`; 1 completed response returned (`totalItems: 1`, `hasMore: false`, `nextBefore: null` — page not full, correct) |
| `get_response` real token | PASS | Run `fcf076b1-…` terminal `succeeded`; `found: true`; `responseToken` matched the pinned token exactly (defensive token-match exercised) |
| `get_response` fake token | PASS | Run `ba10ae80-…` terminal `succeeded` (did NOT fail); `found: false`, all data fields null |
| Bounded output (persisted runs) | PASS | list keys exactly `{responses,count,totalItems,hasMore,nextBefore}`; per-response `{responseToken,submittedAt,landedAt,answers,hidden,score}`; answer `{fieldId,fieldRef,fieldType,answerType,value}`. NO `metadata`/`response_url`/`variables`/`landing_id`/`response_id`/raw `token`/`calculated` keys in any persisted output (scripted forbidden-key scan) |
| pageSize bound | PASS | live `page_size=1` returned exactly 1 |
| `before` cursor | PASS | `before=<newest token>` returned 0 older items and did NOT include the cursor token (exclusive, as documented) |
| `since` filter | PASS | `since=2030…` → 0; `since=2020…` → 1 |
| `query` filter | PASS | nonsense query → 0 (server-side search confirmed) |
| `included_response_ids` | PASS | real token → 1 item with matching token; fake token → 0 items (HTTP 200, not 404 — confirms the found:false design) |
| Refresh + rotation (post-reconnect credential) | PASS | `dispatcher.refresh()` live: new expiry persisted, BOTH ciphertexts changed (rotation persisted), rotated pair immediately live-usable AND still carries `responses:read` (responses list succeeded post-refresh) |
| No token/secret leakage | PASS | bearer token sent in Authorization header only (unit-asserted); probe/readback prints ids/counts only; run outputs contain no credential material |

Sensitive handling: `answers` + `hidden` are marked `sensitive: true` in
both action metas (run-details redaction + variable-picker warning are
meta-driven and unit-tested; the live cert verified the persisted shape
carries only the bounded fields those metas describe).

Pagination note (documented + live-confirmed): one page per run, newest
first; `nextBefore` = last item's token only when the page is FULL, else
null. With 1 response and default pageSize 25 the first page is the last
page (`hasMore: false`). Cursor traversal is exclusive and never repeats
the cursor token.

Cleanup accounting: read-only certification — NOTHING created provider-side.
The response used is the harmless TYPEFORM-1 cert artifact
("crsmoke live cert response 2026-07-04", the only response on form
`KRVNz1KP`); it remains, as already documented. Smoke workflows/runs are
harness-managed rows in the dev DB (same disposition as every prior
action cert). Probe scripts live in `scripts/trash/` (deletable).

## Live verification (Phase 13, 2026-07-04)

Environment: production (`https://chainreact.app`, deployed v2-main), live
Typeform account, real form `KRVNz1KP` ("New form"). Orchestration ran from
the local repo with production `NEXT_PUBLIC_APP_URL` + shared Supabase
(the Asana-proven pattern). Script: `scripts/trash/typeform-live-cert.ts`.

| Check | Result | Evidence |
|---|---|---|
| OAuth connect | PASS | Integration row created by Marcus's production connect (2026-07-04 17:54Z), email account id, alias display name, ~1-week expiry matching `expires_in` |
| Refresh + rotation | PASS | `dispatcher.refresh()` live: new expiry persisted, access + refresh ciphertexts BOTH changed (rotation persisted), new pair immediately live-usable (`GET /forms` OK) |
| `typeform:forms` option source | PASS | Real resolver returned the live form (safe title label); `q` passed through as server-side `search` and filtered correctly; no tokens/emails in output |
| Trigger activation | PASS | Real `registerWorkflowTriggers` -> live `PUT /forms/KRVNz1KP/webhooks/chainreact-b895432bdefa9f5ef9fa1219` in 422ms; webhookId `01KWQ4XYAQGT2CFKEARPPAN8PY`; secret stored encrypted; notification URL = production |
| `event_types` ambiguity | RESOLVED: optional | PUT body omitted it; PUT 200; the webhook later delivered a standard `form_response` end-to-end |
| Real response -> run | PASS | Real response submitted through the public form UI; production verified `Typeform-Signature`, dispatched, cron drained; run `da58bb81-…` terminal `succeeded`; EXACTLY 1 run |
| Payload identity/shape | PASS | eventId `new_response_in_form:KRVNz1KP:<responseToken>` (token-scoped, timestamp-free); formId/changeKind/responseToken matched; bounded `answers` projection carried the submitted text with fieldTitle/fieldType; `hidden`/`score` null; `response_url` ABSENT |
| Deactivation | PASS | Real `unregisterWorkflowTriggers` -> DELETE; `trigger_resources` rows left = 0 |
| Provider-side removal proof | PASS | Second `DELETE /forms/{id}/webhooks/{tag}` -> 404 (we hold no `webhooks:read` by design, so 404-on-redelete is the gone-proof) |
| Redelivery dedup (live) | NOT LIVE-FORCEABLE | Typeform retries only on delivery failure; dedup is proven by the direct-seed dev smoke + unit tests (same honesty boundary as Asana) |
| Wrong-form drop (live) | NOT LIVE-FORCEABLE | Single form in the account; P-S2 filter proven by unit tests + direct-seed smoke |

Cleanup accounting:
- Test workflow `cd7e0f9d-…`: soft-deleted. Trigger rows: deleted (0 left).
- Typeform webhook: deleted, 404-proven gone.
- `webhook_event_dedup` row for the cert event: deleted.
- One real response ("crsmoke live cert response 2026-07-04") REMAINS on
  form `KRVNz1KP` — deleting it needs `responses:write` (not granted by
  design); harmless, documented artifact.
- The form itself is Marcus's and is now PUBLISHED (his action during the
  cert; it was a draft, which blocked submission until published).
- One-off cert scripts live in `scripts/trash/` (probe, cert, submit,
  refresh-check); transient state file + failure screenshot deleted.

Certification recorded in `tests/trigger-smoke/triggerCertificationSeed.ts`
(`typeform:new_response_in_form` = LIVE_PASS 2026-07-04). Live quirks
recorded in `research.md` ("Live-observed behavior").

## Provider developer portal setup

### App/basic settings
- Where: Typeform admin panel -> Organization settings -> **Developer apps** -> "Register a new app"
- App name: ChainReact (or preferred)
- App type: standard OAuth app (Typeform has only one app kind)
- Website URL: the production app URL
- Privacy policy URL / Terms URL / Support email / logo: not required by Typeform's registration form (only name, website URL, redirect URIs are documented as required)
- Notes: no app review/approval process is documented; the app is usable immediately after registration

### Redirect URIs
- Local: `http://localhost:3000/api/integrations/oauth/typeform/callback` (https is only "recommended" per docs; if the portal rejects http, use a tunnel)
- Preview/Vercel: `https://<preview-domain>/api/integrations/oauth/typeform/callback`
- Production: `https://<production-domain>/api/integrations/oauth/typeform/callback`
- Exact callback path: `/api/integrations/oauth/typeform/callback` (generic V2 OAuth dispatcher route)

### Webhook URLs
- Nothing to configure in the portal. Typeform webhooks are created per-form BY THE APP at trigger activation (`PUT /forms/{form_id}/webhooks/{tag}`), pointing at:
  `https://<domain>/api/webhooks/typeform?workflowId=<id>&nodeId=<id>`
- Events subscribed: the standard `form_response` event (default; no `event_types` body sent)
- Signature secret location: V2-minted per webhook at activation, stored encrypted on the trigger row (`hookSecretEncrypted`); never in the portal, never in env
- Verification/challenge notes: no creation handshake/challenge documented. Deliveries are verified via `Typeform-Signature` (sha256= + base64 HMAC-SHA256 over the raw body). The deployment receiving deliveries must be publicly reachable over HTTPS with a valid certificate.

### OAuth scopes
| Scope | Required? | Used by | Why |
|---|---:|---|---|
| `accounts:read` | Yes | OAuth callback | `GET /me` connect-time identity (email/alias/user_id) |
| `forms:read` | Yes | `typeform:forms` option source | `GET /forms` picker |
| `webhooks:write` | Yes | trigger activate/deactivate | `PUT`/`DELETE /forms/{id}/webhooks/{tag}` |
| `responses:read` | Yes (TYPEFORM-2) | `list_responses` / `get_response` actions | `GET /forms/{id}/responses`; pre-TYPEFORM-2 tokens need reconnect (re-consent) |
| `offline` | Yes | token refresh | refresh-token issuance; access tokens expire ~weekly |

Scopes are requested by the app automatically (from the manifest); nothing to configure portal-side.

### Provider-specific settings
- Token rotation: refresh tokens ROTATE on every refresh (handled; rotated token persisted)
- PKCE: not supported/documented by Typeform (confidential-client flow; secret stays server-side)
- Webhook signing: per-webhook secret, V2-minted (see above)
- Event subscriptions: per-form, app-managed
- Bot/user install choice: n/a
- Marketplace/review steps: none documented
- Test-user requirements: none; any Typeform account with at least one form works for live certification
- Rate-limit notes: 2 requests/second per Typeform account (Create + Responses APIs); webhook delivery exempt
- EU data centers: **NOT supported this slice** — accounts hosted on `api.eu.typeform.com` / `api.typeform.eu` will see an empty forms list or failing webhook CRUD. Documented limitation (docs/providers/typeform/research.md).

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `TYPEFORM_CLIENT_ID` | Yes | Yes | Yes | Yes | `integrations/typeform/oauth.ts` | from the developer app |
| `TYPEFORM_CLIENT_SECRET` | Yes | Yes | Yes | Yes | `integrations/typeform/oauth.ts` | secret; server-side only |
| `NEXT_PUBLIC_APP_URL` | Yes (existing) | Yes | Yes | Yes | callback + webhook URL construction | already set for other providers |
| `TYPEFORM_AUTHORIZE_BASE` | No | e2e only | No | No | oauth.ts | e2e mock override |
| `TYPEFORM_TOKEN_BASE` | No | e2e only | No | No | oauth.ts | e2e mock override |
| `TYPEFORM_API_BASE` | No | e2e only | No | No | API wrappers | e2e mock override |
| `TYPEFORM_WEBHOOK_URL` | No | e2e only | No | No | notificationUrl.ts | e2e/tunnel override |

Redeploy after adding env vars.

## Supabase / database setup
- Migrations added: **none** (reuses `trigger_resources`, `webhook_event_dedup`, `workflows`, `integrations`)
- db:push run: n/a
- RLS/policy notes: no new tables/policies
- Storage bucket notes: none
- Cron notes: none (Typeform webhooks don't expire; no renewal cron participation)

## Actions shipped
| Action | Handler | Schema | Metadata | Options | Unit tests | Smoke |
|---|---|---|---|---|---|---|
| `typeform:list_responses` (TYPEFORM-2) | `integrations/typeform/actions/listResponses.ts` | strict Zod (`formId`, `pageSize` 1..100, `since`/`until`/`query`/`before`) | `.meta.ts` (data, low risk; answers/hidden sensitive) | `typeform:forms` for formId | 10 (schema/handler/cursor/filters/no-leak) + 10 wrapper | LIVE_PASS 2026-07-07 (workflow-live sweep, real Responses API) |
| `typeform:get_response` (TYPEFORM-2) | `integrations/typeform/actions/getResponse.ts` | strict Zod (`formId`, `responseToken`) | `.meta.ts` (data, low risk; `found` flag; answers/hidden sensitive) | `typeform:forms` for formId; token mapped from trigger | 9 (schema/handler/found-false/token-mismatch/no-leak) | LIVE_PASS 2026-07-07 (real token found:true + fake token found:false) |

TYPEFORM-1 shipped zero actions deliberately (self-contained webhook
payload); `capabilities.actions` flipped to `true` and `typeform` joined
COVERED_PROVIDERS in TYPEFORM-2.

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|
| `typeform:new_response_in_form` | Webhook (per-form, V2-minted secret) | activate (PUT) / deactivate (DELETE), no renewal | `formId` via `typeform:forms` | activate (6), deactivate (6), receive (12), normalize (9), signature (8), route (10) | direct-seed dev-DB smoke PASS (dispatch/dedup/terminal); provider-boundary live pending Phase 13 |

Option sources: `typeform:forms` (7 resolver tests).

## Manual verification checklist for Marcus
- [x] Register the Typeform developer app (admin panel -> Organization settings -> Developer apps). (Done 2026-07-04)
- [x] Add the redirect URI(s) above. (Done — production connect succeeded)
- [x] (No webhook URL to add — app-managed at activation.)
- [x] Add `TYPEFORM_CLIENT_ID` / `TYPEFORM_CLIENT_SECRET` to Vercel and `.env.local`. (Done)
- [x] Redeploy after env changes. (Done — v2-main deployed)
- [x] Connect Typeform from the Apps page. (Done — integration row 2026-07-04 17:54Z)
- [x] Phase 13 live certification (TYPEFORM-1 trigger). (PASSED 2026-07-04 — see "Live verification")
- [x] **TYPEFORM-2:** deploy the TYPEFORM-2 commit to production. (Done — v2-main pushed through `69666b142` incl. `1a3df91f0`, 2026-07-07)
- [x] **TYPEFORM-2:** reconnect Typeform on the smoke account (re-consent grants `responses:read`). (Done 2026-07-07 — verified live)
- [x] **TYPEFORM-2:** set `SMOKE_TYPEFORM_RESPONSE_TOKEN` (a real completed response token on the smoke form). (Done — harvested live from form `KRVNz1KP`)
- [x] **TYPEFORM-2:** Phase 13 live certification for `list_responses` + `get_response` (read-only). (PASSED 2026-07-07 — see "TYPEFORM-2 live verification")

## Known blockers / limitations
- EU data-center Typeform accounts are unsupported this slice (single-host `api.typeform.com`).
- ~~`event_types` PUT-body ambiguity~~ RESOLVED live 2026-07-04: optional; omitting it creates a standard `form_response` webhook (proven end-to-end).
- Partial-response webhooks (`form_response_partial`) are out of scope; such deliveries are quiet-acked.
- Redelivery dedup + wrong-form drop are direct-seed/unit-proven, not live-forceable (Typeform retries only on failure; single-form account).
- The `typeform:forms` picker also lists DRAFT (unpublished) forms, which cannot receive responses until published (live-observed). TYPEFORM-2 added the approved static hint to every form picker ("Draft or unpublished forms may appear here but will not receive responses until published in Typeform."); data-driven hiding/labeling stays impossible (no reliable API draft flag).
- Live-cert artifact: one test response remains on form `KRVNz1KP` (no `responses:write` scope by design).
- TYPEFORM-2 read actions return COMPLETED responses only (API `response_type` default; partials are plan-gated and excluded by the catalog audit).
- TYPEFORM-2 `get_response` is `included_response_ids` filtering (Typeform has no dedicated GET-one endpoint); unknown token → `{found: false}`, not an error.
