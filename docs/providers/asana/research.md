# Asana provider research

Date researched: 2026-07-04
Researcher: Claude (chainreactv2-provider-integration-builder, first net-new V2 provider)
Sources: official developers.asana.com docs plus Asana forum staff answers (URLs at the bottom).

## Auth type

OAuth 2.0 authorization-code flow with refresh tokens. PKCE (S256) is supported and optional; V2 implements it since it is free hardening on a standard code flow.

| Item | Value |
|---|---|
| Authorize endpoint | `GET https://app.asana.com/-/oauth_authorize` |
| Token endpoint | `POST https://app.asana.com/-/oauth_token` |
| Revoke endpoint | `POST https://app.asana.com/-/oauth_revoke` (accepts the refresh token, not the bearer token) |
| API base | `https://app.asana.com/api/1.0` |
| Access token TTL | 3600 s (`expires_in: 3600`) |
| Refresh token | Issued on code exchange; long-lived, no documented expiration (Asana staff, forum) |
| Refresh rotation | NOT documented. V2 persists a new `refresh_token` if the refresh response carries one, otherwise preserves the original (same policy as HubSpot / Monday / Stripe) |
| Client auth | `client_id` + `client_secret` in the form-encoded body (body auth) |
| Identity in token response | The token response includes a `data` object with the user's `gid`, `name`, `email`. V2 uses it directly; falls back to `GET /users/me` (scope `users:read`) if absent |

Authorize params: `client_id`, `redirect_uri`, `response_type=code`, `state`, `scope` (space-delimited), optional `code_challenge` + `code_challenge_method=S256`.

Token-exchange params: `grant_type=authorization_code`, `client_id`, `client_secret`, `redirect_uri`, `code`, optional `code_verifier`.

Refresh params: `grant_type=refresh_token`, `client_id`, `client_secret`, `refresh_token`.

`invalid_grant` on refresh means the grant is dead (revoked / consent withdrawn); V2 maps it to `RefreshAuthRequiredError` per the V2-READY-32 contract.

## Redirect URI

Exact-match against the redirect URL registered in the app's OAuth settings. Non-native apps must use `https`. NOT VERIFIED: whether `http://localhost` is accepted for development; the docs only state https for non-native apps. If local OAuth fails, use an https tunnel for local testing.

V2 callback: `{NEXT_PUBLIC_APP_URL}/api/integrations/oauth/asana/callback` (generic `[provider]` dispatcher route, no per-provider route needed).

## Scopes

Granular OAuth scopes launched April 2025 (developer preview for new apps, GA path mid-2025). Current docs recommend scopes but note they are "not yet available for every Asana API endpoint"; uncovered endpoints require the app-level "Full permissions" toggle in the developer console. Omitting `scope` on the authorize URL uses the legacy `default` full-access scope.

Format: `<resource>:<action>`, space-delimited in the `scope` param.

### Required scopes for this slice (minimum set)

| Scope | Used by |
|---|---|
| `tasks:read` | `get_task`, `asana:tasks` option source (`GET /tasks?project=`) |
| `tasks:write` | `create_task`, `update_task`, `complete_task` (`POST /tasks`, `PUT /tasks/{gid}`) |
| `stories:write` | `add_comment_to_task` (`POST /tasks/{gid}/stories`) |
| `projects:read` | `asana:projects` option source (`GET /projects?workspace=`) |
| `users:read` | `asana:users` option source (`GET /users?workspace=`), identity fallback `GET /users/me` |
| `workspaces:read` | `asana:workspaces` option source (`GET /workspaces`) |
| `webhooks:write` | trigger activation (`POST /webhooks`) |
| `webhooks:delete` | trigger deactivation (`DELETE /webhooks/{gid}`) - NOT covered by `webhooks:write` |

### Considered and rejected

- `stories:read` - no shipped action lists comments.
- `webhooks:read` - we never list webhooks; activation stores the gid.
- `project_sections:read` (sections) - referenced on the get-task reference page but ABSENT from the published scope list; the scope gating `GET /projects/{gid}/sections` is ambiguous in current docs. Sections support is deferred from this slice for that reason (see implementation plan).
- `tasks:delete` - no delete action in this slice.
- OIDC scopes (`openid`, `email`, `profile`) - identity comes from the token response `data` object.

## Webhooks

- Create: `POST /webhooks` with `data: { resource: <projectGid>, target: <url>, filters: [...] }`. Returns `201` with the webhook (`gid`, `resource`, `target`, `active`, ...) only AFTER the handshake succeeds.
- Handshake: during creation, Asana POSTs to `target` with an `X-Hook-Secret` header. The receiver must echo the same `X-Hook-Secret` header with `200`/`204`. No documented timeout window; respond synchronously. The secret is PER WEBHOOK and is only ever delivered in this handshake - it must be persisted at handshake time.
- Signature: every event delivery carries `X-Hook-Signature` = HMAC-SHA256 over the raw request body, keyed with that webhook's `X-Hook-Secret`. Hex digest.
- Payload: `{ "events": [...] }`. Events are COMPACT: `user` (gid), `resource` (gid, resource_type, resource_subtype), `parent`, `action` (`added` / `changed` / `removed` / `deleted` / `undeleted`), `created_at`. No task names or field values - consumers must follow up with GET requests (V2 exposes `asana:get_task` for chaining instead of enriching in the receive path).
- Project-scoped webhooks propagate: a webhook on a project receives events for all its tasks, subtasks, and stories on those tasks.
- Filters: creation accepts `filters: [{ resource_type, action, fields?, resource_subtype? }]` to narrow deliveries server-side.
- Lifecycle: heartbeat (empty `events`) every 8 hours. Asana DELETES the webhook if the target fails to respond for 24 hours (including heartbeats). Returning HTTP `410` also deletes it. No renewal API; webhooks do not expire on a schedule.
- Delete: `DELETE /webhooks/{webhook_gid}` (scope `webhooks:delete`).
- Limits: 1,000 webhooks per resource; 10,000 per token.

