# 4.DOCS-HYGIENE-1 — Phase 4 Markdown Cleanup Audit

**Type:** Audit / report only. **No deletions, no moves, no source / migration / test /
UI changes in this slice. Nothing pushed.**
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`
**Predecessors:** [`README.md`](./README.md) (the `4.DOCS-STRUCTURE-1` reorg index) ·
[`phase-4-readiness-closeout.md`](./phase-4-readiness-closeout.md) (flagged the leaf-count
debt as a deferral).

> **Headline:** The Phase-4 docs are in **good** hygiene. The `4.DOCS-STRUCTURE-1` reorg
> already grouped audits/closeouts into six topical subfolders, kept every **code-cited**
> doc at the stable phase-4 root (so source/test/migration comments still resolve), and
> updated in-doc cross-links. **`npm run lint:structure` now PASSES** (root = 28 files,
> ≤ 50) — the leaf-count violation the readiness closeout reports as open is **already
> resolved**. This audit found **no duplicates, no docs safe to delete, and only one
> genuinely reorg-broken link** (a trivial relative-depth miss in
> `ai/react-agent-end-to-end-audit.md`). The remaining ~22 broken links are **stale
> pointers to source files** (renamed/removed V2 paths or copied V1 paths) inside
> historical planning/design docs — low harm, fix opportunistically. **Recommendation:
> keep everything where it is; do a small link-repair follow-up (CS optional).** No
> archive/delete is warranted right now.

---

## 1. Summary

- **Inventory:** 70 Markdown files under `docs/slices/phase-4` — 28 at the root, 42 in six
  subfolders (`account-model/`, `account-settings/`, `ai/`, `providers/`, `team/`,
  `workflows/`). All share an identical `2026-06-05` mtime (a reorg/move touched them all),
  so **mtime is useless for staleness** — this audit relies on **reference/link evidence**,
  not timestamps.
- **Structure health:** `npm run lint:structure` → **OK** (every leaf folder ≤ 50). The
  readiness closeout's "lint:structure FAIL — 64 > 50" (§4/§5 there) describes the
  **pre-reorg** state and is now **stale**.
- **Code-citation integrity:** 22 root docs are cited by **non-doc** files
  (migrations/tests/source/`CLAUDE.md`). The only **full-path** code citation
  (`core/integrations/credentialSharing.ts:4` →
  `docs/slices/phase-4/team-integration-credential-access-audit.md`) points at a file that
  **remained at root** — so the reorg broke **zero** code references. One doc
  (`team/team-workflows-1-builder-plan.md`) is cited by **bare filename** only and was moved
  into `team/`; the reference still resolves by name but is now a "soft" pointer.
- **Duplicates:** none found. Similarly-named docs (e.g. `account-switcher-plan` vs
  `account-model/account-switcher-closeout` / `-mobile` / `-consistency-audit`) are distinct
  artifacts (plan / closeout / sub-slice / audit), not copies.
- **Links:** 1343 local links checked; **26 reported broken** → **1** reorg-induced (trivial
  fix), **~22** stale source-path links in historical docs, **2** false positives
  (URL-encoded `[id]` routes that *do* exist), **1** checker artifact.

> **Honesty note:** staleness here is judged from **reference signals** (broken code links,
> supersession by a closeout), not an exhaustive line-by-line content re-read of all 70
> files. Where I call a doc "superseded," I mean a closeout now owns the live state — the
> plan/audit is retained as history, not re-verified clause-by-clause.

---

## 2. Docs that MUST remain at stable paths (code-cited — do NOT move/rename/delete)

These are referenced by **source / test / migration / `CLAUDE.md`**. Moving or renaming
them would break those references. All are currently at the phase-4 **root** (correct).

| Doc (root) | Cited by (non-doc) |
|---|---|
| `account-model-foundation-plan.md` | `contracts/accounts.ts`, `repositories/accounts.ts`, `repositories/accountMemberships.ts`, `services/accounts/ensurePersonalAccount.ts`, migration `20260530000000`, 5 tests |
| `account-id-cutover-plan.md` | migrations `20260530000001..4`, `tests/integration/migrations/account-id-foundation-backfill.test.ts` |
| `account-deletion-flow-plan.md` | migration `20260531000006_account_deletion_lifecycle.sql` |
| `account-owner-transfer-leave-plan.md` | `services/accounts/transferOwnership.ts`, migration `20260604000001` |
| `account-switcher-plan.md` | `services/accounts/activeAccount.ts`, migration `20260531000009`, `tests/unit/services/accounts/activeAccount.test.ts` |
| `account-billing-rescope-plan.md` | migrations `20260531000000`, `20260531000001` |
| `task-cost-billing-model-audit.md` | `services/billing/executionBillingGate.ts`, `services/billing/taskCostPolicy.ts`, migrations `20260525000000/1` |
| `reserve-reconcile-billing-design.md` | migrations `20260525000002/3` |
| `pre-run-workflow-run-lifecycle-design.md` | `repositories/workflowRunsLifecycle.ts`, migration `20260525000004` |
| `api-keys-foundation-plan.md` | `features/account/AccountSections.tsx`, migration `20260607000000`, `tests/unit/features/account/ApiSection.test.tsx` |
| `workflow-folders-trash-plan.md` | migration `20260603000000`, `tests/integration/migrations/workflow-folders-foundation.test.ts` |
| `team-workflows-credential-sharing-plan.md` | `repositories/workflowNodeCredentials.ts`, migration `20260606000000` |
| `team-integration-credential-access-audit.md` | `core/integrations/credentialSharing.ts:4` (**full-path** citation) |
| `security-rpc-execute-audit.md` | migration `20260605000001_member_identities_revoke_anon.sql` |
| `provider-metadata-launch-gap-tracker.md` | `CLAUDE.md` + roadmap |
| `ai-architecture-react-agent-plan.md` | ~43 `services/ai/**` + `core/ai/**` files |
| `ai-cost-telemetry-validation-and-cache-audit.md` | `core/ai/modelPricing.ts`, `services/ai/events/aiCostDebug.ts` |
| `planner-model-tier-routing-audit.md` | `services/ai/planner/modelNarrowingClassifier.ts` |
| `planner-prompt-packet-audit.md` | `services/ai/events/recordAiRouteEvents.ts`, `services/ai/planner/types.ts` |
| `react-agent-live-qa-matrix.md` | `services/ai/planner/completePlanWithRequiredInputs.ts` |
| `builder-ui-v1-port-plan.md` | `app/workflows/[id]/page.tsx`, `features/workflow-builder/hooks/useRightDrawer.ts` |
| `google-calendar-metadata-coverage-plan.md` | `integrations/google-calendar/actions/createEvent.meta.ts` |
| `shopify-metadata-coverage-plan.md` | `services/discovery/providers/shopify.ts` |

**Plus:** `README.md` (the index) and `phase-4-readiness-closeout.md` (phase-level
closeout) stay at root by design.

**⚠ Soft-reference watch:** `team/team-workflows-1-builder-plan.md` is cited by **bare
filename** in `app/api/workflows/_shared.ts:152` and
`features/workflow-builder/layout/ActiveAccountMismatchBanner.tsx:16` ("see
team-workflows-1-builder-plan.md §4"). It resolves by name today but lives in `team/`. If
those code comments are ever upgraded to a clickable path, point them at
`docs/slices/phase-4/team/team-workflows-1-builder-plan.md`. **Do not** rename this file.

---

## 3. Docs that are superseded by closeouts but should REMAIN (history)

The live state of each area is now owned by a closeout; the plans/audits are retained as
historical record (and many are *also* code-cited per §2, so they stay regardless).

| Superseded plan/audit | Live closeout (source of truth) |
|---|---|
| `account-model-foundation-plan.md`, `account-id-cutover-plan.md`, `account-owner-transfer-leave-plan.md` | `account-model/account-model-closeout.md` |
| `account-deletion-flow-plan.md` | `account-model/account-deletion-flow-closeout.md` |
| `account-switcher-plan.md` | `account-model/account-switcher-closeout.md` |
| `account-billing-rescope-plan.md`, `task-cost-billing-model-audit.md`, `reserve-reconcile-billing-design.md` | `account-settings/account-settings-billing-closeout.md`, `account-settings/task-cost-billing-foundation-closeout.md`, `account-settings/reserve-reconcile-internal-rollout-readiness.md` |
| `account-settings-api-webhooks-plan.md`, `api-keys-foundation-plan.md`, `api-keys-run-history-plan.md` | `api-keys-foundation-closeout.md`, `account-settings/account-settings-closeout.md` |
| `team-*` plans (`team-invitations-roles`, `team-member-limit`, `team-org-account-creation`, `team-ui-switcher`, `team-workflows-1-builder`, `team-credential-consistency-builder-ai`) | `team/team-account-launch-closeout.md`, `team/team-workflows-closeout.md`, `team/team-credential-access-closeout.md`, `team/team-workflows-credential-sharing-closeout.md` |
| `team-integration-credential-access-audit.md`, `team-workflows-credential-sharing-plan.md` | `team/team-credential-access-closeout.md`, `team/team-workflows-credential-sharing-closeout.md` |
| `workflows/*-plan.md`, `workflows/page-implementation-guide.md` | `workflows/builder-ai-closeout.md` (+ readiness closeout §2.3) |
| All Phase-4 subsystem plans | `phase-4-readiness-closeout.md` (umbrella) |

**Action: none.** Keep all of these. They are either code-cited (§2) or valuable history.

---

## 4. Docs that COULD be archived (if archiving is ever desired)

**Recommendation: do NOT archive now.** There is no structural pressure
(`lint:structure` passes), the docs are already organized into subfolders, and archiving
would add churn + relative-link risk for no benefit.

If an `archive/` (or `closeouts/`) subfolder is ever introduced, the **only** safe
candidates are the **pure-historical, non-code-cited closeouts** whose state is fully
captured by `phase-4-readiness-closeout.md`:

- `account-model/account-switcher-mobile.md`, `account-model/account-switcher-consistency-audit.md`
- `workflows/builder-options-multi-parent-dependencies.md`,
  `workflows/workflow-folders-bulk-actions-ui.md`,
  `workflows/workflow-folders-nested-tree-ui.md`
- `ai/openai-adapter-setup-and-audit.md`, `ai/react-agent-end-to-end-audit.md`,
  `ai/ai-e2e-smoke-test-plan.md`

Even these are **not recommended** for archiving — they're small, organized, and harmless.
Archiving is only worth it if a future leaf approaches the 50-file limit (none does today;
the largest leaf is `workflows/` at 11 files).

---

## 5. Docs that could be DELETED only after confirmation

**None.** No deletion is recommended in any follow-up. Every file is one of:
code-cited (§2), a current closeout, a parent plan referenced by a code-cited child, or
useful history. There are no duplicates, no empty stubs, and no fully-orphaned files.

(If forced to name the *weakest-value* files, they would be the three pure-UI sub-slice
notes under `workflows/` listed in §4 — but their content is unique and they cost nothing
to keep. **Do not delete.**)

---

## 6. Broken / stale links found

1343 local links checked across all 70 docs. **26 flagged**, categorized by cause:

### 6a. Reorg-induced (fix recommended — trivial, safe)
- **`ai/react-agent-end-to-end-audit.md:28`** → `[next.config.mjs](../../../next.config.mjs)`.
  The file moved from root into `ai/` (one level deeper), so the depth should be
  `../../../../next.config.mjs`. Confirmed: `next.config.mjs` exists at repo root, and the
  sibling doc-link in the same file correctly uses `../ai-architecture-react-agent-plan.md`.
  **This is the only link the reorg actually broke.** One-character class of fix.

### 6b. False positives (NOT actually broken — no action)
- `ai-architecture-react-agent-plan.md` → `app/api/workflows/%5Bid%5D/ai/plan/route.ts` and
  `.../ai/apply/route.ts`. The brackets are URL-encoded (`%5Bid%5D` = `[id]`); the real
  dirs `app/api/workflows/[id]/ai/plan` and `.../apply` **exist**. GitHub resolves these.
  My checker didn't decode `%5B`/`%5D`.
- `builder-ui-v1-port-plan.md` → `memory` — an inline `(memory)` token captured as a link
  by the regex; not a real file link.

### 6c. Stale source-path links in historical docs (low harm — opportunistic fix)
These point at **code paths that don't exist in V2** (renamed/removed, or copied V1 paths).
They live in retained planning/design/audit docs and don't affect code or structure:
- **`repositories/userBilling.ts`** (+ `tests/unit/repositories/userBilling.test.ts`) — 8
  links across `reserve-reconcile-billing-design.md`, `task-cost-billing-model-audit.md`,
  `pre-run-workflow-run-lifecycle-design.md`. No such file in `git ls-files`. (The
  `user_billing` *table* still exists per the readiness closeout's billing deferrals; the
  *repository file* path is stale. The V2 home is `services/billing/taskCostPolicy.ts`.)
- **`lib/workflows/cost-calculator.ts`** — 7 links across the provider metadata-coverage
  plans (`airtable`, `google-drive`, `onedrive`, `outlook-calendar`, `teams`, `trello`) and
  `google-calendar-metadata-coverage-plan.md`. This is a **V1** path
  (`chainreact-app-9e`); V2's equivalent is `services/billing/taskCostPolicy.ts`. Provider
  plans copied V1 references.
- **`features/workflow-builder/canvas/nodes/WorkflowNodeView.tsx`**,
  `features/workflow-builder/panels/AddNodeMenu.tsx`, `.../panels/RunNowPanel.tsx` (4 links)
  in `builder-ui-v1-port-plan.md` — planned/renamed builder component paths.
- **`components/app-shell/navItems.ts`** (`workflows/page-implementation-guide.md`) and
  **`tests/unit/repositories/workflowRuns.listByUserForDisplay.test.ts`**
  (`workflows/runs-page-plan.md`) — renamed/planned paths.

**None of 6c point at a moved phase-4 doc** — the reorg's doc-to-doc link updates held. They
reflect *implementation drift / V1-path copy*, not the reorg.

---

## 7. Recommended cleanup plan

**Posture: light-touch. The reorg already did the heavy lifting correctly.**

| # | Action | Risk | Recommend |
|---|---|---|---|
| 1 | Fix the one reorg-broken link (§6a) `../../../next.config.mjs` → `../../../../next.config.mjs`. | None | ✅ Yes (follow-up) |
| 2 | Update the readiness closeout §4/§5 to note the leaf-count debt is **resolved** (`lint:structure` now passes), or leave a one-line correction. | None | ✅ Yes (follow-up) |
| 3 | Repair the §6c stale source links to their V2 homes (`taskCostPolicy.ts`, current builder paths) **or** annotate them "V1 reference / superseded." | Low | ◐ Optional |
| 4 | Upgrade the two bare-filename code comments (§2 soft-reference) to the `team/` path. | Low (touches **source comments** — out of scope for a docs slice) | ◐ Optional, separate slice |
| 5 | Move non-code-cited root docs (`api-keys-run-history-plan.md`, `account-settings-api-webhooks-plan.md`, `api-keys-foundation-closeout.md`) into subfolders. | Medium (link churn; they're coupled to code-cited root siblings) | ❌ No — keep grouped at root |
| 6 | Archive completed closeouts (§4). | Low–Med | ❌ No — no structural pressure |
| 7 | Delete anything. | — | ❌ No — nothing qualifies |

Net follow-up = items **1 + 2** (both trivial, docs-only), with **3** as a nice-to-have.

---

## 8. Risk notes

- **Code-citation breakage is the real risk** of any docs cleanup. The §2 list is the
  do-not-touch set; the full-path citation in `credentialSharing.ts` and the bare-name
  citations in `_shared.ts` / `ActiveAccountMismatchBanner.tsx` are the specific fragile
  points. Re-run the `git grep` reference map before any rename/move.
- **Relative-depth links** break silently on move (the §6a miss proves it). Any future move
  must re-run the link checker (script embedded in §9) and fix depth.
- **mtime cannot date staleness here** (uniform `2026-06-05`); use git history
  (`git log --follow <file>`) if true authorship dates are needed.
- **No content re-verification** was performed — "superseded" means a closeout owns live
  state, not that the historical doc was line-checked.
- **Subfolder paths are not code-cited anywhere** (verified: zero
  `docs/slices/phase-4/<subfolder>/` references outside docs), so subfolder internals are
  safe to reorganize *among themselves* — but doc-to-doc links must be re-checked.

---

## 9. Proposed follow-up slice (only if cleanup is approved)

**`4.DOCS-HYGIENE-2 — Phase 4 link repair` (docs-only, no push):**

1. Edit `ai/react-agent-end-to-end-audit.md:28`: `../../../next.config.mjs` →
   `../../../../next.config.mjs`.
2. Add a one-line correction to `phase-4-readiness-closeout.md` §4/§5 noting
   `lint:structure` now **passes** post-`4.DOCS-STRUCTURE-1` (leaf-count debt resolved).
3. *(Optional)* Repoint or annotate the §6c stale source links (`userBilling.ts` →
   `services/billing/taskCostPolicy.ts`; `lib/workflows/cost-calculator.ts` → V2 equivalent
   or "V1 ref").
4. Re-run verification: the link checker below + `npm run lint:structure`. Local commit.
   **No deletes, no moves, no source changes, no push.**

A separate **source** slice (not docs) could upgrade the two bare-filename code comments
(§2 soft-reference) to the `team/` path — but that touches `.ts` files and must not be
bundled with a docs slice.

**Reusable link checker** (what this audit ran; add `%5B`→`[` decoding to drop the §6b
false positives):

```js
const fs=require("fs"),path=require("path");
const root="docs/slices/phase-4";
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>{const p=path.join(d,e.name);
  return e.isDirectory()?walk(p):e.name.endsWith(".md")?[p]:[];});
const re=/\[[^\]]*\]\(([^)]+)\)/g;
for(const f of walk(root)){const t=fs.readFileSync(f,"utf8");let m;
  while((m=re.exec(t))){let l=m[1].trim();if(/^(https?:|mailto:|#)/.test(l))continue;
    l=decodeURIComponent(l.split("#")[0].split(" ")[0]);if(!l)continue;
    if(!fs.existsSync(path.resolve(path.dirname(f),l)))console.log(f,"->",m[1]);}}
```

---

## Report summary

- **State:** Phase-4 docs are healthy. `4.DOCS-STRUCTURE-1` reorg correctly subfoldered
  audits/closeouts, **pinned all code-cited docs at root** (zero broken code references),
  and updated doc-to-doc links. `npm run lint:structure` **passes** — the readiness
  closeout's open leaf-count violation is **already resolved**.
- **Must remain (code-cited):** 22 root docs (§2) + README + readiness closeout. One
  soft-reference watch: `team/team-workflows-1-builder-plan.md` (bare-name cite).
- **Superseded-but-keep:** plans/audits whose live state moved to closeouts (§3) — retained
  as history; many are also code-cited.
- **Archive:** none recommended (no pressure; candidates listed in §4 for completeness).
- **Delete:** none. No duplicates, stubs, or orphans.
- **Links:** 1 reorg-broken (trivial fix, §6a), 2 false positives (§6b), ~22 stale
  source-path links in historical docs (§6c, opportunistic).
- **Recommended next step:** `4.DOCS-HYGIENE-2` link-repair (items 1–2 trivial; 3 optional)
  — docs-only, no push.
- **Boundaries honored:** audit/report only. No deletions, no moves, no source / test /
  migration / UI changes. Nothing pushed.
