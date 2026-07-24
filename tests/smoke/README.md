# Production smoke suite

Repeatable Playwright checks that run against the **deployed** app
(default `https://chainreact.app`) — the automated version of the core
manual smoke pass.

## Run

```bash
npm run smoke:prod
```

Uses `playwright.smoke.config.ts` (separate from the local e2e config — no dev
server, no provider mocks, `workers: 1`).

## Environment variables

| Var | Required | Default | Purpose |
|-----|----------|---------|---------|
| `PRODUCTION_SMOKE_BASE_URL` | no | `https://chainreact.app` | Target origin |
| `PRODUCTION_SMOKE_EMAIL` | for auth specs | — | Disposable test-account email |
| `PRODUCTION_SMOKE_PASSWORD` | for auth specs | — | Disposable test-account password |
| `PRODUCTION_SMOKE_PREFIX` | no | `Smoke Test` | Disposable-workflow name prefix (cleanup only ever touches names with this prefix) |
| `PRODUCTION_SMOKE_RUN_EXECUTION` | no | `false` | `true` opts into actually executing the manual run (otherwise readiness/save/reopen are still verified, execution is skipped) |

Set credentials via the shell / CI secret store. **Never commit them** — no
`.env` files, no hardcoded secrets. The cached session lives under
`tests/smoke/.auth/` (gitignored).

## Authenticated smoke — account setup (operator)

The `auth-setup` project ([`auth.setup.ts`](./auth.setup.ts)) signs in once with the two
`PRODUCTION_SMOKE_*` credential vars and caches the session; the `authenticated`, `builder`,
and `slack-action` projects reuse it and **self-skip** (never fail) when the vars are absent.

Required account state — the setup does a plain **email + password** form sign-in and waits for
the `/workflows` redirect, with **no MFA / CAPTCHA / email-verification handling**:

- A **disposable** test account — its own login, **not** a Google/SSO-only account, **no MFA**,
  already **email-verified**. It must contain **no real customer data**; the builder smoke only
  ever creates and deletes workflows whose name starts with `PRODUCTION_SMOKE_PREFIX`.
- No pre-existing workflow is needed — the builder smoke **creates its own** disposable one and
  deletes it. The core flow uses a native HTTP action, so **no external integration** is required
  (only the separate Slack-action smoke needs a connected Slack + `PRODUCTION_SMOKE_SLACK_CHANNEL_NAME`).

Where Marcus configures them: export `PRODUCTION_SMOKE_EMAIL` / `PRODUCTION_SMOKE_PASSWORD` in the
shell (or the CI secret store) for the run — they are **not** Vercel env vars and are unrelated to
any production runtime variable. Run just the authenticated projects with
`npm run smoke:prod` (public always runs alongside).

Rotate / remove: change the account password (or swap accounts) and update the two vars; delete the
cached `tests/smoke/.auth/` directory so the next run re-authenticates. Nothing to clean up in prod.

> **Document Builder coverage gap:** `builder.smoke.spec.ts` currently exercises the **Visual**
> builder only (create → configure → save → reopen → run → cleanup). It does **not** yet toggle
> or verify **Document mode**, so an authenticated *Document Builder* production pass still needs a
> manual check or a new spec — see the follow-up in `docs/PROJECT_MEMORY.md` open risks.

## Coverage

- **Public smoke** (no credentials): homepage, all auth pages, recovery-route
  safety, protected-route redirects, no 500 / RSC-crash markers.
- **Authenticated shell** (skips without credentials): dashboard, account
  switcher, account settings + billing usage (used/limit, remaining, reset),
  runs, templates, apps.
- **Builder + run + cleanup** (skips without credentials): create a disposable
  workflow → Manual trigger + HTTP Request action → assert Needs setup / not
  Ready / run blocked → fill GET + `https://example.com` → assert Ready → save →
  reopen → assert persistence → (opt-in) manual run appears in Runs → delete the
  smoke workflow and confirm it leaves the list.

## Without credentials

Public smoke still runs. Authenticated + builder specs **skip** with a clear
message; no workflow is created or deleted.
