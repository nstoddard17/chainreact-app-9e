# 4.V2-READY-4 — CI Branch / Gate Audit + Fix

**Type:** CI config fix + audit (workflow + docs). Nothing pushed. `db:push` NOT run.
**Date:** 2026-06-14
**Branch:** `v2-main`
**Parent:** [v2-ready-0b-skipped-test-triage.md](./v2-ready-0b-skipped-test-triage.md) finding #2 (CI branch mismatch); surfaced again in [v2-ready-3-smoke-checklist.md](./v2-ready-3-smoke-checklist.md) (A5).

> **Verdict — fixed.** `.github/workflows/ci.yml` triggered on **`v2-foundation`**,
> which is a **stale, fully-merged ancestor** of the active branch **`v2-main`** (0
> commits ahead, last moved 2026-05-25 vs. `v2-main` active through 2026-06-14). The
> live working branch was therefore **ungated** by the non-e2e CI checks. Retargeted
> the PR + push triggers to `v2-main`. No other workflow, deploy, or Vercel config
> gates branches. CI coverage scope is unchanged (no smoke/e2e/DB added — those stay
> gated on the future V2-READY-0C test-DB decision).

---

## 1. Workflows / config inspected

| File | Branch gating? | Finding |
|---|---|---|
| [`.github/workflows/ci.yml`](../../../../.github/workflows/ci.yml) | **Yes** — `pull_request` + `push` on `v2-foundation` | **Stale.** Retargeted to `v2-main`. |
| `vercel.json` | No | Crons + function config only; **no `git`/`branch`/deploy keys**. Vercel deploy-branch gating is dashboard-configured (out of repo scope) — not changed. |
| Other `.github/workflows/*` | — | **None exist.** `ci.yml` is the only workflow file. |
| CI-referenced scripts | n/a | `scripts/check-leaf-folder-counts.mjs` (`lint:structure`) + `scripts/check-migration-rls.mjs` (`lint:migrations`) both present; unaffected. |

**Branch reality (measured this session):**
- `v2-foundation` tip `5486f1aff` (2026-05-25, "Merge PR #92") == `origin/v2-foundation`.
- `v2-main` tip is current; `git merge-base --is-ancestor v2-foundation v2-main` → **true**.
- `v2-foundation..v2-main` = **543 commits**; `v2-main..v2-foundation` = **0**.
- Conclusion: `v2-foundation` is no longer a work target → **replace**, not keep-both
  (per the slice's "prefer replacing if the old branch is no longer used"). Kept-both
  would falsely imply `v2-foundation` is still an active CI target.

---

## 2. Stale branch references found

| Location | Kind | Action |
|---|---|---|
| `ci.yml` `on.pull_request.branches` + `on.push.branches` | **CI trigger** | Changed `v2-foundation` → `v2-main`. |
| `ci.yml` header comment | CI prose | Updated to `v2-main` + a note recording why the retarget happened (kept the word `v2-foundation` only in that explanation). |
| `docs/runbooks/v2-smoke-testing.md` CI note | CI doc | Updated to say it now triggers on `v2-main`. |
| `docs/slices/phase-4/readiness/v2-ready-3-smoke-checklist.md` (CI row + A5) | CI doc | Updated to point at this fix. |
| `docs/slices/phase-4/readiness/v2-ready-0b-skipped-test-triage.md` finding #2 | CI doc | Marked **RESOLVED** with a pointer here. |

**Deliberately NOT changed (historical authoring baselines, not CI gates — avoiding
churn):** `ai-architecture-react-agent-plan.md` ("Base baseline: origin/v2-foundation"),
`task-cost-billing-model-audit.md` (same), `slice-3-google-calendar.md` ("off
v2-foundation @ …"), `workflows/builder-ai-closeout.md` (commits "ahead of
origin/v2-foundation"). These record the branch a doc was authored against at a point in
time; rewriting them would be revisionist and out of scope.

---

## 3. CI trigger change made

```diff
 on:
   pull_request:
     branches:
-      - v2-foundation
+      - v2-main
   push:
     branches:
-      - v2-foundation
+      - v2-main
```

Plus the header comment retarget + a dated rationale block. The stale branch was
**replaced** (not kept alongside) because it is fully merged and abandoned.

---

## 4. CI coverage summary (after fix)

| Check | In CI? | Notes |
|---|---|---|
| Type-check (`npx tsc --noEmit`) | ✅ | |
| Lint (`npm run lint`) | ✅ | |
| Structure lint (`npm run lint:structure`) | ✅ | ≤50 files / leaf folder. |
| Migration lint (`npm run lint:migrations`) | ✅ | RLS on user-data tables. |
| Unit + structural Jest (`npm test`) | ✅ | No-DB lane. |
| **Production build** (`npm run build`) | ❌ **not in CI** | Pre-existing gap, **left as-is** — out of this slice's branch-gate scope. Noted as a candidate follow-up (would need an env-less build to pass, consistent with the project's "build passes without API keys" rule). |
| Smoke (`npm run smoke:prod`) | ❌ intentional | Needs a deployed origin + creds; not CI-suitable today. |
| Local e2e (`npm run test:e2e`) | ❌ intentional | Needs a test Supabase project (V2-READY-0C). |
| DB integration suites (`ALLOW_DB_INTEGRATION_TESTS`) | ❌ intentional | Destructive; needs a test Supabase project (V2-READY-0C). |

No coverage was added or removed — only the trigger branch changed. The intentional
exclusions (smoke/e2e/DB) remain gated on the future test-Supabase decision.

---

## 5. Readiness note

- **CI now tracks the active branch.** `v2-main` PRs + pushes run typecheck + lint +
  structure + migrations + Jest. The previously-ungated working branch is covered.
- **DB-gated suites still require V2-READY-0C** (stand up a throwaway test Supabase
  project + a CI job with `ALLOW_DB_INTEGRATION_TESTS=true`). Until then ~46
  RLS/account-model/billing-foundation suites run only on manual opt-in.
- **Smoke / e2e stay manual/scripted, not CI-gated** (see
  [`docs/runbooks/v2-smoke-testing.md`](../../../runbooks/v2-smoke-testing.md)). The
  same test-Supabase project unblocks a CI smoke/e2e job (A5 in V2-READY-3).
- **Build-in-CI** is a noted, separate follow-up — not added here.

---

## 6. Checks run

- `npm run lint:structure` — see slice report (added one doc to the `readiness/` leaf,
  well under the 50 cap).
- **YAML parse validation** of `ci.yml` — see slice report (the repo has no dedicated
  workflow-lint tool; validated that the edited workflow still parses).
- No `npm run lint` gain expected — ESLint targets TS/TSX/JS, not YAML/Markdown, and no
  source changed. No `npm test` (no Jest utilities/source touched). No `npm run build`
  (no app source touched).

---

## 7. Closeout confirmation

One workflow file retargeted (`v2-foundation` → `v2-main`) + four CI-relevant docs
updated + this record added. No migration, no `db:push`, no push/deploy. No AI / MCP /
billing behavior changed (the parallel chat's in-flight AI-REPAIR files in the working
tree were not touched). No new providers. Historical non-CI branch references were
intentionally left untouched to avoid churn.
