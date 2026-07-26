# ANALYTICS-RELEASE-AND-PROVIDER-SKILL-1 — Production release and provider-skill amendment

**Status:** ✅ **RELEASED TO PRODUCTION.** Pushed as an ordinary fast-forward; the new
build is live and serving. Analytics exposure unchanged by the release.
**Date:** 2026-07-26 · **Released commit:** `2ef761593`

---

## 1. Starting state (recorded before any change)

| Item | Value |
|---|---|
| Local `v2-main` | `64f57de39` |
| `origin/v2-main` | `b62bf2021` (**had moved independently**) |
| Analytics arc tip | `d00083c4b` (branch `analytics-cd5b-drilldown`) |
| Merge base | `64f57de39` |
| Shared working tree | branch `react-agent-multistep-data-mapping-1`, clean — **not touched** |
| Analytics worktree | `ChainReactV2-wt-cd5b`, clean |
| `d00083c4b` reachable from local `v2-main`? | No |
| `d00083c4b` reachable from `origin/v2-main`? | No |

`origin/v2-main` carried **3 commits** the Analytics arc did not have
(`54be3bba8` account email-code verification, `9d2abf272` deletion-authorization
atomicity, `b62bf2021` react-agent guidance timeout + bounded retry). The arc carried
**24 commits** the remote did not. This was a genuine divergence, not a
fast-forward — so the fast-forward path in the release plan did not apply.

## 2. Backup

`backup/v2-main-before-analytics-release-2026-07-26` → `64f57de39`, verified equal to
the original local `v2-main`. Local-only; never pushed, never deleted.

## 3. Reconciliation method — merge, and why

Isolated worktree `C:/Users/marcu/source/repos/ChainReactV2-wt-release`, branch
`analytics-release-and-provider-skill-1`, based on `origin/v2-main` (`b62bf2021`),
then `git merge --no-ff d00083c4b`.

**Zero conflicts** — verified in advance: the two change sets share **no file**. The
remote's 3 commits touch account deletion, sensitive-action challenges and the
react-agent gateway (67 files); the arc touches the insights platform, chart/builder
features and its own docs (133 files); the intersection is empty.

**Merge was chosen over rebase deliberately.** Rebasing would have rewritten all 24
arc commit SHAs, and the arc's own outcome documents cite those SHAs
(`cf7d11c34`, `d65a6da6a`, `91e80fa1e`, `4f4add6b3`, `66707ea87`, `6495a1d09`,
`05c0987cc`, `a9b9ad2ed`, `646ca838d`, `f95fdd3c5`, `d00083c4b`) — rebasing would have
turned every one of those references into a dangling lie. The merge preserves every
commit identity on both sides, matches this repo's documented concurrent-session rule
("completed, approved branches merge or fast-forward into `v2-main`"), and follows the
existing precedent commit `ee6e1b5ea`. Post-merge, `origin/v2-main` was an ancestor of
`HEAD`, so the push was an ordinary fast-forward.

Both sides verified present after the merge: account-deletion and react-agent files
intact; CD-5A/CD-5B analytics files intact.

## 4. Final commit range

Pushed `b62bf2021..2ef761593` — **26 commits** (24 arc + 1 merge + 1 docs/skill batch).

| Commit | Contents |
|---|---|
| `f1601c8ec` | merge: reconcile the Analytics arc onto `v2-main` |
| `2ef761593` | docs/skill: Analytics disposition gate, testing-policy correction, project docs, Help Center |
| (24 ancestors) | the complete Analytics arc through `d00083c4b` |

**Push-content audit (all clean):** no migration · no `.env`/secret/credential file ·
no test artifact, report or generated download · no custom-node, Slack, Fleetio,
vehicle-link or workflow-builder work · no provider exposure change.

## 5. Documentation updated

