# 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-CLOSEOUT — Explicit Credential Sharing Closeout

**Type:** Closeout / handoff. **Docs only — no source, migrations, tests, UI, or
behavior changes.** Nothing pushed.
**Date:** 2026-06-05 (CS-7 update appended)
**Branch:** `builder-ui-v1-audit-1`
**Arc:** plan → CS-1 … CS-7 (all shipped). This doc closes the arc and records the
verified end state + next-track options.

**Source of truth (verified current state):**
[contracts/repository](../../../repositories/workflowNodeCredentials.ts) ·
[execution resolution](../../../services/execution/engine.ts) ·
[reassignment service](../../../services/teamCredentials/reassignmentService.ts) ·
[options policy](../../../services/options/credentialPolicy.ts) ·
[AI availability](../../../services/ai/tools/workflowContext.ts) ·
[offboarding impact](../../../services/accounts/offboardingImpact.ts) ·
[membership remove](../../../services/accounts/membership.ts) ·
[leave account](../../../services/accounts/leaveAccount.ts) ·
[feature flag](../../../services/teamCredentials/flags.ts) ·
[consent inbox service](../../../services/teamCredentials/credentialRequestsInbox.ts) ·
[inbox panel](../../../features/team/CredentialRequestsPanel.tsx) ·
[migration](../../../supabase/migrations/20260606000000_workflow_node_credentials.sql) ·
[plan](./team-workflows-credential-sharing-plan.md) · [22A–22D closeout](./team-credential-access-closeout.md).

---

## 1. Summary

- Team-workflow **personal-provider** steps now support **explicit, per-node
  credential ownership** — a node may run under a specific consenting member's
  connection instead of the workflow creator's.
