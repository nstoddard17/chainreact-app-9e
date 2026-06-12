# 4.CONN-SHARE-1 — Explicit Private-Connection Sharing Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, execution, or
credential-sharing behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-12
**Branch:** `builder-ui-v1-audit-1`
**Arc:** WF-RUNPERM (team-visible ≠ team-runnable, shipped `6a02131ed`/`42fe1ce29`) →
**this plan** → CONN-SHARE CS-1…CS-N (future, gated, migration-bearing).

**Source of truth (verified current state — every file below was read for this plan):**
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`personal | account` classifier + `POLICY`) ·
[core/integrations/workflowCredentialScope.ts](../../../core/integrations/workflowCredentialScope.ts) (`workflowUsesPrivateCredential`, `viewerMayRunEdit` — creator-only when private) ·
[app/api/workflows/_shared.ts](../../../app/api/workflows/_shared.ts) (`assertWorkflowRunEditAllowed` ~348, DTO booleans `usesPrivateCredential`/`viewerCanRunEdit` ~280/316, typed `WORKFLOW_USES_PRIVATE_CREDENTIAL` 335) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) (22B AsyncLocalStorage creator-pin) + [services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (pins `connected_by_user_id = createdByUserId` for personal providers, 166-219) ·
[repositories/workflowNodeCredentials.ts](../../../repositories/workflowNodeCredentials.ts) (**existing** per-node grant table + consent state machine) ·
[services/teamCredentials/flags.ts](../../../services/teamCredentials/flags.ts) (`ENABLE_NODE_CREDENTIAL_REASSIGNMENT`, default OFF) + [reassignmentService.ts](../../../services/teamCredentials/reassignmentService.ts) / [credentialRequestsInbox.ts](../../../services/teamCredentials/credentialRequestsInbox.ts) / [nodeCredentialOwners.ts](../../../services/teamCredentials/nodeCredentialOwners.ts) / [credentialOwnerMetadata.ts](../../../services/teamCredentials/credentialOwnerMetadata.ts) ·
[supabase/migrations/20260505000002_integrations.sql](../../../supabase/migrations/20260505000002_integrations.sql) (`integrations` schema — no sharing column) ·
[app/apps/_shared.ts](../../../app/apps/_shared.ts) + [contracts/apps.ts](../../../contracts/apps.ts) (Apps DTO; `canDisconnect`/`canReconnect`; NO `provider_account_id`) ·
[services/integrations/disconnect.ts](../../../services/integrations/disconnect.ts) (disconnect gate + cascade).

**Prior decisions this revisits:**
[team-workflows-credential-sharing-plan.md](./team-workflows-credential-sharing-plan.md)
(2026-06-05 — chose **Option B: per-node consent-gated reassignment**, explicitly weighing and
deferring a row-level approach) · [workflow-run-edit-permission-closeout.md](./workflow-run-edit-permission-closeout.md)
(WF-RUNPERM creator-only run/edit for private-credential workflows).

---

## 0. Decision status — LOCKED (2026-06-12, Marcus)

**The model is decided. This remains design-only — do NOT start an implementation slice until
Marcus explicitly says so.** Marcus confirmed **Option A (row-level connector-push)** and resolved
every open question. The locked model:

1. **Account ownership unchanged.** `integrations.account_id` owns the row; `connected_by_user_id`
   stays provenance/audit/display. The row still belongs to the team account.
2. **Sharing controls usage, not ownership.** `private_to_connector` = only the connector/creator
   can run/edit private-credential workflows; `shared_with_account` = members with workflow
   permissions can run/edit workflows using that connection. Account/shared-service providers remain
   shared by classification and **ignore** this field.
3. **Row-level, not per-node.** This is per **integration row**, not per workflow node. The existing
   per-node reassignment/grant system (`workflow_node_credentials`, flag-gated) stays **separate** and
   remains a future/advanced path. **Do not merge the two concepts.** (Resolves OQ-1 = A; OQ-5 = keep B
   separate.)
4. **Who can share: connector only.** Owner/admin may **not** silently share another member's
   personal external identity. Owner/admin may still manage/audit/disable/delete/disconnect per
   existing admin rules. (Resolves OQ-2 = connector-only; no silent admin share. The optional
   "admin-request" flow from the old OQ-2 is **not** adopted.)
5. **Who can unshare:** connector can unshare. Owner/admin **may** perform a safety/admin removal —
   but if implemented it must be **framed as an admin safety action and audit-logged**, and must never
   silently toggle a member's private identity *into* shared.
6. **Unshare behavior:** do **not** auto-disable workflows. Revert affected workflows to **creator-only
   run/edit**. Non-creators who could previously run now get the **existing private-credential blocked
   state + Duplicate CTA**. No silent auto-resume or hidden permission continuation. (Resolves OQ-4.)
7. **Execution behavior:** a shared personal connection still executes as the **connector's** external
   OAuth identity (never the runner's/author's). The UI must make this explicit **before** sharing:
   *"Team members will be able to run workflows using this connection."* (Resolves OQ-3 direction.)
8. **Data model:** add nullable `integration_sharing_scope` on `integrations` when implementing.
   Values `private_to_connector | shared_with_account`. `NULL` derives the default from provider
   credential classification (personal → `private_to_connector`; account → shared by classification).
   **No backfill.** Add a **CHECK** constraint. **No RLS model change.**
9. **Feature-flag posture:** this is **not** a permanent hidden feature. A temporary implementation
   guard during development is fine, but the goal is to **build, verify, and make it live once
   complete** — not ship it dark indefinitely.

Sections 4–10 below are the design rationale that produced this model; where they describe an option
as "recommended" or "open," treat §0 as authoritative.

---

## 1. Context

WF-RUNPERM made "team-visible ≠ team-runnable" real: a workflow with ≥1 private/member-connected
credential is **creator-only** to run/edit; teammates can see + duplicate. The remaining gap is
the **escape hatch the closeout named**: a connector should be able to *explicitly* make their
private connection team-usable so those workflows become team-runnable by role. This plan designs
that — **smallest safe path only** — and reconciles it with two already-shipped systems it touches.

---

## 2. Current codebase findings (verified)

### 2.1 Credential classification is centralized and authoritative
[credentialSharing.ts](../../../core/integrations/credentialSharing.ts) classifies every provider
`personal | account` (`POLICY`, default `personal`, coverage-tested). **Account** providers
(slack/notion/stripe/shopify/hubspot/mailchimp) are already account-shared by nature; **personal**
providers (gmail, outlook, calendars, drive, dropbox, …) act AS the connecting human and must not
auto-share. **Sharing scope is only ever meaningful for `personal` providers** — account providers
are inherently shared today.

### 2.2 The run/edit gate is creator-only for private — and does NOT consult any sharing state
[`viewerMayRunEdit`](../../../core/integrations/workflowCredentialScope.ts) returns: not-private →
any member; private → `createdByUserId === caller` only. Role-agnostic. Enforced at
[`assertWorkflowRunEditAllowed`](../../../app/api/workflows/_shared.ts) (run-now / PATCH
draftDefinition / activate / resume / reactivate) and surfaced as DTO booleans + the typed
`403 WORKFLOW_USES_PRIVATE_CREDENTIAL`. **This is the single chokepoint a sharing feature must teach
about "shared" connections.**

### 2.3 Execution pins personal providers to the workflow CREATOR (22B)
[credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) +
[refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (166-219): for personal providers,
the engine pins `connected_by_user_id = createdByUserId`. So a private-credential workflow already
runs as its creator's identity. **Consequence for sharing:** "shared with team" must NOT change
*whose* token executes — it stays the **connector's**. Sharing changes **who may trigger** the run,
not which credential resolves. (If a non-creator authors a workflow against a shared connection,
execution must resolve to the **connector**, not the author — see OQ-3.)

### 2.4 A per-node, consent-gated reassignment system ALREADY EXISTS (flag OFF)
[`workflow_node_credentials`](../../../repositories/workflowNodeCredentials.ts) is a shipped side
table: per `(workflow, node)`, an optional `credential_owner_user_id` + a `pending → accepted →
declined|revoked` consent machine, with offboarding revoke + a consent inbox
([reassignmentService.ts](../../../services/teamCredentials/reassignmentService.ts),
[credentialRequestsInbox.ts](../../../services/teamCredentials/credentialRequestsInbox.ts)). The
whole CS-1…CS-8 arc landed but is **gated OFF** by `ENABLE_NODE_CREDENTIAL_REASSIGNMENT`
([flags.ts](../../../services/teamCredentials/flags.ts)); while off, nodes resolve to the creator
exactly as today. **Shape: requester-pull, per-node, target-consent** — "member B asks to use A's
credential on one node; A consents."

### 2.5 The `integrations` table has no sharing column
[20260505000002_integrations.sql](../../../supabase/migrations/20260505000002_integrations.sql):
columns include `connected_by_user_id`, `provider_account_id`, `disconnected_at`, `account_metadata`
— **no `sharing_scope`**. The Apps DTO ([app/apps/_shared.ts](../../../app/apps/_shared.ts)) emits
`id`, `displayName`, `connectedAt`, `canDisconnect`, `canReconnect` — deliberately **no
`provider_account_id`/email** (pinned by the DTO-safety test).

---

## 3. Product / model decision — what this is, and is NOT

**Is:** a **connector-push, per-connection** opt-in — Person A (the connector of a personal
integration row) flips it from `private_to_connector` to `shared_with_account`, after which
workflows using that provider become **team-runnable by role**, while still executing under **A's**
credential. A coarse, deliberate "I'm letting my team run things as me with this connection" switch.

**Is NOT:** the existing **per-node, requester-pull, consent-gated reassignment**
(`workflow_node_credentials`, §2.4). That is a *different, finer* mechanism for "use a specific
person's credential on a specific node." This plan does **not** delete or replace it — it stays
flag-gated and complementary (targeted reassignment vs broad connection-sharing).

**Is NOT:** a general permission system, a per-workflow ACL, or owner/admin power to silently share
a member's external identity (see §5).

Anchored to the V2 account model: sharing is **account-scoped** (a connection is shared *with its
owning account*), role still governs run/edit downstream, and a non-member can never observe or
infer a shared connection.

---

## 4. Recommended approach — row-level `integration_sharing_scope`

Add an **additive, nullable** `integration_sharing_scope` to `integrations`, consulted **only for
personal providers**:

- `NULL` / `private_to_connector` → today's behavior (creator-only run/edit; engine creator-pin).
- `shared_with_account` → the provider stops counting as "private" **for the run/edit gate** on that
  account; workflows whose only private providers are all shared become team-runnable by role.
  Execution still resolves to the **connector** (the row's `connected_by_user_id`).

Three touch-points, each extending an existing seam (no new subsystem):

1. **Run/edit gate.** Extend `viewerMayRunEdit` to accept the set of providers the account has
   `shared_with_account`. A workflow is team-runnable when every private-provider node it uses is
   either account-class OR a shared personal provider on this account. The chokepoint
   (`assertWorkflowRunEditAllowed`) resolves that set server-side and passes it in.
2. **Execution resolution.** For a shared personal provider, the engine resolves
   `connected_by_user_id = <the connector who shared>` instead of the creator-pin. Cleanest reuse:
   the resolver already supports an explicit owner override (the 22B context + the node-credential
   override path) — sharing supplies that owner from the shared row.
3. **Apps surface + workflow badge.** Connector toggles share/unshare; DTO exposes a boolean
   `sharedWithAccount` (no identity); the workflow run/edit DTO booleans already exist and just need
   the shared-set folded into their computation.

May ship behind a temporary `ENABLE_CONNECTION_SHARING` dev guard so partial slices stay inert
while in flight (while off, the column is inert and every path behaves exactly as WF-RUNPERM ships
today) — **but per §0.9 this is not a permanently-hidden feature**; the guard exists to land the work
safely, and is flipped on (or removed) once the arc is complete and verified.

---

## 5. Alternatives considered

| Option | Mechanism | Security / no-leak | Migration | Builder/UI | Execution consistency | Offboarding | Fit to "share my connection" |
|---|---|---|---|---|---|---|---|
| **A. Row-level `integration_sharing_scope` (recommended)** | nullable column on `integrations`; only personal providers | ✅ connector-push only; no identity exposed (boolean) | ⚠ **1 additive nullable column** | ✅ one Apps toggle + badge | ✅ resolve to connector via existing owner-override seam | ✅ reuse disconnect/offboarding revoke = unshare | ✅✅ exactly the product ask |
| **B. Reuse `workflow_node_credentials` (already built)** | model "share" as standing accepted grants | ✅ consent-gated, identity-hidden | ✅ none (table exists) | ❌ per-node, requester-pull — wrong shape for "share whole connection" | ✅ already wired | ✅ already wired (revoke) | ❌ awkward: would need an inverted, connection-wide grant generator |
| **C. Per-node connection picker** | node references a chosen integration row | ⚠ surfaces co-member rows → leak risk | ⚠ node-ref | ❌ biggest builder change | ✅ | ⚠ | ⚠ overkill for launch |
| **D. Owner/admin can share any member's connection** | role-based broad share | ❌ silently shares a user's external identity — the thing the personal/account model prevents | — | — | — | — | ❌ rejected (see §6 authz) |

**Recommendation: A**, with **B kept separate** (flag-gated, complementary). A matches the user's
explicit framing (`private_to_connector` / `shared_with_account`), is the smallest path that makes
private-credential workflows team-runnable, and reuses the WF-RUNPERM gate + the 22B owner-override
seam rather than inventing a permission system. The 2026-06-05 plan chose B for *targeted* sharing;
A is the *broad connector opt-in* that plan's per-node model doesn't ergonomically express — they
coexist.

---

## 6. Security / data model

**Schema (CS-1, migration-bearing — deferred until approved):**
```sql
ALTER TABLE public.integrations
  ADD COLUMN integration_sharing_scope text;        -- NULL = private_to_connector (derived)
-- CHECK (integration_sharing_scope IN ('private_to_connector','shared_with_account'))
-- No backfill: NULL is read as private_to_connector for personal providers; account providers
-- ignore the column entirely (already account-shared).
```
Existing table → **grandfathered grants** (no new GRANT needed; it's an existing table). RLS already
gates `integrations` rows; the column adds no new row visibility.

**Default-from-classification:** when `NULL`, derive: personal → `private_to_connector`; account →
not applicable (always shared). So the column is **only writable/meaningful for personal providers**
— enforce in the toggle service (mirror `workflowNodeCredentials.createPendingRequest`'s
`ACCOUNT_PROVIDER_NOT_NODE_OWNABLE` guard).

**No-leak invariants (carry from WF-RUNPERM + Apps DTO):**
- The Apps/workflow DTOs expose only a **boolean** `sharedWithAccount` — never
  `provider_account_id`, email, token, scope, or connector identity.
- A non-member never learns a shared connection exists (membership-gated; 404/no-leak).
- Sharing never lets a co-member **see** the credential or its tokens — only run workflows that
  resolve to it server-side (the 22D-2 redaction / `toOwnerControlledView` posture is untouched).
- The unshare/disconnect error surfaces are typed + generic (no identity).

**Authorization (CS-2) — per §0.4/§0.5 + §10 (DECIDED 2026-06-12):**
- **Share — connector only.** The **connector** (`connected_by_user_id === caller`) may share **their
  own** personal connection. ✅
- **Owner/admin may NOT silently share** a member's personal external identity (Option D rejected —
  impersonation risk). The optional admin-*request* flow is **not** adopted. Owner/admin retain
  manage/audit/disable/delete/disconnect on the row per existing admin rules — but **never** a silent
  share or any toggle of a member's identity *into* shared. ✅
- **Normal member** cannot **share or unshare** another member's connection. ✅
- **Unshare:** the **connector** may unshare their own personal connection. **Owner/admin** may
  perform an unshare **only as a framed admin safety/removal action, and it must be audit-logged**.
  Owner/admin unshare is a restriction/removal action — **never** permission to share or to silently
  toggle a member's identity into shared. ✅

---

## 7. API / service / UI expectations (described, not built)

- **Toggle service** `services/integrations/connectionSharing.ts` —
  `setSharingScope({ accountId, integrationId, callerUserId, scope })`, authorized exactly like
  [disconnect's `resolveAndAuthorize`](../../../services/integrations/disconnect.ts) but
  **connector-only for share** (personal-provider guard). Returns typed reasons
  (`not_found`/`forbidden`/`account_frozen`/`account_provider_not_shareable`).
- **Route** `POST /api/accounts/[id]/integrations/[integrationId]/sharing` (mirrors the disconnect
  route's auth + typed-error mapping). Client sends only the opaque ids + the target scope.
- **Apps DTO** gains `sharedWithAccount: boolean` (server-derived, personal providers only).
- **Apps UI** (extends [AppCard](../../../features/apps/AppCard.tsx) per-account row, next to
  Reconnect/Disconnect): action **"Share with team" / "Stop sharing"**; badge **"Private to you" /
  "Shared with team"**; a confirmation warning *"Teammates will be able to run workflows that use
  this connection, acting as you."* Shown only when `acc.canShare` (connector + personal provider).
- **Workflow surface:** the existing run/edit DTO booleans (`usesPrivateCredential`,
  `viewerCanRunEdit`) recompute with the shared set → the builder's disabled-Run state + the
  list-row "Private connection" badge automatically reflect a now-shared connection. A small
  "Shared connection — team-runnable" badge is an optional polish.
- **Unshare workflow behavior (decision, §10 OQ-4):** **recommended — unshare reverts affected
  workflows to creator-only** (they do NOT disable; they simply stop being team-runnable, matching
  WF-RUNPERM's default). Active workflows owned by the connector keep running (they always could).
  Do **not** silently leave them broadly runnable, and do **not** auto-disable (less destructive).

---

## 8. Tests required (by area)

- **Classifier/scope unit:** account provider → not shareable; personal → shareable; `NULL` reads as
  `private_to_connector`; only personal providers consult the column.
- **Run/edit gate:** workflow with a shared personal provider → team-runnable by role; same workflow
  unshared → creator-only again; mixed (one shared + one still-private provider) → still creator-only;
  account-only/native-only unaffected (regression).
- **Authz (route + service):** connector shares ✓; non-connector member → forbidden; owner/admin share
  of a member's personal → forbidden (Option D guard) but unshare allowed; non-member → 404 no-leak;
  account provider → `account_provider_not_shareable`.
- **Execution:** a shared-connection workflow run by a non-creator member resolves to the
  **connector's** credential (not the runner's), pinned via the owner-override seam; unshared → reverts
  to creator-pin.
- **No-leak:** DTO exposes only the `sharedWithAccount` boolean; no `provider_account_id`/email/token/
  scope/connector id in any response, badge, or error.
- **Disconnect interaction:** disconnecting a shared connection still cascades per existing rules AND
  clears the shared scope; offboarding revoke of the connector unshs / reverts dependent workflows.
- **Flag:** with `ENABLE_CONNECTION_SHARING` off, the column is inert and every path matches
  WF-RUNPERM today.

---

## 9. Implementation slice breakdown (all future, gated, smallest-first)

1. **CS-1 (migration + pure scope helpers + flag).** Additive nullable column (+CHECK); flag
   `ENABLE_CONNECTION_SHARING` (default OFF); pure `effectiveSharingScope(provider, column)` +
   `accountSharedProviderSet(rows)` helpers. No behavior wired. **Needs `db:push` — Marcus-approved.**
2. **CS-2 (toggle service + route + authz).** Connector-only share / connector-or-admin unshare;
   typed errors; no-leak. Mirrors the disconnect service/route.
3. **CS-3 (run/edit gate).** Thread the account's shared-provider set into `viewerMayRunEdit` /
   `assertWorkflowRunEditAllowed` + the DTO booleans. Behind the flag.
4. **CS-4 (execution resolution).** Resolve shared personal providers to the connector via the
   existing owner-override seam. Behind the flag. Heaviest correctness surface → its own slice + parity
   tests.
5. **CS-5 (Apps UI + workflow badge).** Share/Stop-sharing per-row action, badges, confirmation copy.
6. **CS-6 (disconnect/offboarding interaction).** Unshare-on-disconnect; connector-offboard reverts
   dependent workflows to creator-only.

---

## 10. Decisions (was: open questions) — RESOLVED 2026-06-12

All five are now **decided** per §0. Retained here with the resolution + any residual implementation
nuance to verify during the slice.

- **OQ-1 — Row-level (A) vs reuse per-node (B).** **DECIDED: A** (row-level connector-push). **B stays
  separate** and flag-gated for targeted per-node reassignment — the two concepts are **not** merged.
- **OQ-2 — Owner/admin share of a member's personal connection.** **DECIDED: connector-only for share;
  no silent admin share** (impersonation). The optional admin-*request* flow is **not** adopted.
  Owner/admin retain manage/audit/disable/delete/disconnect per existing admin rules.
- **OQ-3 — Non-creator author of a workflow on a shared connection.** **DECIDED: execution resolves to
  the connector**, never the author/runner. *Residual to verify in CS-4:* if multiple members share the
  same provider on one account, the workflow must bind a **specific** connector (reuse the node-owner
  override) — **unverified until CS-4 design.**
- **OQ-4 — Unshare effect on dependent workflows.** **DECIDED: revert to creator-only; do NOT
  auto-disable.** Non-creators fall back to the existing private-credential blocked state + Duplicate
  CTA. No silent auto-resume. Surface a one-time notice to affected workflow owners.
- **OQ-5 — Interaction with the shipped per-node system.** **DECIDED: keep separate.** *Residual to
  verify in CS-4:* when both could set an effective owner for a node, an explicit **accepted
  node-credential grant** (B) wins over the coarse **connection share** (A); document + cover with a
  precedence test.
- **Unshare authz nuance (new, from §0.5):** if owner/admin unshare is implemented, it must be a
  framed **admin safety action** and **audit-logged** — never a silent re-toggle of a member's
  identity into shared.

---

## 11. Acceptance criteria

**This planning slice:** the doc exists under `docs/slices/phase-4/`, every current-state claim ties
to a file that was read, no source/test/migration/UI changed, nothing pushed.

**The implementation must later meet:** additive nullable column only; flag default OFF; connector-push
authz (no silent admin share of personal identity); run/edit gate + execution both consult the shared
set; execution still runs as the **connector**; unshare reverts (not broadly-runnable, not auto-disabled);
no `provider_account_id`/email/token/scope/identity leak; non-members get 404/no-leak; Disconnect
behavior unchanged except the additive unshare-on-disconnect; the per-node reassignment system stays
intact and flag-gated.

---

## 12. Hard boundaries (what this slice did NOT change)

No source, tests, migrations, schema, UI, execution, or credential-sharing behavior changed. No column
added. The `workflow_node_credentials` system, the WF-RUNPERM gate, the 22B creator-pin, Disconnect,
Reconnect, and AI/MCP code are all untouched. The model, schema, authz, and slice ordering are
**proposals**. Nothing pushed.

---

## 13. Recommended next step

**Model is locked (§0); implementation is NOT authorized yet.** When Marcus explicitly says to start
the slice, pick up **CS-1** — the additive nullable `integration_sharing_scope` column (+CHECK) + the
temporary `ENABLE_CONNECTION_SHARING` guard + the pure scope helpers (tested in isolation), `db:push`
only with explicit approval. Do not start CS-3/CS-4 (gate + execution) until CS-1/CS-2 land. No push,
no migration, no `db:push`, no AI/MCP changes, no Disconnect changes until then.

## Build now or defer?

**Decision locked now (§0); build deferred until Marcus says go.** The feature needs a migration +
changes to the run/edit gate and the execution resolver (both sensitive, both shipped). The model is
no longer in question — only the go-ahead to implement is pending. The smallest first step (CS-1) is a
single additive nullable column behind a temporary guard — low risk, reversible — but still gated on
explicit start + migration approval per the standing push/migrate policy.
