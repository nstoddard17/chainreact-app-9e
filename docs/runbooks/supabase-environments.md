# Supabase environments — operator runbook (SUPABASE-ENV-PIPELINE-1)

How ChainReactV2's three database environments work day to day, and the
one-time setup that stands up the hosted development project.

Design rationale and audit trail:
[`docs/slices/phase-5/supabase-env-pipeline/supabase-env-pipeline-plan.md`](../slices/phase-5/supabase-env-pipeline/supabase-env-pipeline-plan.md).

---

## The three environments

> **Status 2026-08-01 (SUPABASE-HOSTED-DEV-CERT-1):** `chainreact-dev` is LIVE —
> ref `syvnzqzctnywakgyykmz`, Chain React Org, us-east-1. All 125 migrations
> applied and history-verified; synthetic bootstrap done; `workflow-files`
> bucket created (private); RLS certification subset green. The CLI uses the
> **securely stored login** (`supabase login`, Windows Credential Manager) —
> never set `SUPABASE_ACCESS_TOKEN` in env files or commands. One-time steps 1
> and the bucket part of step 2 are complete; Auth URL config, email templates,
> GitHub Environments, and the Vercel `v2-dev` lane remain.

| | Local | Development | Production |
|---|---|---|---|
| What | Docker stack on loopback | hosted `chainreact-dev` project (us-east-1) | live project (`chainreact.app`) |
| Data | synthetic, reset at will | synthetic only, guarded reset | real customer data |
| Schema arrives via | `supabase db reset` (all migrations + seed) | deploy-development workflow / guarded `db:push:dev` | promote-production workflow only |
| App | `next dev` on localhost | Vercel preview lane pinned to `v2-dev` (`dev.chainreact.app`) | Vercel production on `v2-main` |
| Reset allowed | always | `npm run dev:reset` (multi-guard) | **never** |
| Seed | automatic on reset | automatic on guarded reset | **never** (`--include-seed` is banned and guard-tested) |

## Daily commands

```bash
# Local stack
npm run supabase:test:start     # start + apply all migrations + seed + write .env.test.local
npm run supabase:test:reset     # rebuild local schema from zero
npm run supabase:test:stop
CHAINREACT_DB_TARGET=local npm run dev:bootstrap   # synthetic users/workflow (needs DEV_BOOTSTRAP_PASSWORD)

# Generated types (the schema contract)
npm run db:types                # regenerate types/database.types.ts from the local stack
npm run db:types:check          # drift gate (also runs in db-ci)

# Development project (all fail closed without explicit target + dev ref)
CHAINREACT_DB_TARGET=development npm run db:push:dev -- --linked   # PREFERRED: dry-run + apply via the
                                                                   # CLI's securely stored login; verifies
                                                                   # supabase/.temp/project-ref == dev ref
CHAINREACT_DB_TARGET=development npm run db:push:dev               # URL mode (needs SUPABASE_DEV_DB_URL)
CHAINREACT_DB_TARGET=development DEV_RESET_CONFIRM=<devref> npm run dev:reset
CHAINREACT_DB_TARGET=development npm run dev:bootstrap
```

The linked flow needs a one-time `npx supabase link --project-ref <devref>`
after `npx supabase login` (token pasted interactively; stored in the OS
credential store — never in env files, argv, or logs).

Development credentials live in `.env.development.local` (gitignored) or CI
secrets — variable names are documented at the end of `.env.example`. The
guarded commands read process env first, then that file.

**`npm run db:push` (the legacy direct-to-prod path) is retired from routine
use.** It still exists for emergency owner-driven use with `.env.local`, but the
sanctioned path to production is the promote-production workflow.

## Promotion flow (after one-time setup)

1. Work lands on local `v2-main`; local gates pass.
2. Marcus approves an exact SHA for development → push that SHA to `v2-dev`.
3. `deploy-development` runs automatically: db-ci → dev migration (dry-run,
   apply, history verification) → Vercel dev deploy → smoke → uploads
   `dev-certification-<sha>`.
4. Marcus tests at `dev.chainreact.app` and accepts.
5. Marcus dispatches `promote-production` with that **same SHA** + the
   certification run id, and approves the `production` environment gate when
   the run pauses.
6. The workflow re-verifies everything, dry-runs, applies forward migrations,
   verifies history, only then deploys the app, smokes, and uploads a
   promotion report. A SHA without a matching dev certification is refused.

Rollback: the **application** rolls back by promoting/aliasing a previous known
-good deployment; the **database** never rolls back — correct forward with a new
migration. Destructive changes ship expand → deploy → backfill → contract.

`supabase migration repair` is a manual, owner-approved recovery documented
here precisely so it never becomes automation: if promote-production reports
history divergence, stop, snapshot the `supabase_migrations.schema_migrations`
table via the dashboard SQL editor, reconcile intentionally, and only then
consider `migration repair` from a workstation.

---

## One-time setup (owner)