- The feature is **consent-gated** (inert until the target accepts) and
  **feature-flag-controlled** (`ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, default OFF).
- **Default behavior is unchanged:** with no accepted node owner, a personal step
  resolves to `workflow.created_by_user_id` exactly as before (the 22B creator pin).
- **Account/service providers remain account-shared** — they ignore any node owner.
- **No broad team-wide sharing** of personal credentials was introduced (no
  credential pool, no "anyone can use anyone's Gmail").
- **No `created_by_user_id` rewrite** — provenance is never mutated by this arc.

---

## 2. Completed commit chain

| Slice | Commit | What it shipped |
|---|---|---|
| Plan | `b9327d4ca` | Explicit credential sharing + creator-reassignment plan (Option B side table). |
| CS-1 — schema + repository | `1b19e4386` | `workflow_node_credentials` table, RLS, GRANTs, repo helpers; flag added (off). |
| CS-2 — execution resolution | `3b3c668bd` | Engine resolves accepted per-node owner → falls back to creator; no silent co-member fallback. |
| CS-3 — consent + routes | `db4e3fe9d` | `reassignmentService` request/accept/decline/revoke + routes; owner/admin/creator-initiate, target-consent. |
| CS-4 — options + badge awareness | `3473352bd` | `decideOptionsCredential` keyed on effective owner; builder badge awareness. |
| CS-4b — metadata + request UI | `c7496a071` | Node credential-owner metadata + minimal reassignment-request UI. |
| CS-5 — AI availability | `15a4abb98` | `getWorkflowIntegrationAvailabilityForAI` node-owner-aware; flags only, no identity. |
| CS-6 — offboarding evolution | `54b7ba5ff` | Impact counts owned nodes; remove/leave revokes the member's live grants. |
| CS-7 — consent inbox surface | `9ad1d4c50` | Team-page `CredentialRequestsPanel` + account-scoped inbox endpoint; target accepts/declines via the CS-3 routes; no notification-enum migration. |

---

## 3. Current behavior

**Data**
- `workflow_node_credentials` stores per-(workflow, node) credential-owner grants
  with a consent `status` (`pending` / `accepted` / `declined` / `revoked`).
- A **partial unique index** allows only **one live (pending|accepted) grant** per
  `(workflow_id, node_id)`; `declined` / `revoked` rows are retained as history.
- Feature flag `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` — **default OFF**.

**Execution (flag ON)**
- personal provider + **accepted** node owner → runs under the **assigned owner's**
  connection.
- personal provider + no accepted owner → runs under the **workflow creator**
  (byte-for-byte today).
- assigned owner has **no active connection** → **clear failure** (reassign /
  reconnect); **no silent fallback** to the creator at runtime.
- account/service provider → **account-shared**, ignores any node owner.

**Builder / options (flag ON)**
- accepted owner → gets options for their node (`personal-creator`-equivalent).
- non-owner (incl. the creator, once reassigned) → `NOT_WORKFLOW_OWNER`, **no
  provider fetch, no label fetch**.
- effective owner has no connection → `OWNER_MUST_CONNECT`.

**Builder UI**
- accepted assigned-owner badge ("runs under `<member>`'s connection", display
  identity only).
- pending reassignment state shown on the node.
- minimal reassignment-**request** UI (request only; see §7 for the deferred
  consent inbox).
- eligible-target picker lists **only connected, eligible members** by safe
  display identity.

**AI**
- availability is node-owner-aware; emits **only booleans / flags**
  (`connected` / `ownerControlled` / `ownerMustConnect`).
- **never** emits owner id / email / label / scope / token.

**Offboarding (CS-6)**
- impact count = **distinct union** of (a) workflows the member created with a
  personal-provider step **and** (b) workflows where the member is the **accepted**
  node-credential owner (class (b) gated on the flag — inert when OFF).
- remove / leave **revokes** the departing member's live (pending|accepted) grants
  before soft-disconnect, so revoked nodes fall back to the workflow creator (CS-2).
- existing personal-credential **soft-disconnect (22C) is unchanged**.

**Consent inbox (CS-7)**
- pending reassignment requests **surface on the Team page Overview** in a
  `CredentialRequestsPanel`, so the target member can discover them.
- the target can **accept** or **decline** each request from the panel; accept calls
  the existing CS-3 accept route (**making the grant effective**), decline calls the
  CS-3 decline route (**the grant stays inert / creator-pinned**).
- the panel **hides entirely** when there are no pending requests or the feature
  flag is OFF (the account-scoped inbox endpoint returns an empty list) — the page
  is unchanged for everyone else.
- **no new notification type / migration** was needed: a CS-3 request already
  inserts a pending `workflow_node_credentials` row, so the inbox item *is* that
  row; CS-7 only adds the self-scoped reader + UI.

---

## 4. Security / no-leak guarantees

- **No OAuth tokens** are ever exposed or returned.
- **No provider account labels / emails / scopes** cross members — connection
  checks are presence-only.
- **Non-members** get no-leak behavior (404 / gate failure, never the count or
  detail).
- **Account/service providers can never become node-owned** — rejected at the repo
  (`ACCOUNT_PROVIDER_NOT_NODE_OWNABLE`) via the central classifier.
- A grant is **inert until `accepted`** by the target.
- A caller **cannot create an accepted grant directly** — the repo only inserts
  `pending`; accept is a separate, target-only transition.
- **Flag OFF** keeps the old creator-pinned behavior in execution, options, AI, and
  the impact warning.
- **AI prompts / tool results / persisted messages never receive** the
  `credentialOwnerUserId` (identity stays server-internal).
- **Consent inbox (CS-7):** the inbox payload carries **only** workflow id + name,
  node id, provider **type**, the requester's **display name**, and `requestedAt` —
  **no OAuth tokens, no provider account labels / emails, no scopes**. The endpoint
  is **self-scoped to `auth.userId`** (never request input), so it can't probe
  another member; **non-members get no-leak behavior** (403, never the list).

---

## 5. Data / RLS model

- `workflow_node_credentials` is **workflow/account-scoped** — the side table has no
  `account_id`; scope is resolved through the `workflow_id → workflows` FK.
- **SELECT** is membership-gated (`is_account_member` of the workflow's account) and
  **freeze-aware** (`accounts.deletion_status = 'active'`).
- **Writes are service-role only** — there are no user-facing write RLS policies;
  the consent/reassignment flow runs server-side.
- **Provider classification stays in code** through the single credential-sharing
  classifier (`core/integrations/credentialSharing.ts`), **not duplicated in SQL**.
- The **partial unique index** permits exactly one live (`pending|accepted`) grant
  per `(workflow_id, node_id)` while preserving `declined` / `revoked` history.
- **Workflow delete cascades** grants (`workflow_id … ON DELETE CASCADE`); the
  owner FK is `ON DELETE CASCADE` on `auth.users`.
- Explicit Data-API **GRANTs** (`authenticated` + `service_role`) per the
  post-Oct-2026 cutover rule.

---

## 6. UI behavior

- The existing **creator badge** remains when there is no override ("runs under
  `<creator>`'s connection").
- An **accepted override** badge says the node runs under the **assigned member's**
  connection (display identity only).
- **Pending** request state is shown on the node.
- The **Reassign** action is available only to allowed users (owner/admin, or the
  creator) and only for **personal-provider** nodes.
- The eligible-target picker shows **connected, eligible members by safe display
  identity** (name → email → short id); members without the provider connected are
  not selectable.
- **No broad redesign** — this layers onto the existing TW-3/3b badge + config UX.
- **No personal-provider token or provider account label** is ever shown.

**Consent inbox panel (CS-7) — `features/team/CredentialRequestsPanel.tsx`:**
- a **self-fetching** panel on the Team page Overview that **renders nothing** while
  loading, when empty, or when the feature is OFF (no layout change for others).
- each request reads: *"‹requester display name› wants the ‹Provider› step in
  ‹workflow name› to run under your connection,"* plus a line clarifying that
  **accepting lets that step act using the user's connected app account**.
- **Accept / Decline** buttons call the existing CS-3 per-node routes; the item
  **resolves out of the list** on success.
- **inline error** on action failure; the item stays so the user can retry.

---

## 7. Deferred / known limitations

- ✅ **In-app consent surface — RESOLVED (CS-7).** The target now sees + accepts /
  declines pending requests via the Team-page `CredentialRequestsPanel`.
- **Discovery is pull-based** — the inbox is only visible when the target **visits
  the Team page**. There is **no NotificationBell badge / push** yet; active
  notification needs a future `notification_type` migration (out of scope for CS-7
  under the no-migration boundary). This is the natural next track — §9.A.
- **No multi-connection-per-provider** selection (a member with two connections of
  the same provider can't pick which at the node level — Option C, future).
- **No whole-workflow "runs-as member X"** shortcut (Option E was not needed).
- **No broad credential pool / sharing** (Option D rejected at launch).
- **No automatic reassignment when the creator leaves** — offboarding **revokes**
  the leaver's grants (falls back to the creator, or fails clearly); it does not
  auto-assign a replacement.
- **No migration of existing plaintext provider webhook secrets** (out of arc).
- `lint:structure` docs-folder file-count debt remains — **pre-existing and
  unrelated** to this arc.

---

## 8. Verification baseline (as of CS-7, `9ad1d4c50`)

- **Full Jest:** 15,873 passed / 0 failed (28 suites skipped — gated DB harness).
- **typecheck:** clean (`tsc --noEmit`).
- **lint:** 0 errors on changed files.
- **CS-1 … CS-6 suites:** green.
- **CS-3 route/service, CS-4b builder-request, NotificationBell, and Team suites:**
  green (untouched by CS-7 — accept/decline reuse the existing CS-3 routes).
- **Existing 22C + leave/remove offboarding suites:** green (incl. the TL-3
  leave-account structural scope guard).

> No source / migration / test / behavior was changed by this closeout-update slice
> — the baseline above is inherited from CS-7, not re-measured here.

---

## 9. Recommended next tracks

**First:** run a full local baseline if one hasn't been run since CS-7 (`tsc
--noEmit`, `eslint .`, `jest`) to confirm the arc end state on a clean tree.

**Then choose one:**

- **A. NotificationBell badge / active notification** for credential requests —
  turns CS-7's pull-based inbox into active discovery (needs a `notification_type`
  migration; the one remaining caveat in §7).
- **B. Docs structure reorg** to resolve `lint:structure` file-count debt.
- **C. API keys / webhooks Phase B planning** — developer-platform foundation.
- **D. Plan metadata / Stripe billing planning** — monetization.
- **E. 2FA / session future security planning.**

**Suggested priority by goal:**

| Goal | Pick |
|---|---|
| Collaboration polish | **A** — NotificationBell badge / active notification |
| Local hygiene | **B** — docs structure reorg |
| Developer platform | **C** — API keys foundation planning |
| Monetization | **D** — plan metadata / Stripe planning |

**Recommendation:** with the consent surface now shipped (CS-7), the collaboration
loop is **functionally complete**; **A** (NotificationBell badge / active
notification) is now a polish item, not a blocker. Pick the next track by the goal
above rather than defaulting to A — **B** is the cheapest hygiene win if no product
goal is pressing.

---

## Report summary

- **Arc complete:** explicit per-node credential ownership for Team-workflow
  personal-provider steps — consent-gated, flag-controlled
  (`ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, default OFF), default = creator-pinned,
  account/service unchanged, no broad sharing, `created_by_user_id` never rewritten.
- **Commit chain:** plan `b9327d4ca` → CS-1 `1b19e4386` → CS-2 `3b3c668bd` → CS-3
  `db4e3fe9d` → CS-4 `3473352bd` → CS-4b `c7496a071` → CS-5 `15a4abb98` → CS-6
  `54b7ba5ff` → CS-7 `9ad1d4c50`.
- **End state:** `workflow_node_credentials` (one live grant per node, history
  preserved, service-role writes, membership-gated freeze-aware SELECT); execution /
  options / AI all node-owner-aware behind the flag; offboarding counts + revokes
  owned grants; the target consents via the Team-page inbox panel (CS-7).
- **Deferred:** NotificationBell badge / active notification (pull-based inbox only),
  multi-connection-per-provider, whole-workflow runs-as, auto-reassign-on-leave.
- **Recommended next track:** pick by goal (§9) — the consent loop is complete, so
  **A** (active notification) is polish; **B** (docs reorg) is the cheapest hygiene win.
