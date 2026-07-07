# Typeform provider research

Slice 5.TYPEFORM-1. Researched 2026-07-04 against the live official docs at
`https://www.typeform.com/developers/` (the canonical host for
developer.typeform.com content). Anything the docs do not state is flagged
`NOT DOCUMENTED`; nothing below is invented.

**TYPEFORM-2 update (2026-07-06):** the Responses API section below was
expanded (re-verified against the retrieve-responses reference) and the
scope set gained `responses:read` for the `list_responses` /
`get_response` read actions.

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

Required (minimum set for the shipped surface):

| Scope | Used by | Since |
|---|---|---|
| `accounts:read` | `GET /me` connect-time identity resolution | TYPEFORM-1 |
| `forms:read` | `typeform:forms` option source (`GET /forms`) | TYPEFORM-1 |
| `webhooks:write` | trigger activation (`PUT /forms/{id}/webhooks/{tag}`) and deactivation (`DELETE`), per the scopes page webhooks:write covers create/update/delete | TYPEFORM-1 |
| `responses:read` | `list_responses` / `get_response` read actions (`GET /forms/{id}/responses`) | TYPEFORM-2 |
| `offline` | refresh-token issuance (without it the 1-week access token strands the connection) | TYPEFORM-1 |

Considered and REJECTED (no scope bloat):
- `webhooks:read`: V2 never lists or reads webhooks back.
- `forms:write`, `themes:*`, `images:*`, `workspaces:*`, `responses:write`:
  out of scope by design (`responses:write` backs only the destructive
  delete-responses endpoint, rejected by the 2026-07-06 catalog audit).

**Re-consent note (TYPEFORM-2):** tokens granted before `responses:read`
was added do NOT gain the scope on refresh — a refresh keeps the original
grant. Existing connections get HTTP 403 on the new read actions
(mapped to `InsufficientScopeError` → re-consent UX) until the user
reconnects.

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

## Responses API (shipped in TYPEFORM-2; re-verified 2026-07-06)

`GET /forms/{form_id}/responses` (scope `responses:read`) backs
`typeform:list_responses` and `typeform:get_response`.

Query parameters (documented):

| Param | Notes |
|---|---|
| `page_size` | default 25, max 1000. V2 bounds it to ≤100 per run. |
| `since` / `until` | Unix seconds or ISO 8601 UTC; submitted-at window. |
| `after` / `before` | cursor tokens, exclusive, traversal in processing order; documented as the safe way to walk the full set without repeats. **Incompatible with `sort`** — V2 never sends `sort` and paginates with `before` (newest-first default ordering, older pages via the last item's token). |
| `included_response_ids` / `excluded_response_ids` | comma-separated response tokens. There is NO dedicated GET-one-response endpoint — `get_response` honestly filters the list with `included_response_ids` + `page_size=1`. |
| `response_type` | `started` / `partial` / `completed`; **defaults to completed**. V2 never sends it — partial responses are plan-gated and rejected by the catalog audit, so only completed responses are exposed. (`completed` boolean param is deprecated.) |
| `sort` | `{field},{asc|desc}`, default `submitted_at,desc`. Never sent (cursor incompatibility). |
| `query` | server-side search across answers / hidden fields / variables. Exposed as the `query` filter. |
| `fields` / `answered_fields` | answer-field projection/filtering; not exposed (no clear workflow value yet). |

Response body: `{ total_items, page_count, items: [...] }`. Each item:
`response_id`, `token` (the stable unique id — same value the webhook
delivers), `landed_at`, `submitted_at`, `landing_id`, `metadata`
(user_agent / platform / referer / network_id / browser — respondent
fingerprint data, deliberately DROPPED at V2's wrapper boundary),
`hidden`, `calculated.score`, `variables[]`, `answers[]` (same
discriminated union as the webhook payload, but with NO `definition`
block — so no question titles are available on this endpoint).

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

## Live-observed behavior (Phase 13 certification, 2026-07-04)

Observed against the real provider boundary (production receive route,
live Typeform account, real form `KRVNz1KP` — script
`scripts/trash/typeform-live-cert.ts`):

1. **`event_types` ambiguity RESOLVED: optional.** A live
   `PUT /forms/{form_id}/webhooks/{tag}` with body
   `{ url, enabled, secret, verify_ssl }` and NO `event_types` returned
   200 and the webhook delivered a standard `form_response` event
   end-to-end. The reference page's "required" reading is wrong in
   practice; the walkthrough's minimal body is correct.
2. **Webhook PUT succeeds on an UNPUBLISHED (draft) form.** The webhook
   arms fine before the form is published; it simply cannot receive
   events until the owner publishes (the public URL shows "you can't
   access this typeform until its creator says so").
3. **`GET /forms` lists draft forms too** (`settings.is_public: false`,
   no `published_at`). Consequence: the `typeform:forms` picker can show
   forms that cannot yet receive responses. Acceptable for now; a title
   suffix or filter is a possible future UX refinement.
4. **No publish API on `api.typeform.com`:** `POST /forms/{id}/publish`
   returned 404 `Endpoint not found` (probe made with our token, which
   also lacks `forms:write` by design). Publishing appears to be an
   admin-UI action; live certification requires the owner to publish the
   form manually.
5. **Signature verification confirmed live:** production accepted the
   real delivery (sha256= + base64 HMAC over raw bytes, keyed with the
   V2-minted per-webhook secret) and the run fired; the receive path
   dispatches only verified events.
6. **Delivery latency was seconds** from form submission to the run
   appearing (well within the first 5s poll).
7. **Refresh-token rotation confirmed live** via the persisting
   dispatcher path: the refresh response carried a NEW refresh token,
   both ciphertexts changed in storage, and the rotated pair was
   immediately live-usable. (That the OLD token is invalidated is per
   docs; not separately probed to avoid burning a live credential.)
8. **Answer shape observed:** a `long_text` question delivered
   `answers[0] = { type: "text", text: ... }` with `field.type:
   "long_text"` — matches the documented discriminated union and the
   normalizer's projection (fieldTitle resolved from `definition.fields`).
9. **DELETE gone-proof works:** after deactivation, a second
   `DELETE /forms/{id}/webhooks/{tag}` returned 404 — usable as the
   provider-side removal proof (we deliberately hold no `webhooks:read`).

## Known limitations recap

1. EU data center accounts unsupported this slice (see above).
2. `event_types` PUT-body ambiguity (omitted; verify live).
3. PKCE, localhost redirect rules, webhook-per-form limits, rate-limit
   headers: all NOT DOCUMENTED.
4. Access-token weekly expiry + rotating refresh tokens: refresh handling
   built for weekly expiry with rotation persisted every refresh.
