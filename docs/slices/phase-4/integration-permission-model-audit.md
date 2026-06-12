# 4.INTEG-PERM — Integration Permission Model Audit (private vs shared)

**Type:** Security audit / design only. **No source, migrations, tests, UI, or behavior
changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — every file below was read for this audit):**
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`credentialSharingForProvider` / `isPersonalCredentialProvider` / `isAccountCredentialProvider`, `POLICY`, `DEFAULT_CREDENTIAL_SHARING`) ·
[services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (22B creator-pin at runtime, lines 161-193) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) (`runWithCredentialResolutionContext` / `createdByUserId`) ·
[services/options/credentialPolicy.ts](../../../services/options/credentialPolicy.ts) (`decideOptionsCredential` — `not-owner` redaction) ·
[services/ai/tools/integrations.ts](../../../services/ai/tools/integrations.ts) (`toOwnerControlledView`, lines 114-122, 202) ·
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`requireWorkflowAccountMember`, lines 156-168) ·
[app/api/workflows/[id]/run-now/route.ts](../../../app/api/workflows/%5Bid%5D/run-now/route.ts) (run authz, lines 119-126) ·
[services/workflows/templateManagement.ts](../../../services/workflows/templateManagement.ts) (`createWorkflowFromTemplate` sets `createdByUserId: actorUserId`, lines 125/276/351/419) ·
[services/integrations/disconnect.ts](../../../services/integrations/disconnect.ts) (`resolveAndAuthorize`) ·
[app/apps/_shared.ts](../../../app/apps/_shared.ts) (`computeCanDisconnect`) ·
[repositories/workflowNodeCredentials.ts](../../../repositories/workflowNodeCredentials.ts) + [services/teamCredentials/flags.ts](../../../services/teamCredentials/flags.ts) (existing per-node owner override, `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` default OFF).

