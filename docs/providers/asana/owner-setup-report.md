# Asana Owner Setup Report

## Status
- Code status: code-complete (Slice 5.ASANA-1, first net-new V2 provider)
- Commit: see git log for `feat(asana)` on v2-main (local, 2026-07-04)
- Push status: NOTHING pushed
- Smoke status: mocked-boundary suites green (14 suites / ~123 Asana tests); action-smoke CLI shows asana 5/5 fixture-backed; trigger smoke PASSED against the real dev DB (2/2, synthetic signed events, dedup + terminal proven). LIVE provider smoke NOT run - no Asana developer app or credentials exist yet.
- Remaining owner action: create the Asana developer app, set redirect URLs + scopes + distribution, add 2 Vercel env vars, connect from the Apps page, run the live smoke.

## Provider developer portal setup

### App/basic settings
- Console: https://app.asana.com/0/my-apps -> "Create new app"
- App name: ChainReact (or ChainReact Dev / ChainReact Preview for non-prod apps)
- App type: OAuth app (authorization code + refresh)
- Website URL: https://chainreact.app (or your prod domain)
- Privacy policy / Terms / Support email: fill from ChainReact's standard links (required only for App Directory listing, not for OAuth use)
- Logo/icon: optional; used on Asana's consent screen
- Notes: one app can serve all environments if you register every redirect URL on it; separate dev/prod apps are cleaner and match how the other providers are set up.

### Redirect URIs (OAuth tab, exact match)
- Local: `http://localhost:3000/api/integrations/oauth/asana/callback`
  - CAUTION: Asana docs require https for non-native apps and do not document a localhost exception. If Asana's console rejects the http URL or the flow fails locally, use an https tunnel (e.g. `https://<tunnel>/api/integrations/oauth/asana/callback`) with `NEXT_PUBLIC_APP_URL` pointed at the tunnel.
- Preview/Vercel: `https://<preview-domain>/api/integrations/oauth/asana/callback`
- Production: `https://<prod-domain>/api/integrations/oauth/asana/callback`
- Exact callback path: `/api/integrations/oauth/asana/callback` (generic V2 dispatcher route; no per-provider route exists)

### Webhook URLs
- Nothing to register in the Asana portal. Asana webhooks are created dynamically per trigger activation via `POST /webhooks`; the target is `<NEXT_PUBLIC_APP_URL>/api/webhooks/asana?workflowId=...&nodeId=...`.
- Local: webhook triggers cannot complete activation against localhost (Asana must reach the target for the X-Hook-Secret handshake). Use an https tunnel and set `ASANA_WEBHOOK_URL` to the tunnel base for local trigger testing.
- Preview/Vercel: `https://<preview-domain>/api/webhooks/asana`
- Production: `https://<prod-domain>/api/webhooks/asana`
- Events subscribed: per-trigger server-side filters - task+added (new_task_in_project), task+changed (task_updated_in_project)
- Signature secret location: none in the portal and none in env. Asana issues a PER-WEBHOOK `X-Hook-Secret` during the creation handshake; V2 stores it encrypted on the trigger row (`trigger_resources.config.hookSecretEncrypted`) and verifies `X-Hook-Signature` (HMAC-SHA256 hex over the raw body) per row.
- Verification/challenge notes: handled automatically. The receive route echoes `X-Hook-Secret` only for a trigger row in its activation window; anything else gets 400 with no echo (fail closed).

### OAuth scopes (OAuth > Permission Scopes)
| Scope | Required? | Used by | Why |
|---|---:|---|---|
| `tasks:read` | yes | get_task, task picker | GET /tasks/{gid}, GET /tasks?project= |
| `tasks:write` | yes | create_task, update_task, complete_task | POST /tasks, PUT /tasks/{gid} |
| `stories:write` | yes | add_comment_to_task | POST /tasks/{gid}/stories |
| `projects:read` | yes | project picker | GET /projects?workspace= |
| `users:read` | yes | assignee picker, identity fallback | GET /users?workspace=, GET /users/me |
| `workspaces:read` | yes | workspace picker | GET /workspaces |
| `webhooks:write` | yes | trigger activation | POST /webhooks |
| `webhooks:delete` | yes | trigger deactivation | DELETE /webhooks/{gid} (NOT covered by webhooks:write) |

Fallback: if any endpoint 403s because Asana's granular-scope rollout does not yet cover it in your app, the console's "Full permissions" toggle (OAuth > Permission Scopes) is the documented escape hatch. Prefer the granular set above.

