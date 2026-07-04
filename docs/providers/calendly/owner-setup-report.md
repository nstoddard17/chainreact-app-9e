# Calendly Owner Setup Report

Slice 5.CALENDLY-1, 2026-07-04.

## Status
- Code status: **code-complete; owner setup required**
- Commit: see git log (`feat(calendly): net-new provider slice 1`) — local, not pushed
- Push status: **Nothing pushed**
- Smoke status: direct-seed trigger smoke **PASSED against the real dev DB**
  (both triggers: 1 run each, terminal `succeeded`, dedup held, cleaned).
  Provider-side lifecycle (POST/DELETE /webhook_subscriptions) is
  unit-tested; live proof is Phase 13.
- Remaining owner action: create the Calendly developer app, set env vars,
  connect, and run Phase 13 live certification **with a paid or trial
  Calendly account** (webhooks are plan-gated).

## Provider developer portal setup

### App/basic settings
- Portal: https://developer.calendly.com → sign in with a **Calendly
  developer account** (separate from the Calendly user account; GitHub or
  Google sign-in) → Console: https://developer.calendly.com/console/apps
  → "Create New App".
- App name: ChainReact (owner's choice)
- App type / client kind: **Web** (confidential client)
- Environment: Calendly separates **Sandbox** and **Production** apps —
  create a Sandbox app first for testing (allows `http://localhost`
  redirect URIs), and a separate Production app for the deployed app
  (HTTPS redirect URIs only). Each app has its own client id/secret.
- **The client secret (and an app-level webhook signing key) are shown
  ONLY at app creation — copy the client id + secret immediately.** (V2
  does not use the app-level signing key; our webhook signatures use
  per-subscription keys V2 mints itself. The console will still show
  one — you can ignore it.)
- Notes: no review/approval process is documented for basic OAuth usage.

### Redirect URIs
- Local: `http://localhost:3000/api/integrations/oauth/calendly/callback`
  (Sandbox app only)
- Preview/Vercel: `https://<preview-domain>/api/integrations/oauth/calendly/callback`
- Production: `https://<production-domain>/api/integrations/oauth/calendly/callback`
- Exact callback path: `/api/integrations/oauth/calendly/callback`

### Webhook URLs
- **No portal webhook configuration is needed.** Calendly webhook
  subscriptions are created programmatically by trigger activation
  (`POST /webhook_subscriptions`) and deleted on deactivation — nothing
  to register in the developer console.
- Receive route (for reference / firewall allowances):
  `https://<domain>/api/webhooks/calendly` (per-node
  `?workflowId=&nodeId=` query params are appended automatically).
  Calendly requires a public **HTTPS** URL — local trigger activation
  needs a tunnel or the deployed route (Asana pattern:
  `CALENDLY_WEBHOOK_URL` / `NEXT_PUBLIC_APP_URL` pointing at the
  deployed app).
- Events subscribed programmatically: `invitee.created`,
  `invitee.canceled` (one per trigger node, scope `user`).
- Signature secret location: minted per subscription by V2 at
  activation, stored encrypted on the trigger row
  (`trigger_resources.config.hookSecretEncrypted`). No env var.

### OAuth scopes
Request these for the app (Calendly's granular scopes — **newly created
apps get NO API access until scopes are requested**; select them at app
creation):

| Scope | Required? | Used by | Why |
|---|---:|---|---|
| `users:read` | yes | connect + activation + options | `GET /users/me` identity; user/org URIs for subscription creation |
| `event_types:read` | yes | `calendly:event_types` option source | event-type filter picker |
| `scheduled_events:read` | yes | webhook payloads | Calendly requires the event family's read scope to receive `invitee.*` payloads |
| `webhooks:write` | yes | trigger activation/deactivation | `POST` / `DELETE /webhook_subscriptions` |

### Provider-specific settings
- Token rotation: **single-use rotating refresh tokens** (enforced by
  Calendly for all integrations by 2026-08-31). V2 persists the rotated
  token on every refresh — no owner action.
- PKCE: S256, implemented (Calendly directs PKCE for all app types).
- Webhook signing: per-subscription `signing_key`, V2-minted — no owner
  action.
- Event subscriptions: programmatic — no owner action.
- Marketplace/review steps: none required for private use.
- Test-user requirements: **webhooks require a paid Calendly plan
  (Standard/Professional/Teams/Enterprise) on the CONNECTING user's
  Calendly account.** A free account can connect via OAuth but trigger
  activation will fail with a humanized error. Use a paid seat or a
  Calendly **trial** account for live certification (no dedicated
  sandbox tenant exists).
- Rate-limit notes: official numbers not machine-verifiable; V2 handles
  429 + Retry-After defensively.

## Vercel environment variables

| Env var | Required? | Local? | Preview? | Production? | Where used | Notes |
|---|---:|---:|---:|---:|---|---|
| `CALENDLY_CLIENT_ID` | yes | yes | yes | yes | `integrations/calendly/oauth.ts` | from the developer console app |
| `CALENDLY_CLIENT_SECRET` | yes | yes | yes | yes | `integrations/calendly/oauth.ts` | shown ONCE at app creation |
| `CALENDLY_AUTH_BASE` | no | e2e only | no | no | oauth.ts | test override; defaults to `https://auth.calendly.com` |
| `CALENDLY_API_BASE` | no | e2e only | no | no | API wrappers | test override; defaults to `https://api.calendly.com` |
| `CALENDLY_WEBHOOK_URL` | no | tunnel/live-cert only | no | no | notification URL helper | override when local activation must register the deployed/tunnel route |

Redeploy after adding env vars.

## Supabase / database setup
- Migrations added: **none** (reuses `trigger_resources`,
  `webhook_event_dedup`, `integrations` — no new tables).
- db:push run: n/a.
- RLS/policy notes: none — no schema changes.
- Storage bucket notes: none.
- Cron notes: none — Calendly subscriptions don't expire; the renewal
  cron never touches these rows.

## Actions shipped
| Action | Handler | Schema | Metadata | Options | Unit tests | Smoke |
|---|---|---|---|---|---|---|
| (none this slice — deliberate; the invitee payload embeds the scheduled_event, so no read action is needed. `capabilities.actions: false`.) | — | — | — | — | — | — |

## Triggers shipped
| Trigger | Webhook/Polling | Lifecycle | Config | Unit tests | Smoke |
|---|---|---|---|---|---|
| `calendly:event_scheduled` ("Meeting Scheduled", invitee.created) | Webhook (user-scoped subscription) | activate: POST /webhook_subscriptions with V2-minted signing key; deactivate: DELETE (best-effort); no renewal | optional `eventTypeId` filter (`calendly:event_types`) | activate/deactivate/normalize/receive/route/signature/filter suites — pass | direct-seed dev smoke PASSED (1 run, succeeded, dedup held, cleaned) |
| `calendly:event_canceled` ("Meeting Canceled", invitee.canceled) | Webhook (user-scoped subscription) | same shared lifecycle | same | same suites — pass | direct-seed dev smoke PASSED |

Option source: `calendly:event_types` (values = event-type UUIDs, labels =
names; personal-credential gated centrally).

## Manual verification checklist for Marcus
- [ ] Create the Calendly developer account + app (Sandbox first;
      Production app when deploying) and select the 4 scopes.
- [ ] Add redirect URI(s) for each environment.
- [ ] Copy client id + secret at creation (secret shown once).
- [ ] Add `CALENDLY_CLIENT_ID` / `CALENDLY_CLIENT_SECRET` to Vercel
      (and `.env.local` for local).
- [ ] Redeploy after env changes.
- [ ] Connect Calendly from the Apps page (works on any plan).
- [ ] Ensure the connected Calendly account is on a **paid or trial
      plan**, then activate a workflow with each trigger (creates the
      real subscriptions).
- [ ] Book a test meeting → exactly one `event_scheduled` run; cancel it
      → exactly one `event_canceled` run; reschedule one → confirm the
      canceled(rescheduled:true) + scheduled pair.
- [ ] Deactivate → confirm the subscription is deleted (Phase 13
      documents the gone-proof).

## Known blockers / limitations
1. **Paid-plan webhook gate** — free-plan Calendly accounts cannot
   activate the triggers (humanized error ships). Live certification
   requires a paid/trial account. Owner: Marcus.
2. **Replay window is generous (24h)** pending Phase 13 observation of
   whether Calendly re-signs retried deliveries; dedup is the effective
   replay guard (same posture as Asana/Typeform).
3. Reschedules fire BOTH triggers by design (documented in the trigger
   descriptions; `rescheduled` flag lets workflows branch).
4. Organization-scoped subscriptions (all-member events) are out of
   scope this slice (personal credential class).