## Rate limits

- Free workspaces: 150 requests/minute. Paid: 1,500 requests/minute. Per authorization token.
- `429` includes standard `Retry-After` (seconds). Rejected requests still count against quota.
- Concurrency: max 50 simultaneous reads, 15 simultaneous writes per token.

## Pagination

- `limit` 1..100 plus opaque `offset` token (only an offset previously returned may be passed back).
- Response `next_page`: `{ offset, path, uri }` or `null` when exhausted.
- V2 option sources fetch one page of 100 and set `hasMore` from `next_page` presence; picker refinement happens via the search box.

## Endpoints used in this slice

All under `https://app.asana.com/api/1.0`; success envelope is `{ "data": ... }`, errors are `{ "errors": [{ "message": ... }] }`.

| Endpoint | Used by | Notes |
|---|---|---|
| `POST /tasks` | create_task | body `data: { name, notes?, projects: [gid], assignee?, due_on? }`. Workspace not needed when `projects` is set |
| `PUT /tasks/{task_gid}` | update_task, complete_task | partial update: only provided fields change. `completed: true` completes |
| `GET /tasks/{task_gid}` | get_task | `opt_fields` comma-separated for the bounded output set |
| `POST /tasks/{task_gid}/stories` | add_comment_to_task | body `data: { text }`. Returns the full story |
| `GET /workspaces` | options | compact records |
| `GET /projects?workspace={gid}&archived=false` | options | "may timeout for large domains" per docs |
| `GET /users?workspace={gid}` | options | `opt_fields=name`; V2 does not request emails |
| `GET /tasks?project={gid}` | options | project param required when no assignee+workspace pair |
| `POST /webhooks` | trigger activate | see webhooks above |
| `DELETE /webhooks/{gid}` | trigger deactivate | best-effort on deactivation |

## Data model notes

- Every id is a string `gid`; every object has `resource_type`.
- `opt_fields` expands compact records; V2 requests only the fields in the bounded output contract.
- Completing a task = `PUT /tasks/{gid}` with `data: { completed: true }` (scope `tasks:write`).
- Sections at create time would use `memberships` (project + section pairs); moving later uses `POST /sections/{gid}/addTask`. Both deferred with the sections scope ambiguity.

## Developer portal

- Console: `https://app.asana.com/0/my-apps` ("Create new app").
- Client ID / secret and redirect URLs live in the app's OAuth tab; permission scopes under OAuth > Permission Scopes (including the "Full permissions" fallback toggle).
- Distribution: "Manage distribution" tab; choose "Any workspace" so external users can authorize. No review/publication required for authorization (App Directory listing is separate and optional).
- No documented sandbox; use a free workspace for testing (150 req/min).

## Known limitations / unverified items

1. Refresh-token rotation is undocumented (V2 persists defensively).
2. No explicit changelog confirming granular scopes are fully GA; per-endpoint coverage is still incomplete per current docs.
3. The scope gating `GET /projects/{gid}/sections` is ambiguous - sections deferred.
4. Handshake response timeout is undocumented.
5. `http://localhost` redirect URIs are not documented as allowed (https required for non-native apps).
6. If the deployment is unreachable for more than 24 hours, Asana deletes active webhooks; affected workflows need deactivate/reactivate. Surfaced in the owner report.

## Sources

- https://developers.asana.com/docs/oauth
- https://developers.asana.com/docs/oauth-scopes
- https://developers.asana.com/docs/authentication
- https://developers.asana.com/docs/webhooks-guide
- https://developers.asana.com/docs/rate-limits
- https://developers.asana.com/docs/pagination
- https://developers.asana.com/docs/manage-distribution
- https://developers.asana.com/reference/createtask
- https://developers.asana.com/reference/updatetask
- https://developers.asana.com/reference/createstoryfortask
- https://developers.asana.com/reference/gettask
- https://developers.asana.com/reference/gettasks
- https://developers.asana.com/reference/getworkspaces
- https://developers.asana.com/reference/getprojects
- https://developers.asana.com/reference/getsectionsforproject
- https://developers.asana.com/reference/getusers
- https://developers.asana.com/reference/createwebhook
- https://developers.asana.com/reference/deletewebhook
- https://forum.asana.com/t/new-oauth-permission-scopes/1048556
- https://forum.asana.com/t/lifetime-of-refresh-token/123429
