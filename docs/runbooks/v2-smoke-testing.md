# Runbook — ChainReactV2 Smoke Testing

**Purpose:** a repeatable pre-/post-deploy verification contract for the V2 app.
Covers what to run, what to click, what to capture, and what counts as pass/fail.
Use this before promoting `v2-main` and after any deploy.

> This runbook is the operational companion to the readiness arc. Coverage gaps,
> the automation that exists today, and the prioritized "next automation" list are
> recorded in
> [`docs/slices/phase-4/readiness/v2-ready-3-smoke-checklist.md`](../slices/phase-4/readiness/v2-ready-3-smoke-checklist.md).

---

## 0. What automated smoke already exists (don't re-do it by hand)

Playwright smoke suite at [`tests/smoke/`](../../tests/smoke), config
[`playwright.smoke.config.ts`](../../playwright.smoke.config.ts), run via
`npm run smoke:prod`. It targets a **deployed origin** (no local dev server, no
provider mocks). Three projects:

| Project | Spec(s) | Credentials | What it proves |
|---|---|---|---|
| `public` | `public.smoke.spec.ts` | none | Marketing home, all `/auth/*` pages, recovery redirect, and protected routes (`/workflows /runs /templates /apps /account /team`) redirect to sign-in. No 500 / RSC-crash marker on any page. |
| `auth-setup` | `auth.setup.ts` | `PRODUCTION_SMOKE_EMAIL` + `PRODUCTION_SMOKE_PASSWORD` | Signs in once, caches storage state. Absent creds → writes empty state and **skips** (does not fail). |
| `authenticated` | `authenticated-shell`, `builder`, `slack-action` | reuses cached session | Dashboard + account switcher render; account billing usage (used/limit/remaining/reset); runs/templates/apps pages; apps catalog renders provider cards; builder create→add nodes→configure→save→reload→(manual run)→cleanup; Slack action build→pick-channel-by-name→(post)→Succeeded→cleanup. |

**Env contract** (sourced from shell / CI secret store, never hardcoded —
[`tests/smoke/helpers/env.ts`](../../tests/smoke/helpers/env.ts)):

