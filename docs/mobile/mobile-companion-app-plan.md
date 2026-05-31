# ChainReactV2 — Mobile Companion App Plan (Expo / React Native)

> **Status: deferred.** To be reattacked once the web version is closer to finished. This is a scoping + readiness plan, not an immediate implementation.

## Context

ChainReactV2's valuable logic — the workflow engine, 26 provider integrations, OAuth, triggers, billing — already lives server-side (Next.js API routes + Supabase RPCs) and every user-facing table is RLS-scoped. That makes a mobile **companion** app feasible without rebuilding the engine. The companion app is *not* a port of the workflow builder (the `@xyflow/react` node canvas is web-only and a poor touch experience) — it is a narrower client for **monitoring runs, controlling workflows, and receiving push alerts** on the go.

The first version must feel like a true **incident-response companion**, not a read-only dashboard. The signature flow: *a workflow fails → the user is alerted immediately → taps the push → sees the run/error → pauses/resumes/disables/reruns from the phone.* Push is what makes mobile feel necessary, so it ships in v1 — but scoped tightly so it doesn't become a notification platform.

**v1 scope (confirmed):**
1. Monitor — workflow list, run history, run detail/steps, failure classification
2. Control — activate / pause / resume / disable / run-now (with confirmation handling)
3. Push — native APNs/FCM notifications for **workflow failures + already-existing critical notification events only**
4. In-app notifications feed
5. Push tap → deep-link to run detail or notification detail