**Headline:** The private-vs-shared model Marcus describes **already exists at runtime** as the
`personal` / `account` credential-sharing classification (22A) enforced by the 22B creator-pin
and the 22D-2 option-picker. **Live Disconnect (commit `34b28e045`) is SAFE** — its authz reuses
that same classification. The one genuine divergence is the **workflow run/edit permission axis**
(any member can run another member's workflow), which is a separate forward decision, not a
Disconnect-safety problem.

---

## 1. Context

Disconnect went live (`34b28e045`, flag removed). Before locking its authorization, Marcus wants
the team/business integration-permission model refined to separate four concerns:
(1) **row ownership** (`account_id`), (2) **visibility** in the team, (3) **permission to use** an
integration in workflows, (4) **permission to disconnect/manage/share**. This audit maps each
concern to the real code and judges whether removing the Disconnect flag exposed any unsafe path.

---

## 2. Current-behavior findings (verified, Q1)

### 2.1 Can member B *use* an integration connected by member A?
**Two distinct answers — this is the crux.**

- **Through B's own builder / new workflows → NO.** Personal-provider credential resolution is
  **pinned to the workflow's `created_by_user_id`** with **no co-member fallback**
  ([refreshAndRetry.ts:161-193](../../../services/oauth/refreshAndRetry.ts)). B's workflow has
  `created_by = B`, so a personal step resolves *B's* credential; if B hasn't connected it, the run
  fails with a clear "connect `<provider>`" error — it **never** falls back to A's row (line 183-187).
  The builder option-picker mirrors this (§2.3), so B can't even see or select A's Gmail.
- **Through running A's *existing* workflow → YES (and this is the gap).** Run/edit authorization is
  **membership-based, roles NOT consulted** — "any member of the account is authorized"
  ([_shared.ts:156-168](../../../app/api/workflows/_shared.ts)); run-now states plainly
  "created_by_user_id is provenance, never consulted here"
  ([run-now/route.ts:119-126](../../../app/api/workflows/%5Bid%5D/run-now/route.ts)). The engine
  sets the credential-resolution context to the *workflow's* `created_by_user_id`
  ([credentialResolutionContext.ts:28-35](../../../services/oauth/credentialResolutionContext.ts)),
  so when B runs A's workflow, personal steps resolve **A's** credential — i.e. **B can send email
  as A by running A's workflow.** B never sees A's token or labels (those stay redacted, §2.3); B can
  only *trigger* A's pre-built automation, which executes under A's identity.

### 2.2 Can B run/edit A's workflow that uses A's integration?
**Yes — run, edit, activate, pause, disable are all membership-gated, not creator-gated**
(TW-1 launch decision, [_shared.ts:156](../../../app/api/workflows/_shared.ts)). This is the
deliberate current model and the one place it diverges from Marcus's direction #4 ("only
creator/authorized user can run/edit" a private-credential workflow).

### 2.3 Does the builder option-picker hide/redact member-connected personal providers for non-creators?
**Yes.** [decideOptionsCredential](../../../services/options/credentialPolicy.ts) returns
**`not-owner`** for a personal provider when the requester ≠ workflow creator (lines 74-81): the
caller then performs **NO lookup and NO resolver call**, so a co-member's personal credential and
its resource labels (e.g. Slack channel names, Gmail labels) are **never fetched**. The AI-tools
surface independently redacts to `toOwnerControlledView` (`accountLabel: null`, `scopeCount: 0`,
`ownerControlled: true`) for non-creators
([integrations.ts:114-122,202](../../../services/ai/tools/integrations.ts)).

### 2.4 Does run-now enforce creator-pinned personal-credential behavior?
**Yes** — via the engine's `runWithCredentialResolutionContext({ createdByUserId })` →
`refreshAndRetry`'s personal-provider pin (§2.1). Account/service providers are intentionally
**not** pinned (account-shared).

### 2.5 Does Disconnect use `connected_by_user_id` as authority, and where?
**Yes, as ONE arm of a two-arm rule, and only for personal providers:**
- [disconnect.ts `resolveAndAuthorize`](../../../services/integrations/disconnect.ts): account/service
  providers (`isAccountCredentialProvider`) ⇒ **owner/admin only**; personal providers ⇒ **owner/admin
  OR `connected_by_user_id === caller`** (the connector). Non-member / cross-account ⇒ `not_found`.
- [app/apps/_shared.ts `computeCanDisconnect`](../../../app/apps/_shared.ts) mirrors the same rule for
  UI gating (the routes re-authorize, so the boolean is advisory only).
`connected_by_user_id` is used as **provenance for the connector-may-disconnect-own arm**, never as
row ownership.

---

## 3. Provider classification (Q2)

**There already is an authoritative classification system — extend it, do not reinvent.**
[credentialSharing.ts](../../../core/integrations/credentialSharing.ts) `POLICY` (lines 47-78):

| Class | Providers | Maps to Marcus's |
|---|---|---|
| **`account`** (shared org resource) | slack, notion, stripe, shopify, hubspot, mailchimp | **shared_with_account** (default shared) |
| **`personal`** (acts as the human) | gmail, microsoft-outlook, microsoft-outlook-calendar, google-calendar, google-drive/sheets/docs/analytics, microsoft-onedrive/onenote/excel/teams, dropbox, discord | **private_to_connector** (default private) |
| **`personal` (needs decision → safe default)** | github, facebook, airtable, trello, monday | private for now |

Unknown providers ⇒ `personal` (fail-safe; never auto-share). The coverage test forces every
registered provider to be classified. **The `personal`/`account` split is exactly the
`private_to_connector` / `shared_with_account` default split** Marcus wants — no new taxonomy needed
for the *defaults*.

---

## 4. Recommended final product model

**Adopt the existing classification as the DEFAULT, and add only the missing piece: a per-row
explicit-share OVERRIDE.** The four concerns map cleanly:

1. **Row ownership** — `account_id` (unchanged; `connected_by_user_id` stays provenance/display).
2. **Visibility** — account-membership (a member can *see that* a provider is connected; personal
   labels/credentials stay redacted to non-connectors per §2.3).
3. **Permission to USE in a workflow** — derived from **(provider class) × (sharing override) ×
   (who created/owns the workflow node)**:
   - `account` provider ⇒ usable by any workflow on the account (shared). ✅ already true.
   - `personal` provider, default `private_to_connector` ⇒ usable only by the connector's own
     workflows (creator-pin). ✅ already true at the credential layer; the **gap is that any member
     can run the connector's workflow** (§2.2).
   - `personal` provider explicitly `shared_with_account` ⇒ usable by account workflows. ❌ does not
     exist yet (no override field) — this is the new capability.
4. **Permission to disconnect/manage/share** — Disconnect already correct for defaults (§6); the
   **share** action (flip a personal row to `shared_with_account`) is connector-only (or owner/admin),
   and is the new write surface.

**The only genuinely new product capability is "Person A explicitly shares their personal connection
with the team."** Everything else is already modeled; the work is (a) decide the run/edit-permission
policy (§4 concern 3 gap), and (b) build the explicit-share override.

---

## 5. Data model (Q3)

**Do we need `integration_sharing_scope`? Eventually yes — but NOT now, and NOT via a rushed
migration.**

- The provider **classification gives the default**; what it cannot express is a **per-row runtime
  choice** ("A shared *this* Gmail row"). That needs per-row state: either a nullable
  `integration_sharing_scope` column on `integrations` (`private_to_connector | shared_with_account`,
  default derived from the class) **or** reuse of the existing per-node
  [`workflow_node_credentials`](../../../repositories/workflowNodeCredentials.ts) grant table
  (already models "this user's credential is the accepted owner for this node", flag-gated
  `ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, default OFF).
- **Additive + non-breaking:** a nullable column defaulting to the classification-derived value does
  not touch `account_id` ownership, RLS, or any existing row. `access_token_encrypted` stays NOT NULL;
  no token reshape.
- **Migration now? No.** Recommendation: **classification-first**. Today's behavior already enforces
  private-by-default for personal providers (creator-pin + option redaction), so there is no *leak* to
  patch. The column/table is only required when the **explicit-share write path** is built. Document
  + guard via the existing classification now; add persistence with that feature.
- **Open design choice (flag for decision):** a new `integrations.integration_sharing_scope` column
  (simple, integration-level) vs. extending `workflow_node_credentials` (already exists, per-node,
  finer-grained). Lean toward the **integration-level column** for "share this connection with the
  team" because Marcus's mental model is per-connection, not per-node — but confirm against the
  node-credential arc before building.

---

## 6. Disconnect rules under this model + SAFETY VERDICT (Q5 + key question)

**Verdict: live Disconnect (`34b28e045`) is SAFE under current behavior. No narrow fix required.**

Disconnect authz is **role + provenance** based on the SAME `isAccountCredentialProvider`
classification — it was never flag-based, so removing the availability flag exposed **no** new path.
Mapping to Marcus's Q5 rules against what exists today (no sharing override yet ⇒ every personal row
is private):

| Case (current reality) | Marcus's rule | Current behavior | Aligned? |
|---|---|---|---|
| Shared service integration (account class) | admin/owner only | `isAccountCredentialProvider` ⇒ owner/admin only | ✅ |
| Private member-connected (personal, not shared) | connector / admin / owner, with impact warning | personal ⇒ owner/admin OR connector; advisory `workflow-impact` shown pre-confirm | ✅ |
| Normal member disconnecting *another* user's connection | not allowed | personal: a non-connector member is neither connector nor admin/owner ⇒ `forbidden`; account: non-admin ⇒ `forbidden` | ✅ |
| **Shared member-connected** (personal explicitly shared) | admin/owner (or connector w/ stronger confirm) | **does not exist yet** (no override) | n/a today |

The only row of Marcus's table that current authz doesn't cover — "shared member-connected" — **cannot
occur today** because there is no share override. When the explicit-share feature lands, the personal
arm should tighten: a *shared* personal row should require **owner/admin** (or connector with a
stronger confirmation), so a connector can't unilaterally yank a connection the team now depends on.
That is **forward work tied to the share feature**, not a current safety hole.

**No-leak (unchanged, re-confirmed):** Disconnect responses + audit logs carry only ids/counts/
provider; non-member/cross-account ⇒ uniform 404 (no existence inference); revoke failure never
surfaces a raw provider error. Co-member personal credentials/labels remain redacted in the builder
(§2.3).

---

## 7. Workflow rules alignment (Q4)

| Marcus's rule | Current behavior | Status |
|---|---|---|
| Private workflow on private connection: visible to team, but **only creator/authorized can run/edit** | Visible ✅; but **any member can run/edit** (membership-gated, §2.2) | ⚠️ **GAP** — run/edit not creator/role-restricted |
| Copy-as-template: another member duplicates and **picks their own integration** | `createWorkflowFromTemplate` sets `createdByUserId = actorUserId` ([templateManagement.ts:125/276/351/419](../../../services/workflows/templateManagement.ts)); export sanitizer strips credentials; the copy re-pins personal resolution to the forker | ✅ aligned |
| Shared workflow on shared integration: members with workflow permission run/edit | account-class providers are account-shared; any member runs | ✅ aligned |
| Reconnect/disconnect respect scope + workflow impact | Disconnect cascades dependents to `disabled(integration_revoked)` + shows impact; Reconnect via `upsertActive` inserts a fresh row | ✅ for defaults; scope-aware refinement is forward work |

---

## 8. Minimal implementation path

1. **Now (this audit): nothing to code for safety.** Disconnect is safe; private-by-default is
   already enforced. Document the model (this doc).
2. **Decision gate (product, blocking the share feature, NOT Disconnect):** choose the **run/edit
   permission policy** for private-credential workflows — keep membership-based (status quo) or
   restrict run/edit of a workflow whose nodes use a personal provider to the creator + owner/admin.
   This is the only behavior that contradicts the stated direction.
3. **Explicit-share feature (separate slice, flag-gated, default OFF):** add the per-row sharing
   override (integration-level column **or** node-credential reuse — §5), a connector-only "Share with
   team" action, and tighten the personal-provider Disconnect arm for *shared* rows (owner/admin or
   stronger confirm). Migration lands **with** this slice, never before.
4. **Copy-as-template:** already satisfies the requirement; no work.

**Deferrable:** the `integration_sharing_scope` migration, any RLS/GRANT change, and any Disconnect
authz change — all tied to step 3.

---

## 9. Blockers before continuing

- **No blocker for Disconnect.** It is safe and may stay live.
- **One product decision blocks the *share* arc, not Disconnect:** the run/edit-permission policy
  (§8.2). Until Marcus decides whether non-creators may run/edit a private-credential workflow, the
  "private workflow → only creator can run" rule (#4) cannot be implemented, and the explicit-share
  semantics can't be finalized.

---

## 10. What did NOT change (invariants preserved)

No co-member credential fallback was added; `created_by_user_id` / `connected_by_user_id` semantics
unchanged; the 22B creator-pin, 22D-2 option redaction, and `toOwnerControlledView` are untouched;
Disconnect authz unchanged; no `integration_sharing_scope` introduced; no migration, no schema, no
RLS/GRANT change; no MCP change. This slice is **docs-only**.

---

## 11. Recommended next step

Put the **run/edit-permission decision** (§8.2) to Marcus. If he wants private-credential workflows
restricted to creator+owner/admin for run/edit, that becomes the first implementation slice
(workflow-permission, independent of Disconnect). The explicit-share override + its Disconnect
refinement follow as a flag-gated slice. Disconnect itself needs nothing further.