### Provider-specific settings
- Token rotation: refresh tokens are long-lived; rotation undocumented. V2 persists a rotated refresh token if one ever appears (preserve-old policy). Nothing to configure.
- PKCE: V2 always sends S256; supported by Asana, nothing to enable.
- Webhook signing: per-webhook (handshake); nothing to configure.
- Event subscriptions: created at trigger activation; nothing to configure.
- Bot/user install choice: n/a - Asana OAuth acts as the connecting human (personal credential class).
- Marketplace/review steps: none required for OAuth use. App Directory listing is optional and separate.
- Distribution: Manage distribution tab -> choose **"Any workspace"** so users outside your own workspace can authorize.
- Test users: no sandbox; use a free Asana workspace (note free tier = 150 req/min).
- Rate limits: free 150/min, paid 1,500/min per token; 429 carries Retry-After; V2 surfaces 429 as a typed provider error (no auto-retry loop in this slice).

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `ASANA_CLIENT_ID` | yes | yes | yes | yes | `integrations/asana/oauth.ts` | From the app's OAuth tab |
| `ASANA_CLIENT_SECRET` | yes | yes | yes | yes | `integrations/asana/oauth.ts` | Secret; never logged |
| `ASANA_AUTHORIZE_BASE` | no | e2e only | no | no | oauth.ts | Mock override; never set in prod |
| `ASANA_TOKEN_BASE` | no | e2e only | no | no | oauth.ts | Mock override |
| `ASANA_API_BASE` | no | e2e only | no | no | `_shared/asana/api/_request.ts` | Mock override |
| `ASANA_WEBHOOK_URL` | no | tunnel only | no | no | `triggers/_shared/notificationUrl.ts` | Local-tunnel override; prod uses NEXT_PUBLIC_APP_URL |

No webhook signing secret env var exists for Asana (per-webhook secrets via handshake).

Smoke-only env (dev, optional, for live action smoke after connecting):
`SMOKE_ASANA_CONNECTED=true`, `SMOKE_ASANA_PROJECT_ID=<throwaway project gid>`, `SMOKE_ASANA_TASK_ID=<throwaway task gid in that project>`.

## Supabase / database setup
- Migrations added: NONE (reuses trigger_resources, webhook_event_dedup, integrations; per-webhook secret lives in trigger_resources.config)
- db:push run: not needed
- RLS/policy notes: unchanged
- Storage bucket notes: none
- Cron notes: none (Asana webhooks do not expire on a schedule; no renewal cron participation)

## Actions shipped
| Action | Handler | Schema | Metadata | Options | Unit tests | Smoke |
|---|---|---|---|---|---|---|
| asana:create_task | yes | strict | yes | workspaces/projects/users | 7 | fixture (writeSafe, verify get_task, cleanup complete_task) |
| asana:update_task | yes | strict + at-least-one refine | yes | + tasks picker | 7 | fixture (setup create, markerSuffix verify) |
| asana:complete_task | yes | strict | yes | tasks picker | 5 | fixture (setup create, expectEquals completed) |
| asana:add_comment_to_task | yes | strict | yes | tasks picker | 5 | fixture (echo-verify only - documented limitation, no comment-read action) |
| asana:get_task | yes | strict | yes | tasks picker | 5 | fixture (read, liveSafe) |

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|
| asana:new_task_in_project | webhook (project-scoped, filter task+added) | activate (pre-upsert + handshake secret persistence + POST /webhooks) / deactivate (DELETE /webhooks) | workspaceId -> projectId cascade | activate 8, deactivate 5, receive 15, normalize/filter 11 | PASSED vs real dev DB (direct-seed, signed synthetic events, dedup + paused-drop via dispatcher gates) |
| asana:task_updated_in_project | webhook (filter task+changed) | same shared lifecycle | same | shared suites | PASSED vs real dev DB |

## Manual verification checklist for Marcus
- [ ] Create the Asana developer app at https://app.asana.com/0/my-apps
- [ ] Add the redirect URI(s) above (exact match)
- [ ] Register the 8 scopes above under OAuth > Permission Scopes (or Full permissions fallback)
- [ ] Set distribution to "Any workspace"
- [ ] Add `ASANA_CLIENT_ID` + `ASANA_CLIENT_SECRET` to Vercel (all envs) and `.env.local`
- [ ] Redeploy after env changes
- [ ] Connect Asana from the Apps page (verify the connected account shows your Asana email)
- [ ] Builder: create a workflow with New Task in Project -> Get Task; verify the workspace/project pickers populate
- [ ] Activate it; verify activation succeeds (creates the Asana webhook + handshake)
- [ ] Create a task in the watched project; verify a run fires and Get Task returns its fields
- [ ] Optional: set SMOKE_ASANA_* env and run `npm run smoke:actions:run` for the live action smoke
- [ ] Deactivate the workflow; verify the webhook is deleted (Asana: no webhooks remain for the project)

## Known blockers / limitations
- Owner setup required (developer app + env vars) - everything above.
- Local OAuth/webhooks likely need an https tunnel (Asana https redirect requirement + reachable handshake target).
- Asana deletes webhooks after 24h of failed deliveries/heartbeats (platform behavior, no renewal API). Recovery = deactivate/reactivate the workflow. Consider a health surface in a later slice.
- Sections deferred (create_task cannot target a section) - Asana's scope for GET sections is ambiguous in current docs.
- add_comment_to_task smoke verification is execute-echo only (no comment-read action shipped).
- update_task treats empty strings as "not provided" - clearing a field to empty is not supported in this slice.
- task_updated_in_project is chatty (any field change fires it); documented in the builder description.
- Live provider smoke pending owner credentials.
