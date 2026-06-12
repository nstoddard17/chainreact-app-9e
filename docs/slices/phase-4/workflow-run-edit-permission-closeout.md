# 4.WF-RUNPERM — Workflow Run/Edit Permission Closeout (team-visible ≠ team-runnable)

**Type:** Closeout / handoff. **Docs-only — no source, tests, migrations, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Companion planning doc:** [workflow-run-edit-permission-audit.md](./workflow-run-edit-permission-audit.md)
(the audit/design that scoped this arc) ·
[integration-permission-model-audit.md](./integration-permission-model-audit.md)
(the parent audit that flagged run/edit as the open divergence).

**Headline:** The product decision **"team-visible does not mean team-runnable"** is now
enforced end to end. A workflow that uses ≥1 private/member-connected credential runs under
the **creator's** external OAuth identity (22B creator-pin), so only the creator may run/edit
it; everyone else is pointed to Duplicate. Server enforcement + builder UI both landed, with
**no migration and no feature flag**. **Disconnect remains live and untouched.**

---

## 1. Summary

- **Audit (planning, docs-only):** grounded the decision in the real enforcement points and
  proposed the smallest no-migration implementation (one shared predicate + a creator gate at
  three chokepoints). → `71e094bc3`.
- **Server enforcement:** added the shared `workflowUsesPrivateCredential` + `viewerMayRunEdit`
  helpers, gated run-now / credential-bound edit / activate / resume / reactivate behind a typed
  `403 WORKFLOW_USES_PRIVATE_CREDENTIAL`, and exposed `usesPrivateCredential` + `viewerCanRunEdit`
  booleans on the workflow DTOs + a list-row badge. → `6a02131ed`.
- **Builder UI polish:** disabled the builder header **Test Workflow + Run Manually** controls for
  non-creators of a private-credential workflow, with the same safe duplicate-hint copy — a friendly
  front door for the already-enforced 403. → `42fe1ce29`.

---

## 2. Completed commit chain

- `71e094bc3` — docs(workflows): audit run/edit permission policy for private-credential workflows (4.WF-RUNPERM) _(2026-06-12)_
- `6a02131ed` — feat(workflows): creator-only run/edit for private-credential workflows (4.WF-RUNPERM) _(2026-06-12)_
- `42fe1ce29` — feat(builder): disable header Run/Test for non-creators of private-credential workflows (4.WF-RUNPERM-UI) _(2026-06-12)_

All three are local on `builder-ui-v1-audit-1`; none pushed. (A parallel diagnostics commit
`e5573fc6a` CS-2b sits between `6a02131ed` and `42fe1ce29` in branch order — unrelated to this
arc, shared-worktree interleave only.)

---

## 3. Current behavior (end to end)

**Classification.** `core/integrations/workflowCredentialScope.ts` decides whether a workflow is
"private-credential": `workflowUsesPrivateCredential(definition)` returns true iff ≥1 node uses a
real personal/member-connected OAuth provider. `native` pseudo-providers (manual/scheduled trigger,
delay, http_request, if/then, router, format-transform) are excluded via `NON_OAUTH_PROVIDERS` — else
every workflow (each has a trigger) would mis-flag as private. Account/service providers (slack,
notion, stripe, shopify, hubspot, mailchimp) and native-only graphs are **not** private.
`offboardingImpact.ts` was refactored to reuse this single predicate (no duplicated classification).

**The single decision.** `viewerMayRunEdit(workflow, callerUserId)`:
- Workflow uses **no** private credential → **any account member** may run/edit (unchanged).
- Workflow uses **≥1** private credential → **only the creator** may run/edit. A `null` creator
  (deleted member) → nobody may run/edit. Role-agnostic by design.

**Server enforcement** (after the existing membership gate, before the action):
- **run-now** (test **and** manual — the gate runs before the testMode branch),
- **PATCH `draftDefinition`** (credential-bound save; name/folder edits still allowed),
- **activate / resume / reactivate**,

each returns a typed **`403 WORKFLOW_USES_PRIVATE_CREDENTIAL`** with safe copy (no email / provider
label / scope / token / `providerAccountId` / raw error). **Pause / disable / delete / duplicate /
transfer** are unchanged — they are management actions that don't borrow the creator's identity.

**DTO.** `toWorkflowDetail` / `toWorkflowListItem` populate `usesPrivateCredential` + `viewerCanRunEdit`
booleans (server-computed; `.optional()` for fixture back-compat; no `createdByUserId` / credential
detail leak).

**UI.** The workflows list row/card shows a **Private connection** badge when
`usesPrivateCredential && !viewerCanRunEdit`. The **builder header** disables Test Workflow + Run
Manually for non-creators (`viewerCanRunEdit === false`) and surfaces the safe copy. Duplicate
remains available and re-pins `createdByUserId` to the actor (the copy uses the actor's own
connection).

---

## 4. Permission matrix (as shipped)

| Workflow uses… | Normal member (non-creator) | Creator | Owner / admin (non-creator) |
|---|---|---|---|
| **Only shared/account integrations, or native-only** | run ✓ · edit ✓ | run ✓ · edit ✓ | run ✓ · edit ✓ |
| **≥1 private / member-connected credential** | run ✗ · edit ✗ (403 + duplicate hint) | run ✓ · edit ✓ | **run ✗ · edit ✗** by default — may manage/audit/disable/delete/duplicate/transfer/request-share |
| **(any)** non-member | 404 (no existence leak) | — | — |