- `PRODUCTION_SMOKE_BASE_URL` — default `https://chainreact.app`.
- `PRODUCTION_SMOKE_EMAIL` / `PRODUCTION_SMOKE_PASSWORD` — authenticated smoke; absent → authed specs skip.
- `PRODUCTION_SMOKE_PREFIX` — disposable-workflow name prefix (default `Smoke Test`). **Cleanup only ever deletes a workflow whose name starts with this prefix.**
- `PRODUCTION_SMOKE_RUN_EXECUTION=true` — **opt-in** to real external side effects (the builder's HTTP request, the Slack post) + task-quota spend. Default OFF → build/config/readiness still run, nothing is sent.
- `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME` — target channel for the Slack action smoke (by visible name, e.g. `general`). Absent → Slack smoke self-skips. A channel name alone never posts — posting additionally needs `RUN_EXECUTION=true`.

**Artifacts:** HTML report at `playwright-report/smoke/`; a **sanitized** JSON
artifact at `artifacts/mcp/smoke-latest.json`
([`mcpSmokeArtifactReporter.ts`](../../tests/smoke/mcpSmokeArtifactReporter.ts) →
[`sanitizeSmokeArtifact.ts`](../../tests/smoke/helpers/sanitizeSmokeArtifact.ts)) —
carries category/title/status/duration/error-class/step-label/attachment-basenames
only; never raw error messages, URLs, paths, posted text, channel names, or
token-shaped values.

> **Local e2e is separate.** [`playwright.config.ts`](../../playwright.config.ts) +
> `tests/e2e/` spin a local dev server with mocked provider backends (Slack, Google,
> Microsoft, Notion, Airtable, Stripe, Shopify, HubSpot, GitHub, Mailchimp, Trello).
> Run with `npm run test:e2e`. That suite is for provider-walkthrough proofs against
> mocks, **not** production smoke. CI runs **neither** smoke nor e2e today (no test
> Supabase project) — see CI note in §6.

---

## 1. Local smoke (pre-push, on a dev build)

Fast confidence that the build and core surfaces are intact before pushing.

1. `npm run typecheck` → 0 errors.
2. `npm run lint` → 0 errors. `npm run lint:structure` if files were added/moved.
3. `npm test` (focused suite for what changed; full `npx jest` for a release cut).
4. `npm run dev`, then by hand: home loads, `/auth/sign-in` loads, sign in, `/workflows`
   renders the dashboard + account switcher, open the builder for any workflow.
5. Optional but recommended for a release cut: `npm run test:e2e` (mocked providers) —
   proves the builder + at least one provider action/trigger walkthrough end-to-end.

**Pass:** all checks green; manual surfaces render with no console 500 / RSC crash.
**Fail:** any typecheck/lint/test failure, any blank/500 page, account switcher missing.

---

## 2. Production smoke (post-deploy)

Run against the deployed origin. **Read-only by default** — execution stays off
unless you explicitly opt in.

```bash
# Always-safe: public + authed-shell + builder build/config/save (no external sends)
PRODUCTION_SMOKE_BASE_URL=https://chainreact.app \
PRODUCTION_SMOKE_EMAIL=… PRODUCTION_SMOKE_PASSWORD=… \
npm run smoke:prod
```

Without creds you still get the full `public` project (redirects + no-500). With
creds you additionally get the authenticated shell + the builder authoring loop up
to save/reload (no run). This is the default post-deploy gate.

**Pass:** `public` all green; `auth-setup` signs in (or cleanly skips if you ran
creds-less); `authenticated` shell + builder build/config/save/reload green; no
server-error marker anywhere.
**Fail:** any redirect missing, any 500/RSC marker, sign-in fails, builder can't
create/configure/save, or a smoke workflow is left behind (cleanup is prefix-guarded
and best-effort; a leftover `Smoke Test …` workflow is a fail signal).

---

## 3. After-auth / OAuth smoke (manual — not automated)

Real OAuth round-trips are **not** in the automated smoke (no provider creds held by
the harness, by design). Do these by hand after a deploy that touched auth, OAuth, or
a provider:

1. Sign in with email/password → lands on `/workflows`.
2. Sign in with Google (the social button) → lands authenticated.
3. `/apps` → Connect a provider (e.g. Slack) → complete the real OAuth consent →
   returns to `/apps` with that card showing **connected**.
4. Reconnect: from a connected card, use Reconnect → re-consent → still connected.
5. Disconnect: disconnect the card → it returns to the available/disconnected state;
   confirm no other account's connection changed.
6. Account switch: open the account switcher → select a Team account → page reloads →
   the workflows/apps lists are now scoped to that account (different set than Personal).

**Capture:** a screenshot of the Apps page before/after connect, and the provider
card's connected state. **Pass:** card reaches connected; reconnect/disconnect move
the state correctly; switch re-scopes the lists. **Fail:** card stuck on a stale
state, OAuth callback 500, or a switch that doesn't re-scope.

---

## 4. Workflow execution smoke (opt-in — real side effects)

Only when verifying the execution path end-to-end on production. Gated behind a
single switch so a normal smoke never spends quota or posts anything.

```bash
PRODUCTION_SMOKE_BASE_URL=https://chainreact.app \
PRODUCTION_SMOKE_EMAIL=… PRODUCTION_SMOKE_PASSWORD=… \
PRODUCTION_SMOKE_RUN_EXECUTION=true \
PRODUCTION_SMOKE_SLACK_CHANNEL_NAME=general \
npm run smoke:prod
```

This permits the builder smoke's HTTP `GET https://example.com` run and the Slack
smoke's real `chat.postMessage`. Both create a disposable `Smoke Test …` workflow,
run it, assert a run appears (builder) / **Succeeds** (Slack) on `/runs`, then delete
the workflow.

**Pass:** the run reaches a terminal status visible on `/runs` (builder: any
terminal; Slack: Succeeded), and the disposable workflow is deleted.
**Fail:** run never leaves `running` (orphaned-run regression — cross-check the
stale-run sweep cron), Slack run Failed, or cleanup left the workflow behind.

> Manual companion for execution surfaces the automation doesn't assert: open a
> **run detail / logs** view for a completed run and confirm per-step status + the
> sanitized error surface (no raw identifiers in step errors — the V2-READY-2
> guarantee).

---

## 5. Team permissions & connection-sharing smoke (manual — not automated)

No automated coverage today (needs multi-user/team fixtures — see follow-ups). For a
deploy touching membership, sharing, or account scope, verify by hand with two test
users:

1. As a Team **owner/admin**: `/team` lists members; invite (copy-link), change a
   role, remove a member — each reflects in the roster.
2. As a Team **member** (non-admin): `/team` shows the roster but no invite/manage
   controls.
3. **Shared (account) connection** (Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp): an
   account-class connection is usable by another member's workflow run.
4. **Private (personal) connection** (everything else): a personal-provider step
   resolves to the workflow **creator's** credential, never silently to a co-member's.
   A member without their own connection cannot run a personal-provider step as someone
   else.

**Pass:** role gating holds; account connections shareable; personal connections never
cross members. **Fail:** any control visible to a member who shouldn't have it, or any
personal credential resolving across members.

---

## 6. No-leak smoke (manual spot-check + automated artifact)

- The sanitized MCP artifact (`artifacts/mcp/smoke-latest.json`) is the automated
  guard — its unit tests pin that no raw error/url/path/token/channel leaks. Spot-check
  it after a smoke run.
- Manual: trigger a failing run (e.g. a misconfigured node) and open run detail →
  confirm the step error is human-readable with **no raw identifiers / tokens / internal
  ids** (V2-READY-2). Confirm a non-member cannot infer another account's resources
  (404 / empty, never a leak).

**Pass:** artifact carries only the allowlisted fields; run-detail errors are
sanitized; cross-account probes return 404/empty. **Fail:** any token/url/path/raw
identifier in an error surface or the artifact.

---

## 7. What to capture per smoke run

- Pass/fail of each Playwright project (`public` / `auth-setup` / `authenticated`).
- The HTML report (`playwright-report/smoke/`) on any failure (traces retained on
  failure; screenshots only-on-failure).
- The sanitized JSON artifact (`artifacts/mcp/smoke-latest.json`).
- For manual steps: a screenshot of the Apps page connected state, the `/runs` row
  reaching terminal, and any run-detail error surface checked for no-leak.
- The base URL, whether `RUN_EXECUTION` was on, and which provider channel (if any)
  was targeted.

---

## CI note

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs typecheck + lint +
`lint:structure` + `lint:migrations` + `npm test` only. It runs **neither** the
smoke suite **nor** the e2e suite (no test Supabase project; pointing CI at production
is unsafe). It also currently triggers on `v2-foundation`, while active work is on
`v2-main` — confirm the trigger gates the working branch. Standing up a test Supabase
project unblocks a CI smoke/e2e job (secrets enumerated in the ci.yml header).
