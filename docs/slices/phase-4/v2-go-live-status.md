# V2 Go-Live — Production Status

**Type:** Go-live status record. **Date:** 2026-06-09 (UTC date; precise time not captured in this environment).
**Status:** ✅ **LIVE** — public-surface smoke GREEN; **authenticated-flow + execution smoke GREEN (2026-06-11 — see "Production smoke" closeout below)**; Vercel log review remains manual.

---

## Promotion facts

| Item | Value |
|---|---|
| Production domain | `https://chainreact.app` |
| GitHub default branch | `v2-main` |
| Vercel production branch | `v2-main` |
| `v2-main` commit | `6c542208` (`fix(build): move DEFAULT_BATCH_LIMIT out of a route module`) |
| Supabase project (production DB) | **`qcepijemjlkssfkvzlio`** (the migrated V2 project; Option A repoint) |
| Env switch | ✅ completed — Production `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` repointed to the V2 project; `TOKEN_ENCRYPTION_KEY` / `OAUTH_STATE_SIGNING_KEY` / `CRON_SECRET` set to match `ChainReactV2/.env.local` |
| V1 preserved | `origin/main`, `origin/v1-main-archive`, tag `v1-main-archive-2026-06-09`, and the V1 DB `xzwsdwllmrnrgbltibxt` — **all intact, nothing wiped** |

## Smoke test result

### ✅ Verified — automated, read-only (run this session against `https://chainreact.app`)
GET-only requests; no auth, no mutations.

| # | Check | Result |
|---|---|---|
| 1 | Homepage loads | ✅ `200`, `<title>ChainReact</title>`, Vercel-served (`X-Vercel-Id`) |
| 2 | Sign-up page renders | ✅ `/auth/sign-up` → `200` |
| 3 | Sign-in page renders | ✅ `/auth/sign-in` → `200`, auth form present |
| 5–10 | Protected routes gate correctly | ✅ `/workflows` `/templates` `/apps` `/account` `/runs` `/notifications` → `307` → `/auth/sign-in` (clean redirect, **no 500**) |
| 12 | No Server Components render error | ✅ 0 error markers (`application error` / `server-side exception` / `digest:`) in homepage + sign-in HTML |
| 13 | No server 500s on the public surface | ✅ no 5xx on any route probed |

**Interpretation:** the app is serving from the V2 deployment against the V2 schema. A wrong-schema/missing-env failure would surface as 500s or RSC errors on the DB-touching paths or middleware — none observed.

### ⏳ Pending — require an authenticated session or Vercel access (NOT verified here)
These need a real sign-in (which would create real rows in the prod DB) and/or the Vercel dashboard; not done from this environment to avoid mutating production / lacking access.

| # | Check | How to verify |
|---|---|---|
| 4 | Personal account / profile bootstrap | Sign up a throwaway account → confirm a personal account + profile are created |
| 5 | Dashboard loads (authed) | After sign-in |
| 6 | Account switcher loads | After sign-in |
| 7 | Create workflow opens | After sign-in |
| 8 | Builder loads | Open a workflow |
| 10 | Account settings loads | After sign-in |
| 11 | Plan & billing usage renders used/limit + remaining + reset date | Account → Plan & billing (the shipped `taskUsagePeriod` UI) |
| 14 | Vercel production logs: no repeated server failures | Vercel dashboard → Deployments → Logs |

---

## Cross-device email confirmation fix — `1c1e00d9a` (2026-06-10)

**Issue:** With the Supabase SSR **PKCE** flow, email confirmation (and password
recovery) can fail when sign-up starts on one device and the emailed link is
opened on another. The link carried a one-time `code`, and
`exchangeCodeForSession` needs the **verifier cookie stored in the originating
browser** — a second device (e.g. confirming on a phone) doesn't have it, so the
exchange failed. This hits the very common "sign up on desktop, confirm on
phone" pattern.

**Fix (code — shipped):** [`app/auth/callback/route.ts`](../../../app/auth/callback/route.ts)
now also accepts a device-independent `token_hash` + `type` link and verifies it
via `supabase.auth.verifyOtp` (narrow allow-list: `email`, `recovery`). The
existing `code` → `exchangeCodeForSession` path is **unchanged** for Google OAuth
and same-device PKCE. Invalid/missing `type`, failed verification, and missing
params all redirect to `/auth/sign-in?error=…`; token values are never placed in
the redirect target or logs. 15 callback tests + full auth suite, `tsc`, eslint,
`next build` all green (see commit).

**Fix (Supabase templates — REQUIRED for the fix to take effect):**
- **Confirm signup:** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/auth/confirmed`
- **Reset password:** `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/auth/reset-password`
- **URL Configuration:** Site URL = `https://chainreact.app`; Redirect URLs include `https://chainreact.app/auth/callback` (or `https://chainreact.app/**`).