**Push kept deliberately narrow in v1:** failures + existing critical events only — **no** preference center, **no** alert rules, **no** marketing/product-update pushes, **no** rich push actions, **no** HITL approval pushes (HITL doesn't exist in the backend yet).

**Explicitly out of v1:** workflow authoring/builder, integration OAuth reconnect (deferred — mobile OAuth redirect handling is non-trivial), HITL approvals (no backend feature yet).

## Core architectural decision — Hybrid data access

The mobile app uses **two paths**, chosen per operation:

- **Safe reads + realtime + auth → native Supabase SDK directly.** Workflow list, run *summaries*, and `notifications` are RLS-scoped by `auth.uid()` / `account_id`; the native SDK authenticates with a Supabase JWT and reads/subscribes directly — no web-API changes needed for these.
- **Sensitive reads + all mutations → existing Next.js API routes.** Run *detail* (`steps[].output`, trigger event payloads) and integration health must go through the API or a safe view — **not** raw tables (see security guard). Mutations (activate/pause/resume/disable/run-now) contain server-side business logic (state transitions, billing, confirmation gating) that must not be duplicated client-side. These routes are currently **cookie-only** and need a small bearer-token shim (A1).

### Security guard — safe read surfaces only (mandatory)
Direct SDK reads bypass any server-side redaction, so the mobile read surface must be vetted before shipping:
- **Never expose** integration tokens, provider secrets, raw OAuth metadata, or sensitive provider payloads to the device.
- **Run detail is redacted at the API layer today** — `GET /api/workflows/[id]/runs/[runId]` applies "output redaction per sensitive metadata." A raw `workflow_runs` SDK read of `steps[].output` would leak the *unredacted* payload. → **Run detail / step outputs go through the API route (or a dedicated redacted view), never the raw table.** Run *list/summary* fields (id, status, timestamps, error classification) are safe for direct SDK read.
- **Integration health** (if surfaced) reads from a **safe view / read model** (provider id, display name, health status, expiry flag) — never the full `integrations` row that holds encrypted tokens.

Net effect: workflow list, run summaries, and notifications read straight from Supabase; run detail + integration health + the ~5 action endpoints go through the API (and the auth shim).

---

## Workstream A — Backend prep (in the ChainReactV2 web repo)

These land in the web repo *before or alongside* the mobile build. They are additive and don't disturb the web client.

### A1. Bearer-token support in `requireUser()`
**File:** `app/api/providers/_shared.ts` (the shared auth gate used by all routes).
- Today it calls `supabase.auth.getUser()` which reads cookies only.
- Extend: if no cookie session, read `Authorization: Bearer <JWT>`, verify with `supabase.auth.getUser(jwt)` (admin client), and resolve the same account scope.
- Cookie path stays the default for the web client — purely additive.
- Apply to the action routes the mobile app calls: `activate`, `pause`, `resume`, `disable`, `run-now`, plus `GET /api/runs`, `GET /api/workflows/[id]/runs/[runId]` (if the app reads run detail via API rather than direct SDK).
- Mirror V1's pattern: `auth.getUser(jwt)` with a token argument uses the admin client and is not browser-lock-bound (see V1 CLAUDE.md auth notes).

### A2. Notifications read path
Notifications are currently **server-actions only** (`app/notifications/actions.ts`) — no REST GET.
- **Preferred:** mobile reads the `notifications` table **directly via the native Supabase SDK** (RLS already filters by `user_id`). No new endpoint required.
- Add only `markRead` / `markAllRead` as a thin REST route **or** call the table UPDATE directly via SDK (RLS-protected). Keep parity with the existing server actions' behavior.

### A3. Push delivery infrastructure (new)
- **New migration:** `notification_subscriptions` (or `device_tokens`) table — `(user_id, account_id, platform, token, created_at)`, RLS-scoped, with explicit `GRANT`s per V2 migration convention. Add via `npm run db:push` / `scripts/db-push.mjs`.
- **New endpoint:** `POST /api/notifications/register-device` (bearer-authed via A1) for the app to register/refresh its APNs/FCM token.
- **Delivery hook:** the engine already inserts into `notifications` on failed runs via its `notifyOnFailedRun` service. Add a delivery step there (or a Supabase DB webhook / Edge Function on `notifications` INSERT) that looks up the user's device tokens and pushes via **Expo Push API** (simplest — wraps both APNs + FCM) or direct APNs/FCM.
- Keep delivery idempotent and fire-and-forget so it never blocks run finalization.

### A4. Realtime enablement
- No realtime is used today (zero `.channel()` usage). Enable the Supabase **realtime publication** on `workflow_runs` and `notifications` so the native SDK can subscribe.
- Verify RLS covers realtime (Supabase enforces RLS on realtime when configured) so a device only receives its own account's rows.
- Realtime payloads for `workflow_runs` should carry **summary columns only** (status, timestamps, error classification) — same safe-field constraint as A4b. Keep redacted/output fields out of the realtime row.

### A4b. Safe integration-health view (only if integration health is surfaced)
- The `integrations` table holds encrypted tokens + OAuth metadata and must never reach the device.
- If v1 shows integration health, add a **read-only view / read model** exposing only `(provider id, display name, health status, expiry flag)`, RLS-scoped, with explicit `GRANT`s. Mobile reads the view, never the base table.

### A5. Publish shared contracts
- `contracts/` already holds the Zod schemas (`workflow.ts`, `triggerEvent.ts`, `integration.ts`, `actionMeta.ts`, run/notification shapes via `repositories/`).
- Make these consumable by the mobile repo: either extract `contracts/` into a shared workspace package (monorepo/pnpm workspace) or publish as a private package. This gives the app end-to-end type safety on both the direct-SDK reads and the API mutations.

---

## Workstream B — Expo mobile app (new repo / workspace)

### B1. Project setup
- Expo (managed) + TypeScript + Expo Router. Add `@supabase/supabase-js` with React Native storage adapter (`AsyncStorage` + `aes` for secure token storage), `expo-notifications`, `expo-secure-store`.
- Consume the shared `contracts/` package from A5.
- Reuse `zustand` for state (same store patterns as web; logic is portable, UI is not).

### B2. Auth
- Supabase native SDK session (email/password to match the web's configured auth; add OAuth login later if web adds it).
- Persist the session token in secure storage; attach it as `Authorization: Bearer` on all calls to the web API (A1).

### B3. Screens (v1)
- **Workflows list** — direct SDK read of workflows (RLS-scoped), state chips (active/paused/disabled/draft), provider chips. Mirrors `GET /api/workflows` shape.
- **Run history** — per-workflow runs (`workflow_runs`) + an account-wide recent-runs feed (mirrors `GET /api/runs`). Direct SDK read + realtime subscription for live status.
- **Run detail** — steps[], trigger event, error classification, fatal error. **Read via `GET /api/workflows/[id]/runs/[runId]` (redacted), not the raw table** (security guard).
- **Controls** — activate / pause / resume / disable / run-now via the bearer-authed API routes (`app/api/workflows/[id]/activate` etc.). Handle the 409 "confirmation required" response from `activate` with a confirm sheet.
- **Notifications feed** — direct SDK read of `notifications`, mark-read, deep-link to the run via `action_url`.
- **Push tap routing** — a tapped failure push deep-links to run detail; a generic critical-event push deep-links to notification detail.

### B4. Realtime + push
- Subscribe to `workflow_runs` (INSERT/UPDATE, RLS-filtered) for live run status badges.
- Subscribe to `notifications` (INSERT) for in-app badge updates.
- Register the device token on login (A3 endpoint); render received pushes and route taps to the run/notification.

---

## Build order (when reattacked)

1. **Backend bearer-token auth shim** for mobile action routes (A1).
2. **Safe mobile read surfaces** — workflows, `workflow_runs` summaries, `notifications`, and a limited integration-health view if needed (A2, A4, A4b; vet against the security guard).
3. **Expo app foundation** — auth, workflow list, run history, run detail (B1–B3).
4. **Control actions** — activate/pause/resume/disable/run-now with confirmation handling (B3 controls).
5. **Push v1 infrastructure** (A3 + B4) — `notification_subscriptions`/`device_tokens` table, register-device endpoint, failed-run delivery hook, Expo Push API (or direct APNs/FCM), idempotent fire-and-forget delivery, tap deep-link to run detail.
6. **Realtime / in-app notification badge** updates, if RLS-safe and straightforward (A4 + B4).
7. **Full verification** on device/simulator.

A5 (contracts extraction) can happen first if a monorepo is set up; otherwise mirror schemas initially and extract later.

## Verification

- **A1:** unit-test `requireUser()` for (a) cookie session, (b) valid bearer token, (c) missing/invalid token → 401. Hit a protected route with a real Supabase JWT via `curl -H "Authorization: Bearer <jwt>"`.
- **A3/A4:** trigger a workflow failure in a test account → confirm a `notifications` row inserts, a realtime event fires to a subscribed client, and an Expo push is delivered to a registered device.
- **End-to-end (Expo):** log in on a device/simulator → see workflows + run history → pause/run-now a workflow and watch the run appear live via realtime → force a failure → receive push → tap to open run detail.
- Run existing web gates after backend changes: `npx tsc --noEmit`, `npm run lint`, `npm run lint:structure`, `npm run lint:migrations`, `npm test` (the device-token migration must pass `lint:migrations` RLS/GRANT checks).

## Open items to revisit at reattack time
- Confirm the web app's user-login auth providers (email/password confirmed; add OAuth login parity if web gains it).
- Decide monorepo vs separate repo for `contracts/` sharing.
- Integration OAuth reconnect on mobile (deferred from v1) — mobile OAuth redirect handling is non-trivial; scope when needed.
- HITL approvals — not implemented in backend yet; add to mobile only after the backend feature exists.