Everything below is a Marcus action — the repo side is already complete. The
current machine's `SUPABASE_ACCESS_TOKEN` belongs to a Vercel-integration org
owned by a third party (see the plan doc §1), which is why the dev project was
NOT created automatically.

### 1. Create the development Supabase project (~2 min)

Dashboard → **your own org** (the one that owns production, not "Nathaniel's
projects") → New project:

- Name: `chainreact-dev`
- Region: `us-east-1` (matches production)
- Database password: generate, save to your password manager

Collect from Project Settings → API / Database:
project ref, `https://<ref>.supabase.co`, anon key, service-role key, and the
**session-pooler** connection string (the `postgres.<ref>@...pooler...:5432`
form; percent-encode the password).

### 2. Dev project dashboard configuration

- Storage → New bucket: `workflow-files` (private).
- Auth → URL Configuration: Site URL `https://dev.chainreact.app`; add
  redirects `https://dev.chainreact.app/auth/callback` and
  `http://localhost:3000/auth/callback`.
- Auth → Email templates: copy the two production templates
  (`{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email|recovery`).
- Leave Turnstile OFF in dev (or create dev-scoped keys).

### 3. GitHub Environments (repo → Settings → Environments)

- `development` — secrets: `SUPABASE_DEV_PROJECT_REF`, `SUPABASE_DEV_DB_URL`,
  `SUPABASE_DEV_URL`, `SUPABASE_DEV_SERVICE_ROLE_KEY`, `VERCEL_TOKEN`,
  `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, optional `DEV_SMOKE_EMAIL` /
  `DEV_SMOKE_PASSWORD`. Repo/environment **variable**: `DEV_APP_HOSTNAME=dev.chainreact.app`.
- `production` — **required reviewers: you**. Secrets (can wait until first
  promotion): `SUPABASE_PROD_PROJECT_REF`, `SUPABASE_PROD_DB_URL`,
  `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, optional
  `PROD_SMOKE_EMAIL` / `PROD_SMOKE_PASSWORD`.

(`VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` are in `.vercel/project.json`; mint the
token at vercel.com → Account → Tokens.)

### 4. Vercel

- Project `chainreact-app` → Settings → Environment Variables: add **Preview**
  variables **scoped to branch `v2-dev`**: `NEXT_PUBLIC_SUPABASE_URL` (dev),
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (dev), `SUPABASE_SERVICE_ROLE_KEY` (dev),
  fresh dev-only `TOKEN_ENCRYPTION_KEY`, `OAUTH_STATE_SIGNING_KEY`,
  `SENSITIVE_ACTION_CHALLENGE_KEY`, `CRON_SECRET`, `WATCH_CHANNEL_SECRET`,
  `NEXT_PUBLIC_APP_URL=https://dev.chainreact.app`, Stripe **test-mode** keys,
  and any provider credentials that get dev apps.
- Domains: add `dev.chainreact.app`, assign it to the `v2-dev` git branch; add
  the DNS CNAME it prints.
- Deployment ordering: the workflow deploys via CLI after the DB gate. To stop
  Vercel's git integration racing it on `v2-dev` pushes, set Settings → Git →
  Ignored Build Step to skip builds for branch `v2-dev` (one-time; production
  `v2-main` behavior is unchanged).

### 5. First development deployment

```
git push origin <approved-sha>:refs/heads/v2-dev     # after explicit approval
```

Watch `deploy-development` in Actions. Then create the synthetic users:

```
CHAINREACT_DB_TARGET=development DEV_BOOTSTRAP_PASSWORD=<pick one> npm run dev:bootstrap
```

and sign in at `dev.chainreact.app` as `dev-owner@chainreact.test`.

### 6. Machine hygiene (recommended)

- Point `.env.local` at the **development** project once it exists (the
  `POSTGRES_URL_*` vars must move with it — `npm run check:db-target` enforces
  the pair), so day-to-day `next dev` stops touching production.
- Replace the machine's `SUPABASE_ACCESS_TOKEN` with one minted from your own
  Supabase account.

## Cron limitation in development

Vercel schedules crons only for the **production** deployment of a project, so
the dev lane gets no automatic ticks. Exercise cron routes in dev with:

```
curl -H "Authorization: Bearer <dev CRON_SECRET>" https://dev.chainreact.app/api/cron/<route>
```

A dedicated scheduler for dev (second Vercel project or external pinger) is a
deliberate non-goal until needed.

## Safety invariants (guard-tested)

- Dev commands refuse the production ref by constant denylist
  (`scripts/lib/env-target.mjs`, `tests/unit/pipeline/env-target-guards.test.ts`).
- `dev:reset` demands the dev ref retyped in `DEV_RESET_CONFIRM`.
- promote-production's text can never contain `--include-seed`, `db reset`, or
  `migration repair` (`tests/unit/pipeline/workflow-safety.test.ts`).
- `supabase/seed.sql` stays data-only with no secret-shaped values
  (`tests/unit/pipeline/seed-safety.test.ts`).
- Applied migrations are never edited — db-ci fails PRs that modify one.