| Document | Why |
|---|---|
| `.claude/skills/chainreactv2-provider-integration-builder/SKILL.md` | **New Phase 8.5 — Analytics disposition** (mandatory gate + eligibility checklist + implemented-dataset requirements + exposure rule); added to the hard definition of done (item 16) and to the implementation-plan deliverable; testing section corrected. |
| `.claude/skills/README.md` | Skill row now names the Analytics disposition among the deliverables. |
| `CLAUDE.md` | Provider Implementation Pattern gains the Analytics-disposition step (now step 8 of 11); new **Analytics** authoring rule (18); **Testing Gates** rewritten off the full-suite default. |
| `docs/rules/testing-strategy.md` | New "Scope of a verification run (owner policy)" section — the authoritative testing doc no longer conflicts with `CLAUDE.md`. |
| `docs/PROJECT_MEMORY.md` | Arc recorded under Recently completed; two durable decisions added (no-full-suite/Docker default; Analytics disposition required). |
| `docs/slices/phase-4/v2-go-live-status.md` | Analytics release section (exposure, reconciliation, verification, release note). |
| `features/marketing/help/**` | **New customer-facing Analytics category + 6 articles.** |

### Provider-addition skill — what changed in substance

Every net-new provider must now record exactly one **Analytics disposition**:

- **A. Implemented** — useful, safely readable facts + passing live certification.
- **B. Eligible but blocked** — stays absent or `preview`; requires a committed
  read-only certification harness, a blocked report, and the exact owner action that
  unblocks it. Fixture-only "certification" is explicitly forbidden.
- **C. Not suitable** — with the reason (too sensitive · free text · current-state with
  no honest question · unbounded · high-cardinality · misleading without absent
  history · redundant · not worth the scan cost). **No token dataset to check a box.**
- **D. Deferred by owner** — candidate dataset and required future certification
  recorded; never silently omitted.

Plus a full eligibility checklist (credential/ownership · candidate datasets ·
date semantics · honest measures · dimensions and filters · money and units ·
pagination and provider cost · privacy projection · existing scopes) and the durable
exposure rule: **a dataset is never public merely because its adapter passes unit
tests.**

### Testing-policy correction

The three active documents that told agents to run the whole repository suite after
every batch now agree: the default is the four static checks plus **the focused suites
a change actually touches**, with exact totals reported; Docker/Supabase are not
started for ordinary verification; browser tests run only when the environment is
already available, targeted spec only; **a blocked browser scenario is reported as
blocked, never as passed**; a full-suite run requires Marcus's explicit per-batch
authorization.

## 6. Release verification

### Static checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | clean (exit 0) |
| `npm run lint` | **0 errors**, 29 warnings |
| `npm run lint:structure` | 1 violation — `docs/slices/phase-5` root at 51 files |
| `npm run lint:migrations` | OK — no migration added |

**Warning delta explained honestly:** the Analytics worktree measured 27 warnings;
this release worktree measures 29 because it also contains the merged remote work. The
2 extra warnings sit on remote-side files (`app/api/accounts/[id]/ai/workflow-guidance`,
`lib/api/accounts.ts`, `services/ai/reactAgent/...`). **No file created or edited in
this batch produces a warning.** The structure violation is the same pre-existing
phase-5 docs-root offender; this batch added nothing to that folder.

### Focused release gate

| Command | Suites | Tests |
|---|---|---|
| `npm test -- tests/unit/services/analytics/insights/ tests/unit/features/analytics/insights/` | 29 | 528 |
| `npm test -- tests/unit/features/marketing/HelpCenterPage.test.tsx tests/unit/features/marketing/HelpArticlePage.test.tsx tests/unit/app/HelpRoutes.test.tsx tests/unit/app/api/analytics/ tests/unit/core/analytics/` | 11 | 185 |
| **Total** | **40** | **713** |

All passed; 0 failures, 0 skipped. This is a bounded post-integration gate — the full
117-suite / 1,710-test certification evidence was produced in
[`analytics-final-certification-1.md`](./analytics-final-certification-1.md) and was
not re-run wholesale, because the merge changed no Analytics file (zero overlap).

