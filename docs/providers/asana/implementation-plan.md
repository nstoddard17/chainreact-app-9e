# Asana implementation plan (first slice)

Date: 2026-07-04
Status at authoring time: pre-implementation. This is the plan the code follows.

## Identity

- Provider id: `asana`
- Display name: `Asana`
- Credential class: **personal** (`core/integrations/credentialSharing.ts`). An Asana OAuth token acts as the connecting human (their task assignments, their comment authorship). Same class as Trello / Monday / GitHub. Research surfaced nothing suggesting an account/service posture.
- tokenScope: `user`; accountIdField: `email` (from the token response `data` object, falling back to the user gid).

## Auth flow

OAuth 2.0 code flow via the generic dispatcher (`services/oauth/dispatcher.ts` + `integrations/asana/oauth.ts`):

- Body-auth token exchange + refresh against `https://app.asana.com/-/oauth_token`.
- PKCE S256 via `generatePkce()` (Asana supports it; free hardening).
- Refreshable: `expires_in 3600`, long-lived refresh token; preserve-old refresh-token policy (persist a rotated one if the response carries it).
- `invalid_grant` on refresh -> `RefreshAuthRequiredError` (V2-READY-32).
- Identity from token response `data { gid, name, email }`; fallback `GET /users/me`.
- `revoke()` stub (deferred to the uniform disconnect-UX slice, matching every other V2 provider). Asana's revoke endpoint is documented in research.md for that slice.
- Env vars: `ASANA_CLIENT_ID`, `ASANA_CLIENT_SECRET`; e2e overrides `ASANA_AUTHORIZE_BASE`, `ASANA_TOKEN_BASE`, `ASANA_API_BASE`, `ASANA_WEBHOOK_URL`.

## Manifest scopes (minimum set)

`tasks:read tasks:write stories:write projects:read users:read workspaces:read webhooks:write webhooks:delete`

Capabilities (honest, flipped in this same slice because the real handlers land here): `oauth: true`, `actions: true`, `webhookTrigger: true`, `pollingTrigger: false`. Health check 12 h (the "others" bucket). apiVersion `1.0`.

## Actions (5)

All principal calls wrapped in `refreshAndRetry` (hourly-expiring tokens). Strict Zod config schemas. Bounded outputs only; no raw response spreading; permalink URLs and user-authored text marked `sensitive` in metas.

| Action | Endpoint | Config (required*) | Output |
|---|---|---|---|
| `asana:create_task` | `POST /tasks` | workspaceId (UI scope), projectId*, name*, notes, assigneeId, dueOn | taskGid, taskName, permalinkUrl, assigneeGid, dueOn, completed, createdAt |
| `asana:update_task` | `PUT /tasks/{gid}` | taskGid*, name/notes/assigneeId/dueOn (at least one), workspaceId/projectId (UI scope) | taskGid, taskName, permalinkUrl, assigneeGid, dueOn, completed, modifiedAt |
| `asana:complete_task` | `PUT /tasks/{gid}` `{completed:true}` | taskGid*, workspaceId/projectId (UI scope) | taskGid, completed, completedAt |
| `asana:add_comment_to_task` | `POST /tasks/{gid}/stories` | taskGid*, text*, workspaceId/projectId (UI scope) | storyGid, text, createdAt |
| `asana:get_task` | `GET /tasks/{gid}` | taskGid*, workspaceId/projectId (UI scope) | taskGid, taskName, notes, completed, completedAt, dueOn, dueAt, assigneeGid, assigneeName, projectGids, permalinkUrl, createdAt, modifiedAt |

Risk: create/update/comment `medium` (recoverable writes), complete `medium`, get `low`. Nothing destructive; no confirmation gates; no hidden high-risk defaults (assignee/notifications are never silently supplied).

## Triggers (2, webhook)

Project-scoped webhooks via `POST /webhooks` with server-side `filters`, per-(workflow, node) lifecycle, strict-direct-lookup URLs (`/api/webhooks/asana?workflowId=X&nodeId=Y`), same architecture as Monday/Trello.

