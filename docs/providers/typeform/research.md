# Typeform provider research

Slice 5.TYPEFORM-1. Researched 2026-07-04 against the live official docs at
`https://www.typeform.com/developers/` (the canonical host for
developer.typeform.com content). Anything the docs do not state is flagged
`NOT DOCUMENTED`; nothing below is invented.

## Auth type

OAuth 2.0 authorization code flow, confidential client. **No PKCE** (not
documented anywhere in the OAuth pages; the token exchange requires
`client_secret` in the form body, so this is a confidential-client flow).

- Authorize: `GET https://api.typeform.com/oauth/authorize`
  with `client_id`, `redirect_uri` (must exactly match a registered URI),
  `scope` (space-delimited; URL-encodes to `+`), `state`.
- Token exchange: `POST https://api.typeform.com/oauth/token`
  form-encoded `grant_type=authorization_code`, `code`, `client_id`,
  `client_secret`, `redirect_uri`.
- Token response: `{ token_type: "Bearer", access_token, expires_in,
  refresh_token? }`. `refresh_token` is present ONLY when the `offline`
  scope was requested.
- Access token expiry: docs state a default of 1 week (`expires_in`).
- Refresh: `POST /oauth/token` with `grant_type=refresh_token`,
  `refresh_token`, `client_id`, `client_secret`. **Refresh tokens ROTATE**:
  the docs state the refresh procedure invalidates the old refresh token,
  so the new one must be persisted on every refresh (contrast Asana's
  undocumented-rotation preserve-old policy).
- The token response carries NO identity object. Connect-time identity
  comes from `GET https://api.typeform.com/me` (scope `accounts:read`),
  which returns `{ alias, email, language, user_id }`.
- Redirect URI: https is "recommended" per docs; http/localhost rejection
  rules are NOT DOCUMENTED. Exact-match against the registered URI.

Source: https://www.typeform.com/developers/get-started/applications/

## Scopes

Full documented list: `accounts:read`, `forms:read`, `forms:write`,
`images:read`, `images:write`, `themes:read`, `themes:write`,
`responses:read`, `responses:write`, `webhooks:read`, `webhooks:write`,
`workspaces:read`, `workspaces:write`, `offline`.

Required for this slice (minimum set):

| Scope | Used by |
|---|---|
| `accounts:read` | `GET /me` connect-time identity resolution |
| `forms:read` | `typeform:forms` option source (`GET /forms`) |
| `webhooks:write` | trigger activation (`PUT /forms/{id}/webhooks/{tag}`) and deactivation (`DELETE`), per the scopes page webhooks:write covers create/update/delete |
| `offline` | refresh-token issuance (without it the 1-week access token strands the connection) |

Considered and REJECTED (no scope bloat):
- `webhooks:read`: V2 never lists or reads webhooks back.
- `responses:read`: the webhook payload carries the full response content,
  so no Responses API call ships in this slice.
- `forms:write`, `themes:*`, `images:*`, `workspaces:*`, `responses:write`:
  out of slice scope by design.

Source: https://www.typeform.com/developers/get-started/scopes/

## Forms API (option source)

- `GET https://api.typeform.com/forms` with `search`, `page` (default 1),
  `page_size` (default 10, max 200), `workspace_id`, `sort_by`, `order_by`.
  Page-number pagination (not cursor).
- Response: `{ total_items, page_count, items: [{ id, title, created_at,
  last_updated_at, settings, theme, _links }] }`.

Source: https://www.typeform.com/developers/create/reference/retrieve-forms/

## Webhooks API (trigger lifecycle)

- Create or update: `PUT https://api.typeform.com/forms/{form_id}/webhooks/{tag}`
  body `{ url, enabled, secret, verify_ssl }`. `tag` is our own identifier,
  unique per form; PUT to the same tag updates in place, which makes
  activation idempotent per (workflow, node).
- Delete: `DELETE /forms/{form_id}/webhooks/{tag}`.
- Response (200): `{ id, tag, form_id, url, enabled, event_types?, secret,
  verify_ssl, created_at, updated_at }`.
- Webhook URLs must be HTTPS with a valid certificate.
- **No creation handshake/challenge is documented** (contrast Asana's
  X-Hook-Secret dance). WE mint the HMAC secret and send it in the PUT
  body; there is no provider round-trip to the receive route at creation
  time. The docs are silent rather than promising no validation ping, so
  the receive route quietly acks unknown deliveries anyway.
- Ambiguity: the reference page describes an `event_types` body object as
  required, but the walkthrough example body omits it entirely
  (`{"url":..., "enabled":true}`), implying it defaults to the standard
  `form_response` event. V2 omits it; verify at live certification
  (Phase 13) and add `event_types` explicitly if the PUT rejects.
