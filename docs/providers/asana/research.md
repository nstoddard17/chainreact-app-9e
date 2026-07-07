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
- LIVE-observed (2026-07-04): creating ONE task in a project delivers TWO `task`+`added` events through a `{resource_type: task, action: added}`-filtered project webhook - Asana emits one membership event per parent (the project and its section), `created_at` milliseconds apart, otherwise identical in V2's normalized shape. Consumers must dedup on (project, task), NOT on the event timestamp, or one creation double-fires (V2's `new_task_in_project` dedup key is task-scoped for this reason).
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

---

## ASANA-2 follow-up research (2026-07-06)

Date researched: 2026-07-06 (chainreactv2-provider-integration-builder, ASANA-2 slice).
Scope source: `docs/slices/phase-5/asana-typeform-catalog-audit.md`.

### Sections scope verification (the audit's gating question) — BLOCKED

The audit deferred sections on "does `projects:read` cover `GET /projects/{gid}/sections`?".
Verified 2026-07-06 against https://developers.asana.com/docs/oauth-scopes:

- `projects:read` endpoint list (verbatim): `GET /projects/{project_gid}/custom_field_settings`,
  `GET /projects`, `GET /projects/{project_gid}`, `GET /tasks/{task_gid}/projects`,
  `GET /teams/{team_gid}/projects`, `GET /workspaces/{workspace_gid}/projects`,
  `GET /workspaces/{workspace_gid}/projects/search`, `GET /projects/{project_gid}/task_counts`.
  **No sections endpoint.**
- `GET /projects/{project_gid}/sections` appears in **NO** granular scope's endpoint list
  anywhere on the page, and **no `sections:read` / `sections:write` scope exists** (full scope
  name inventory checked).
- The only `/sections` endpoints under any scope: `POST /sections/{section_gid}/addTask`
  (under `tasks:write`) and `GET /sections/{section_gid}/tasks` (under `tasks:read`).
- Live corroboration: forum thread "Setting up get sections in a project but getting an error
  for endpoint: default" (https://forum.asana.com/t/setting-up-get-sections-in-a-project-but-getting-an-error-for-endpoint-default/1077797,
  resolved July 2025) — calling the endpoint under granular scopes returns
  `One of the following scopes must be present to use this endpoint: default`; the working
  resolution was switching the app to Full permissions and removing the `scope` param.

**Decision:** the sections OPTION SOURCE cannot be built under this app's granular-scope model
(the write endpoint `addTask` is covered by held `tasks:write`, but a section picker requires
the list endpoint, which needs the legacy `default` full-access scope). `add_task_to_section` +
`asana:sections` are BLOCKED until Asana adds a granular scope for the sections list endpoint
(or ChainReact deliberately switches the app to Full permissions, which is against the
least-privilege posture). Not ambiguous anymore — verified blocked.

### ASANA-2 scope changes

- **`stories:read` added** (NEW). Covers `GET /stories/{story_gid}` and
  `GET /tasks/{task_gid}/stories` (verbatim from the oauth-scopes page; also
  `GET /goals/{goal_gid}/stories`, unused). Needed by the `comment_added_to_task`
  receive-time post-fetch. Existing users must RE-CONSENT before the trigger can activate
  reads (403 InsufficientScopeError until then).
- `create_subtask` needs no new scope: `POST /tasks/{task_gid}/subtasks` is in the
  `tasks:write` endpoint list (verified verbatim).
- `list_tasks_in_project` needs no new scope: `GET /projects/{project_gid}/tasks` is in the
  `tasks:read` endpoint list (verified verbatim).
- `task_completed` / `task_assigned` post-fetch (`GET /tasks/{task_gid}`) rides on held
  `tasks:read`.

### Webhook filters (ASANA-2 trigger signatures)

The WebhookFilter object supports `resource_type`, `resource_subtype`, `action`, and `fields`
(webhooks guide example: `{"resource_type": "task", "resource_subtype": "milestone",
"action": "changed", "fields": ["due_at", "due_on", "dependencies"]}`). ASANA-2 uses:

- `task_completed`: `{resource_type: "task", action: "changed", fields: ["completed"]}`
- `task_assigned`: `{resource_type: "task", action: "changed", fields: ["assignee"]}`
- `comment_added_to_task`: `{resource_type: "story", action: "added", resource_subtype: "comment_added"}`

### Compact events + the `change` object

Webhook events remain compact (gid + action + timestamp; no field values). Field-change events
carry a `change` object (`field`, `action`, and `new_value` / `added_value` / `removed_value`
depending on scalar vs collection). V2 uses `change.field` only as a defense-in-depth matcher
mirror of the server-side `fields` filter and NEVER trusts `change.new_value` for dispatch —
the authoritative state comes from a bounded post-fetch:

- `task_completed`: `GET /tasks/{gid}` must read `completed === true` or the event is dropped
  (a merely-updated task never fires).
- `task_assigned`: `GET /tasks/{gid}` must show a non-null assignee (unassignment never fires);
  the post-fetched assignee is the payload's `newAssigneeGid`/`newAssigneeName`.
- `comment_added_to_task`: `GET /stories/{story_gid}` (scope `stories:read`) supplies text
  (truncated to 4,000 chars), author gid + display name (never email), and the target task.

Post-fetch failure posture: 404 → drop quietly (resource gone between event and fetch);
dead credential after refresh → drop with a warn (never dispatch what we can't verify);
any other error → propagate so the route 5xxes and Asana redelivers.

### ASANA-2 dedup keys (timestamp-free, per the ASANA-1 live double-fire lesson)

- `task_completed:{projectGid}:{taskGid}` — one fire per task completion; documented
  limitation: un-complete → re-complete within the 7-day dedup TTL does not re-fire.
- `task_assigned:{projectGid}:{taskGid}:{assigneeGid}` — one fire per (task, assignee) pair;
  a different assignee is a new key; documented limitation: A → B → A within the TTL does
  not re-fire the second A.
- `comment_added_to_task:{projectGid}:{storyGid}` — the story gid is a durable per-comment
  entity id; no re-fire limitation.

### Additional sources (ASANA-2)

- https://developers.asana.com/docs/oauth-scopes (re-verified endpoint lists, 2026-07-06)
- https://developers.asana.com/reference/getsectionsforproject (no scope note on page)
- https://developers.asana.com/reference/createsubtask
- https://developers.asana.com/reference/getstory
- https://forum.asana.com/t/setting-up-get-sections-in-a-project-but-getting-an-error-for-endpoint-default/1077797

### ASANA-2 live-provider event-shape review (Phase 13, 2026-07-06)

Full live certs passed same day via `scripts/trash/asana2-live-trigger-smoke.ts`
(driver pattern: local orchestration, production `NEXT_PUBLIC_APP_URL` so handshakes +
events land on the deployed receive route; shared Supabase). Observations:

- **Server-side `fields` filters honored live:** a plain rename delivered NOTHING to the
  `fields:["completed"]` webhook (0 runs across a 75s window). No over-delivery observed.
- **`resource_subtype` filter honored live:** completing a task (which emits a
  `marked_complete` system story) produced NO run on the comment webhook — either Asana
  withheld it server-side or the matcher/post-fetch dropped it; both are the designed
  outcome and indistinguishable from outside.
- **Unassignment gate held live:** `assignee -> null` (PUT with `assignee: null`; the API
  rejects the typed wrapper's "" form, so unassign needs an explicit null) produced no run.
- **`assignee: "me"` is accepted** by PUT /tasks as an assignee value; the production
  post-fetch resolved it to the concrete user gid in `newAssigneeGid`.
- **Dedup keys observed in production runs** (all timestamp-free as designed):
  `task_completed:{project}:{task}`, `task_assigned:{project}:{task}:{assignee}`,
  `comment_added_to_task:{project}:{story}`. Exactly one run per positive event; no
  multi-parent double-fire recurrence.
- **Handshake latency:** 1.1–2.1s per activation (3 activations), consistent with ASANA-1.
- **stories:read** proven twice: a pre-flight `GET /stories/{gid}` probe and the comment
  run's production post-fetch returning text + author display name.
