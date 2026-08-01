# V2-DEV-LANE-ACTIVATION-1 — plan for standing up the GitHub/Vercel development lane

**Status:** planning (nothing pushed, nothing deployed, no dashboard changes)
**Date:** 2026-08-01
**Prerequisites met:** hosted dev database certified (SUPABASE-HOSTED-DEV-CERT-1);
dev Auth Phase A complete except recovery-email delivery, carried as an
**explicit open certification item** (see
[`docs/runbooks/supabase-environments.md`](../../../runbooks/supabase-environments.md) §2b).

Everything configuration-shaped lives in the runbook (§3–§5) — this plan adds
only the *sequence*, the *authorization gates*, and the decisions/risks
specific to first activation. No values are duplicated here.

---

## What already exists (verified in-repo)

- `.github/workflows/deploy-development.yml` — the full v2-dev lane: SHA
  verification → db-ci gate → guarded dev migration (dry-run→apply→history
  check) → Vercel deploy → smoke → `dev-certification-<sha>` artifact. Now
  pins `VERCEL_GIT_COMMIT_REF=v2-dev` on the CLI deploy so the **branch-scoped
  Preview env vars actually attach** on a detached-HEAD checkout (without it
  the app would deploy with no Supabase config).
- `.github/workflows/db-ci.yml` (zero-secret, loopback) and
  `promote-production.yml` (built, never auto-runs) — guard-tested.
- Dev database: migrated (125/125, history exact), bootstrapped, bucket
  created, RLS-spot-certified; Auth configured + Phase A certified per above.

## Decisions locked by this plan

1. **First approved SHA = the local `v2-main` HEAD at authorization time** —
   it contains the pipeline, the OTP fix, and the definition-crash fix, all of
   which the dev lane needs. Certifying an older SHA would re-expose fixed
   defects on the deployed lane.
2. **Pushing `v2-dev` publishes the local commit chain to origin under
   `refs/heads/v2-dev` only.** `origin/v2-main` does not move → **no
   production deploy is triggered**. The same commits reach `v2-main` later
   through the normal per-batch push approval.
3. **Vercel Ignored Build Step for `v2-dev` must be set BEFORE the first
   push**, or Vercel's git integration races the workflow with an unordered
   auto-build (the exact race the pipeline exists to prevent).
4. Google sign-in provider setup stays optional/deferred — Phase B certifies
   it only if Marcus enables the provider (runbook §2a).
5. Recovery-email delivery is certified in **Phase B** on the deployed lane
   (owner policy: one retry after the built-in-SMTP cooldown, no spamming).

## Activation sequence

### Step 1 — Owner dashboards (~15 min, no repo interaction)

1. **GitHub → Settings → Environments**: create `development` with the secrets
   in runbook §3 (dev Supabase ref/URLs/keys + `VERCEL_TOKEN` /
   `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`, optional `DEV_SMOKE_*`), and the
   repo **variable** `DEV_APP_HOSTNAME=dev.chainreact.app`. Create
   `production` with **required reviewer = Marcus** (its secrets can wait).
2. **Vercel → chainreact-app → Settings**:
   - Environment Variables: the **Preview-scoped-to-branch-`v2-dev`** set from
     runbook §4 (dev Supabase trio, fresh dev-only `TOKEN_ENCRYPTION_KEY`,
     `OAUTH_STATE_SIGNING_KEY`, `SENSITIVE_ACTION_CHALLENGE_KEY`,
     `CRON_SECRET`, `WATCH_CHANNEL_SECRET`,
     `NEXT_PUBLIC_APP_URL=https://dev.chainreact.app`). Minimum-to-boot first;
     Stripe test keys / Resend / provider credentials can follow later.
   - Git → Ignored Build Step: skip builds for branch `v2-dev` (decision 3).
   - Domains: add `dev.chainreact.app`, assign to branch `v2-dev`, create the
     DNS CNAME it prints.
3. Tell the session the dashboards are done.

### Step 2 — Owner authorization gate

Marcus names the exact SHA (default: current local `v2-main` HEAD) and
explicitly authorizes the `v2-dev` push. **No push happens before this.**

### Step 3 — Claude, after authorization

1. Pre-push discipline (concurrent-session rule): `git fetch`, confirm the SHA
   exists locally, review `git log origin/v2-main..<sha> --oneline` so every
   published commit is accounted for.
2. `git push origin <sha>:refs/heads/v2-dev` (creates the marker branch; no
   force, ever).
3. Watch the `deploy-development` run end-to-end; report each gate's result
   honestly (db-ci → migration → deploy → smoke → certification artifact).
   Expected first-run friction: dev smoke inherits the 9 pre-existing
   public stale-copy assertions from `smoke:prod` — report as baseline if hit.

### Step 4 — Phase B hosted Auth certification (runbook §2b)

Confirmation-link click-through → full recovery incl. the **open
recovery-email item** and AAL2 step-up → logout/protected-route on the dev
host → (optional) Google sign-in → final no-production-crossover proof.
Marcus performs the browser parts; results recorded in the runbook.

### Step 5 — Closeout

Update runbook status banner + PROJECT_MEMORY; the pipeline is then live
end-to-end short of production promotion, which stays owner-gated behind the
`production` environment reviewers.

## Risks / notes

- **Vercel CLI deploys from CI count against the Vercel plan's build minutes**
  like any build; the lane deploys only on approved SHAs, so volume is low.
- Vercel crons never fire on the preview lane (documented limitation;
  runbook §"Cron limitation").
- The dev lane's smoke reuses `playwright.smoke.config.ts` against
  `DEV_APP_HOSTNAME`; authenticated smoke activates only when `DEV_SMOKE_*`
  secrets exist (use the dev-owner synthetic user, never a real account).
- If the `?**` redirect-glob entries prove non-matching during Phase B Google
  tests, swap to the documented `/**` fallback (runbook §2a) and re-run.
