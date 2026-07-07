# Asana Owner Setup Report

> **ASANA-2 (2026-07-06): owner action required again.** The follow-up slice adds a NEW
> scope (`stories:read`) + 3 triggers + 2 actions. See "ASANA-2 owner setup" at the bottom
> for the exact console change, re-consent requirement, and deploy gate. The sections above
> it describe the live-complete ASANA-1 state.

## Status
- Code status: code-complete (Slice 5.ASANA-1, first net-new V2 provider) + LIVE-verified 2026-07-04 (see "Live provider verification" below). ASANA-2 follow-up (2026-07-06): code-complete, owner setup required (see "ASANA-2 owner setup").
- Commit: see git log for `feat(asana)` on v2-main (local, 2026-07-04); live verification + double-fire dedup fix committed 2026-07-04
- Push status: NOTHING pushed
- Smoke status: mocked-boundary suites green (14 suites / ~123 Asana tests); LIVE action smoke PASSED 5/5 (real provider mutations, certified in certificationSeed); LIVE trigger verification PASSED for both triggers end-to-end against production (real POST /webhooks + handshake against https://chainreact.app, real task events, production dispatch + drain, real DELETE /webhooks). One REAL bug found and fixed locally: new_task_in_project fired twice per task creation (Asana sends one task+added membership event per parent - project AND section; the timestamp-bearing dedup key kept them distinct). Dedup key is now task-scoped.
- Remaining owner action: NONE. v2-main pushed to `64795582a` and deployed 2026-07-04 (Vercel deployment dpl_AnKnzUfXmMDjyjHWZBSwmKFDsGio, aliased to chainreact.app); the deploy-gated live retest PASSED - new_task_in_project fired EXACTLY ONE run per created task and its eventId came back in the new timestamp-free format from the production receive route, proving the fix is live.

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
| `tasks:read` | yes | get_task, list_tasks_in_project, task picker, ASANA-2 task_completed/task_assigned post-fetch | GET /tasks/{gid}, GET /tasks?project= |
| `tasks:write` | yes | create_task, update_task, complete_task, create_subtask (ASANA-2) | POST /tasks, PUT /tasks/{gid}, POST /tasks/{gid}/subtasks |
| `stories:write` | yes | add_comment_to_task | POST /tasks/{gid}/stories |
| `stories:read` | yes (NEW, ASANA-2) | comment_added_to_task post-fetch | GET /stories/{story_gid}. **Must be added in the console; existing users must re-consent.** |
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
- [x] Create the Asana developer app at https://app.asana.com/0/my-apps (done 2026-07-04)
- [x] Add the redirect URI(s) above (exact match) - proven by the successful production OAuth connect
- [x] Register the 8 scopes above under OAuth > Permission Scopes (or Full permissions fallback) - all live calls (tasks/stories/projects/users/workspaces/webhooks write+delete) succeeded
- [x] Set distribution (production connect succeeded)
- [x] Add `ASANA_CLIENT_ID` + `ASANA_CLIENT_SECRET` to Vercel (Preview + Production verified via `vercel env ls`) and `.env.local`
- [x] Redeploy after env changes
- [x] Connect Asana from the Apps page (integration row created 2026-07-04T15:11Z)
- [x] Workspace/project/user/task pickers populate (live resolver verification, names-only user labels)
- [x] Activation creates the Asana webhook + handshake (live, both triggers, ~1.2-1.4s)
- [x] Task created in the watched project fires a run that reaches terminal succeeded via production drain
- [x] Live action smoke run (5/5 PASS, certified)
- [x] Deactivation deletes the webhook (second DELETE reads 404; no webhooks remain)
- [x] Push + deploy v2-main, then re-run `npx tsx scripts/trash/asana-live-trigger-smoke.ts` to confirm the new_task_in_project double-fire fix live - DONE 2026-07-04, ALL LIVE TRIGGER CHECKS PASSED (exactly 1 run per trigger, webhooks 404-proven deleted, rows cleaned)

## Known blockers / limitations
- ~~Owner setup required (developer app + env vars)~~ DONE 2026-07-04 (developer app created, env vars on Vercel Preview+Production, connected on production).
- ~~The new_task_in_project double-fire fix (task-scoped dedup key) is LOCAL ONLY~~ DEPLOYED + LIVE-RETESTED 2026-07-04: exactly one run per created task on production; run f0e6d936 carried the timestamp-free eventId, proving the deployed normalize is the fixed version.
- Local OAuth/webhooks likely need an https tunnel (Asana https redirect requirement + reachable handshake target). Live verification instead activated from the local repo WITH the production notification URL (shared Supabase), which works and is the documented pattern for local live-trigger testing.
- Asana deletes webhooks after 24h of failed deliveries/heartbeats (platform behavior, no renewal API). Recovery = deactivate/reactivate the workflow. Consider a health surface in a later slice.
- Sections VERIFIED BLOCKED (2026-07-06, was "ambiguous"): `GET /projects/{gid}/sections` is covered by NO granular scope (no sections:read exists) and live evidence shows it demands the legacy `default` full-access scope. `asana:sections` + `add_task_to_section` stay out until Asana ships a granular scope (research.md "Sections scope verification").
- add_comment_to_task smoke verification is execute-echo only (no comment-read action shipped).
- update_task treats empty strings as "not provided" - clearing a field to empty is not supported in this slice.
- task_updated_in_project is chatty (any field change fires it); documented in the builder description. A single multi-field edit can still fire more than once (distinct task+changed events keep their timestamps in the dedup key by design - updates are legitimately repeatable).
- new_task_in_project does not re-fire when the same task is removed from and re-added to the project within the 7-day dedup TTL (consequence of the task-scoped dedup key; accepted).
- GET /events (Events API) is 403 under the granted granular scopes - diagnosis of webhook payload shapes must go through a webhook target, not the event stream.

## Live provider verification

### OAuth connect
- Date: 2026-07-04
- Environment: production (https://chainreact.app), Asana developer app + `ASANA_CLIENT_ID`/`ASANA_CLIENT_SECRET` on Vercel (Preview + Production, verified via `vercel env ls`)
- Result: PASS - integration row created 2026-07-04T15:11Z under the smoke account, `getActiveForExecution` resolves it (dbConnected=true, execUsable=true), hourly-expiring token transparently served via refreshAndRetry.

### Live actions
All five ran through the REAL V2 execution engine (workflow-live harnesses, testMode=false) against the connected account; targets pinned via `SMOKE_ASANA_PROJECT_ID`/`SMOKE_ASANA_TASK_ID` (the workspace's default project "Marcus's first project" - the granted scopes cannot create projects, `projects:read` only).

| Action | Result | Evidence / notes |
|---|---|---|
| asana:create_task | PASS | crsmoke task created; INDEPENDENT get_task read-back proved the marker on taskName; cleanup complete_task ok (created 1 / cleaned 1 / leaked 0, artifact archived) |
| asana:get_task | PASS | read live runner (run terminal succeeded) + doubles as the write fixtures' read-back seam |
| asana:update_task | PASS | setup create -> update -> read-back marker verify -> cleanup complete (created 1 / cleaned 1 / leaked 0) |
| asana:add_comment_to_task | PASS | execute-echo verify only (markerEchoPath text) - documented limitation, no comment-read action; crsmoke comment left on the pinned smoke task |
| asana:complete_task | PASS | setup create -> execute -> read-back `completed == true` state verify; completed task intentionally left (archive disposition, no delete action) |

Certified in `scripts/chainreact/smoke/certificationSeed.ts` (ASANA-LIVE block): get_task LIVE_PASS, 4 writes LIVE_PASS_LEFT_ARTIFACT.

### Live triggers
Both ran the REAL provider-side lifecycle the direct-seed dev smoke leaves uncovered: local `registerWorkflowTriggers` -> real `POST /webhooks` -> X-Hook-Secret handshake against the DEPLOYED `https://chainreact.app/api/webhooks/asana` receive route (shared Supabase; secret persisted encrypted by production) -> real task event in the watched project -> production signature-verify + dispatch + cron drain -> terminal run -> `unregisterWorkflowTriggers` -> `DELETE /webhooks` proven gone by a second delete reading 404.

| Trigger | Result | Evidence / notes |
|---|---|---|
| asana:new_task_in_project | PASS (with bug found + fixed) | Activation handshake ~1.2s, secret stored, webhookEnabled=true. Real task creation fired a run that reached terminal `succeeded` on production's own drain. BUG: got 2 runs for 1 creation - Asana delivers one task+added membership event per parent (project + section), created_at 138ms apart, and the timestamp-bearing dedup key kept them distinct. FIXED locally: dedup key is now `new_task_in_project:<projectGid>:<taskGid>` (timestamp only as fallback when the task gid is missing); regression tests added; direct-seed dev trigger smoke re-run PASS 2/2. Production needs the commit deployed before a live re-test can show exactly one run. Deactivation deleted the webhook (second delete -> 404) and removed the trigger row. |
| asana:task_updated_in_project | PASS | Activation handshake ~1.4s. Real task rename fired EXACTLY ONE run, terminal `succeeded` via production drain, event identity matched (taskGid/projectGid/changeKind). Deactivation deleted the webhook (404-proven) and removed the trigger row. |

Not practically testable live, covered elsewhere: wrong-project drop (the throwaway workspace has a single project and the granted scopes cannot create another; Asana webhooks are project-scoped at the provider boundary, and the P-S2 row filter is proven by unit tests + the direct-seed smoke) and forced redelivery (cannot be triggered on demand; dedup is proven by the direct-seed smoke's re-send step).

### Option sources
Exercised live via the real resolvers with the connected integration (refreshAndRetry path).

| Source | Result | Notes |
|---|---|---|
| asana:workspaces | PASS | 1 workspace, label = workspace name |
| asana:projects (workspace cascade) | PASS | requiredDeps workspaceId honored; 1 project listed |
| asana:users (workspace cascade) | PASS | labels are NAMES ONLY - 0 labels contained "@" (no email exposure) |
| asana:tasks (project cascade) | PASS | requiredDeps projectId honored; 3 tasks listed |

### Cleanup
- Test tasks created: 6 total (write-smoke create/update/complete setups, live-trigger task, events-repro task) - ALL completed (archive disposition; Asana ships no delete-task action in this slice). They remain, crsmoke-marked and completed, in "Marcus's first project".
- Test comments created: 1 crsmoke comment on the pinned smoke task ("Task 1") - remains (no delete-comment action); intentional documented artifact.
- Webhooks cleaned up: 2/2 deleted via the real deactivation path, each proven gone by a second DELETE reading 404. No Asana webhooks remain.
- Remaining artifacts: completed crsmoke tasks + 1 crsmoke comment (above); smoke workflow rows soft-deleted; webhook_event_dedup rows for the live test events deleted.

### Remaining limitations
- ~~Production runs the pre-fix dedup key~~ RESOLVED 2026-07-04: v2-main pushed to 64795582a, deployed, and the live retest showed exactly one run per trigger with the timestamp-free eventId format produced by the production route.
- Wrong-project live drop and live forced redelivery remain the only unproven-live behaviors (cannot be produced with a single-project workspace / on-demand); each is covered by unit tests + the direct-seed dev smoke.

### Deploy-gated retest (2026-07-04, post-deploy)
| Trigger | Runs | Terminal | eventId format | Webhook cleanup |
|---|---|---|---|---|
| new_task_in_project | exactly 1 | succeeded | timestamp-free (fix live) | deleted, second delete 404 |
| task_updated_in_project | exactly 1 | succeeded | timestamped (by design) | deleted, second delete 404 |

Retest artifact: one crsmoke task created in the smoke project, completed at the end (archive disposition); its dedup rows removed; both smoke workflows soft-deleted; no Asana webhooks remain.

---

# ASANA-2 owner setup (2026-07-06)

## Status
- Code status: code-complete owner setup required
- Commit: local only on v2-main (see git log for `feat(asana)` ASANA-2, 2026-07-06)
- Push status: NOTHING pushed
- Smoke status: mocked-boundary suites green (155 Asana unit tests across 14 suites; 802 smoke-seed tests). LIVE: `list_tasks_in_project` PASSED the workflow-live sweep same-day (held tasks:read — no re-consent needed for it). `create_subtask` write smoke + all 3 new triggers await owner setup + deploy.
- Remaining owner action: 3 steps below.

## What ASANA-2 adds
- Triggers: `task_completed`, `task_assigned` (both ride on already-granted scopes), `comment_added_to_task` (needs the NEW `stories:read` scope for its story post-fetch).
- Actions: `create_subtask` (held tasks:write), `list_tasks_in_project` (held tasks:read).
- No new env vars. No new webhook URLs (same `/api/webhooks/asana` route). No DB migrations.

## Owner steps (in order)

1. **Asana developer console** (https://app.asana.com/0/my-apps → the ChainReact app →
   OAuth → Permission Scopes): add **`stories:read`** to the granted scope set.
   That is the ONLY console change. (If the app is on the "Full permissions" fallback
   toggle instead of granular scopes, nothing to change.)
2. **Deploy**: push/deploy v2-main containing the ASANA-2 commit. The new trigger receive
   paths and actions must exist on the deployment that receives webhook events — activating
   a new trigger before deploy will register a webhook whose deliveries hit a route that
   drops the events (unknown eventType quiet-ack). Scope order does not matter; deploy
   before reconnect is the safe sequence.
3. **Re-consent**: RECONNECT Asana from the Apps page for every connected user
   (practically: the smoke account). Asana only attaches newly-granted scopes on a fresh
   consent. Until re-consent, `comment_added_to_task` activates (webhooks:write is held)
   but its story post-fetch 403s and events are dropped with a warn — the trigger will
   look armed but never fire. `task_completed` / `task_assigned` / both new actions work
   WITHOUT re-consent.

## Post-setup live certification (Phase 13) checklist
- [ ] `stories:read` added in the console
- [ ] v2-main ASANA-2 commit deployed
- [ ] Asana reconnected on the smoke account (consent screen shows the stories read grant)
- [ ] Live trigger cert: `task_completed` — activate, complete a task in the smoke project, exactly ONE run, plain edit fires nothing, DELETE /webhooks 404-proven
- [ ] Live trigger cert: `task_assigned` — assign fires with the new assignee gid/name; unassign fires NOTHING; optional assignee filter narrows; cleanup proven
- [ ] Live trigger cert: `comment_added_to_task` — comment fires with truncated text + author display name; a non-comment story (e.g. completion story) fires nothing; cleanup proven
- [ ] Live write smoke: `create_subtask` (`npm run smoke:writes:live` scope-filtered, or the write batch) — needs `SMOKE_ASANA_TASK_ID` as the parent
- [x] Live read smoke: `list_tasks_in_project` — PASSED 2026-07-06 via the workflow-live sweep (recorded in certificationSeed)
- [ ] Flip the 3 trigger seed rows from NOT_RUN to LIVE_PASS and `create_subtask` to its LIVE_PASS_* status; update the matrix pins in `tests/unit/smoke-actions/certification-seed-split.test.ts`

## ASANA-2 known limitations (by design, documented)
- `task_completed` does not re-fire if a task is un-completed and re-completed within the 7-day dedup TTL (timestamp-free task-scoped key).
- `task_assigned` does not re-fire when the SAME user is re-assigned to the same task within the TTL (A → B → A collapses the second A); a DIFFERENT assignee always fires.
- Unassignment never fires `task_assigned`.
- Comment text is plain `text` truncated to 4,000 chars; author is gid + display name (never email). HTML comments are not rendered.
- Post-fetch drops (task/story deleted between event and fetch; dead credential) are quiet by design — never dispatch what we can't verify.
- Sections: VERIFIED BLOCKED under granular scopes (see Known blockers above); `add_task_to_section` intentionally not shipped.
