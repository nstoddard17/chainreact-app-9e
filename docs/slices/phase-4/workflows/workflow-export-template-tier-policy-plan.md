# 4.WORKFLOW-PORTABILITY-TEMPLATES-TIER-POLICY-1 — Export + Template Tier Policy Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, env, or Stripe
changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — each file read this session):**
[services/workflows/exportWorkflow.ts](../../../../services/workflows/exportWorkflow.ts) (sanitizer + single/bulk export builders; `ACCOUNT_WORKFLOW_EXPORT_LIMIT = 200`; folder hierarchy intentionally omitted) ·
[app/api/workflows/[id]/export/route.ts](../../../../app/api/workflows/[id]/export/route.ts) (single export — `requireWorkflowAccountMember`, non-member → 404) ·
[app/api/accounts/[id]/workflows/export/route.ts](../../../../app/api/accounts/[id]/workflows/export/route.ts) (bulk export — `requireAccountRole(["owner","admin","member"])`, non-member → 403) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (`PlanTier`, `PLAN_LIMITS` — member/folder/task numeric caps only; **no feature-capability gating exists**) ·
[services/accounts/accountAuthz.ts](../../../../services/accounts/accountAuthz.ts) (`requireAccountRole` — the single role chokepoint) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) (limits resolve via `defaultPlanForAccountType`, not actual plan — "later wiring slice can pass the account's ACTUAL plan") ·
[contracts/accounts.ts](../../../../contracts/accounts.ts) (`MembershipRole = owner | admin | member`) ·
[contracts/workflowDefinition.ts](../../../../contracts/workflowDefinition.ts) (credential-free node/edge/config shape) ·
[repositories/workflows.ts](../../../../repositories/workflows.ts) (`WorkflowRecord`: `accountId` owner, `createdByUserId` provenance, `draftDefinition`, `folderId`) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`account_billing.plan` is the billing tier; webhook is sole writer) ·
[app/api/workflows/route.ts](../../../../app/api/workflows/route.ts) (workflow create — account-scoped) ·
docs: [business-downgrade-plan.md](../account-settings/business-downgrade-plan.md) (§8 export, CS-BD-4 net-new) · [business-upgrade-plan.md](../account-settings/business-upgrade-plan.md).

**Arc commits referenced:** Business downgrade / export foundation BD-3 (CS-BD-4A single export + sanitizer) · BD-4 (CS-BD-4B bulk account export) · plan metadata 4.BILLING-PLAN-METADATA-2 / CS-1 (planPolicy seam) · Pro value CS-PRO-2 (Pro task cap = first paid benefit).

> **Decision plan, not implementation.** Every "today it works like X" traces to a file read
> this session; every "we should do Y" is a labeled recommendation. This doc changes nothing.

---

## 1. Context

Two adjacent capabilities are now ready to be governed by tier policy:

- **Workflow export/download** already exists end-to-end in V2 (single + bulk, credential-free,
  strong sanitizer) but is **gated only by account membership/role — never by plan tier.** It was
  built primarily as a *safety* feature for the destructive Business → Team downgrade
  ([business-downgrade-plan.md](../account-settings/business-downgrade-plan.md) §8).
- **Workflow templates do not exist at all in V2** — verified: no template table, repository,
  contract, route, or service (§2). Marcus wants template creation to be a **paid productivity
  feature**, distinct from export.

This slice sets the **tier policy** for both before code is written, so the implementation slices
inherit clear rules and the export/template surfaces stay credential-safe and consistent with the
account-scoped model.

The core product thesis to lock: **export = trust / data-portability (cheap, near-universal);
templates = productivity / reuse / collaboration (paid).** They must not be conflated.

---

## 2. Current codebase findings (verified)

### 2.1 Export foundation — exists, membership-gated, no tier gate

