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
