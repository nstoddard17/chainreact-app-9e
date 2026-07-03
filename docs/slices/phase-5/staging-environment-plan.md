# ChainReactV2 Staging Environment Plan

**Type:** Planning / design only. No source, migrations, tests, UI, env files, Vercel,
Supabase, or Stripe dashboard changed by this doc. Nothing pushed, deployed, `db:push`-ed,
or applied to production.
**Date:** 2026-07-03
**Owner decision doc for:** MVP launch blocker #1 — "No staging environment" (see
[`mvp-launch-readiness-audit.md`](./mvp-launch-readiness-audit.md)).

> **Honesty boundary.** This plan is built from repo evidence only (env plumbing, OAuth
> redirect construction, cron config, db-push guard, smoke harness). It **cannot** verify
> anything that lives outside the code: the actual Vercel project/environment layout, which
> env vars are currently set where, provider-dashboard redirect allow-lists, current Stripe
> mode, or whether every migration is applied to the prod DB. Every such item is called out
> explicitly as "cannot verify from code — Marcus must confirm."

---

## Executive summary

**Recommendation: stand up one dedicated staging Supabase project + one dedicated staging
Vercel deployment (its own project on a `staging` branch → a staging domain), both wired to
Stripe test mode, before opening broader signups or taking live payments.**

The good news the code makes clear: **environment separation in ChainReactV2 is almost
entirely a configuration concern, not a code concern.** The app already funnels every
environment-sensitive URL through a single env var (`NEXT_PUBLIC_APP_URL`) and every
DB target through `POSTGRES_URL_NON_POOLING` + `NEXT_PUBLIC_SUPABASE_URL`, and the
`db:push` path is already guarded by a **relative** ref-match check (`check:db-target`)
that works for any project, not just prod. There is no hard-coded production project ref or
production URL in the runtime paths that matter. So a staging environment is mostly: a
second Supabase project, a second set of Vercel env vars, a second app URL, and staging
callback URLs registered in each provider dashboard.

The real work is operational and external (Supabase project creation, provider dashboard
redirect URIs, a Stripe test-mode webhook), plus a small amount of repo hardening (a staging
smoke target, a documented promotion flow, and making cron duplication safe). The smallest
safe version is achievable without touching the production project at all.

The single most important rule this plan enforces: **migrations debut on staging, never on
prod.** Today `npm run db:push` applies straight to `qcepijemjlkssfkvzlio`, which is both
dev and prod. After this plan, staging is the first target and prod is a deliberate,
verified second step.

---

## Current environment findings

What exists today, with file evidence.

### Vercel projects / environments
- Production deploys from branch **`v2-main`** → **`https://chainreact.app`**
  (`docs/slices/phase-4/v2-go-live-status.md:13-14`).
- **No separate staging/preview environment is documented anywhere in the repo.** The
  push posture in `CLAUDE.md:26-34` states plainly: "there is no separate staging
  environment yet" and "pushing to `v2-main` … DOES deploy to production."
- **Cannot verify from code:** whether a Vercel Preview environment or a second Vercel
  project already exists, and what env vars are set in each Vercel scope. Marcus must
  confirm from the Vercel dashboard.

### Supabase project usage
- **One** project, ref **`qcepijemjlkssfkvzlio`**, serves as **both dev and prod**
  (`v2-go-live-status.md:16`; audit `mvp-launch-readiness-audit.md:42-49`,65).
- Migrations are forward-only under `supabase/migrations/` and are applied via
  `npm run db:push` (see below), directly against that one project.