### ✅ Verified this session — production (`https://chainreact.app`)
| Check | Result |
|---|---|
| Commit `1c1e00d9a` pushed to `v2-main` | ✅ `43bf442e6..1c1e00d9a` |
| Vercel production deploy | ✅ **Ready** (`chainreact-mhezy020x`, ~2m build, no error state) |
| Public auth smoke | ✅ `/`, `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/confirmed` → `200`; `/workflows` → `307` → sign-in; no 500s / RSC errors |
| `/auth/reset-password` without a recovery session | ✅ `307` → `/auth/forgot-password?error=…invalid or has expired` (safe, no crash) |
| `/auth/callback` no params | ✅ `307` → `…?error=oauth_missing_code` |
| `/auth/callback?type=email_change` (disallowed) | ✅ `307` → `…?error=invalid_confirmation` (allow-list live) |
| `/auth/callback?type=email&token_hash=bogus` | ✅ `307` → `…?error=Email link is invalid or has expired` — **verifyOtp path live; Vercel server reaches Supabase; token not leaked** |

### ⏳ Pending — manual (NOT verified here)
- **Supabase template update** — set the two templates + URL config above. Until then the code path is live but Supabase still emits PKCE `code` links, so the cross-device bug persists in the email itself.
- **Real cross-device email smoke** (needs the template change + two physical devices):
  - Desktop sign-up → open confirmation email on phone → lands on `/auth/confirmed` → Continue → dashboard.
  - Desktop forgot-password → open reset email on phone → lands on `/auth/reset-password` → set new password → sign in.

**Honesty note:** the ✅ rows were actually run this session (git push output, `vercel ls`, and curl probes against the live domain — the bogus-token verifyOtp probes create nothing). The ⏳ rows need Marcus's dashboard change and physical devices and are **not** claimed as passing. The DNS failure to resolve `*.supabase.co` seen during this work was **local to the dev machine only** — the Vercel server reaches Supabase fine (proven by the verifyOtp probe above).

## Production smoke — authenticated + execution closeout — 2026-06-11

**Result:** `npm run smoke:prod` against `https://chainreact.app` — **30 tests: 29 passed, 1 skipped, 0 failed. Overall PASSED.** (Run by Marcus this session; not run from the assistant environment — no smoke credentials there.) Deployed commit under test: `9abe08ab6` on `v2-main`.

**Validates the previously ⏳-pending authenticated/execution checks above:**
- **Builder manual-run finalizes** to a terminal run status and appears on `/runs` — confirms the run-now `after()` reliability fix (commit `9abe08ab6`, live) in production. Manual runs no longer stick in `running` (invisible to the `neq('status','running')` Runs read).
- **Slack action manual-run finalizes** (Send Channel Message) — Slack action smoke: 6 passed, 0 failed, 1 skipped.
- Public surface, authenticated shell, and builder readiness/save — all green.
- MCP smoke artifact written: `artifacts/mcp/smoke-latest.json`.

**Notes:**
- **Slack re-OAuth was required** to restore Slack channel option loading. The channel picker had failed with `PROVIDER_ERROR` ("Couldn't load Slack channels. Try again.") because the stored bot token was rejected by Slack's API; reconnecting the **same workspace** (Apps → Slack → "Connect another") refreshed the token in place via `upsertActive` on `(account_id, provider, provider_account_id)`, and channel loading recovered.
- The **1 skipped test is the Slack-side message verification** — intentionally gated (the smoke harness holds no Slack API read credentials). ChainReact-side run success is the acceptance signal; **the message landing in the Slack channel is not externally verified in Slack.**

### Open follow-ups (not blocking; NOT addressed in this closeout)
- **Connected-app recovery UX gap:** no obvious **Reconnect** affordance and **no Disconnect** action on connected app cards (`markDisconnected()` is repo-only dead code; no disconnect API route). Recovering a broken token relies on the non-discoverable "Connect another → same workspace" workaround. A scoped recovery-UX slice (visible Reconnect + auth-error clarity; Disconnect designed separately) is queued, not yet built.
- **Observed on localhost — UNDIAGNOSED, needs investigation before the Reconnect UX:** during a Slack OAuth reconnect on localhost while signed in as one user, the app afterward showed a *different* signed-in user plus a "Connected to slack" banner. Not yet reproduced or root-caused; flagged as a potential auth/session-integrity concern. Production smoke (run as the dedicated smoke account) was unaffected.

## What remains deferred (unchanged)
- **Live-provider validation** — OAuth connect/refresh/revoke, webhook delivery+dedup, Stripe checkout/webhook round-trips, per-provider live testing. Not started.
- **Developer-portal redirect URLs** — leave as-is until testing a specific provider.
- **Production DB hardening decision** — keep `qcepijemjlkssfkvzlio` as prod, vs. provision a fresh dedicated prod project and `db push` V2 there, vs. (only after a verified backup) reuse `xzwsdwllmrnrgbltibxt`. No action now.
- **GitHub `main`** — still V1; not touched. The `--force-with-lease` main-replacement path remains off the table.

## Honesty / verification notes
- The ✅ rows were **actually run** this session (curl GETs against the live domain + HTML marker scan). The ⏳ rows were **not** run — they require auth/mutation or Vercel access I don't have, and are not claimed as passing.
- This doc is committed **locally only** (not pushed). Pushing it to `v2-main` will trigger a Vercel production redeploy (harmless docs change) — push when ready.
