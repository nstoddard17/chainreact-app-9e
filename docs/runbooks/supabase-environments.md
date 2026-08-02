# Supabase environments — operator runbook (SUPABASE-ENV-PIPELINE-1)

How ChainReactV2's three database environments work day to day, and the
one-time setup that stands up the hosted development project.

Design rationale and audit trail:
[`docs/slices/phase-5/supabase-env-pipeline/supabase-env-pipeline-plan.md`](../slices/phase-5/supabase-env-pipeline/supabase-env-pipeline-plan.md).

---

## The three environments

> **Status 2026-08-01 FINAL (V2-DEV-ONBOARDING-FIXTURE-CLOSEOUT-1): the v2-dev
> lane is FULLY CERTIFIED.** Run 30717312345 @ `1567acb13`: all six jobs
> green — db-ci, pooler migration, deploy with attribution `v2-dev` proven by
> the fail-closed gate, REST alias, bypass readiness 200, smoke OVERALL
> PASSED (auth-setup 1/1, public 14/14, authenticated shell 6/6, builder 4/4,
> cleanup 1/1; accepted optional skips: manual-run — execution opt-in gate —
> and Slack — no dev Slack config), certification artifact
> `dev-certification-1567acb13…` uploaded. Synthetic accounts are
> post-onboarding fixtures (bootstrap dismisses the checklist). dev-owner
> sign-in proves dev-Supabase wiring. Production untouched throughout.
>
> **CORRECTION 2026-08-01 (V2-DEV-BRANCH-ATTRIBUTION-1): the app-env half of
> the lane certification below is RETRACTED.** The Vercel CLI derives the
> branch from git metadata and ignores `VERCEL_GIT_COMMIT_REF`; every CLI
> deployment from the detached-HEAD checkout was attributed to branch `HEAD`,
> so the v2-dev-scoped Preview env (dev Supabase trio, empty Turnstile
> override) never attached — the deployed app was built with the GENERIC
> preview env, i.e. **production values**, behind Vercel Authentication.
> Authenticated smoke's disabled sign-in button (generic Turnstile key)
> means no auth request was ever sent; production data untouched. Database
> migration/identity certification (GitHub-secret path) is unaffected and
> stands. Fix staged locally: the deploy job materializes a real `v2-dev`
> branch in the runner clone and a fail-closed attribution gate sits between
> deploy and alias. **Do not sign in at dev.chainreact.app until a
> post-fix deployment replaces the current one.**
>
> **Status 2026-08-01 (V2-DEV-REST-ALIAS-FIX-1): the v2-dev lane is LIVE and
> certified end-to-end** (app-env claims retracted above; database claims stand): Run 30711097469 @ `7afed3335`: db-ci gate green
> (CI clean reset + RLS suites), dev migration "Remote database is up to
> date" via the Session pooler (identity guard confirmed the dev ref; the
> direct `db.<ref>` host is IPv6-only and unreachable from Actions runners —
> always use the pooler URL in `SUPABASE_DEV_DB_URL`), Vercel deploy
> (`chainreact-cblwpckpw`), **REST alias** bound `dev.chainreact.app` →
> `dpl_6WG5eKeaR95FhFeX2Z7yWcpKuX9u` (HTTP 200; the CLI `alias` command
> cannot use team-scoped tokens — REST is the sanctioned path), bypass
> readiness 200, public smoke 14/14, certification artifact
> `dev-certification-<sha>` uploaded. **Open items:** authenticated smoke
> self-skipped — the `development` env has `DEV_SMOKE_EMAIL` but no
> `DEV_SMOKE_PASSWORD`; recovery-email delivery still open (Phase B).
>
> Prior status (SUPABASE-HOSTED-DEV-CERT-1): `chainreact-dev` is LIVE —
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

## Release flow (DEV-TO-PRODUCTION-FLOW-1 — the certified default)

1. Claude develops on the local `v2-main` checkout; local gates pass; commits
   stay local. Nothing is ever pushed automatically.
