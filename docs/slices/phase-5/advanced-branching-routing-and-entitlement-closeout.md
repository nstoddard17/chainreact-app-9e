# Advanced Branching — Routing Hardening + Plan Entitlement (BRANCH-ENT-1) — CLOSEOUT

> Status: COMPLETE (local-only, 2026-07-19/20). Plan:
> [`advanced-branching-routing-and-entitlement-plan.md`](./advanced-branching-routing-and-entitlement-plan.md).
> Nothing pushed, no PR, no deploy, no `db:push`, **no migration**.

## What shipped (commit chain)

| Commit | Content |
|---|---|
| `abd744bb8` | `advanced_branching` capability policy (planPolicy + fail-closed resolver pair) + canonical restricted-node classifier (`core/workflows/advancedBranching.ts`) + `getPlanState(+ServiceRole)` repo reads |
| `96df539c8` | Engine D1 fix — order-independent reconvergence (fixpoint worklist); truthful If/Then + Router output metadata (D2) |
| `b3ba54828` | Shared branch-wiring validation (`missing_branch_edge` / `stale_branch_edge`) in `findGraphIssues` → builder drawer + write-path readiness + engine backstop + diagnostics (D3) |
| `39b3758d7` | Builder branch authoring (D4): labeled True/False/route source handles (stable `branch:<label>` ids) + Always cleanup handle, on-edge route pills, label-preserving connect/insert/delete, config-change edge reconciliation |
| `352c07ca3` | Server enforcement: `planFeatureGate` (typed `PLAN_FEATURE_REQUIRED`) at saveDraftDefinition / template use+replace / AI apply+guidance / activate / publish / resume / run-now / engine pre-billing choke point + background one-shot lifecycle disable |
| `91282fdff` | Free-plan locked library entries (Pro badge + explanation + `/account` CTA), page-level entitlement threading, insertion backstop |
| C7 commit | Playwright journeys: paid builder-driven If/Else, free locked-library + typed API rejection, downgrade recovery |
| (this commit) | engine.ts lint cap 590→640 (documented), closeout doc |

## Product decisions (locked)