- **Sanitizer** ([exportWorkflow.ts:36-139](../../../../services/workflows/exportWorkflow.ts)): three
  defense layers — (a) `SENSITIVE_KEY_RE` redacts whole values under token/secret/credential/owner
  keys; (b) `EMAIL_RE` + `TOKEN_RE` redact secret-shaped substrings inside *any* string value;
  (c) node/edge fields are **whitelisted** (unexpected fields dropped). Redacted values become
  `REDACTION_MARKER = "__REDACTED__"` so a future import can prompt reconnect rather than silently
  drop. Built **only** from `name` + `draftDefinition` — sibling tables (`integrations`,
  `workflow_node_credentials`) are never read, so they are *structurally* excluded.
- **Single export** ([route.ts](../../../../app/api/workflows/[id]/export/route.ts)): `GET
  /api/workflows/[id]/export`. Auth → 401; `requireWorkflowAccountMember(userId, accountId)`;
  non-member or soft-deleted → **404** (no existence oracle). **Any account member** can export.
  **No plan-tier check.**
- **Bulk account export** ([route.ts](../../../../app/api/accounts/[id]/workflows/export/route.ts)):
  `GET /api/accounts/[id]/workflows/export`. `requireAccountRole(userId, accountId, ["owner",
  "admin","member"])` — **any member** (owner/admin/member alike); non-member → **403
  NOT_ACCOUNT_MEMBER**. `listByAccount` is RLS-scoped + excludes soft-deleted. Over
  `ACCOUNT_WORKFLOW_EXPORT_LIMIT = 200` → typed **413 TOO_MANY_WORKFLOWS**. **Folder hierarchy
  omitted** by design ([exportWorkflow.ts:213-214](../../../../services/workflows/exportWorkflow.ts)).
  **No plan-tier check.**
- **Import: does not exist.** No `importWorkflow`, no import route, no cross-account upload. Net-new
  (matches downgrade plan §8 / CS-BD-4).

### 2.2 Templates — do not exist (entirely net-new)

Grepped `repositories/`, `supabase/migrations/`, `contracts/`, and `services/` for `template`: the
only hits are **unrelated** (AI prompt templates in `buildWorkflowPlanPrompt.ts`, GitHub
repo-creation `template` fields, Excel/SQL function-body "template" comments). **There is no
workflow-template table, repository, contract, route, service, or UI in V2.** There is also **no
`duplicate` workflow route** in V2 (that was a V1 surface) — so even "create workflow from an
existing one" is net-new.

### 2.3 Plan policy — numeric limits only, no feature gating

[planPolicy.ts](../../../../core/billing/planPolicy.ts) defines `PlanTier =
free|pro|team|business|enterprise` and `PLAN_LIMITS` with **only** `memberLimit / folderLimit /
taskLimit`. There is **no capability/feature gate** ("can export bulk", "can create templates")
anywhere in `core/` or `services/` (grep for `entitlement|featureGate|canUse|requirePlan` → zero
hits). Today's limit helpers ([memberLimits.ts](../../../../services/accounts/memberLimits.ts)) even
resolve via `defaultPlanForAccountType(type)` — the **structural type**, not the account's actual
billing plan — and explicitly note "a later wiring slice can pass the account's ACTUAL plan once
Pro/paid tiers carry different caps." **Feature-tier gating is therefore net-new policy surface**,
and templates/export are its first real consumers.

### 2.4 Roles & plan resolution

- Roles: `owner | admin | member` ([contracts/accounts.ts:20](../../../../contracts/accounts.ts));
  `requireAccountRole` is the chokepoint ([accountAuthz.ts:22](../../../../services/accounts/accountAuthz.ts)).
- Actual billing tier lives at `account_billing.plan`
  ([accountBilling.ts](../../../../repositories/accountBilling.ts)); the webhook is the sole writer.
  Reading it for a gate is a `getUsage`-style account-scoped read.

---

## 3. Product principles

1. **Export is data-portability / trust, not a paywall.** A user can always get their own work out
   in a credential-free form. Single-workflow export is effectively universal.
2. **Templates are paid reuse/productivity.** Creating, storing, and sharing reusable templates is
   where tier value lives.
3. **Neither export nor templates ever carry credentials.** Both reuse the existing export
   sanitizer and its structural no-leak posture (build from `name` + `draftDefinition` only).