- Known other refs (from `scripts/lib/db-target.mjs:19-22`): `xzwsdwllmrnrgbltibxt`
  (V1 legacy) and `gyrntsmtyshgukwrngpb` ("unidentified third project, NOT confirmed as
  V2"). Neither is a staging project.

### Env var naming (the canonical set)
From `.env.example` and the code that reads it:
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- **Migrations / direct SQL:** `POSTGRES_URL_NON_POOLING` (port 5432, the one `db:push`
  uses), `POSTGRES_URL`, `POSTGRES_PRISMA_URL`. Invariant (`.env.example:9-16`): these
  MUST target the same ref as `NEXT_PUBLIC_SUPABASE_URL`.
- **Crypto:** `TOKEN_ENCRYPTION_KEY` (AES-256 token-at-rest, "DO NOT reuse the V1 key"),
  `OAUTH_STATE_SIGNING_KEY` (signed OAuth state), `ANON_AI_LIMIT_SIGNING_KEY` (anon AI cap
  cookie; falls back to `OAUTH_STATE_SIGNING_KEY`), `WATCH_CHANNEL_SECRET` (Google watch
  channel HMAC).
- **Cron:** `CRON_SECRET` (guards every cron route — see below).
- **Per provider:** `SLACK_CLIENT_ID/SECRET/SIGNING_SECRET`, `GOOGLE_CLIENT_ID/SECRET`,
  `MONDAY_*`, `DROPBOX_*`, `FACEBOOK_*`, plus the rest of the 26-provider set. Many carry
  E2e-only base-URL overrides that "default to real" in prod.
- **Stripe (platform billing):** `STRIPE_SECRET_KEY`, `STRIPE_BILLING_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_PRICE_{PRO,TEAM,BUSINESS}_{MONTHLY,ANNUAL}`.
  Separate from the workflow-provider Stripe integration (`STRIPE_CLIENT_ID/SECRET`).
- **App URL:** `NEXT_PUBLIC_APP_URL` (default `http://localhost:3000`).

### `NEXT_PUBLIC_APP_URL` — the master environment switch
This one var is the canonical public origin and drives nearly everything environment-
sensitive:
- **Every OAuth redirect URI.** Each provider builds its redirect from it, e.g.
  `integrations/slack/oauth.ts:52-55` → `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/slack/callback`.
- **The OAuth callback redirect base** (`app/api/integrations/oauth/[provider]/callback/route.ts:28-30`)
  — deliberately from the env, not `request.url`, so tunnels/proxies don't misdirect.
- **Stripe checkout `success_url`/`cancel_url` and portal `return_url`**
  (`services/billing/platformBillingSessions.ts` `appBaseUrl()`).
- **Webhook registration URLs** baked into provider dashboards: Dropbox
  (`${NEXT_PUBLIC_APP_URL}/api/webhooks/dropbox`, `.env.example:117-119`), Facebook
  (`.env.example:145-146`), Monday, and the Stripe billing endpoint.

Implication: set `NEXT_PUBLIC_APP_URL` to the staging origin and most redirect/return
behavior follows automatically. The gap is external: each provider dashboard must
**allow-list** the staging callback URL, or the round-trip 400s at the provider.

### OAuth callback URLs
- Single dynamic route: `app/api/integrations/oauth/[provider]/callback/route.ts` (all
  providers), plus the Supabase auth callback `app/auth/callback/route.ts`.
- Redirect URI pattern per provider: `${NEXT_PUBLIC_APP_URL}/api/integrations/oauth/<provider>/callback`.
- Token-ingest providers (e.g. Trello, per `docs/rules/token-ingest-auth.md`) use
  `app/integrations/token-ingest/[provider]/page.tsx` rather than an OAuth redirect.

### Stripe webhook endpoints
- **Platform billing:** `POST /api/webhooks/stripe-billing` — signature-verified over the
  raw body, public/unauthenticated by design, fail-closed if `STRIPE_BILLING_WEBHOOK_SECRET`
  is unset (`services/billing/stripeBillingWebhook.ts`; go-live checklist §5).
- **Workflow-provider Stripe:** `/api/webhooks/stripe` — separate account/credentials, must
  never be conflated with billing.
- One endpoint per Stripe **mode** (test vs live) with a mode-matched secret. Cross-mode
  secrets 400/500 every event.

### Cron routes
- `vercel.json` declares **9 crons** (poll-triggers, renew-watch-subscriptions,
  sweep-stale-runs, process-run-queue, release-expired-reservations, check-slack-health,
  run-scheduled-triggers, cleanup-workflow-files, evaluate-ops-alerts).
- Every cron route is guarded by `CRON_SECRET` / `requireCronAuth`.
- Vercel crons execute against the **production deployment of a given Vercel project**.
  A dedicated staging Vercel project therefore runs its **own** cron set against the
  staging DB — this is the cron-duplication risk to manage (see Risks).

### Smoke-test targets
- `npm run smoke:prod` (`playwright.smoke.config.ts`) targets a **deployed origin** via
  `PRODUCTION_SMOKE_BASE_URL`, **default `https://chainreact.app`**
  (`tests/smoke/helpers/env.ts:28-32`).
- Authenticated + execution smoke is env-gated (`PRODUCTION_SMOKE_EMAIL/PASSWORD`,
  `PRODUCTION_SMOKE_RUN_EXECUTION`, `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME`). Cleanup is
  prefix-guarded (`PRODUCTION_SMOKE_PREFIX`, default `Smoke Test`).
- The base URL is already parameterized, so pointing smoke at staging is a one-env change —
  **but the default is prod**, which is a footgun if someone runs execution smoke without
  overriding the base URL.

### Scripts that assume production
- `scripts/db-push.mjs` — reads `POSTGRES_URL_NON_POOLING` from `.env.local`, runs
  `echo y | npx supabase db push --db-url <url> --include-all`. It targets **whatever
  `.env.local` points at** — today that is the shared dev+prod project. Guarded by:
- `scripts/lib/db-target.mjs` `validateMigrationTarget()` — a **relative** guard: it only
  asserts `POSTGRES_URL_NON_POOLING`'s ref equals `NEXT_PUBLIC_SUPABASE_URL`'s ref. It does
  **not** hard-code the prod ref, so it is **staging-safe by construction** — as long as
  both vars point at the staging project, the guard passes. This is a key enabler.
- `npm run smoke:prod` defaults to the prod domain (above).
- No other script hard-codes the prod ref; `KNOWN_FOREIGN_REFS` is informational only.

---

## MVP staging target

The minimum safe setup. Goal: a place to rehearse migrations and prod-risk config changes
that (a) is fully isolated from real customer data and money, and (b) exercises the same
code paths as prod.

### 1. Separate Supabase staging project
- A brand-new Supabase project (call it `chainreact-staging`), distinct ref from
  `qcepijemjlkssfkvzlio`. RLS/GRANT model is identical because it is applied via the same
  forward-only migrations.
- Staging becomes the **first** `db:push` target for every new migration.
- New, staging-only `TOKEN_ENCRYPTION_KEY` (do not reuse prod's — a separate key means a
  staging DB leak can never decrypt against prod-encrypted rows, and vice-versa).

### 2. Separate Vercel staging deployment
- **Recommended:** a dedicated Vercel project (or a `staging` git branch mapped to its own
  production-scoped deployment) → a staging domain, e.g. `staging.chainreact.app`. A
  dedicated deployment is preferred over ad-hoc Preview URLs because (a) it has a **stable**
  origin, which OAuth/Stripe/webhook allow-lists require, and (b) its crons run
  deterministically against staging.
- `NEXT_PUBLIC_APP_URL = https://staging.chainreact.app` in the staging scope.
- All staging env vars point at the staging Supabase project + Stripe test mode.
- **Cannot verify from code:** the current Vercel project layout. Marcus chooses between a
  second Vercel project vs. a branch-scoped environment; both work, tradeoff in Risks.

### 3. Staging env vars (the delta from prod)
| Var | Staging value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://staging.chainreact.app` |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | staging project's |
| `POSTGRES_URL_NON_POOLING` / `POSTGRES_URL` / `POSTGRES_PRISMA_URL` | staging project's (ref-matched) |
| `TOKEN_ENCRYPTION_KEY` | **new** staging-only 32-byte key |
| `OAUTH_STATE_SIGNING_KEY` / `ANON_AI_LIMIT_SIGNING_KEY` / `WATCH_CHANNEL_SECRET` | new staging-only keys |
| `CRON_SECRET` | new staging-only value |
| Provider `*_CLIENT_ID/SECRET` | ideally separate staging OAuth apps; at minimum shared apps with staging redirect URLs added |
| `STRIPE_SECRET_KEY` / `STRIPE_BILLING_WEBHOOK_SECRET` / `STRIPE_PRICE_*` | **Stripe TEST mode** ids/secrets only |
| `PRODUCTION_SMOKE_BASE_URL` (CI/shell for smoke) | `https://staging.chainreact.app` |

### 4. Staging OAuth redirect URLs
Each provider's dashboard must allow-list
`https://staging.chainreact.app/api/integrations/oauth/<provider>/callback` (and the Supabase
auth `…/auth/callback`). See the full provider list below. For MVP, only the providers being
launch-certified need this immediately; the rest can be added as they are enabled.

### 5. Staging Stripe (test-mode) webhook / price config
- Stripe **test mode** only. A test-mode webhook endpoint at
  `https://staging.chainreact.app/api/webhooks/stripe-billing` with its own `whsec_…`.
- Test-mode Price ids in the `STRIPE_PRICE_*` staging vars. Mode-match invariant holds:
  test secret + test prices + test webhook secret (never mixed with live).

### 6. Staging cron behavior
- Staging crons run against staging data only. They are safe **because** staging holds no
  real customer tokens and Stripe is in test mode.
- Decision point: keep the full cron set on staging (best fidelity, exercises
  renew-watch/poll/queue paths) vs. trim it. Recommended: **keep the full set** — that is
  the whole point of staging — but ensure staging integrations are only ever throwaway test
  connections so renew/poll crons never touch a real user's provider account.

### 7. Staging smoke command
- `PRODUCTION_SMOKE_BASE_URL=https://staging.chainreact.app npm run smoke:prod` with
  staging smoke creds. (Optionally add a `smoke:staging` script alias so the base URL is not
  forgotten — see Required repo changes.)

### 8. Migration promotion flow (staging → prod)
Local authoring → apply to **staging** → verify on staging → **then** apply to prod. Detailed
below.

---

## Required external setup checklist

Actions Marcus must take **outside the repo** (dashboards / infra). None of these are code.

**Supabase**
- [ ] Create a new Supabase project `chainreact-staging` (distinct region OK; note the ref).
- [ ] Capture its `NEXT_PUBLIC_SUPABASE_URL`, anon key, service-role key, and the
      **non-pooling** Postgres connection string (port 5432, `postgres.<ref>` user).
- [ ] Set Supabase **Auth → URL Configuration**: Site URL `https://staging.chainreact.app`;
      Redirect URLs include `https://staging.chainreact.app/**`.
- [ ] Apply the two cross-device email-confirm templates (mirroring the prod fix in
      `v2-go-live-status.md:82-85`) pointed at the staging callback.

**Vercel**
- [ ] Create the staging deployment (dedicated project or `staging` branch environment) and
      map `staging.chainreact.app`.
- [ ] Set **all** staging env vars (table above) in the staging scope only. Do **not** copy
      prod secrets — mint new keys for `TOKEN_ENCRYPTION_KEY`, signing keys, `CRON_SECRET`.
- [ ] Confirm staging Vercel crons are enabled and carry the staging `CRON_SECRET`.
- [ ] **Cannot verify from code:** confirm prod env vars are unaffected by adding staging.

**OAuth / provider dashboards** (per provider being certified — see full list below)
- [ ] Add `https://staging.chainreact.app/api/integrations/oauth/<provider>/callback` to each
      provider app's allowed redirect URIs (or create separate staging OAuth apps).
- [ ] For webhook providers, register the staging webhook URL / verify token (Dropbox,
      Facebook, Monday, Microsoft Graph, Slack, Shopify, GitHub, HubSpot, Mailchimp, Stripe).

**Stripe (test mode)**
- [ ] In the **platform** Stripe account, test mode: create test Products/Prices, copy the
      test Price ids into the staging `STRIPE_PRICE_*` vars.
- [ ] Register a test-mode webhook endpoint
      `https://staging.chainreact.app/api/webhooks/stripe-billing`, subscribe the four billing
      events (checkout.session.completed, customer.subscription.{created,updated,deleted}),
      copy its `whsec_…` into staging `STRIPE_BILLING_WEBHOOK_SECRET`.
- [ ] Activate the test-mode Customer Portal.

**DNS**
- [ ] Point `staging.chainreact.app` at the staging Vercel deployment.

---

## Required repo changes

Expected code/config/doc/script changes. **Not implemented here** — listed for the follow-up
slices. All are small and additive; none touch runtime behavior of prod.

1. **`.env.example`** — add a short "Staging" comment block documenting the staging delta
   (which vars change, the "new keys, don't reuse prod" rule, Stripe-test-mode note). Docs
   only; no values.
2. **`package.json`** — add a `smoke:staging` script that sets
   `PRODUCTION_SMOKE_BASE_URL=https://staging.chainreact.app` so execution smoke can never
   accidentally hit prod when the intent was staging. (Windows-safe: use the Playwright
   config's env, or a tiny node wrapper, rather than inline `VAR=… cmd`.)
3. **`scripts/lib/db-target.mjs`** — add the staging ref to `KNOWN_FOREIGN_REFS` with a
   `"V2 staging project"` label so a cross-env mixup (e.g. staging app URL + prod PG string)
   is surfaced with context. The relative guard already blocks the mismatch; this only
   improves the message. (Optional but cheap.)
4. **New runbook `docs/runbooks/staging-environment.md`** — the operational companion to
   this plan: how to point `.env.local` at staging, the `db:push`→verify→prod promotion
   steps, the staging smoke command, and the "migrations debut on staging" rule.
5. **`docs/runbooks/v2-smoke-testing.md`** — add a staging section (base URL override,
   test-mode Stripe note).
6. **CI (`.github/workflows/ci.yml`)** — *future, not MVP-blocking:* once the staging (or a
   dedicated test) Supabase project exists, this is the project that unblocks the e2e + RLS
   integration jobs the audit flags (must-fix "wire e2e + RLS into CI"). Decide whether the
   RLS/e2e job runs against **staging** or a throwaway ephemeral project. (Recommendation:
   a separate ephemeral test project, not staging, so CI never races a human rehearsal on
   staging — but staging is an acceptable MVP stopgap.)
7. **`CLAUDE.md` / `docs/PROJECT_MEMORY.md`** — once staging exists, update the push-posture
   text ("there is no staging environment yet") and record the staging ref + promotion flow
   as a durable decision.

No changes are needed to the OAuth redirect construction, the callback route, the billing
session URLs, or `db-push.mjs` — they are already environment-parameterized.

---

## Migration promotion flow

The core deliverable: migrations must never debut on prod again.

**Local → staging → production, step by step:**

1. **Author locally.** Add the forward-only migration under `supabase/migrations/`. Run the
   static gates: `npm run lint:migrations` (RLS + GRANT on user-data tables), `npm run
   lint:structure`, `npx tsc --noEmit`, and the relevant `npm test` suites.
2. **Point `.env.local` at staging.** Set the staging Supabase + `POSTGRES_URL_NON_POOLING`
   (ref-matched). Run `npm run check:db-target` — it must print the **staging** ref and pass.
3. **Apply to staging.** `npm run db:push`. The guard re-runs inside `db-push.mjs`; it
   applies only to staging.
4. **Verify on staging (see Smoke and verification flow).** RLS/GRANT checks, targeted
   integration/security tests, and a staging smoke run. Exercise the specific feature the
   migration supports.
5. **Only then, apply to prod.** Point `.env.local` back at the prod ref, re-run
   `npm run check:db-target` (must now print the **prod** ref), take a verified prod DB
   backup/snapshot, then `npm run db:push` against prod.
6. **Post-prod smoke.** Run `smoke:prod` against `chainreact.app` and confirm the feature +
   no regressions.

**Guardrails that make this safe:**
- The `check:db-target` relative guard means the human cannot push staging migrations to prod
  (or vice-versa) *while `.env.local` is pointed at the wrong project* — the ref mismatch
  aborts. The discipline required is: **switch `.env.local` deliberately, and read the
  printed ref before every `db:push`.**
- Forward-only rule (unchanged): never edit an applied migration; a fix is a new migration
  that is itself rehearsed on staging first.

---

## Smoke and verification flow

Commands and manual checks required **on staging** before any prod apply.

**Static gates (local, pre-apply):**
```
npx tsc --noEmit
npm run lint
npm run lint:structure
npm run lint:migrations
npm test            # focused suites for what changed
```

**Staging DB target confirmation:**
```
npm run check:db-target      # MUST print the staging ref and pass
```

**Apply + RLS/GRANT verification on staging:**
- `npm run db:push` (staging).
- Run the security/RLS integration suites that cover the touched tables
  (`tests/integration/security/` per `docs/rules/database-security.md` §Required tests):
  own-row read/write, cross-user denial, anon denial, service-role bypass only where
  declared, encryption round-trip, no-cleartext-token scan.
- Confirm the new table (if any) has RLS enabled, at least one policy, and explicit GRANTs
  (the `lint:migrations` gate enforces authorship; the integration test proves runtime
  behavior on the real staging schema).

**Feature + integration verification on staging:**
- Relevant provider/integration tests for the feature.
- If the change touches OAuth/webhooks/billing: a live round-trip on staging with a
  throwaway connection / Stripe test card.

**Staging end-to-end smoke:**
```
PRODUCTION_SMOKE_BASE_URL=https://staging.chainreact.app \
PRODUCTION_SMOKE_EMAIL=… PRODUCTION_SMOKE_PASSWORD=… \
npm run smoke:prod            # or the new smoke:staging alias
```
Add `PRODUCTION_SMOKE_RUN_EXECUTION=true` + `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME=…` only when
verifying the execution path (safe on staging — test-mode Stripe, throwaway Slack).

**Manual staging checks** (from `docs/runbooks/v2-smoke-testing.md` §3–§6, run against
staging): OAuth connect/reconnect/disconnect for the certified providers; one webhook
delivered end-to-end (dedup verified); one Stripe **test** checkout + webhook round-trip;
one durable-queue manual run finalizing; a no-leak spot-check on a failing run.

**Only after all green on staging** → apply to prod (promotion flow step 5) → `smoke:prod`
against `chainreact.app`.

---

## Risks and mitigations

| Risk | How it bites | Mitigation |
|---|---|---|
| **Production data copied to staging** | Real customer PII / tokens land in a lower-trust env; a staging leak = a prod leak | **Never copy prod data.** Staging starts empty; seed only synthetic/test accounts. If a prod-shaped dataset is ever needed, anonymize first (strip emails, drop token columns). Staging uses a **separate** `TOKEN_ENCRYPTION_KEY`, so even a copied encrypted token is undecryptable on staging. |
| **Prod OAuth tokens in staging** | A real user's provider access reachable from staging code/logs | Staging uses separate signing/encryption keys and (ideally) separate provider OAuth apps. Only throwaway test connections are made on staging. No prod token export, ever. |
| **Real customer emails / webhooks fired from staging** | Staging cron (renew-watch, poll, notify) or a test run emails/DMs a real user | Staging holds only test connections → crons act on test data. Notification/email sends on staging target test recipients only. Register **staging** webhook URLs at providers so prod webhooks never route to staging and vice-versa. |
| **Stripe mode mixup** | A live key with a test price (or a staging endpoint on the live webhook) → silent billing corruption or a real charge from staging | Staging is **test mode only**. Enforce the mode-match invariant (all of `STRIPE_SECRET_KEY` + `STRIPE_PRICE_*` + `STRIPE_BILLING_WEBHOOK_SECRET` from the same mode). Separate test webhook endpoint + secret. Never put a live secret in the staging scope. |
| **Cron duplication** | A dedicated staging Vercel project runs its own 9 crons; if staging ever pointed at prod data, work would double | Staging crons run against the **staging** DB only (staging Supabase env vars). Keep staging integrations synthetic so renew/poll crons never touch a real provider account. If using a Vercel Preview environment instead of a project, note Preview deployments **don't** run crons — a tradeoff for cron fidelity. |
| **Env var drift** (staging vs prod diverge, or a staging value leaks into prod) | A migration/feature "works on staging" but breaks on prod because a var differs; or a staging key is accidentally set in prod | Keep `.env.example` as the single documented superset. Maintain a short staging-delta table (this doc). Mint staging keys distinctly and never cross-set. `check:db-target` catches the highest-risk drift (DB ref) automatically before every `db:push`. |
| **Smoke default points at prod** | `smoke:prod` with `RUN_EXECUTION=true` and no base-URL override posts to prod | Add the `smoke:staging` alias (Required repo changes #2); make the staging runbook lead with the base-URL override; keep execution smoke opt-in (already true). |
| **`.env.local` pointed at the wrong project during a promotion** | Human applies a staging migration to prod or vice-versa | The `check:db-target` guard aborts on ref mismatch; the promotion flow mandates reading the printed ref before every `db:push`. Add the staging ref to `KNOWN_FOREIGN_REFS` for a clearer message. |
| **CI still can't run RLS/e2e** | The audit's high-severity gap persists even with staging | Decide the CI test-project story (ephemeral vs. staging) as a fast-follow; staging is an acceptable MVP stopgap but a dedicated ephemeral project avoids CI racing human rehearsals. |

---

## OAuth / provider callback risk — providers needing staging callback updates

Every auth/OAuth/webhook flow that must be updated for staging. All OAuth redirect URIs
follow `https://staging.chainreact.app/api/integrations/oauth/<provider>/callback`; webhook
URLs follow `https://staging.chainreact.app/api/webhooks/<provider>`. For MVP, prioritize the
providers being launch-certified; add the rest as enabled.

**Standard OAuth providers (redirect URI allow-list required):**
- Slack, Discord, Dropbox, Stripe (workflow provider), Airtable, HubSpot, Shopify, Monday,
  Facebook.
- Google family (one Google Cloud OAuth client covers them): Gmail, Google Drive, Google
  Sheets, Google Docs, Google Calendar, Google Analytics. **Note:** Google sensitive scopes
  (e.g. `analytics.edit`, Gmail) require OAuth-app verification — a staging OAuth client may
  need its own verification or test-user allow-list (`.env.example:84-88`).
- Microsoft family (Azure AD app registration redirect URIs): Outlook Mail, Outlook Calendar,
  Teams, OneNote, OneDrive, Excel.

**Token-ingest providers (no OAuth redirect; different flow):**
- Trello (and any other token-ingest per `docs/rules/token-ingest-auth.md`) — uses the
  `app/integrations/token-ingest/[provider]` page. No redirect URI to register; verify the
  ingest page renders on staging.

**Webhook providers (register the staging webhook URL / verify token):**
- Slack (signing secret), Shopify, Facebook (verify token + `X-Hub-Signature-256`), GitHub,
  Gumroad, HubSpot, Mailchimp, Microsoft Graph (`clientState`), Monday
  (`x-monday-signature`), Dropbox (app-level webhook, `X-Dropbox-Signature`).
- **Mailchimp / Microsoft Graph** lack strong signature verification (audit accepted risk) —
  on staging, ensure their `clientState`/audience secrets are staging-specific.

**Stripe billing webhook:**
- Register a **test-mode** endpoint `https://staging.chainreact.app/api/webhooks/stripe-billing`
  with its own `whsec_…` (separate from prod's live endpoint).

**Supabase auth callback:**
- `https://staging.chainreact.app/auth/callback` in the staging project's Redirect URLs, plus
  the two email templates.

**Cannot verify from code:** the current redirect allow-lists in each provider dashboard, and
which providers are in "development mode" vs. published/verified. Marcus must confirm each
dashboard.

---

## Implementation slices

Small, ordered follow-up prompts. Each is independently shippable; none touches prod until
its verification passes.

- **`LAUNCH-STAGING-1` — Provision staging Supabase + baseline schema.** Create the staging
  Supabase project (external), then locally point `.env.local` at it, `check:db-target`,
  `db:push` the full current migration set, and confirm RLS/GRANT lint + security suites pass
  against the staging schema. Deliverable: staging DB at parity with prod schema. (No prod
  touch.)
- **`LAUNCH-STAGING-2` — Stand up the staging Vercel deployment + env vars.** Create the
  staging deployment/domain, set the full staging env delta (new keys, staging Supabase,
  `NEXT_PUBLIC_APP_URL`), confirm the app boots and public smoke is green against
  `staging.chainreact.app`. (External Vercel config + a public smoke run.)
- **`LAUNCH-STAGING-3` — Wire staging OAuth + webhooks for the launch-certified providers.**
  Add staging redirect URIs + webhook URLs for the top providers (Slack + one Google + one
  Microsoft to start), verify connect/reconnect/disconnect + one webhook round-trip on
  staging. Expand provider-by-provider.
- **`LAUNCH-STAGING-4` — Staging Stripe test-mode billing.** Test Products/Prices, test
  webhook endpoint + secret, portal activation; run one test checkout + webhook round-trip on
  staging.
- **`LAUNCH-STAGING-5` — Repo hardening (docs + scripts).** Add the `smoke:staging` script,
  the staging ref to `KNOWN_FOREIGN_REFS`, the `.env.example` staging block, the
  `docs/runbooks/staging-environment.md` runbook, and the smoke-runbook staging section.
  Update `CLAUDE.md` + `PROJECT_MEMORY.md` to record staging exists and the promotion flow.
  (Docs/scripts only; local commit.)
- **`LAUNCH-STAGING-6` (fast-follow, can trail launch) — CI test project + e2e/RLS in CI.**
  Decide ephemeral-vs-staging for CI, provision it, and wire the DB-gated RLS/isolation + a
  happy-path e2e into `ci.yml`. Closes the audit's high-severity CI gap.

---

## What this plan explicitly did NOT do

- No Supabase project created, no `db:push`, no migration authored.
- No Vercel/Stripe/provider dashboard change.
- No env file edited (`.env.local` / `.env.example` untouched).
- No source, test, or schema change. No deploy. No production change.
- Docs-only. Not committed or pushed unless Marcus asks.