| Trigger | Asana filter | eventType (short form) |
|---|---|---|
| `asana:new_task_in_project` | `{resource_type: "task", action: "added"}` | `new_task_in_project` |
| `asana:task_updated_in_project` | `{resource_type: "task", action: "changed"}` | `task_updated_in_project` |

### Per-webhook secret handling (the Asana-specific problem)

Asana delivers the webhook's HMAC key exactly once, via the `X-Hook-Secret` handshake POST that arrives WHILE `POST /webhooks` is still pending. V2's lifecycle upserts `trigger_resources` only AFTER `activate()` returns, so the receive route would have no row to store the secret on. Design:

1. `activate()` pre-upserts the trigger row itself (`triggerResourcesRepo.upsert`, keyed on workflow_id+node_id) with `handshakePending: true` before calling `POST /webhooks`. Provenance userId = `integration.connectedByUserId` (always set for V2-created rows; lifecycle's final upsert overwrites with `workflow.createdByUserId`).
2. The receive route's handshake path (X-Hook-Secret header present) resolves the row, and ONLY when `handshakePending === true` and no secret is stored yet, persists `hookSecretEncrypted` (encrypted with `core/encryption/tokens.encryptToken`) via `updateConfig`, then echoes the header. Any other handshake is rejected WITHOUT echo (400), so an attacker cannot rotate an armed row's secret; a failed echo makes Asana fail the webhook creation (fail closed).
3. After `POST /webhooks` returns 201, `activate()` re-reads the row, requires the stored secret (deletes the webhook and throws if missing), and returns the full config patch: `webhookEnabled, projectId, webhookId, hookSecretEncrypted, notificationUrl, handshakePending: false`. The lifecycle's final upsert persists it.

Secret storage diverges from Airtable's plaintext `macSecretBase64` precedent: encrypted at rest via `encryptToken` (strictly better; decrypted only in the receive path for HMAC verification).

### Receive path

- Handshake: see above.
- Events: resolve row by query params -> decrypt per-row secret -> verify `X-Hook-Signature` (HMAC-SHA256 hex over raw body, constant-time compare) -> parse `{events: []}` -> heartbeat (empty events) acked 200 -> classify each event (`task+added` / `task+changed`) -> drop unsupported + row-eventType mismatches -> normalize -> `dispatchTriggerEvent`.
- Rows lacking a secret (interrupted activation) quietly ack and never dispatch.
- Invalid signature -> 401. Dispatch failure -> 500 so Asana retries.

### Normalization + dedup + filtering

- Compact payload only (Asana events carry no task content): `changeKind, taskGid, projectGid, actorGid, action, resourceSubtype, createdAt`. Users chain `asana:get_task` for details; no receive-path enrichment fetches.
- `projectGid` is taken from the receiving row's configured project (authoritative: the webhook is project-scoped), never guessed from `parent`.
- eventId: `${eventType}:${projectGid}:${taskGid}:${created_at}` - deterministic, so N same-project workflows' duplicate deliveries collapse in `webhook_event_dedup` and fan back out via dispatch.
- Per-trigger dispatcher filters (P-S2 `registerTriggerFilter`) compare `payload.projectGid` to each candidate row's `config.projectId`, so a task event in project A can never fire a workflow watching project B. (Fan-out is global per (provider, eventType); the filter is what scopes it.)
- Renewal: none. Asana webhooks do not expire on a schedule; no `subscription-watch` marker. Limitation: Asana deletes webhooks after 24 h of failed deliveries/heartbeats (owner report).
- Deactivation: best-effort `DELETE /webhooks/{gid}`; swallows not-found and dead-token errors like Monday.

## Option sources (4)

`asana:workspaces` (no deps), `asana:projects` (dep workspaceId), `asana:users` (dep workspaceId, labels are names only - no emails), `asana:tasks` (dep projectId). All `requiresIntegration: true`, wrapped in `refreshAndRetry`, sanitized errors (`INTEGRATION_DISCONNECTED` / `PROVIDER_REAUTH_REQUIRED` via InsufficientScope / `PROVIDER_ERROR`), one page of 100 with `hasMore` from `next_page`. Personal-credential gating (NOT_WORKFLOW_OWNER / OWNER_MUST_CONNECT) is enforced centrally by `services/options/resolveOptionsSource.ts` once `asana` is classified personal; no per-resolver logic.

**Sections deferred**: the scope gating `GET /projects/{gid}/sections` is ambiguous in current Asana docs (`project_sections:read` is referenced on one page but absent from the published scope list). `create_task` ships without a section picker (tasks land in the project's default section). Revisit when Asana's scope list covers sections.

## Builder fields

Cascades: workspaceId (asana:workspaces) -> projectId (asana:projects) -> taskGid (asana:tasks, `allowManualEntry: true` so upstream variables/pasted gids work). dueOn uses the `date` field type. Trigger config: workspaceId -> projectId.

## Registry / surface wiring

- `integrations/_registry.ts`: manifest + 2 trigger side-effect imports.
- `services/oauth/dispatcher.ts`: `asana: asanaOAuth`.
- `core/integrations/credentialSharing.ts`: `asana: "personal"`.
- `services/execution/handlers/_handlerInventory.ts`: 5 handlers.
- `services/discovery/providers/asana.ts` + `_metaInventory.ts`: 5 action metas + 2 trigger metas.
- `services/options/_registry.ts`: 4 resolvers.
- `tests/structure/discovery-meta-coverage.test.ts`: add `asana` to COVERED_PROVIDERS (1:1 handler/meta parity enforced from day one).
- Apps page / Builder / AI visibility: all derive from the registries above (providers route filters on `listProvidersWithMetadata()`; AI context uses safe booleans via `services/ai/tools/workflowContext.ts` + credentialSharing). Icon: `public/integrations/asana.svg` (new asset; V1 had none).
- API wrappers: `integrations/_shared/asana/api/*` + `integrations/_shared/asana/webhooks/signature.ts` + `errors.ts` (Monday/HubSpot placement pattern).

## Smoke strategy

- 5 fixtures under `tests/fixtures/action-smoke/asana/`, registered in `tests/smoke-actions/fixtures.ts`:
  - `get_task`: read fixture (`SMOKE_ASANA_TASK_ID`).
  - `create_task`: writeSafe; verify via `get_task` marker read-back; cleanup = `complete_task` (`cleanupKind: "archive"` - Asana has no shipped delete action; a completed marker-prefixed task is the honest disposition).
  - `update_task`: setup `create_task`, execute update with `markerSuffix: "updated"`, verify `get_task`, cleanup `complete_task`.
  - `complete_task`: setup `create_task`, execute complete, verify `get_task` `expectEquals completed: true` (executeIsCleanup-like disposition via archive semantics).
  - `add_comment_to_task`: writeSafe against the env-pinned smoke task; no read-back action shipped for comments, so verification relies on the execute echo (`markerEchoPath: "text"`); documented limitation.
- Trigger smoke: `tests/integration/trigger-smoke/asana-webhook.workflow.dev.test.ts` mirroring the Monday webhook smoke (activation -> handshake -> signed event injection -> dispatch/enqueue -> dedup -> paused-drop), added to the `smoke:triggers:webhook` script.
- Live smoke requires owner-provisioned Asana credentials (none exist yet) - expected result at this slice's close is fixtures registered + mocked-boundary suites green + live run pending owner setup.

## Owner setup requirements (previewed; full detail in owner-setup-report.md)

Asana developer app (my-apps console), redirect URIs per environment, the 8 scopes above (or Full permissions fallback), distribution "Any workspace", Vercel env vars `ASANA_CLIENT_ID` / `ASANA_CLIENT_SECRET`. No webhook signing secret env var (per-webhook secrets via handshake). Webhook URL `/api/webhooks/asana` needs no portal registration (created dynamically per trigger).

## Blockers / risks

1. Granular-scope coverage is still rolling out on Asana's side; if a scoped call unexpectedly 403s in practice, the app-level "Full permissions" toggle is the documented fallback (owner decision; scopes stay declared either way).
2. Sections deferred (scope ambiguity) - create_task cannot target a section in this slice.
3. Webhook 24 h failure deletion (platform behavior) - documented limitation, no renewal API exists.
4. localhost https redirect ambiguity - local OAuth may need a tunnel.
5. Live smoke blocked until owner provisions the developer app + a smoke workspace/project/task.