**Boundaries honored:** Docker was not used or started; Supabase was not started; the
full repository suite was not run; the full Playwright suite was not run.

## 7. Push and remote verification

```
git push origin v2-main
b62bf2021..2ef761593  v2-main -> v2-main
```

Ordinary fast-forward. **No `--force`, no `--force-with-lease`, no history rewrite, no
temporary release branch, no PR.** Post-push `git fetch` confirms
`origin/v2-main` = `2ef761593` = local `HEAD`.

## 8. Deployment and production health

Production served the **new build** — verified by content, not by the push alone:

| Check | Result |
|---|---|
| `https://chainreact.app/` | 200 |
| `/help` | 200, and renders the **new** "Build charts from your workflow runs" Analytics category blurb |
| `/help/build-a-custom-insight` | 200, renders "Build a Custom Insight" |
| `/help/choose-a-chart-type`, `/date-ranges-and-comparison`, `/explore-a-chart-value`, `/export-a-chart-to-csv`, `/why-some-data-isnt-available` | 200 each |
| `/analytics` unauthenticated | 307 → sign-in (correct) |
| Production public smoke (`playwright.smoke.config.ts --project=public`) | **14 passed, 0 failed, 0 skipped** |

All six help routes are new in this release, so serving them is direct proof the
deployment built from `2ef761593` and is live. No rollback observed; no new environment
variable is required; no migration was attempted (none exists in the pushed range).

### Authenticated production smoke — BLOCKED (pre-existing, not a release defect)

The authenticated Analytics smoke (create a disposable Insight → chart → drill →
Back/Reset → CSV → remove) **could not run**. `PRODUCTION_SMOKE_EMAIL` /
`PRODUCTION_SMOKE_PASSWORD` exist and were supplied, but the sign-in form's submit
button stays `disabled`: Cloudflare Turnstile issues no token to an automated browser.
This is the **known, previously documented** limitation recorded in
`v2-go-live-status.md` and PROJECT_MEMORY — not something this release introduced.

The documented workaround (service-role `generateLink` → `/auth/callback`) has no
harness wired into `playwright.smoke.config.ts`; building production-write automation
at release time was judged the wrong trade against an already-verified deployment.
**Recorded as blocked. Not claimed as passed.** Public-route and build-health evidence
above stands in its place, exactly as the release plan prescribes for this case.

## 9. Production inventory after release (unchanged by it)

**Public:** ChainReact → Workflow runs · QuickBooks → Invoices · Shopify → Orders
**Preview (development only, absent from the production catalog):** Stripe → Payments
**Absent / unregistered:** HubSpot → Deals · Motive → Fuel purchases

Verified on the released commit: `registry.ts` registers exactly four sources;
`exposure` is `public` for ChainReact/QuickBooks/Shopify and `preview` for Stripe;
HubSpot and Motive are not registered at all.

## 10. Release note (ship with the release)

> **Existing Custom Insights with a custom date range will now correctly include the
> selected end date. Because the previous behavior accidentally excluded that final
> day, some existing chart totals may increase after release.**

Presets are unaffected — only saved **custom** ranges change.

## 11. Remaining work

- **Stripe → Payments**: public certification pending a connected Stripe **test**
  account; harness committed and ready.
- **HubSpot → Deals**: pending a portal with populated deal **amounts**.
- **Motive → Fuel purchases**: pending fuel-purchase history.
- **Browser certification** of the launch-visible Analytics flows — still outstanding;
  needs either the local Supabase e2e stack or a captcha-free production smoke session.
- Deliberately deferred: external-provider raw-record drill-through · ChainReact Runs
  URL-filter navigation · calendar-aligned month comparison · line-chart series drill UI.

## 12. Confirmations

No migration · no `db:push` · no force push · no history rewrite · no PR · no provider
exposure change · no OAuth scope change · no unrelated work in the pushed range ·
Docker never started · full repository suite never run · another session's working tree
never touched.
