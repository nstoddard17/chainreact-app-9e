# Typeform Owner Setup Report

## Status
- Code status: **code-complete owner setup required** (Slice 5.TYPEFORM-1)
- Commit: see git log for `feat(typeform): net-new provider slice 1` on this branch (local only)
- Push status: **Nothing pushed**
- Smoke status: direct-seed trigger smoke **PASS** against the real dev DB (2026-07-04); provider-boundary live certification (Phase 13) pending owner setup
- Remaining owner action: create the Typeform developer app, add env vars, then request Phase 13 live certification

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
| (none — deliberate; the form_response webhook payload is self-contained. `capabilities.actions: false`; `typeform` joins COVERED_PROVIDERS when the first action slice ships) | — | — | — | — | — | — |

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|
| `typeform:new_response_in_form` | Webhook (per-form, V2-minted secret) | activate (PUT) / deactivate (DELETE), no renewal | `formId` via `typeform:forms` | activate (6), deactivate (6), receive (12), normalize (9), signature (8), route (10) | direct-seed dev-DB smoke PASS (dispatch/dedup/terminal); provider-boundary live pending Phase 13 |

Option sources: `typeform:forms` (7 resolver tests).

## Manual verification checklist for Marcus
- [ ] Register the Typeform developer app (admin panel -> Organization settings -> Developer apps).
- [ ] Add the redirect URI(s) above.
- [ ] (No webhook URL to add — app-managed at activation.)
- [ ] Add `TYPEFORM_CLIENT_ID` / `TYPEFORM_CLIENT_SECRET` to Vercel (all envs) and `.env.local`.
- [ ] Redeploy after env changes; restart the local dev server after editing `.env.local`.
- [ ] Connect Typeform from the Apps page (card is under the new "Forms" category).
- [ ] Then ask for **Phase 13 live certification**: live OAuth + refresh, live trigger lifecycle (PUT webhook on a real form, real submission -> one run, DELETE on deactivate with provider-side 404 proof), live `typeform:forms` option source, `event_types` PUT-body ambiguity check, and live event-shape review.

## Known blockers / limitations
- EU data-center Typeform accounts are unsupported this slice (single-host `api.typeform.com`).
- `event_types` in the webhook PUT body is ambiguous in the docs (reference says required, walkthrough omits it). V2 omits it; verify at live certification and add explicitly if a live PUT rejects.
- Partial-response webhooks (`form_response_partial`) are out of scope; such deliveries are quiet-acked.
- The direct-seed smoke does not exercise the provider-side PUT/DELETE lifecycle (unit-tested; live proof is Phase 13).