- **Team-visible ≠ team-runnable** is the spine of the matrix.
- **Owner/admin cannot run/edit as the creator by default** — running a private-credential workflow
  would send/act *as* the creator's personal OAuth identity (impersonation), the exact thing the
  personal/account model prevents. Continuity paths are **ownership transfer** (re-pins to the new
  owner's connection) or the **future explicit-share**.
- **Non-creators see safe copy and can Duplicate** to use their own connection.

---

## 5. Security / no-leak guarantees

- **No identity borrowing.** A non-creator can no longer silently run a co-member's workflow under
  the creator's personal OAuth identity, nor rewrite its credential-bound config.
- **No-leak on the new surfaces.** The `403` body and the DTO booleans expose a typed code + booleans
  only — never token / email / provider label / scope / `providerAccountId` / raw error. The list
  badge and builder copy name no provider account, email, or scope — only "private connection" + the
  duplicate action.
- **Visibility ≠ existence leak.** A member who *can see* the workflow gets `403` (not `404`); a
  non-member still gets `404`. The 22B creator-pin, 22D-2 option redaction, and `toOwnerControlledView`
  are untouched.

---

## 6. Data / RLS / model notes

- **No migration. No schema/RLS/GRANT change.** Enforcement runs entirely over existing columns:
  `workflows.created_by_user_id` (typed non-null; DB `ON DELETE SET NULL`), the `personal`/`account`
  credential classification (`core/integrations/credentialSharing.ts`), and account membership.
- **Null-creator edge** (deleted team member → `created_by_user_id = null`): treated as
  run/edit-blocked for everyone; the workflow's personal cred was already offboarding-soft-disconnected
  (22C) so it can't resolve anyway. Owner/admin management paths remain.
- **Account-model alignment:** authorization stays **membership-based** (TW-1) for the visibility/manage
  axis; the creator gate is layered **on top** only for the run/edit-as-creator axis. No per-seat or
  role-tier logic added.

---

## 7. UI behavior

- **Workflows list:** `PrivateConnectionBadge` on the row/card when `usesPrivateCredential && !viewerCanRunEdit`,
  with safe duplicate-hint copy.
- **Builder header:** Test Workflow + Run Manually disabled for non-creators; a `role="status"` hint
  + button tooltip carry the safe copy *"This workflow runs with the creator's private connection.
  Duplicate it to use your own connection."* No fake/unsupported control shipped — the disabled state
  mirrors the server's already-enforced 403 (defense-in-depth, not the security boundary).
- **Disconnect UI:** unchanged.

---

## 8. Deferred / known limitations

- **Admin break-glass run** (audit-logged, confirmed override) — intentionally **not** built. Default
  is owner/admin = no run-as-creator. Add only if Marcus asks.
- **Explicit-share** (a shared personal row whose workflows become team-runnable by role, via
  `integration_sharing_scope`) — deferred to its own future slice; it's the only path that would need
  a migration.
- **Inline config field read-only state** for non-creators in the builder body — the audit suggested
  read-only config fields (§7 of the audit); the shipped UI gates at the **run/save** boundary
  (disabled header controls + server 403 on save) rather than per-field read-only. Functionally
  equivalent for safety; a per-field read-only polish is an optional follow-up.

---

## 9. Verification baseline

- **Server enforcement (`6a02131ed`) tests — inherited, not re-run this session.** That commit shipped
  the helper matrix (personal/account/native/mixed/unknown/null-creator), `assertWorkflowRunEditAllowed`
  + DTO-boolean + no-leak tests, an activate-non-creator 403 test, and badge copy/no-leak tests
  (per the commit message). Not independently re-executed during this closeout.
- **Builder UI polish (`42fe1ce29`) — measured earlier this session** (during the UI slice, not for
  this docs commit): focused Jest across the 3 affected builder suites (HeaderRunControls,
  WorkflowBuilder, BuilderHeader) **112 passed**; `npm run typecheck` clean; `npm run lint` 0 errors
  (pre-existing warnings only); `npm run lint:structure` OK. **Not re-run for this docs-only commit.**
- **This closeout commit:** docs-only — no checks run (nothing executable changed).
- **Migrations:** none in this arc → nothing to `db:push`.
- **Feature flags:** **none** introduced or used by this arc. Behavior is unconditional.

---

## 10. Recommended next tracks

1. **Per-field read-only config** for non-creators in the builder body (optional polish; §8).
2. **Explicit-share slice** (`integration_sharing_scope`) — the migration-bearing path that lets a
   shared personal row make its workflows team-runnable by role, with ownership-transfer continuity.
3. **Admin break-glass run** — only if a real operational need surfaces; must be audit-logged + confirmed.

---

## 11. Closeout confirmation

Docs-only. Nothing pushed. No deploy, no `db:push`, no migrations, no feature flags, no MCP changes,
no Disconnect changes. Doc path:
[`docs/slices/phase-4/workflow-run-edit-permission-closeout.md`](./workflow-run-edit-permission-closeout.md).