2. Marcus reviews the Owner Report and authorizes a **specific SHA** for
   development.
3. Claude pushes exactly that SHA to `refs/heads/v2-dev` (fast-forward, never
   force; standard pre-push checks: fetch, clean tree, expected refs,
   ancestry, outgoing-range review).
4. `deploy-development.yml` certifies: exact-SHA verification → database CI
   (loopback, zero secrets) → guarded dev migration (identity guard proves
   `syvnzqzctnywakgyykmz`; production ref denylisted in code; **Session
   pooler** URL — the direct `db.<ref>` host is IPv6-only and unreachable
   from Actions runners) → Vercel CLI deploy (runner materializes a real
   local `v2-dev` branch; **fail-closed attribution gate** requires
   `meta.githubCommitRef = v2-dev` before aliasing) → REST alias to
   `dev.chainreact.app` (the CLI `alias` command cannot use team-scoped
   tokens) → protection-bypass readiness probe → public + authenticated
   smoke → uploads `dev-certification-<sha>`.
5. Marcus tests at `https://dev.chainreact.app` (Vercel Authentication stays
   on; synthetic post-onboarding fixtures via `dev:bootstrap`).
6. On Marcus's approval, Claude pushes the **same certified SHA** to
   `v2-main`. **This does not deploy** — the Vercel Ignored Build Step skips
   Git-triggered builds for `v2-main` and `v2-dev` (the push shows up in
   Vercel as a CANCELED record, which is the skip working). Claude verifies
   no automatic production deployment was created and that `ci.yml` is green.
7. Claude dispatches `promote-production.yml` from ref `v2-main` with inputs:
   the exact SHA and the matching `dev-certification` run ID — then **stops**.
8. **Marcus approves the Production gate**: GitHub → **Actions** → the running
   production promotion workflow → **Review deployments** → check
   **Production** → **Approve and deploy**. Claude never clicks this.
9. Post-approval, the workflow enforces database-before-application ordering:
   production target verification (refs only) → migration history divergence
   check → destructive-migration `backup_confirmed` gate → dry-run → apply
   forward migrations → post-apply verification → **only then**
   `vercel deploy --prod` → production smoke → promotion report (365-day
   artifact). A SHA without a matching dev certification is refused; seeding,
   resets, and `migration repair` are textually banned and guard-tested.
10. Claude verifies production health and reports completion.

**Owner shorthand** — "Dev looks good. Promote this exact tested version to
production and stop when GitHub needs my approval." means: identify the
certified SHA → push only it to `v2-main` → verify no auto-deploy →
dispatch `promote-production.yml` → stop at the gate with the click path
above → resume monitoring after approval.

**Failure posture:** never rerun blindly, never auto-push a fix, never touch
production during diagnosis; preserve logs, name the exact failing stage,
propose the smallest correction, and wait for authorization.

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

- ✅ Storage → New bucket: `workflow-files` (private) — **done 2026-08-01**
  (created + verified via service key, SUPABASE-HOSTED-DEV-CERT-1).
- ⏳ Auth configuration — **THE authoritative checklist is §2a below**
  (SUPABASE-HOSTED-DEV-AUTH-1 audit; every value derived from the code, not
  guessed). Pending until you enter it and confirm.

### 2a. Dev Auth configuration (✅ ENTERED by owner 2026-08-01)

Owner confirmed (SUPABASE-HOSTED-DEV-AUTH-CERT-1): Site URL + all four
redirect allowlist entries saved; both dev templates pasted; Turnstile still
OFF; no production settings touched. The value derivations below remain the
reference for future changes.

All in the `chainreact-dev` dashboard (`syvnzqzctnywakgyykmz`) → Authentication.
Derivations: `app/auth/callback/route.ts` (token_hash `verifyOtp`, `type`
allowlist `["email","recovery"]`, same-origin `next` sanitizer),
`app/auth/actions.ts` (`resolveOrigin()` = request origin →
`NEXT_PUBLIC_SITE_URL` → localhost; `emailRedirectTo`/`redirectTo` paths),
`features/auth/GoogleSignInButton.tsx` (`signInWithOAuth` redirectTo =
`${window.location.origin}/auth/callback[?next=…]`), and the production values
in `docs/slices/phase-4/v2-go-live-status.md:82-85`.

