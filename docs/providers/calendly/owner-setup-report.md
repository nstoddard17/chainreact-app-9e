# Calendly Owner Setup Report

Slice 5.CALENDLY-1, 2026-07-04. Phase 13 live certification 2026-07-05.

## Status
- Code status: **live-complete** (Phase 13 PASSED 2026-07-05 — see "Live
  verification" below)
- Commit: `e10d3dcbd` (slice, pushed 2026-07-04) + the Phase 13 evidence
  commit (local)
- Push status: slice pushed 2026-07-04 (Marcus-approved); Phase 13
  evidence commit **local, not pushed**
- Smoke status: direct-seed trigger smoke PASSED against the real dev DB
  (2026-07-04), AND full provider-boundary live certification PASSED in
  production (2026-07-05).
- Remaining owner action: **none** (push/deploy of the Phase 13 evidence
  commit is Marcus's call; the corrected meta wording ships with it).

## Live verification (Phase 13, 2026-07-05 — production)

Environment: production (`https://chainreact.app`), deployed slice commit,
live Calendly account (webhook-capable plan), activation driven from the
local repo with `NEXT_PUBLIC_APP_URL=https://chainreact.app` (shared
Supabase — Asana/Typeform pattern). Drivers:
`scripts/trash/calendly-live-cert.ts` (phases: list-event-types → activate
→ await-scheduled/await-canceled → status → deactivate) and
`scripts/trash/calendly-live-book.ts` (Playwright, headed Chrome — the
public booking page rejects headless Chromium).

| Check | Result |
|---|---|
| OAuth | PASS — 1 active production row, exactly the 4 requested scopes echoed, user/org URIs persisted in account metadata; no tokens logged/browser-visible |
| Token refresh + rotation | PASS — stored token was expired; first call refreshed via the dispatcher, rotated pair persisted and live-usable for every subsequent call |
| `calendly:event_types` option source | PASS — real event type listed (UUID value, name label), q-filter works, no URIs/tokens/emails in items |
| Trigger activation | PASS — 3 real `POST /webhook_subscriptions` (scope `user`, per-node production URLs); `subscriptionUri` persisted; signing key stored ENCRYPTED (plaintext-shape check) |
| Real booking → `event_scheduled` | PASS ×3 — each booking fired EXACTLY ONE run, terminal `succeeded` via production cron; payload bounded, embedded scheduled_event populated, no raw API URIs; dedup key subscriber-scoped + timestamp-free |
| Real cancellation → `event_canceled` | PASS ×3 — each cancellation fired EXACTLY ONE run, terminal `succeeded`; `cancellation {canceledBy, reason, cancelerType}` populated; true cancel carried `rescheduled: false` |
| Reschedule | OBSERVED live — canceled half: `rescheduled: true` + `newInviteeId` set; NEW-booking half: `rescheduled: false` + `oldInviteeId` set. Trigger design is honest and branchable; no synthetic rescheduled trigger needed. Meta wording corrected (the new half is identified by `oldInviteeId`, not the flag) |
| Event-type filter (P-S2) | PASS both directions — matching filter fired on every booking; a mismatch-filter workflow (own real subscription) stayed at 0 runs across all 3 bookings |
| Dedup / retry / replay | Not live-forceable (no delivery failed; no duplicate arrived). Redelivery dedup remains certified by the direct-seed smoke + unit tests. Retry re-signing UNVERIFIED → the 24h replay tolerance stays, dedup is the effective replay guard |
| Deactivation | PASS — all 3 subscriptions DELETEd; second DELETE returned 404 for each (provider-side gone-proof); 0 trigger rows left |
| Cleanup | All 3 test bookings canceled (calendar clean); 3 cert workflows soft-deleted; 6 dedup rows removed; no provider-side artifacts remain except Calendly's own booking/cancellation history + notification emails for the crsmoke meetings (inert) |

Certification recorded as LIVE_PASS for both triggers in
`tests/trigger-smoke/triggerCertificationSeed.ts`. Live quirks appended to
`research.md` ("Live-observed behavior").

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
   activate the triggers (humanized error ships). This gates END USERS;
   the Phase 13 certification itself is DONE (2026-07-05, webhook-capable
   account).
2. **Replay window stays generous (24h)** — Phase 13 could not observe
   retry re-signing (no delivery failed during the window); dedup is the
   effective replay guard (same posture as Asana/Typeform). Tighten only
   with provider evidence that retries are re-signed.
3. Reschedules fire BOTH triggers by design. Live-observed: branch on
   `rescheduled` for the canceled half, on `oldInviteeId` for the new
   booking half (the new half carries `rescheduled: false`).
4. Organization-scoped subscriptions (all-member events) are out of
   scope this slice (personal credential class).