4. **A destructive safety flow is never blocked by a billing gate.** Downgrade export is always
   available to the owner regardless of tier (you must be able to save your work before we simplify
   the account).
5. **Tier gates are membership-aware AND plan-aware**, layered on top of the existing role
   chokepoint — they never replace the account-scoped authorization that already exists.
6. **No fake controls.** Disabled/"upgrade to unlock" affordances only where a real backend path
   exists or is one slice away.

---

## 4. Export / download tier policy (recommended)

| Tier | Single export | Bulk export | Notes |
|---|---|---|---|
| **Free** | ✅ yes | ❌ no | Portability/safety floor — never paywalled |
| **Pro** | ✅ yes | ✅ personal-account bulk | First bulk benefit |
| **Team** | ✅ yes | ✅ account bulk — **owner/admin only** | Members keep single export |
| **Business** | ✅ yes | ✅ account bulk — **owner/admin only** | + downgrade export (always, owner) |
| **Enterprise** | ✅ yes | ✅ all | Future admin/audit exports |

**Single-workflow export stays available to every tier and every account member** (keep today's
`requireWorkflowAccountMember`; add **no** tier gate). This is the trust floor and matches principle
#1. It is also what a removed/exiting member or a downgrading owner relies on to keep their work.

### 4.1 Bulk export policy

- **Free: no bulk export.** Bulk is the first real export benefit — encourages Pro without harming
  the portability floor (single export still covers "get my workflow out").
- **Pro: personal-account bulk export.** A personal (Pro) account owner can bulk-export their own
  workflows.
- **Team / Business: account bulk export is owner/admin only.** Tighten today's
  `["owner","admin","member"]` to **`["owner","admin"]`** for the bulk route on team/org accounts —
  bulk export of an entire shared account is an administrative action, not a per-member one.
  (Members retain single-workflow export of any workflow they can see.)
- **Cap unchanged:** keep `ACCOUNT_WORKFLOW_EXPORT_LIMIT = 200` + typed 413; revisit only if a tier
  needs a higher ceiling (Enterprise streaming/ZIP is a later concern, not launch).

> **Behavior change to flag:** the bulk route today allows `member`. Recommendation tightens it to
> owner/admin for team/org. That is a *real* authorization change — must ship behind the feature
> flag and be called out, not silently applied. Single export's `member` access is unchanged.

### 4.2 Downgrade export exception (must bypass bulk-tier gating)

Per [business-downgrade-plan.md](../account-settings/business-downgrade-plan.md) §8 + §13, the
owner must be able to **save all workflows before a destructive Business → Team downgrade.** This
export path:

- **Is always available to the account owner**, regardless of whether the tier "normally" allows
  bulk export, and regardless of the bulk-route role tightening in §4.1. (An owner downgrading *is*
  owner/admin, so the role check already passes — but the **tier gate must be explicitly bypassed**
  for this entry point so a future tier policy can't accidentally block a safety flow.)
- **Reuses the exact bulk export builder** (`buildAccountWorkflowsExport`) — no separate code path,
  no separate sanitizer. The only difference is the *gate*, not the *payload*.
- **Recommendation:** model it as a distinct, owner-only, flag-gated entry (the downgrade dialog's
  "Export workflows first" affordance, CS-BD-4 in the downgrade plan) that calls the bulk builder
  with the **tier check skipped** — never as "Business happens to allow bulk anyway."

---

## 5. Template creation tier policy (recommended)

| Tier | Create custom templates | Suggested limit | Sharing scope |
|---|---|---|---|
| **Free** | ❌ no (use built-ins only) | 0 (optionally 1 "taste") | n/a |
| **Pro** | ✅ personal templates | **25** | private to the personal account |
| **Team** | ✅ shared team templates | **50** | shared across the account |
| **Business** | ✅ shared business templates | **250** | shared; categories/publishing **later** |
| **Enterprise** | ✅ advanced | **config / uncapped (null)** | governance/approval/private library |

### 5.1 Template usage policy

- **Built-in templates: usable by every tier including Free.** "Use a template to start a workflow"
  is an onboarding/value driver — gating *consumption* of first-party templates hurts activation.
  Free **consumes** built-ins; it does not **author** custom ones.
- **Custom template creation is the paid line.** Free cannot create custom templates. Two models to
  choose from (§17 open decision):
  - **(A) Hard line — recommended for launch:** Free = 0 custom templates. Simplest; cleanest
    upsell.
  - **(B) Taste model:** Free = exactly 1 personal "sample" template, to demonstrate the feature.
    More generous, but adds a per-tier `1` edge case to every limit check and a "you've used your
    one free template" state. Defer unless activation data calls for it.
- **Limits mirror the existing `PLAN_LIMITS` shape** — add a `templateLimit: number | null` field to
  the central policy (null = uncapped/config for Enterprise), so template caps live in the **same
  single seam** as member/folder/task caps and the same "count vs limit" enforcement pattern applies.

### 5.2 Template sharing / visibility

- **Pro (personal account):** templates are private to that account (single-member). Visibility =
  account-scoped, same as workflows.
- **Team / Business (shared accounts):** templates are **account-shared** — any member can *use*
  them; **creation/edit/delete gated by role** (recommend owner/admin to author shared templates,
  members to use — mirrors the §4.1 admin-vs-member split). This avoids a member spamming the shared
  library while keeping reuse open to everyone.
- **Business categories / publishing controls and Enterprise approval/governance are explicitly
  deferred** (§9 slice breakdown) — launch ships flat per-account shared libraries, not a CMS.
- **Cross-account template visibility (a public/marketplace gallery) is out of scope** — templates
  are account-owned, same boundary as workflows. First-party built-ins are the only cross-account
  catalog at launch.

---

## 6. Template data model recommendation

Templates are **net-new** (§2.2). Recommended shape — a sibling of `workflows`, **not** a flag on it
(a template is not an executable workflow; it has no runs, no activation, no folder, no
credentials):

```
workflow_templates
  id                uuid pk
  account_id        uuid not null  -- owner account (same ownership root as workflows)
  created_by_user_id uuid          -- provenance only (ON DELETE SET NULL)
  name              text not null
  description       text
  source            text default 'user'   -- 'user' | 'builtin' (builtins may be account_id NULL / system)
  definition        jsonb not null  -- SANITIZED ExportedWorkflowDefinition (credential-free, §7)
  schema_version    int  not null   -- mirror EXPORT_SCHEMA_VERSION
  -- deferred (Business+): category text, is_published bool, published_at
  created_at        timestamptz default now()
  updated_at        timestamptz default now()
```

- **`definition` stores the *sanitized export shape*, not the raw `draft_definition`.** A template
  is created by running a workflow through the **same `sanitizeWorkflowDefinitionForExport`** the
  export uses — so a template can *never* hold a credential, by construction (§7). Reuse, do not
  fork, the sanitizer.
- **Account-scoped, RLS + explicit GRANTs** (per CLAUDE.md's post-Oct-2026 rule): `ENABLE ROW LEVEL
  SECURITY` + policies keyed on account membership; `GRANT SELECT, INSERT, UPDATE, DELETE ... TO
  authenticated, service_role`. Built-in/system templates (if `account_id NULL`) are readable by
  all authenticated users via a dedicated read policy.
- **Limit enforcement:** count `workflow_templates where account_id = ? and source = 'user'` against
  `planPolicy.templateLimit` at creation time — same pattern as `memberLimits` / `folderLimits`.
- **No `definition` execution path** — templates are instantiated by **creating a new workflow** from
  the sanitized definition (re-resolving credentials/resources in the target account, like import).

### 6.1 Built-in templates

Built-ins can be modeled either as `source='builtin'` rows (DB-seeded, `account_id` NULL/system) or
as a static first-party catalog in code. **Recommendation: static code catalog for launch** (no
migration churn, versioned with the app), promote to DB rows only when a publishing/admin workflow
needs to edit them. Either way, **consuming** a built-in is free for all tiers (§5.1).

---

## 7. Template no-leak / security model

Templates inherit the **entire** export no-leak posture — this is the central security requirement:

- **Same sanitizer, reused not reimplemented.** A user template's `definition` is produced by
  `sanitizeWorkflowDefinitionForExport` ([exportWorkflow.ts:119](../../../../services/workflows/exportWorkflow.ts)).
  Tokens, secrets, emails, provider account labels/ids, credential-owner ids, integration ids are
  redacted to `__REDACTED__`; node/edge fields are whitelisted. **No new redaction code.**
- **Structural exclusion holds:** templates are built from `name` + sanitized `draftDefinition`
  only. `integrations` and `workflow_node_credentials` are never read into a template, so they
  cannot leak even if the sanitizer regressed.
- **Sharing does not widen the leak surface:** a shared team/business template carries the *same*
  credential-free definition every member already could derive via export. Sharing exposes graph
  structure (which a co-member can already see in the shared account), never credentials. **No
  co-member credential leakage is introduced** (matches the security-review posture from the
  credential-sharing arc).
- **Instantiation re-resolves credentials in the target account** — a template never carries a
  credential *into* a new workflow; the user reconnects/reselects (the `__REDACTED__` markers drive
  the reconnect prompts, same mechanism import uses).
- **Authorization:** template read = account membership; template create/edit/delete = role-gated
  (owner/admin for shared accounts, §5.2) via `requireAccountRole`. Non-member → 404/403 no-leak,
  same as workflows/export. Built-in catalog reads carry no account state.

This is exactly the **chainreactv2-security-review** no-leak contract: no token/email/label/scope
exposure, non-members can't infer existence, service-role-only privileged writes, RLS+GRANT
correctness, secrets never travel.

---

## 8. Import / export relationship

- **Import is net-new and tier-gated *separately* from export.** Export = "get your data out" (cheap
  floor). Import = "bring a graph in and instantiate it." Recommend import availability roughly
  tracks template-creation (a paid productivity action), but the two flags are independent so policy
  can diverge:
  - **Single-workflow import (from an export file):** reasonable to allow **Free** (it's the inverse
    of the export floor and aids the downgrade "save then restore elsewhere" story). Open decision
    §17.
  - **Bulk import / cross-account import-to-personal:** paid (Pro+), mirrors bulk export.
- **Templates and import share the instantiation engine:** "create workflow from template" and
  "import workflow from file" both = *take a sanitized definition → create a new workflow in the
  target account → re-resolve credentials*. Build the instantiation seam **once**, consume it from
  both.
- **Folder metadata in export (§17 / downgrade plan §7):** current bulk export **omits** folder
  hierarchy because downgrade flattens it. **Recommendation: keep omitting for the downgrade/bulk
  safety export** (no active structure to preserve), but if a future *non-downgrade* "account
  backup/restore" feature is built, folder metadata becomes optional re-includable data —
  out of scope here.

---

## 9. Implementation slice breakdown (future — not this slice)

Ordered, each small/bounded, all behind flags (default OFF where it changes behavior):

- **CS-XT-1 — feature-tier policy seam.** Extend [planPolicy.ts](../../../../core/billing/planPolicy.ts)
  with `templateLimit: number | null` and a small capability map (`canBulkExport`,
  `canCreateTemplates`) per tier. Wire a plan-resolution read (`account_billing.plan`, not
  `defaultPlanForAccountType`) into a reusable `requirePlanCapability` helper. Pure policy + one
  account-scoped read. Tests: §10.
- **CS-XT-2 — export tier gate (behavior change, flagged).** Add the tier/role gate to the **bulk**
  export route (tighten team/org to owner/admin; Free blocked; Pro personal-bulk allowed). Single
  export unchanged. Behind `ENABLE_EXPORT_TIER_GATING` (default OFF → today's behavior). Tests:
  free-blocked, pro-personal-allowed, team/org member-blocked + owner/admin-allowed.
- **CS-XT-3 — downgrade export exception.** Owner-only, flag-gated entry that calls the bulk builder
  with the tier check **skipped**; wires the downgrade dialog's "Export workflows first" affordance
  (closes the CS-BD-4 export half from the downgrade plan). Tests: owner can export at downgrade even
  when tier would block bulk.
- **CS-XT-4 — template data model + repository.** `workflow_templates` table (migration + RLS +
  explicit GRANTs), `repositories/workflowTemplates.ts`, contract. No UI. `db:push`. Tests: RLS
  scoping, account ownership, service-role writes.
- **CS-XT-5 — template create/list/use service + routes.** Create (role-gated, sanitizer-reused,
  limit-enforced), list (account + built-in), instantiate-as-workflow. Behind
  `ENABLE_WORKFLOW_TEMPLATES` (default OFF). Tests: §10.
- **CS-XT-6 — import / instantiation seam.** Shared "sanitized definition → new workflow" seam used
  by both import-from-file and create-from-template; `__REDACTED__`-driven reconnect prompts. Tier
  gate per §8. Tests: no-credential-in, reconnect-marker handling.
- **CS-XT-7 — UI.** Template gallery (use built-ins all tiers; create gated), export/bulk-export
  affordances with upgrade states, import upload. No fake controls — each maps to a CS-XT route.
- **Deferred:** Business template categories/publishing; Enterprise approval/governance/private
  library; account backup/restore with folder metadata; streaming/ZIP for large bulk exports.

---

## 10. Test plan (for the implementation slices)

- **Policy (CS-XT-1):** per-tier capability + `templateLimit` correctness; plan resolved from
  `account_billing.plan`; helper is pure / no I/O beyond the one read.
- **Export gate (CS-XT-2/3):** Free single-export still works; Free bulk → blocked; Pro
  personal-bulk → allowed; Team/Business member bulk → blocked, owner/admin → allowed; non-member →
  404/403 no-leak unchanged; **downgrade owner export bypasses the gate**; flag OFF → today's
  behavior byte-for-byte.
- **Templates (CS-XT-4/5):** RLS account scoping (non-member can't read/insert); create role-gated
  (member blocked on shared accounts); `templateLimit` enforced at create; built-ins readable by all
  tiers; **template `definition` is always credential-free** (sanitizer applied — assert no token /
  email / label / grant ever present); instantiation creates a workflow with `__REDACTED__` markers
  preserved for reconnect.
- **Import/instantiation (CS-XT-6):** importing/instantiating never injects a credential; markers
  drive reconnect; tier gate honored.
- **No-leak regression:** reuse the export sanitizer's existing tests; add template-path coverage
  asserting structural exclusion of `integrations` / `workflow_node_credentials`.
- **Existing suites stay green:** `exportWorkflow`, both export routes, `planPolicy`, `accountAuthz`.

---

## 11. Risks / open questions

| # | Risk | Mitigation |
|---|---|---|
| R1 | Bulk-route role tightening (member→owner/admin) breaks current member bulk-export | Behind `ENABLE_EXPORT_TIER_GATING` default OFF; single export unchanged; called out as a real change |
| R2 | Tier gate accidentally blocks the destructive downgrade safety export | Downgrade export is a distinct owner-only entry with the tier check **explicitly skipped** (§4.2) |
| R3 | Template leaks a credential | Reuse the export sanitizer (no new redaction); structural exclusion of credential tables; no-leak tests (§7, §10) |
| R4 | Templates modeled as a workflow flag → execution/billing confusion | Separate `workflow_templates` table; no runs/activation/folder/credentials (§6) |
| R5 | Shared-account template spam by members | Create/edit/delete role-gated (owner/admin); use open to all members (§5.2) |
| R6 | Free taste-model edge case complicates limit checks | Launch with hard line (Free = 0); defer taste model (§5.1, §17) |
| R7 | Plan read drift (type-default vs actual `account_billing.plan`) | CS-XT-1 reads actual plan, not `defaultPlanForAccountType` (§2.3) |
| R8 | Shipping behavior changes before tested | All gating behind flags default OFF; tier policy is pure + unit-tested first |

---

## 12. Acceptance criteria

**For this planning slice (met now):**
- [x] Docs-only plan; current state of export (membership-gated, no tier gate) + **absence** of any
      template feature both verified against files read this session.
- [x] Every current-state claim cited to a file (§2).
- [x] ≥2 alternatives evaluated for the contested decisions (Free template model A/B; built-in
      catalog static-vs-DB; folder-metadata in export); clear recommendations.
- [x] `npm run lint:structure` → OK (§14).
- [x] Nothing pushed.

**For the implementation slices to later meet:**
- [ ] Single-workflow export remains available to **every** tier and member (trust floor).
- [ ] Bulk export gated by tier + role; **downgrade owner export always available** (gate bypassed).
- [ ] Templates: built-ins usable by all tiers; custom creation paid + role-gated + limit-enforced.
- [ ] Template `definition` is **always** produced by the existing export sanitizer — never carries a
      credential; no co-member credential leakage introduced.
- [ ] Import/instantiation re-resolves credentials in the target account; `__REDACTED__` drives
      reconnect.
- [ ] `ENABLE_EXPORT_TIER_GATING` + `ENABLE_WORKFLOW_TEMPLATES` default OFF until tested.

---

## 13. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, schema, env, or Stripe change.
- No flag created or flipped (`ENABLE_EXPORT_TIER_GATING` / `ENABLE_WORKFLOW_TEMPLATES` are
  *recommendations*).
- No template table, route, or repository created.
- No git push. Docs-only local commit.

---

## 14. Verification performed for this plan

- `npm run lint:structure` → **OK** ("every leaf folder has ≤ 50 files"), run this session.
- Grepped `repositories/`, `supabase/migrations/`, `contracts/`, `services/` for `template`:
  **no workflow-template feature exists** — all hits are unrelated (AI prompt templates, GitHub
  repo-creation template fields, SQL function comments). Confirmed via the same grep there is **no
  `duplicate` workflow route** in V2.
- Read both export routes + the export service: confirmed **membership/role gating only, no plan-tier
  gate**, single export = any member, bulk = any member (owner/admin/member), folder hierarchy
  omitted, import absent.
- Read `planPolicy.ts` + `memberLimits.ts`: confirmed **no feature-capability gating** exists today
  — only numeric member/folder/task caps, resolved via type-default not actual plan.
- **Full `npx jest` NOT run** — docs-only, zero source changes.

---

## 15. Open decisions for Marcus

1. **Free custom templates:** hard line (0) — *recommended* — or a 1-template "taste" model? (§5.1)
2. **Pro template limit:** 25 (recommended) vs 10? Team 50 / Business 250 as suggested? (§5)
3. **Bulk-export role tightening:** restrict team/org bulk export to **owner/admin** (recommended)
   or keep today's any-member access? This is a real behavior change. (§4.1)
4. **Single-workflow import on Free:** allow (recommended — inverse of the export floor, aids
   downgrade restore) or gate behind Pro? (§8)
5. **Built-in templates:** static code catalog for launch (recommended) or DB-seeded rows now? (§6.1)
6. **Folder metadata in export:** keep omitting (recommended for the downgrade/bulk safety export)
   or add an optional "include folders" for a future backup feature? (§8)
7. **Shared-template authoring role:** owner/admin only (recommended) or any member on team/org? (§5.2)
8. **Launch scope:** ship export tier gate + downgrade exception + flat template libraries; **defer**
   categories/publishing (Business) and approval/governance (Enterprise) — confirm. (§9)

---

## 16. Recommended next step

Get Marcus's call on **§15.1 (Free template model)** and **§15.3 (bulk-export role tightening — a
real behavior change)**, then implement **CS-XT-1** (the feature-tier policy seam in `planPolicy.ts`
+ `requirePlanCapability`), since every other slice depends on it. Ship the **downgrade export
exception (CS-XT-3)** alongside the export gate so the destructive downgrade safety flow is never at
risk of being blocked by tier policy.

**Doc path:** `docs/slices/phase-4/workflows/workflow-export-template-tier-policy-plan.md`.
**Docs-only. Nothing pushed.**