**URL Configuration** (Auth → URL Configuration):

| Setting | Exact value | Why | Enter now? |
|---|---|---|---|
| Site URL | `https://dev.chainreact.app` | `{{ .SiteURL }}` in both email templates targets it; email links land here (device-independent token_hash flow) | **Yes** — safe before the host exists; email links 404 until the Vercel domain is live |
| Redirect URL 1 | `https://dev.chainreact.app/auth/callback` | Google `signInWithOAuth` redirectTo without `next` | Yes |
| Redirect URL 2 | `https://dev.chainreact.app/auth/callback?**` | Google sign-in with `?next=<path>` (anon-draft returnTo) — `next` is an open same-origin path set, so exact enumeration is impossible | Yes — **verify in certification**; if the query-glob doesn't match, replace 1+2 with `https://dev.chainreact.app/**` (the documented production pattern, v2-go-live-status.md:85) |
| Redirect URL 3 | `http://localhost:3000/auth/callback` | local `next dev` against the dev project — Google sign-in | Yes |
| Redirect URL 4 | `http://localhost:3000/auth/callback?**` | same, with `next` | Yes — same fallback: `http://localhost:3000/**` |

No Vercel `*.vercel.app` preview patterns: the lane aliases
`dev.chainreact.app` and certification happens there; raw preview URLs stay
un-allowlisted (narrowest list). Add them only if you decide to test Google
sign-in on un-aliased previews.

**Email templates** (Auth → Emails): paste the two dev-labeled templates from
the repo — body HTML in [`supabase/templates/dev/confirmation.html`](../../supabase/templates/dev/confirmation.html)
and [`supabase/templates/dev/recovery.html`](../../supabase/templates/dev/recovery.html)
(comments at the top of each file say which dashboard slot + suggested
`[DEV]`-prefixed subject). Link formats are byte-identical to production's:

- Confirm signup → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/auth/confirmed`
- Reset password → `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`

The confirmation template also renders `{{ .Token }}` (the 6-digit code) — the
in-app code path (`verifySignupOtp`) is the ONLY signup-confirmation path that
works from localhost before `dev.chainreact.app` exists, and the only
cross-host-safe one afterward. Recovery is link-only in the app (no code
screen), so recovery E2E waits for the deployed lane.

**Google sign-in provider** (Auth → Providers → Google) — needed for the
Google button (`signInWithOAuth`); OTP/password flows work without it:

1. Google Cloud console → the OAuth client used for Google sign-in → add
   authorized redirect URI `https://syvnzqzctnywakgyykmz.supabase.co/auth/v1/callback`
   (either on the existing client, or a separate dev client if you prefer
   credential isolation).
2. Dashboard → enable Google, paste that client id + secret.

**Bot protection**: leave Turnstile **OFF** (Auth → Bot and Abuse Protection).
The widget hides itself when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is unset and no
captcha token is sent — the audited, correct dev posture
(`core/security/turnstile.ts`, `docs/slices/phase-4/security/account-security-mfa-and-bot-protection.md`).
Do NOT set the site key in the dev Vercel env.

**SMTP**: keep Supabase built-in initially. Its rate limit (~a few auth emails
per hour) is the binding constraint on email-flow certification — space out
signup/reset tests, prefer the OTP code path.

**Configuration-method note**: today this is dashboard-only by policy. The CLI
(`supabase config push` + a `[remotes.dev]` block in `supabase/config.toml`)
could make Auth URL/template config repo-managed and auditable; it is deliberately
NOT wired yet — the exact hosted-sync surface for auth settings is unverified,
and a bad push would overwrite dashboard state. Candidate follow-up:
SUPABASE-CONFIG-AS-CODE-1, trialed against dev only. The Management API
route was rejected for this batch (needs raw PAT handling).