- **Capability:** `advanced_branching` = `native:if_then_condition` ("If/Then
  Condition") + `native:router` ("Router"). Type-level classification — the
  `onFalse:"skip"` filter-style config of If/Then is the same node/library
  entry/handler and is restricted with it; a separate Free-safe linear Filter
  node is a documented follow-up. Labeled edges, the condition evaluator, and
  engine branching primitives are NOT gated.
- **Entitled:** `account_billing.plan ∈ {pro, team, business, enterprise}` AND
  `plan_status ∈ {active, trialing, past_due}` on the **workflow-owning
  account**. Trials = `trialing`. `canceled`/`incomplete`/missing row/read
  error → denied (fail closed). `accounts.type` and `billing_mode` are never
  consulted for this capability.
- **Typed error:** `PLAN_FEATURE_REQUIRED` (HTTP 403 body with `capability`,
  `requiredPlan: "pro"`, `upgradeRoute: "/account"`, offending `nodeIds`; new
  `RunFailureCode` humanized to the existing `upgrade_plan` CTA).
- **Save rule:** validate the PROPOSED definition — reject saves that add or
  retain branching without entitlement; a compliant replacement always saves
  (downgrade recovery). Reads are never gated.
- **Downgrade + background runs:** engine rejects before readiness/billing
  (test runs included → zero handler calls, zero side effects, zero task
  deduction). Webhook/scheduled/api_key-sourced rejections disable the active
  workflow ONCE via the existing lifecycle orchestrator (existing
  `billing_exhausted` enum value + branching `disabled_context`) so triggers
  stop refiring; recovery is the normal upgrade-or-remove-node →
  Reactivate → Resume path. No auto-resume on upgrade.

## Deliberate semantic changes

1. **Reconvergence is now edge-order independent** (previously a merge node on
   a shorter path than its activating parent was mis-skipped depending on edge
   array order).
2. **New blocking readiness issues**: a returnable branch label without a
   destination edge, and a stale labeled edge on a branching node, now fail
   builder validation / activation / publish / run-now / engine readiness
   (`WORKFLOW_NOT_READY`) instead of dying mid-run with `INVALID_BRANCH` or
   silently never running a path. `INVALID_BRANCH` remains the runtime backstop.
3. **Entitlement enforcement itself** — Free accounts previously could obtain
   branching via templates/AI/direct PATCH (never via the builder, which could
   not author labels at all).

## Verification (all actually run)

- `npx tsc --noEmit` — clean.
- `npm run lint` — **0 errors**; 21 warnings, all `max-lines` (pre-existing
  default-cap files e.g. `repositories/accountBilling.ts` — already 571 code
  lines at HEAD — plus documented caps). After the 640 cap bump, engine.ts is
  warning-free.
- `npm run lint:structure` — OK. `npm run lint:migrations` — OK.
- Focused suites (green at their commits): policy/classifier/resolver (192),
  engine incl. D1 regressions + plan gate (111), branch wiring + readiness +
  builder validation (369), builder branch handles/slice/canvas (310),
  save/template/AI/checkpoint gates (248+), locked-picker UX (303 across
  panels+builder).
- Playwright `advanced-branching-entitlement.spec.ts` — **3/3 passed**
  (`--workers=1`, 2.7m): paid journey (library add → handles → save/reload →
  activate → TRUE run and FALSE run with correct skips + cleanup + run-history
  skipped display), free journey (locked entry + typed 403 + nothing
  persisted), downgrade journey (blocked run → editable → compliant
  replacement → publish → runs again).
- Playwright `native-nodes-slice-3-control-flow-walkthrough.spec.ts` —
  **4/4 passed** (1.2m) after a test-harness refresh (email-link sign-in
  around the project CAPTCHA, Pro-plan stamp for the throwaway account,
  onboarding-overlay dismissal, toolbar-scoped Create click, "Pause"
  active-state signal, TERMINAL-status run polling for the durable-queue
  model). Proves Router first-match-wins / defaultRoute / skip persistence and
  both If/Then scenarios e2e on the fixed engine.
- Full `npm test` — 2,298 suites passed / 42 failed (25,757 tests passed / 97
  failed / 81 skipped). **Every one of the 42 failing suites was re-run at the
  pre-batch baseline (`git worktree` @ `abd744bb8~1`) and fails identically
  there** — 9 unit/structure suites (incl. the known
  activeAccount / MCP option-source / WorkflowCanvas-History cluster) and 32
  live-dev-DB integration suites (RLS/migration/billing/dev smokes). One
  additional suite (`react-agent-repair-apply-audit.dev`) failed once on a
  random-UUID-contains-"456" needle collision and passed on re-run (flaky by
  design, pre-existing).
- Action-smoke workflow mode (`run-all.workflow.dev`) — initially FAILED on
  this batch's tree because the branching fixtures ran as bare terminal nodes
  on a Free disposable smoke account (both now rightly blocked). Fixed in the
  harness, not by weakening the rules: `buildSmokeManualRunDefinition` wires
  one format_transformer sink per returnable route label (same canonical
  vocabulary helper as the validator) and `provisionDisposableSmokeAccount`
  stamps the throwaway personal account Pro (smoke certifies actions, not
  billing). Suite now **passes (2/2)**.

## Operational requirements

None. No migration, no `db:push`, no env var, no Stripe change, no Vercel
change, no backfill. `workflow_disabled_reason.billing_exhausted` already
existed in the enum (previously unused by code).

## Follow-ups (not this batch)

- Optional Free-safe linear **Filter** node (separate node type) if product
  wants Free condition-gating without route selection.
- Builder auto-migration of router-route RENAMES onto existing edges (today a
  rename drops the stale edge and the user re-wires; validation names the
  missing route).
- `SUSPICIOUS_BRANCH_LABEL` (labeled edge from a non-branching node) stays a
  non-blocking AI-patch warning by design — the engine substrate deliberately
  allows future handlers to emit `branchTaken`.
