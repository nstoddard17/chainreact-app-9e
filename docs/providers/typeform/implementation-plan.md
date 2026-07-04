# Typeform implementation plan

Slice 5.TYPEFORM-1 (first Typeform slice, intentionally small and complete).
Written 2026-07-04 after research.md + v2-pattern-audit.md.

## Identity

- Provider ID: `typeform`
- Display name: `Typeform`
- Credential class: **personal** (`core/integrations/credentialSharing.ts`).
  A Typeform OAuth token acts as the connecting human over their own forms
  and workspaces; same posture as Trello/Monday/Asana, and the launch-safe
  default.
- Auth flow: OAuth 2.0 authorization code, confidential client, NO PKCE,
  refreshable with ROTATING refresh tokens (`offline` scope).
- tokenScope: `user`; accountIdField: `email` (from `GET /me`).
- apiVersion: `unversioned` (Typeform's REST API has no version segment;
  base `https://api.typeform.com`).

## Scope of this slice

Ships:

- OAuth connect/refresh through `services/oauth/dispatcher.ts`.
- Apps page visibility (category `Forms`, description, icon, connectable).
- Builder visibility for the one trigger.
- AI-safe visibility (automatic via discovery/capability projections).
- Option source: `typeform:forms` (GET /forms, search wired to ctx.q).
- Trigger: `typeform:new_response_in_form` with full webhook lifecycle
  (activate PUT, receive + signature verify, normalize, P-S2 filter
  dispatch, deactivate DELETE).
- Tests + direct-seed trigger smoke + owner setup report.
- Local commit only. Nothing pushed.

Explicitly NOT in this slice (guardrails):

- Form creation/editing/deletion, themes, images/files, workspace/admin
  management, analytics/reporting, partial-response flows
  (`form_response_partial`), custom branding, payment features.
- **No actions at all** - the `form_response` webhook payload carries the
  complete response (answers, hidden fields, score), so no `get_form` /
  `get_response` read action is required for safe normalization.
  `capabilities.actions: false`; `typeform` stays OUT of
  `COVERED_PROVIDERS` until the first action slice (gate requires >=1
  ActionMeta).
- EU data-center hosts (documented limitation; see research.md).
- Responses API backfill.

## Files

| Piece | Path |
|---|---|
| Manifest | `integrations/typeform/manifest.ts` |
| OAuth | `integrations/typeform/oauth.ts` |
| Errors | `integrations/_shared/typeform/errors.ts` |
| HTTP helper | `integrations/_shared/typeform/api/_request.ts` |
| Forms API | `integrations/_shared/typeform/api/forms.ts` |
| Webhooks API | `integrations/_shared/typeform/api/webhooks.ts` |
| Signature | `integrations/_shared/typeform/webhooks/signature.ts` |
| Trigger folder | `integrations/typeform/triggers/newResponseInForm/{index,schema,activate,deactivate,receive,normalize,filter,notificationUrl}.ts` + `newResponseInForm.meta.ts` |
| Option source | `integrations/typeform/options/{_shared,forms}.ts` |
| Webhook route | `app/api/webhooks/typeform/route.ts` |
| Discovery | `services/discovery/providers/typeform.ts` |
| Icon | `public/integrations/typeform.svg` |
| Registry edits | `integrations/_registry.ts`, `services/oauth/dispatcher.ts`, `core/integrations/credentialSharing.ts`, `services/options/_registry.ts`, `services/discovery/_metaInventory.ts`, `lib/apps/providerCategories.ts` |

## Trigger design: `typeform:new_response_in_form`

- Builder field: `formId` (required, combobox, `typeform:forms`).
- Activation: mint 32-byte secret -> deterministic tag
  (`chainreact-<sha256(workflowId:nodeId) prefix>`) ->
  `PUT /forms/{formId}/webhooks/{tag}` with
  `{ url, enabled: true, secret, verify_ssl: true }` -> return config patch
  `{ webhookEnabled, formId, webhookTag, webhookId, hookSecretEncrypted,
  notificationUrl }`. No pre-upsert (no handshake). PUT failure aborts
  activation with nothing to clean up.
- Receive: raw body first; strict-direct-lookup by `?workflowId=&nodeId=`;
  verify `Typeform-Signature` (`sha256=` + base64 HMAC-SHA256) against the
  row's decrypted secret BEFORE parsing; drop non-`form_response` event
  types; normalize one event per delivery. Never return 404/410 (Typeform
  kills the webhook on those); dispatch failure -> 500 for provider retry.
- Dedup key: `new_response_in_form:{formId}:{form_response.token}`
  (stable response id; timestamp-free). Fallbacks: provider `event_id`,
  then `submitted_at`.
- Payload (bounded projection; `answers` + `hidden` marked sensitive):
  `changeKind`, `formId`, `responseToken`, `eventId`, `formTitle`,
  `submittedAt`, `landedAt`, `answers[]` (fieldId, fieldRef, fieldTitle,
  fieldType, answerType, value), `hidden`, `score`.
- Filter: event `formId` must equal config `formId`.
- Deactivation: DELETE by (formId, tag) from config; best-effort.

## Smoke strategy

Direct-seed harness (Asana pattern): seed the post-activation
`trigger_resources` row with an encrypted smoke secret, POST a synthetic
signed `form_response` body through the real route, assert exactly one run
with the expected dedup key, drain to terminal `succeeded`, re-send the
same body and prove dedup, clean up all smoke rows. Provider-side PUT/
DELETE lifecycle is unit-tested and live-certified in Phase 13.

Synthetic payload note: the smoke fabricates a minimal `form_response`
with clearly synthetic values (`crsmoke-...`); no real respondent data
shapes are invented beyond the documented envelope.

## Owner setup requirements (detail in owner-setup-report.md)

- Typeform Developer App (admin panel) with redirect URI(s).
- `TYPEFORM_CLIENT_ID` / `TYPEFORM_CLIENT_SECRET` env vars (local + Vercel).
- Webhook receive URL is registered automatically at activation; the
  deployment must be publicly reachable over HTTPS for live deliveries.

## Known blockers

None for code-complete. Live certification (Phase 13) blocked on owner
setup: developer app + env vars + a Typeform account with at least one
form. The `event_types` PUT-body ambiguity is verified at that point.