### 2b. Dev Auth certification plan + status

**Phase A status (2026-08-01, SUPABASE-HOSTED-DEV-AUTH-CERT-1):**

Automated layer — **CERTIFIED** against `npm run dev:devdb` (localhost app with
the Supabase trio overridden to `chainreact-dev`; the new guarded script is the
sanctioned way to run this lane — `.env.local` untouched):

| Check | Result |
|---|---|
| Browser-facing target | ✅ dev ref inlined in compiled auth chunk; prod ref in NO chunk; prod hostname absent from served HTML |
| Server-facing target | ✅ bogus `token_hash` probes return GoTrue's "Email link is invalid or has expired" — a live server→dev-project `verifyOtp` round trip |
| Callback type allowlist | ✅ `email_change` and `magiclink` → `invalid_confirmation`; only `email`/`recovery` proceed |
| Missing params | ✅ `/auth/callback` bare → `?error=oauth_missing_code` |
| Bogus email/recovery tokens | ✅ safe error redirect, token never in the target URL |
| `/auth/reset-password` no session | ✅ 307 → `/auth/forgot-password?error=…` |
| Protected route signed out | ✅ `/workflows` → 307 → `/auth/sign-in` |
| All redirect hosts | ✅ `localhost:3000` only — never `chainreact.app` |
| Turnstile UI | ✅ absent (site key unset) |
| `next` sanitizer | ✅ via unit tests (13 suites / 132 tests green) — success-path redirect needs a valid token, covered again in the browser layer |

**Defect found by the first owner browser test (SUPABASE-HOSTED-DEV-AUTH-OTP-LENGTH-1,
2026-08-01):** the real `chainreact-dev` confirmation email carried an
**8-digit** `{{ .Token }}` while the confirmation UI hardcoded six digits
(fixed 6-slot input, `length === 6` submit gate, `/^\d{6}$/` server
validation, "6-digit" copy). The automated layer had not caught it — no
automated check ever redeemed a REAL hosted OTP, and the unit fixtures assumed
6. Supabase email OTP length is project-configurable (6–10) and environments
legitimately differ (production 6 today, dev 8), so the flow is now
length-agnostic: single robust `AuthOtpField` (digits-only, string-preserved
leading zeroes, clamp at 10, no auto-submit, submit enabled 6–10), server
regex `/^\d{6,10}$/`, neutral copy. Regression-tested (6/8/10 entry + submit,
<6 blocked, >10 truncated, leading zeroes, 8-digit paste with separators,
non-numeric stripped, full token to `verifyOtp`, no OTP in logs, copy never
says "6-digit"). TOTP authenticator flows stay exactly 6 (RFC 6238) on the
unchanged `AuthCodeInput`. **Signup confirmation remains NOT passed** until
the owner's browser retest with the real 8-digit code succeeds.

**Owner retest 2026-08-01 — signup confirmation PASSED**: real 8-digit hosted
OTP fully enterable, explicit submit, confirmed, redirected to `/workflows`.
One environmental snag: **HTTP 431 after redirect** — localhost:3000 held BOTH
projects' chunked Supabase auth cookies (prod ref from normal `.env.local`
dev + dev ref from this lane), exceeding Node's 16KB default header limit.
Resolved by clearing localhost cookies; `dev:devdb` now raises the dev
server's header limit (`--max-http-header-size=65536`) so lane-switching
can't retrigger it. Password **sign-in also verified** (post-cookie-clear).