- Webhook count limit per form: NOT DOCUMENTED.

Sources:
- https://www.typeform.com/developers/webhooks/reference/create-or-update-webhook/
- https://www.typeform.com/developers/webhooks/walkthroughs/

## Webhook payload (`form_response`)

Top level: `{ event_id, event_type: "form_response", form_response: {...} }`.

`form_response` carries: `form_id`, `token` (the unique response id; the
natural dedup key), `submitted_at`, `landed_at`, `response_url` (admin
console URL; deliberately NOT exposed as a workflow variable),
`calculated.score` (quiz forms only), `variables[]`, `hidden{}` (hidden
fields, when used), `definition` (`id`, `title`, `fields[]` with
`id`/`ref`/`title`/`type`, `endings[]`), `answers[]`, `ending`.

Each `answers[]` entry is a discriminated union: `type` names the value key
(`text` / `email` / `date` / `number` / `boolean` / `choice` / `choices` /
`url` / `file_url` / `payment`), and `field` gives `{ id, type, ref }` of
the question. **Only answered questions appear** - skipped optional
questions are absent, so positional alignment with `definition.fields` must
never be assumed.

Source: https://www.typeform.com/developers/webhooks/example-payload/

## Webhook signature verification

- Header: `Typeform-Signature`.
- Format: `sha256=` + **base64**-encoded HMAC-SHA256 digest (base64, NOT
  hex - a documented common implementation mistake) computed over the raw
  request body bytes, keyed with the webhook's `secret` (the one V2 minted
  and sent in the PUT body).
- Compare in constant time.

Source: https://www.typeform.com/developers/webhooks/secure-your-webhooks/

## Delivery / retry semantics

- Success = 2XX within 30 seconds; slower responses are marked failed and
  retried.
- Retry policy: `410`/`404` responses disable the webhook immediately with
  NO retries (the receive route must never return 404 for transient
  states); `429`/`408`/`503`/`423` retried every 2-3 minutes for up to 10
  hours; other failures retried at escalating intervals (5m, 10m, 20m, 1h,
  2h, 3h, 4h).
- Auto-disable: 100% failure within 24h (>300 attempts) or within 5 min
  (100 attempts) disables the webhook and notifies the account.
- No exactly-once guarantee: retry-until-2XX semantics mean duplicate
  delivery is possible (e.g. slow response, timeout, retry). Dedup on the
  stable `form_response.token`.
- No heartbeat mechanism is documented (contrast Asana's ~8h heartbeats).

Source: https://www.typeform.com/developers/webhooks/

## Responses API (not shipped; recorded for later slices)

`GET /forms/{form_id}/responses` (scope `responses:read`), `page_size` max
1000, cursor pagination via `before`/`after`, single-response fetch via
`included_response_ids` (comma-separated response tokens).

Source: https://www.typeform.com/developers/responses/reference/retrieve-responses/

## Rate limits

2 requests/second per Typeform account for the Create and Responses APIs.
Webhook delivery is exempt. Rate-limit response headers and Retry-After
behavior: NOT DOCUMENTED. The shared `_request` helper parses `Retry-After`
defensively when present.

Source: https://www.typeform.com/developers/get-started/

## EU data centers (known limitation)

- Primary base: `https://api.typeform.com`.
- EU hosts exist (`api.eu.typeform.com` legacy EU, `api.typeform.eu` newer
  EU) and response data + webhook management for an EU-DC form must hit the
  matching regional host. Tokens are region-unique.
- The docs do not explain how an OAuth app discovers the user's region at
  authorize time. **This slice supports `api.typeform.com` only**; EU-DC
  accounts are a documented limitation (the forms list would be empty or
  webhook CRUD would miss). Regional support is a future slice.

Source: https://www.typeform.com/developers/get-started/responses-data-center/

## App registration

Typeform admin panel -> Organization settings -> Developer Apps ->
"Register a new app." Required: app name, app website URL, redirect URI(s).
No review/approval process is documented; apps appear usable immediately.

Source: https://www.typeform.com/developers/get-started/applications/

## Personal access tokens

Supported (created at `admin.typeform.com/user/tokens`, per-token scope
selection, `Authorization: Bearer`). Not used by the product flow; useful
for owner-side live certification later.

## Known limitations recap

1. EU data center accounts unsupported this slice (see above).
2. `event_types` PUT-body ambiguity (omitted; verify live).
3. PKCE, localhost redirect rules, webhook-per-form limits, rate-limit
   headers: all NOT DOCUMENTED.
4. Access-token weekly expiry + rotating refresh tokens: refresh handling
   built for weekly expiry with rotation persisted every refresh.
