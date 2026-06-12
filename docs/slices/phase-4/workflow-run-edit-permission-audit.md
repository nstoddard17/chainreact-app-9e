# 4.WF-RUNPERM — Workflow Run/Edit Permission Audit (team-visible ≠ team-runnable)

**Type:** Security audit / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this audit):**
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`requireWorkflowAccountMember` 156-168, `loadWorkflowForMember` 177-188, `authorizeWorkflowLifecycleAccess` 198-205 — all membership-only) ·
[app/api/workflows/[id]/route.ts](../../../app/api/workflows/%5Bid%5D/route.ts) (GET/PATCH/DELETE — `loadOrNotFound` 30-46 → `requireWorkflowAccountMember`; PATCH `draftDefinition` save 84-97) ·
[app/api/workflows/[id]/run-now/route.ts](../../../app/api/workflows/%5Bid%5D/run-now/route.ts) (run authz 119-126) ·
[services/workflows/saveDraftDefinition.ts](../../../services/workflows/saveDraftDefinition.ts) (write path, no authz of its own) ·
[repositories/workflows.ts](../../../repositories/workflows.ts) (`WorkflowRecord.createdByUserId` non-null type 41; DB `ON DELETE SET NULL` 28-40) ·
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`isPersonalCredentialProvider`, `POLICY`) ·
[services/accounts/offboardingImpact.ts](../../../services/accounts/offboardingImpact.ts) (`NON_OAUTH_PROVIDERS = {"native"}` + node scan 12, 58-68) ·
[services/integrations/disconnect.ts](../../../services/integrations/disconnect.ts) (`selectProviderDependentWorkflows` node scan) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) + [services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (22B creator-pin) ·
[services/workflows/templateManagement.ts](../../../services/workflows/templateManagement.ts) (`createWorkflowFromTemplate` sets `createdByUserId: actorUserId`).

**Headline:** Run, edit/save, and lifecycle are **all membership-gated today** (TW-1) — any member can
run/edit another member's workflow, and via the 22B creator-pin that means **running it executes as the
creator's personal identity**. The product decision ("team-visible ≠ team-runnable") is enforceable
**now, without a migration**: the data needed (`createdByUserId` on the row + the `personal`/`account`
classification + `getRole`) already exists. The work is adding one shared "uses-private-credential"
predicate and a creator gate at three chokepoints. **Disconnect is unaffected.**

---

## 1. Context

The integration-permission audit ([integration-permission-model-audit.md](./integration-permission-model-audit.md))
found Disconnect safe and identified the run/edit axis as the open divergence. Marcus's decision:
**team-visible does not mean team-runnable.** This audit grounds that in the real enforcement points
and proposes the smallest implementation.

---

## 2. Current run/edit behavior (Q1, verified)

**Every run/edit/lifecycle path is gated ONLY by account membership — roles and creator are NOT
consulted (the explicit TW-1 launch decision):**

| Action | Route / chokepoint | Gate today |
|---|---|---|
| Run / test | [run-now/route.ts:119-126](../../../app/api/workflows/%5Bid%5D/run-now/route.ts) | `requireWorkflowAccountMember` — "Roles are NOT consulted… created_by_user_id is provenance, never consulted here" |
| Load builder / detail | [[id]/route.ts GET](../../../app/api/workflows/%5Bid%5D/route.ts) `loadOrNotFound:43` | membership only |
| **Edit / save draftDefinition** | [[id]/route.ts PATCH 84-97](../../../app/api/workflows/%5Bid%5D/route.ts) → `saveDraftDefinition` → `updateDraftDefinition` | membership only (incl. credential-bound node config) |
| Rename / move folder | [[id]/route.ts PATCH 81-107](../../../app/api/workflows/%5Bid%5D/route.ts) | membership only |
| Activate / pause / resume / disable / reactivate / restore | `authorizeWorkflowLifecycleAccess` ([_shared.ts:198-205](../../../app/api/workflows/_shared.ts)) | membership only |
| Delete (to Trash) | [[id]/route.ts DELETE](../../../app/api/workflows/%5Bid%5D/route.ts) | membership only |

`requireWorkflowAccountMember` is explicit: *"Roles are NOT consulted — any member of the account is
authorized. Workflow access is membership-based, not role-gated (TW-1 launch decision)"*
([_shared.ts:156-157](../../../app/api/workflows/_shared.ts)).

**Consequence:** member B can run/edit/activate member A's workflow. The engine pins personal-credential
resolution to the **workflow's** `created_by_user_id` (22B), so when B runs A's workflow, personal steps
resolve **A's** token — B acts as A's mailbox/identity. (B still never *sees* A's token or labels — those
stay redacted in the builder per 22D-2 / `toOwnerControlledView`.) This is the exact gap the decision
closes.

---

## 3. Detecting private-credential workflows (Q2)

`WorkflowRecord.draftDefinition.nodes[].provider` × `isPersonalCredentialProvider`. Two **existing**
scan patterns, **no single shared helper yet**:
- [offboardingImpact.ts:58-68](../../../services/accounts/offboardingImpact.ts) —
  `nodes.some(n => !!n.provider && !NON_OAUTH_PROVIDERS.has(n.provider) && isPersonalCredentialProvider(n.provider))`.
- [disconnect.ts `selectProviderDependentWorkflows`](../../../services/integrations/disconnect.ts) — same idiom, scoped to one provider.

**Critical gotcha:** `native` (the manual-trigger provider) is **not** in the credential-sharing `POLICY`,
so `isPersonalCredentialProvider("native")` returns **true** (fail-safe default). `offboardingImpact`
already excludes it via `NON_OAUTH_PROVIDERS = {"native"}` ([line 12](../../../services/accounts/offboardingImpact.ts)).
**Any new helper MUST replicate that exclusion**, or *every* workflow (all have a trigger) would be
mis-flagged private. → **Extract one shared `workflowUsesPrivateCredential(definition)`** (carrying the
`NON_OAUTH_PROVIDERS` exclusion) and refactor `offboardingImpact` (and optionally disconnect) to use it —
single source of truth, no duplicated classification.

---

## 4. Is there enough data to enforce without a migration? (Q3)

**Yes.** Everything needed is already present:
- **`createdByUserId`** on `WorkflowRecord` — typed non-null ([repositories/workflows.ts:41](../../../repositories/workflows.ts)),
  populated at create + template-fork. DB is `ON DELETE SET NULL` (only nulls if the creating user is
  deleted; the personal-account owner can't be — `accounts.owner_user_id` is `ON DELETE RESTRICT`). **Edge:
  a deleted team member ⇒ `createdByUserId = null`**; the rule must treat a null-creator private-credential
  workflow as **run/edit-blocked for everyone except owner/admin management** (its personal cred was also
  offboarding-soft-disconnected per 22C, so it can't resolve anyway).
- **`personal`/`account` classification** — [credentialSharing.ts POLICY](../../../core/integrations/credentialSharing.ts),
  coverage-tested so no provider falls through silently.
- **Role** — `getRole(accountId, userId)` (session, RLS-self) for the owner/admin branch.

**No `integration_sharing_scope`, no migration, no schema change is required for this slice.**

---

## 5. Recommended final rule

Define `viewerMayRunEdit(workflow, callerUserId, callerRole)`:

- **Workflow uses NO private credential (shared/account-only or native-only):** any account member may
  run/edit. *(unchanged — rule #1.)*
- **Workflow uses ≥1 private/member-connected credential:**
  - **Creator** (`callerUserId === createdByUserId`) → may run + edit. *(rule #3.)*
  - **Any other member, incl. owner/admin** → may **see** (GET), **duplicate-as-template** (→ picks own
    connection), but **may NOT run** and **may NOT save `draftDefinition`** (credential-bound edit).
    *(rules #2 + #6 recommendation.)*
  - **Owner/admin additionally** may **disable/pause, delete, transfer ownership, and request-share** —
    management actions that don't borrow the creator's identity.

The gate triggers if **any** node uses a private provider (running the workflow would resolve the
creator's personal token). Account/native nodes alone never trigger it.

### Owner/admin recommendation (Q6) — **SAFER default: owner/admin may NOT run/edit-config as the creator.**
Running a private-credential workflow executes under the **creator's personal OAuth identity** (sends
email *as* the creator). Letting an admin do that silently is identity impersonation — the precise thing
the personal/account model exists to prevent. **Existing precedent backs this:** the 22B/22D-2 invariant
is *"a Team workflow can only use the personal credential its creator connected, never a co-member's"* —
even an admin has no co-member fallback. So owner/admin get **manage/audit/disable/duplicate/transfer/
request-share**, not run-as-creator. If the team needs continuity, the paths are **ownership transfer**
(re-pins to the new owner, who then uses *their* connection) or the **future explicit-share**. This is
the recommended default; only override if Marcus wants an explicit "admin break-glass run" (which should
then be audit-logged and confirmed).

---

## 6. Minimal implementation plan (Q4 — no flag)

1. **Shared predicate (new, pure):** `core/integrations/workflowCredentialScope.ts` (or
   `services/workflows/`) exporting `workflowUsesPrivateCredential(definition): boolean` with the
   `NON_OAUTH_PROVIDERS` exclusion. Refactor `offboardingImpact` to use it (DRY).
2. **Shared authz helper:** `viewerMayRunEdit(workflow, callerUserId)` → `boolean` (creator-or-not-private).
   Pure; the route supplies `workflow` + caller.
3. **Three chokepoints** (after the existing membership gate, before the action):
   - **run-now** ([run-now/route.ts:~126](../../../app/api/workflows/%5Bid%5D/run-now/route.ts)) — block non-creator on private-credential workflow.
   - **PATCH `draftDefinition`** ([[id]/route.ts:84](../../../app/api/workflows/%5Bid%5D/route.ts)) — block the credential-bound save for non-creators; **leave name/folder edits allowed** (not credential-bound).
   - **activate / resume** ([_shared.ts authorizeWorkflowLifecycleAccess](../../../app/api/workflows/_shared.ts) or the two routes) — block non-creator activation (it would arm the workflow to fire as the creator). Pause/disable/delete stay membership/owner-admin (management).
4. **Typed error:** new `403 WORKFLOW_USES_PRIVATE_CREDENTIAL` (the member **can see** the workflow, so a
   404 would be wrong here — unlike the non-member case). Body carries no email/label/token — just the code
   + a duplicate hint.
5. **Detail DTO booleans** for the builder: add `usesPrivateCredential: boolean` + `viewerCanRunEdit: boolean`
   to `toWorkflowDetail` (server-computed; **booleans only, no credential detail**) so the UI disables run/
   edit and renders the badge.

No feature flag (per instruction). No migration.

---

## 7. UI copy / badge (Q5)

- **Badge** (workflow list row + builder header), shown when `usesPrivateCredential && !viewerCanRunEdit`:
  **"Private connection"** (lock/person glyph). Tooltip: *"This workflow runs with the creator's private
  connection. Only the creator can run or edit it — duplicate it to use your own connection."*
- **Run button (disabled state)** for non-creators: tooltip *"Uses a private connection — duplicate to run
  with your own."* + a **Duplicate** CTA (existing template-fork path).
- **Edit/config fields:** read-only for non-creators with the same tooltip.
- **No leak:** the badge/copy never name the provider account, email, scopes, or token — only the abstract
  "private connection" + the duplicate action. (Naming the creator is optional and non-sensitive — they're
  already in the team roster — but the default copy avoids it.)

---

## 8. Tests required (Q7)

- **`workflowUsesPrivateCredential` (unit):** personal node → true; account-only → false; **native-only →
  false** (the gotcha); mixed personal+account → true; unknown provider → true (fail-safe); empty/no-provider
  → false.
- **Run authz matrix (route):** shared-only → member runs ✓; private-credential → creator runs ✓, non-creator
  member → 403 `WORKFLOW_USES_PRIVATE_CREDENTIAL`, owner/admin → 403 (per recommendation), non-member → 404
  (unchanged no-leak).
- **Edit authz (route):** non-creator `draftDefinition` save on private-credential → 403; name/folder edit →
  allowed; creator save → allowed; account-only save by any member → allowed (regression).
- **Activate authz:** non-creator activate of private-credential → 403; pause/disable by owner/admin → allowed.
- **Duplicate allowed:** non-creator can `createWorkflowFromTemplate` a private-credential workflow → the copy
  has `createdByUserId = actor` (re-pin), already partly covered in `templateManagement` tests — add the
  private-credential case.
- **No-leak:** the 403 body + detail DTO contain no token/email/label/scope; the badge shows no credential
  detail.
- **Regression:** account-only and native-only workflows are entirely unaffected for every member.

---

## 9. Migration: now vs deferred

**None now.** Classification + `createdByUserId` + `getRole` suffice. `integration_sharing_scope` (the
explicit-share override) lands **only** with the future explicit-share slice — when a *shared* personal row
must make its workflows team-runnable by role. This slice is additive-behavior-only over existing columns.

---

## 10. Slice ordering vs MCP

**Independent of MCP — no file overlap** (MCP touches `scripts/mcp/**` + `app/api/internal/diagnostics/**`;
this touches `app/api/workflows/**` + a new `core`/`services` helper). It can land **before, after, or
parallel** to MCP 2B. Recommendation: sequence by Marcus's priority — it's a real authz gap (B can run A's
workflow as A) and is the natural **next** workflow-permission slice; to avoid shared-worktree churn, land it
**after** the in-flight MCP 2B-5 WIP commits, or in a separate worktree. Not blocked by, and does not block,
Disconnect.

---

## 11. Threat note + what did NOT change

**Threat:** today a normal member can silently act as a co-member's personal OAuth identity by running their
workflow, and can rewrite credential-bound config. This slice closes both by creator-gating run + activate +
credential-bound edit on private-credential workflows, while preserving visibility + duplicate. **No-leak
preserved:** new surfaces expose booleans + a typed code only; the 22B creator-pin, 22D-2 option redaction,
and `toOwnerControlledView` are untouched; `created_by_user_id` / `connected_by_user_id` semantics unchanged;
Disconnect authz unchanged; no migration / RLS / GRANT change; no flag; no MCP change. This slice is
**docs-only**.

---

## 12. Recommended next step

Confirm the **owner/admin = no run-as-creator** recommendation (§5) with Marcus. On confirmation, implement
as one small slice: the shared predicate + `viewerMayRunEdit` + the three chokepoints + the typed 403 + the
two detail booleans + the badge, with the test matrix in §8. No flag, no migration.