**Second defect found by owner testing (HOSTED-DEV-WORKFLOW-DEFINITION-CRASH-1,
2026-08-01):** after successful sign-in, `/workflows` crashed
(`definition.nodes.some` TypeError). Auth was NOT the failure. Root cause was
two-layer: the dev bootstrap had inserted the synthetic workflow with
`draft_definition: {}` (bypassing the repository's canonical
`{ nodes: [], edges: [] }` default), and the repository READ path cast
persisted JSON (`as WorkflowDefinition`) instead of validating, so the
malformed row reached pure helpers and one bad row killed the whole
dashboard. Fixed: persisted definitions now pass through
`normalizePersistedWorkflowDefinition` (schema-valid input — including legacy
`{}` — normalizes canonically; schema-invalid input serves a safe EMPTY
definition with a `draftDefinitionInvalid` flag surfaced to the summary DTO,
never silently classified valid); `workflowUsesPrivateCredential` is
crash-proof as last-resort; the bootstrap writes the canonical shape and
idempotently repairs its own synthetic row (never user-created rows). The
hosted dev row was repaired via the guarded bootstrap and an authenticated
server-side probe as dev-owner confirmed `/workflows` renders (200, synthetic
workflow visible, no error markers). **Passed so far:** hosted signup +
8-digit OTP ✅ · sign-in ✅ · sign-out ✅ · protected-route redirect ✅.

**Phase A owner results (final, 2026-08-01): COMPLETE except one open item.**

| Owner browser test | Result |
|---|---|
| Hosted signup email arrival | ✅ |
| 8-digit signup OTP accepted + confirmation | ✅ |
| Sign-in / sign-out | ✅ |
| Protected `/workflows` redirect | ✅ |
| Synthetic workflow visible on `/workflows` | ✅ (post CRASH-1 fix) |
| MFA enrollment | ✅ |
| `/auth/mfa` challenge on next login + code accepted | ✅ |
| Password-reset request submitted | ✅ |
| **Development recovery email delivered** | ⏳ **OPEN — not observed** |

**Open certification item — dev recovery-email delivery:** the request
succeeded but no email was observed; most likely the `chainreact-dev`
built-in-SMTP delivery/rate constraint. Production recovery delivery works,
but that is NOT evidence for dev. Policy (owner-set): retry **once** after the
built-in email cooldown; otherwise certify during Phase B on the hosted
`v2-dev` lane with its final email configuration. Do not spam resets.

**Phase A — checklist** (local `next dev` pointed at the dev
project — `npm run dev:devdb`; do not repoint `.env.local`):

1. Signup with a fresh `…@chainreact.test` email → confirmation email arrives
   (dev-labeled) → enter the **6-digit code** on the verify screen → account
   provisioned (personal account + billing via `handle_new_user`).
2. Sign in / sign out (password).
3. Password reset REQUEST → dev-labeled recovery email arrives (link targets
   `dev.chainreact.app` → completing it waits for Phase B).
4. MFA: enroll TOTP in account settings → sign out/in → `/auth/mfa` challenge
   → step-up to AAL2.
5. Negative: expired/garbage `token_hash` → `/auth/sign-in?error=…`, no crash,
   no token in URL; disallowed `type=email_change` → `invalid_confirmation`.

**Phase B — DEFERRED: requires the deployed `v2-dev` lane + `dev.chainreact.app`**
(blockers per test: email-link click-through + full recovery + hosted AAL2
step-up → links target `https://dev.chainreact.app`, which has no DNS/app yet;
Google sign-in → provider not yet enabled in the dev project + needs the dev
host to prove the allowlist; hosted logout/protected-route + final
no-crossover proof → need the deployed lane itself. Next arc after Phase A
completes: **the GitHub/Vercel `v2-dev` lane setup** — runbook §3–§5.)

1. Confirmation email **link** click-through (mobile + desktop) → `/auth/confirmed`.
2. Full recovery: request → email link → `/auth/reset-password` → (with TOTP
   enrolled) AAL2 code required → password updated → `/workflows`.
3. Google sign-in from `https://dev.chainreact.app` (and once from
   `http://localhost:3000`) — proves the redirect allowlist entries; if the
   `?**` glob form fails here, switch to the `/**` fallback and re-run.
4. Logout; protected route → `307` to `/auth/sign-in`.
5. **No-production-crossover proof**: every email link host, OAuth redirect,
   and post-auth landing observed in Phases A+B is `dev.chainreact.app` or
   `localhost:3000` — never `chainreact.app`; and the dev project's user list
   contains only `@chainreact.test` synthetic users.

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
