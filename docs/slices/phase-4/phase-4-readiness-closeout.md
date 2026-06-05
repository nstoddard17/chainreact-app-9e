# 4.PHASE-4-READINESS-CLOSEOUT — Phase 4 Readiness / Closeout

**Type:** Closeout / readiness / handoff. **Docs only** — no source, schema,
migrations, tests, or UI in this slice.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1` (everything below landed locally on this branch).

> **Read this first.** This doc consolidates the Phase 4 subsystem closeouts
> (account model, teams, workflows, folders/trash, account settings) into one
> readiness source-of-truth, records the **verified migration state** (all 48
> migrations applied; the previously-flagged `20260605000002` "db:push debt" is
> **resolved**), captures the **local baseline** (typecheck / lint / lint:migrations
> / lint:structure / jest) run on 2026-06-05, and lists the **remaining known
> deferrals**. It is a checklist and handoff, **not** implementation. Nothing in
> this slice changes behavior.

---

## 1. Summary

Phase 4's account-model + account-settings foundation is **complete locally** on
`builder-ui-v1-audit-1`:

- **Account model:** account-owned everything (workflows / integrations / runs /
  billing), three account types (`personal` / `team` / `organization`), three roles
  (`owner` / `admin` / `member`), membership-based RLS, owner-transfer + leave-team,
  personal-deletion lifecycle. Business member cap landed at **25**.
- **Teams:** Team page (members, invitations, role changes, ownership transfer,
  leave), member-identity display, member-limit guard, credential-access audit +
  execution/offboarding fixes. Team workflow-builder credential consistency (22D-1/2/3)
  is **done** — broad Team workflow work is unblocked.
- **Workflows:** active-account-scoped dashboard, workspace/account switcher
  (desktop + mobile), nested folder tree navigation, list-view bulk actions.
- **Folders / trash:** workflow folders + trash schema and UI (folders ≤ tier limit,
  max depth 3), nested tree, account-scoped.
- **Account settings:** design-faithful shell + left sub-nav; **functional** Profile
  (display name), Notification preferences, Security & access (read-only + password
  change), personal Danger zone; **read-only/coming-soon** Plan & billing and API &
  webhooks. User-facing labels say **Team / Business** — never "Organization".

User-facing honesty held throughout: every unsupported area is an **honest
"coming soon"** — no fake toggles, inputs, meters, keys, or fabricated data.

---

## 2. Subsystem readiness

### 2.1 Account model — COMPLETE (local)
- Types `personal | team | organization`; roles `owner | admin | member`
  ([contracts/accounts.ts](../../../contracts/accounts.ts)).
- Authorization chokepoint `requireAccountRole(userId, accountId, allowed)`
  ([services/accounts/accountAuthz.ts](../../../services/accounts/accountAuthz.ts));
  active-account resolution `resolveActiveAccount`
  ([services/accounts/activeAccount.ts](../../../services/accounts/activeAccount.ts)).
- Membership-RLS via `is_account_member()` SECURITY DEFINER + freeze-aware joins
  (`accounts.deletion_status = 'active'`); writes service-role/RPC-only.
- Owner-transfer + leave-team (TL-1…TL-5); transfer RPC locked to service_role.
- Business member cap = **25** (`4.ACCOUNT-MODEL-BUSINESS-LIMIT-1`, `13ba61960`) —
  resolves the brief-vs-code mismatch the billing plan flagged.
- **Closeouts:** [account-model-closeout.md](./account-model-closeout.md),
  [account-deletion-flow-closeout.md](./account-deletion-flow-closeout.md),
  [account-switcher-closeout.md](./account-switcher-closeout.md).

### 2.2 Teams — COMPLETE (local)
- Team page: members roster (identity via `get_account_member_identities` RPC),
  invitations, role changes (admin↔member), ownership transfer, leave-team,
  member-limit guard (`memberLimitFor`: team 5, org 25, personal 1).
- Credential access: audit + execution-time pin + offboarding revoke; builder/options/AI
  credential consistency (22D-1/2/3) done.
- **Closeouts:** [team-account-launch-closeout.md](./team-account-launch-closeout.md),
  [team-workflows-closeout.md](./team-workflows-closeout.md),
  [team-credential-access-closeout.md](./team-credential-access-closeout.md).

### 2.3 Workflows — COMPLETE (local, for the Phase-4 scope)
- Dashboard renders for the **active account** (fixed the folders create-but-not-shown
  bug, `92c134d64`); workspace switcher + active-account consistency (`a0365ad0c`),
  mobile switcher (`d78ce058b`).
- Nested folder tree navigation (`3f62e4947`, `b59f52454`); list-view bulk actions
  (`d397d2e09`).
- Execution engine, dispatch, trigger lifecycle, and provider runtime are pre-Phase-4
  foundations (not re-closed here).

### 2.4 Folders / trash — COMPLETE (local)
- Schema: [20260603000000_workflow_folders_and_trash.sql](../../../supabase/migrations/20260603000000_workflow_folders_and_trash.sql);
  account-scoped, RLS + Data API GRANTs.
- Limits: `folderLimitFor` (personal 10 / team 100 / organization 250), max depth 3 —
  tier numbers only, same behavior across tiers.

### 2.5 Account settings — COMPLETE (local)
- Shell + grouped left sub-nav (Personal / Workspace / Account control).
- **Functional:** Profile display name, Notification preferences, Security & access
  (read-only email/verification/sign-in-method + password change), personal Danger zone.
- **Read-only / coming-soon:** Plan & billing (BILL-1, real tier label + real task
  usage + member/folder limits, no fake meters), **API & webhooks** (API-WEBHOOKS-2,
  two honest panels: account-scoped API keys + outbound webhooks, both "coming soon").
- **Closeouts:** [account-settings-closeout.md](./account-settings-closeout.md),
  [account-settings-billing-closeout.md](./account-settings-billing-closeout.md);
  API/webhooks plan: [account-settings-api-webhooks-plan.md](./account-settings-api-webhooks-plan.md).

---

## 3. Migration state — ALL APPLIED (verified 2026-06-05)

- **Local migration files:** 48. **DB-recorded (`supabase_migrations.schema_migrations`):**
  48. **Latest:** `20260605000002_user_profiles_notification_preferences.sql`.
- `npm run db:push` → **"Remote database is up to date."** No pending/unapplied
  migrations remain.
- **Previously-flagged "db:push debt" is RESOLVED.** The billing closeout noted
  `20260605000002` (notification preferences) as unapplied. Verified directly against
  the DB: columns `notify_product_updates` (default `false`), `notify_workflow_alerts`
  (default `true`), `notify_team_activity` (default `true`) all exist on
  `public.user_profiles`, and version `20260605000002` is recorded.

| Migration | State |
|---|---|
| All 48 local migrations (`…20260605000002`) | ✅ Applied / recorded |
| Unapplied migrations | **None** |

---

## 4. Local baseline (2026-06-05)

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | ✅ Clean |
| `npm run lint` (`eslint .`) | ✅ **0 errors**, 17 warnings — all pre-existing (`scripts/trash/*`, one `max-lines` in `services/ai/tools/workflowContext.ts` at 423/400, one unused eslint-disable in a test). None from Phase-4 settings work. |
| `npm run lint:migrations` | ✅ OK — every user-data table migration enables RLS + has ≥1 policy. |
| `npm run lint:structure` | ❌ **FAIL** — `docs/slices/phase-4` has 64 files (limit 50). **Pre-existing docs-accumulation debt, not a code/behavior issue** (see §5). |
| `npx jest` | ✅ **15,688 passed**, 113 skipped, **0 failed** (1385 suites passed, 27 skipped — the skips are live-DB `.dev` integration tests). |

> Net: the code baseline is green (typecheck, lint, migration-RLS, full jest). The
> only red is the **documentation** leaf-count limit on `docs/slices/phase-4`.

---

## 5. Remaining known deferrals

**Documentation / structure**
- **`docs/slices/phase-4` leaf-count violation (64 > 50).** Pre-existing; this readiness
  doc does not resolve it (a docs reorg re-homing ~64 files + fixing their relative
  cross-links is a separate, link-risk-bearing slice). Options: subfolder the closeouts
  (e.g. `phase-4/closeouts/`), archive completed audits, or raise the limit. **Not done
  here.**

**Billing / payments** (per [account-settings-plan-billing-plan.md](./account-settings-plan-billing-plan.md))
- **No Stripe / payments** — no checkout, portal, invoices, payment method, next-billing
  date, or per-tier prices. Deferred to a real Stripe slice (BILL-PAYMENTS).
- **No plan/tier metadata** — tier is derived from account `type` only; **Pro** and
  **Enterprise** have no internal representation (BILL-PLAN-METADATA).
- **Per-tier task quotas** are a flat default 100 for all tiers (no per-tier numbers yet).
- **Account-billing rescope (-9a…-9d) not shipped** — ledgers (`task_usage_events`,
  `ai_cost_events`) still user-scoped; `user_billing` legacy twin still parallel
  (drops at -9c). `account_billing` + `getUsage` already exist, so BILL-1 did not block
  on this; ledger-based usage history does.
- **Reserve/reconcile + overage/packs** built but **flag-gated OFF**
  (`ENABLE_RESERVE_RECONCILE_BILLING=false`); `tasks_reserved` not surfaced as in-flight.

**API keys & webhooks** (per [account-settings-api-webhooks-plan.md](./account-settings-api-webhooks-plan.md))
- Only the read-only "coming soon" surface (Phase A) shipped. Deferred: account-scoped
  **API keys** (Phase B — hash + prefix, owner/admin, trigger-only scope, rate limiting
  prereq), **inbound customer trigger keys** (Phase C), **outbound webhooks** (Phase D —
  delivery queue + retry + signing + delivery ledger).
- **No rate-limiting infrastructure** exists anywhere — a hard prereq before any public
  API key.
- **Hygiene:** inbound provider webhook secrets are stored **plaintext** in
  `trigger_resources.config`; migrate to encrypted storage in a separate slice.

**Security & access** (per [account-settings-security-access-plan.md](./account-settings-security-access-plan.md))
- **2FA**, **sessions/devices**, and **connected accounts** (OAuth/SSO sign-in) remain
  honest "coming soon" — auth is email + password only today. **Avatar** also deferred.

**Account model**
- **Phase D (account deletion of shared accounts / full purge-flow extensions)** not
  started — personal deletion lifecycle is complete; there is intentionally no
  shared-account delete in the UI (managed via Team transfer/leave). Top candidate for
  the next account-model slice.
- **Enterprise** tier (departments / groups / config limits) — future arc; no internal
  type yet.

**Workflows / providers** (context, outside the strict Phase-4 settings scope)
- Provider runtime is broad; **builder metadata coverage** has launch-scope gaps tracked
  separately (see the provider metadata trackers in this folder). Not gating account
  settings.

---

## 6. Acceptance / report summary

- **Migrations:** 48/48 applied; latest `20260605000002`; `db:push` reports up to date;
  the notification-preferences "db:push debt" is **resolved** (columns + version verified
  directly against the DB). **No unapplied migrations.**
- **Baseline:** typecheck clean · lint 0 errors (17 pre-existing warnings) ·
  lint:migrations OK · **lint:structure FAIL (docs leaf-count 64 > 50, pre-existing)** ·
  jest 15,688 passed / 113 skipped / 0 failed.
- **Phase-4 subsystems** (account model, teams, workflows, folders/trash, account
  settings) are **complete locally** on `builder-ui-v1-audit-1` with honest
  coming-soon placeholders for everything not yet supported.
- **Key deferrals:** Stripe/payments + plan metadata + account-billing rescope (-9a…-9d);
  API-keys/webhooks implementation (Phases B–D) + rate limiting; 2FA / sessions /
  connected accounts / avatar; account-model Phase D + Enterprise; the
  `docs/slices/phase-4` leaf-count reorg.
- This is a **docs-only readiness/handoff** slice — no source, schema, migration, test,
  or UI changes.
