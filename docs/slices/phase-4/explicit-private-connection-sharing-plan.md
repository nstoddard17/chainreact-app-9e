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
   override path) — sharing supplies that owner from the shared row. **Refined by the §14 audit:** when
   **2+** members share the same provider this must resolve to a **node-bound specific connector**, never
   by `(account, provider)` alone (which would silently pick the earliest-connected row) — see §14.3–14.5.
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
4. **CS-4 (execution resolution).** Resolve shared personal providers to a **specific connector user
   id** via the existing `effectiveCredentialOwner` → context → pin seam — **never by `(account,
   provider)` alone** (§14.3 silent-wrong-identity risk). Per the §14 audit this **splits**:
   **CS-4a** = node-level connector binding (storage + safe `{userId, displayName, role}` builder picker
   DTO) for the 2+-sharer case; **CS-4b** = resolver precedence (accepted grant → node binding →
   single-sharer → creator) + the **ambiguity-aware gate** + parity tests. Behind the flag. Heaviest
   correctness surface.
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
  the connector**, never the author/runner. *Residual now RESOLVED by the §14 audit:* if multiple members
  share the same provider, the node must bind a **specific connector user id** (new CS-4 binding), and an
  unbound 2+-sharer case **fails closed** to creator-only — never an arbitrary/earliest-row pick. See
  §14.3–14.5.
- **OQ-4 — Unshare effect on dependent workflows.** **DECIDED: revert to creator-only; do NOT
  auto-disable.** Non-creators fall back to the existing private-credential blocked state + Duplicate
  CTA. No silent auto-resume. Surface a one-time notice to affected workflow owners.
- **OQ-5 — Interaction with the shipped per-node system.** **DECIDED: keep separate.** *Residual now
  RESOLVED by the §14 audit:* precedence is **accepted node-credential grant (B) → node connector
  binding (A) → single-sharer → creator**, implemented by extending the existing
  `effectiveCredentialOwner` seam (no new precedence machine). See §14.4 + §14.5; cover with a
  precedence test in CS-4b.
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

---

## 14. CS-4 pre-implementation audit — shared-connection execution binding (2026-06-12)

**Audit only. No source/test/migration/UI changed; this is docs-only findings.** Resolves the
"unverified until CS-4 design" residuals on OQ-3/OQ-5 and the CS-4 slice. Every claim below ties to a
file read for this audit.

### 14.1 Files inspected
[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) (node shape) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`getActiveForExecution`,
`listActiveConnectedUserIdsServiceRole`, ownership model) ·
[supabase/migrations/20260505000002_integrations.sql](../../../supabase/migrations/20260505000002_integrations.sql)
(base schema — note `account_id`/`connected_by_user_id` were added by the later 22-x account cutover;
the repo doc-comment is authoritative for the current columns) ·
[services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (pin + no-fallback) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts)
(ALS context) · [services/execution/engine.ts](../../../services/execution/engine.ts) (per-node owner
set, ~543-551) · [services/teamCredentials/nodeCredentialOwners.ts](../../../services/teamCredentials/nodeCredentialOwners.ts)
(`effectiveCredentialOwner`) · [repositories/workflowNodeCredentials.ts](../../../repositories/workflowNodeCredentials.ts)
(per-node grant table) · [services/teamCredentials/credentialOwnerMetadata.ts](../../../services/teamCredentials/credentialOwnerMetadata.ts)
(safe display label + eligible targets) · [services/ai/tools/workflowContext.ts](../../../services/ai/tools/workflowContext.ts)
(availability-by-effective-owner precedent).

### 14.2 Current execution binding model (verified)
**A workflow node carries NO connection identity.** `WorkflowNodeSchema` stores `id`, `kind`,
`provider`, `type`, `config` (opaque), `position`, `displayName` — **no integration id, no
`providerAccountId`, no credential-owner field** ([workflowDefinition.ts:28-54](../../../contracts/workflowDefinition.ts)).
A node names a **provider string only**.

The integration row is resolved entirely **at execution time** by *user*, not by any node-stored ref:

1. The engine computes a per-node **effective owner** = `effectiveCredentialOwner(provider, nodeId,
   creatorUserId, acceptedOwners)` = accepted per-node owner (flag ON) **else the workflow creator**,
   personal providers only ([engine.ts:543-551](../../../services/execution/engine.ts),
   [nodeCredentialOwners.ts:61-71](../../../services/teamCredentials/nodeCredentialOwners.ts)).
2. It wraps the handler in `runWithCredentialResolutionContext({ createdByUserId: effectiveOwner })`.
3. Inside, for **personal** providers, `refreshAndRetry` pins the lookup to
   `connected_by_user_id = effectiveOwner` ([refreshAndRetry.ts:166-170](../../../services/oauth/refreshAndRetry.ts)).
4. `getActiveForExecution(accountId, provider, providerAccountId=null, { connectedByUserId })` filters
   exact on the pin; with the pin present it returns that user's earliest active row; **a missing
   pinned row throws "owner has no active <provider> connection" — there is NO silent fallback to a
   co-member** ([integrations.ts:219-250](../../../repositories/integrations.ts),
   [refreshAndRetry.ts:179-193](../../../services/oauth/refreshAndRetry.ts)).

So **binding today is by USER (`connected_by_user_id`), not by row id and not by `providerAccountId`**.
`providerAccountId` is `null` on the engine path (it disambiguates multi-workspace rows for the *same*
user, e.g. two Slack teams; it is not a cross-member selector). The integrations active-unique index is
`(account_id, provider, provider_account_id) WHERE disconnected_at IS NULL` — so **two different members
can each have an active row for the same provider** (Alice's Gmail + Bob's Gmail are distinct rows,
distinct `connected_by_user_id`).

**Answers to Q1/Q2:** (Q1) a node stores **only provider/type** — not integration id, not
`providerAccountId`, and it relies on **creator-pinning** (or an accepted node-owner) resolved at run
time. (Q2) `workflow_node_credentials` binds `(workflow, node, provider) → credential_owner_user_id`
(**a USER**, consent-gated `pending→accepted`, ≤1 live grant/node) and feeds resolution through the SAME
`effectiveCredentialOwner` → context → pin seam. That seam can bind a shared connection cleanly **because
it already binds by user id** — which is exactly what a shared connector is. **Node-level binding IS
required for row-level sharing to be safe whenever the account has >1 sharer of the same provider** (see
14.3).

### 14.3 Exact risk with multiple shared connectors
Provider-level "Gmail is shared" is **not** enough — confirmed. The resolver must pin to a **user**. If
CS-4 naively drops the creator-pin for a shared provider and lets `getActiveForExecution` run with **no
`connectedByUserId`**, then when Alice **and** Bob have both shared Gmail, the query matches two active
rows and the **earliest-connected row wins** (`created_at ASC … limit(1)`,
[integrations.ts:240-243](../../../repositories/integrations.ts)). That is deterministic but
**product-wrong**: the run silently executes as "whoever connected first," not the intended connector —
a **silent wrong-identity / cross-member impersonation** outcome, the exact class the personal/account
model exists to prevent. **Therefore CS-4 must never resolve a shared personal provider by
`(account, provider)` alone.** It must resolve to a **specific connector user id**, and when the choice
is ambiguous it must **fail closed**, not pick.

### 14.4 Recommended binding model
**Bind at the node level to a CONNECTOR USER ID, reusing the existing `effectiveCredentialOwner` →
context → pin seam.** Do not bind by integration **row id** — a disconnect+reconnect mints a *new* row
id (upsertActive inserts a fresh row, preserving `connected_by_user_id`), so a row-id binding would break
on reconnect while a **user-id binding survives** it. This matches every existing pin in the codebase.

Resolution precedence for a personal-provider node (CS-4):

1. **Accepted `workflow_node_credentials` grant** (Option B) — explicit, consent-gated → **wins**
   (answers Q4; this is just extending today's `effectiveCredentialOwner`, no new precedence machine).
2. Else **the node's shared-connection connector binding** (the new CS-4 field, see 14.5) if present.
3. Else, if **exactly one** account member has `shared_with_account` for that provider → **that
   connector** (the unambiguous case needs no node binding).
4. Else (provider shared by **2+** members and no node binding) → **ambiguous → not team-runnable**;
   fall back to creator-only (the run/edit gate blocks non-creators; matches OQ-4's revert posture).
5. Else (creator) → today's behavior.

**This means CS-3's gate must be ambiguity-aware:** "team-runnable" requires every private provider to
be not just shared but **unambiguously resolvable** (single sharer, or an explicit node binding, or an
accepted Option-B grant) — the plan's §4.1 gate wording ("every private-provider node is account-class
or a shared personal provider") is **necessary but not sufficient** and must add the resolvability test.

### 14.5 Minimum implementation impact (answers Q6)
- **CS-1 / CS-2 stand as planned** — the `integration_sharing_scope` column + connector-only toggle are
  unchanged by this audit.
- **CS-3 (gate)** grows slightly: fold in the **ambiguity test** (14.4 step 4), not just "is shared."
- **CS-4 (execution)** needs a **node-level connector binding** when >1 member shares a provider. This is
  the new finding versus the plan's original CS-4 sketch (which assumed "resolve to the connector"
  singular). Two ways to store it:
  - **(B-reuse)** Write the chosen connector into `workflow_node_credentials` as an `accepted` grant.
    *Cons:* its semantics are **requester-pull + target-consent**; a share is **connector-push, already
    consented**, so we'd be minting auto-accepted grants and conflating two models §0.3 says to keep
    separate. Also its provider guard + ≤1-live-grant index would need re-reading. **Not recommended as-is.**
  - **(small row-reference — recommended)** A minimal per-node `connector_user_id` binding (either a
    narrow new side table `workflow_node_shared_connection` keyed `(workflow_id, node_id)`, or — only if
    schema review approves — a single opaque field threaded through node config write). It records **just
    a user id**, set when a builder picks a connector for an ambiguous shared provider; resolution reads
    it at 14.4 step 2. Smaller surface than the consent machine, and it composes with B via the
    precedence in 14.4. **Decide the table-vs-field shape in CS-4 design; lean table** (keeps node config
    free of identity and keeps it server-authoritative / RLS-gated like the other side tables).
- Net: **CS-1 → CS-2 → CS-3 → CS-4 ordering still holds.** CS-4 splits into **CS-4a (node connector
  binding: storage + safe builder picker DTO)** and **CS-4b (resolver precedence + ambiguity gate +
  parity tests)**.

### 14.6 UX implication (answers Q5)
The safe display primitive **already exists**: members are surfaced by **`displayName` only** (never
email / `provider_account_id`) via [credentialOwnerMetadata.ts](../../../services/teamCredentials/credentialOwnerMetadata.ts)
(`ownerDisplayName`) and `listEligibleReassignmentTargets` (returns `{ userId, displayName, role }`),
backed by `listActiveConnectedUserIdsServiceRole` which selects **only `connected_by_user_id`**
([integrations.ts:334-355](../../../repositories/integrations.ts)) and is owner/admin/creator-gated.
A teammate picks **"Alice" vs "Bob"** (member display names), **not** "alice@gmail.com" — so the picker
leaks no email/provider account id. **Apps DTO stays identity-free** (boolean `sharedWithAccount`); the
**builder option DTO** for an ambiguous shared provider exposes only the same safe `{ userId, displayName,
role }` shape the eligible-targets endpoint already returns. No new label primitive is needed; CS-4a
reuses it.

### 14.7 Does the plan need updating?
**Yes — two substantive corrections, both folded in above:** (1) CS-3's gate must be **resolvability/
ambiguity-aware**, not just "is shared"; (2) CS-4 must add a **node-level connector binding** (recommended:
a small per-node `connector_user_id` reference, **not** a reuse of the consent-gated per-node table) and
splits into CS-4a/CS-4b. OQ-3 and OQ-5 residuals are now **resolved** by 14.3/14.4. CS-1/CS-2 are
unaffected. **No implementation authorized — CS-4 design is documented, not built.**

---

## 15. CS-4a design — node connector binding (storage + service model) — 2026-06-12

**Type: Planning / design only. No source, migrations, tests, UI, execution, or run/edit
behavior changed in this section. Nothing pushed. No migration created.** Decides the exact
storage + service model so CS-4a implementation is mechanical. Locks the answers to the seven
CS-4a questions.

**Arc shipped so far (verified by commit):** CS-1 `7dd78d1a4` (column + flag + pure helpers) →
CS-2 `4b79788c4` (connector-push toggle service/route) → CS-3a `5479edb02` (ambiguity-aware
eligibility computation, **not wired**). CS-4a is the storage layer the eligibility result needs to
become *resolvable* for the 2+-sharer case.

**Source of truth (every file read for this design):**
[supabase/migrations/20260606000000_workflow_node_credentials.sql](../../../supabase/migrations/20260606000000_workflow_node_credentials.sql)
(the side-table shape CS-4a parallels — FKs, partial-unique, RLS, GRANT) ·
[repositories/workflowNodeCredentials.ts](../../../repositories/workflowNodeCredentials.ts)
(consent-grant repo CS-4a deliberately does NOT reuse) ·
[services/teamCredentials/nodeCredentialOwners.ts](../../../services/teamCredentials/nodeCredentialOwners.ts)
(`effectiveCredentialOwner` — the resolver seam CS-4b extends) ·
[services/teamCredentials/credentialOwnerMetadata.ts](../../../services/teamCredentials/credentialOwnerMetadata.ts)
(`listEligibleReassignmentTargets` → `{userId, displayName, role}` — the safe picker shape to reuse) ·
[app/api/workflows/[id]/nodes/[nodeId]/credential-owner/eligible-targets/route.ts](../../../app/api/workflows/[id]/nodes/[nodeId]/credential-owner/eligible-targets/route.ts)
(the `{ members }` DTO + owner/admin/creator gate) ·
[app/api/workflows/[id]/nodes/[nodeId]/credential-owner/_shared.ts](../../../app/api/workflows/[id]/nodes/[nodeId]/credential-owner/_shared.ts)
(`resolveCaller` — membership-gated 404-no-leak auth seam) ·
[services/accounts/membership.ts](../../../services/accounts/membership.ts)
(`listMembers` → display name via the `get_account_member_identities` SECURITY DEFINER RPC) ·
[repositories/integrations.ts](../../../repositories/integrations.ts)
(`listSharedConnectorUserIdsServiceRole` from CS-3a — the shared-set source) ·
[core/integrations/sharingEligibility.ts](../../../core/integrations/sharingEligibility.ts) (CS-3a status model).

### 15.1 Q1 — Storage: **new small side table `workflow_node_connector_bindings`** (recommended)
Rejected alternatives, with reasons grounded in the read files:
- **Extend `workflow_node_credentials`** — its semantics are **consent-grant**: `status pending →
  accepted`, a partial-unique `one_live_per_node`, `requested_by_user_id`, and a consent inbox
  ([repositories/workflowNodeCredentials.ts](../../../repositories/workflowNodeCredentials.ts) +
  the CS-1…CS-8 consent routes). A connection **share** is *connector-push, already-consented* — there
  is no target to ask. Reusing it means minting **auto-`accepted`** rows and overloading a state
  machine the locked model (§0.3) says to keep **separate**. Rejected.
- **Store in `draftDefinition` node `config`** — the definition is **user- AND AI-editable** and
  republished; the AI-patch path already strips identity-bearing fields it must not own
  (`materializeAiPatchNodeIds` strips `displayName`, [contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts)
  L42-53). Putting a `connector_user_id` in config invites an AI patch or an import/export to carry or
  rewrite an identity binding, and it would not be RLS-gated. Rejected — identity binding must be
  **server-authoritative**, like `workflow_node_credentials`.
- **New side table (recommended)** — parallels the proven `workflow_node_credentials` shape but with
  **direct-binding** (no consent machine), RLS-gated, service-role-written. Smallest surface that keeps
  the two concepts separate.

### 15.2 Q2 — Binding key + columns (reconnect-stable)
Keyed `(workflow_id, node_id)`; stores `connector_user_id` (the **stable** key — `connected_by_user_id`
survives reconnect, whereas the integration **row id** changes on a fresh connect, per
[repositories/integrations.ts](../../../repositories/integrations.ts) `upsertActive`). `provider` is
stored for validation/precedence (mirrors `workflow_node_credentials.provider`). **No `account_id`
column** — derive via the `workflow_id → workflows` FK exactly as `workflow_node_credentials` does (one
fewer denormalized field to keep in sync; the RLS join already needs `workflows`).

```sql
CREATE TABLE public.workflow_node_connector_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  provider text NOT NULL,                          -- personal-only; enforced in code, not SQL
  connector_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- who set it (provenance)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- One binding per node (full unique — no status, so no partial predicate needed).
CREATE UNIQUE INDEX workflow_node_connector_bindings_one_per_node
  ON public.workflow_node_connector_bindings (workflow_id, node_id);
CREATE INDEX workflow_node_connector_bindings_workflow_idx
  ON public.workflow_node_connector_bindings (workflow_id);            -- per-workflow read
CREATE INDEX workflow_node_connector_bindings_connector_idx
  ON public.workflow_node_connector_bindings (connector_user_id);      -- offboarding cleanup
CREATE TRIGGER workflow_node_connector_bindings_set_updated_at
  BEFORE UPDATE ON public.workflow_node_connector_bindings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```
**No `status` column** — a binding is a direct pointer, not a consent flow. Its *validity* is recomputed
at resolve time against the live shared set (§15.6), never trusted from storage alone.

### 15.3 Q3 — Authorization to set a binding
A binding may point ONLY to a `connector_user_id` that, **at set-time**, is in
`listSharedConnectorUserIdsServiceRole(workflow.accountId, provider)` — i.e. has an **active**,
`integration_sharing_scope = 'shared_with_account'` personal row for that provider in the workflow's
account (CS-3a repo). This single check makes "**no silent share of an unshared identity**" *structural*:
you cannot bind to a connector who has not themselves shared (rejected typed reason
`connector_not_shared`).
- **Who may set:** a caller with **edit rights on the workflow** (today: creator, or owner/admin per
  existing rules — CS-4a does NOT widen edit rights; CS-3b is where non-creators gain them, and only
  *after* a binding makes the workflow resolvable). The connector may bind their own shared connection;
  owner/admin may pick among shared connectors — but never an unshared one (the shared-set check blocks
  it). Reuse the `resolveCaller` membership gate
  ([credential-owner/_shared.ts](../../../app/api/workflows/[id]/nodes/[nodeId]/credential-owner/_shared.ts)).
- **Non-member / missing workflow / unknown node** → the same **404 no-leak** the existing credential-
  owner routes already return.
- Account/service providers and native nodes → `not_applicable` (only personal providers are bindable),
  mirroring `ACCOUNT_PROVIDER_NOT_NODE_OWNABLE`.

### 15.4 Q4 — No-leak display model (reuse, don't invent)
The safe picker already exists. CS-4a adds **one analogous read**: "shared connectors for this provider"
= map `listSharedConnectorUserIdsServiceRole(account, provider)` → member `displayName` via
[listMembers](../../../services/accounts/membership.ts) (which sources identity from the
`get_account_member_identities` **SECURITY DEFINER** RPC — display name only, never the OAuth account
email/label). The picker DTO is the **exact existing shape**
`{ userId, displayName, role }` returned by
[listEligibleReassignmentTargets](../../../services/teamCredentials/credentialOwnerMetadata.ts) /
[eligible-targets route](../../../app/api/workflows/[id]/nodes/[nodeId]/credential-owner/eligible-targets/route.ts).
A teammate picks **"Alice (Owner)"**, not `alice@gmail.com`.
- **No new label primitive needed.** `provider_account_id`, email, token, scope, scope-count, and account
  metadata never appear — same fence the Apps DTO and eligible-targets already hold.
- **Apps DTO stays identity-free** (boolean `sharedWithAccount` only; CS-5).
- The stored binding's *human-facing read* (builder badge) shows the bound connector's `displayName`
  only; the `userId` is an opaque uuid carried in the set request (the eligible-targets DTO already
  exposes `userId`, so this is consistent, not a new exposure).

### 15.5 Q5 — Resolver precedence (CS-4b wires this; documented here)
Extend [`effectiveCredentialOwner`](../../../services/teamCredentials/nodeCredentialOwners.ts) so a
personal-provider node resolves its credential owner in this order:
1. **accepted `workflow_node_credentials` grant** (Option B, consent) — **wins** (unchanged today).
2. else **node connector binding** (CS-4a) — *only if the bound connector is still in the live shared
   set* (§15.6 validity recheck).
3. else **single-sharer** — exactly one shared connector for the provider in the account → that connector.
4. else **creator pin** (today's 22B default).
5. **2+ shared, no valid binding → fail closed** (no owner ⇒ the run/edit gate blocks the non-creator and
   the engine never silently picks an arbitrary connector — the §14.3 risk).

### 15.6 Q6 — Lifecycle (fail-closed, never silently-someone-else)
Validity is **computed at resolve time**, not trusted from the row:
- **Connector unshares** (`integration_sharing_scope → NULL`, CS-2): the binding row persists but the
  connector drops out of `listSharedConnectorUserIdsServiceRole` → binding **invalid** → precedence falls
  through to single-sharer/creator → if now ambiguous/unshared, the non-creator is blocked (CS-3b gate).
- **Connector disconnects** (`disconnected_at` set): excluded from the shared set by the CS-3a query's
  `disconnected_at IS NULL` filter → binding invalid → same fail-closed.
- **Connector leaves the account:** offboarding already soft-disconnects their personal rows
  ([softDisconnectPersonalForMember](../../../repositories/integrations.ts), 22C) ⇒ binding invalid at
  resolve. **Plus** a proactive hygiene delete — `deleteBindingsForMemberInAccountServiceRole(accountId,
  connectorUserId)` from the member-removal/leave path, mirroring
  [`revokeLiveForMemberServiceRole`](../../../repositories/workflowNodeCredentials.ts). (Resolve-time
  recheck is the correctness guarantee; the delete is cleanup.)
- A binding **never** causes a different connector to execute: the resolve-time shared-set recheck is the
  invariant. `ON DELETE CASCADE` on `connector_user_id` covers hard user deletion.

### 15.7 Q7 — Migration / RLS / GRANT (outline — NOT created in this slice)
A new table ⇒ a migration is required for CS-4a **implementation**. This design does **not** author it
(per the "design first" instruction). When authored it must — per
[migration RLS lint](../../../scripts/check-migration-rls.mjs) + database-security rules — include, in
the same file, RLS + a policy + explicit GRANTs (mirror `workflow_node_credentials`):
```sql
ALTER TABLE public.workflow_node_connector_bindings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.workflow_node_connector_bindings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_node_connector_bindings TO service_role;
CREATE POLICY workflow_node_connector_bindings_select_account_member
  ON public.workflow_node_connector_bindings FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.workflows w
    JOIN public.account_memberships am ON am.account_id = w.account_id
    JOIN public.accounts a ON a.id = w.account_id
    WHERE w.id = workflow_node_connector_bindings.workflow_id
      AND am.user_id = auth.uid() AND a.deletion_status = 'active'));
```
- **No client write policy** — every write is service-role (the binding service authorizes). Default-deny
  prevents a member self-binding a node by writing the table directly (the same fence
  `workflow_node_credentials` uses).
- **No SQL provider list** — personal-only is enforced in code (the single classifier), never duplicated
  in SQL (same rule the node-credentials migration states).

### 15.8 Does CS-4a implementation need a migration? **Yes** — but not now
CS-4a ships behind `ENABLE_CONNECTION_SHARING` (already exists, default OFF). The table can be created +
`db:push`ed when CS-4a implementation is explicitly authorized; this design slice creates nothing.

### 15.9 CS-4a / CS-4b slice split (locked)
- **CS-4a (implementation, next, gated):** the migration above + a repo
  (`repositories/workflowNodeConnectorBindings.ts`: get-for-node / set / clear / list-for-workflow /
  delete-for-member, all service-role) + a binding service (set/clear authz = editor + target-in-shared-
  set; typed no-leak reasons) + the picker read (shared connectors → `{userId, displayName, role}`) +
  route(s) under `app/api/workflows/[id]/nodes/[nodeId]/connector-binding/` + tests. **Behavior-inert:**
  the binding is **stored and displayed but NOT yet consulted** by the resolver or the run/edit gate.
- **CS-4b (after CS-4a):** wire §15.5 precedence into `effectiveCredentialOwner` (resolver) **and** the
  §14.4 ambiguity-aware gate into `assertWorkflowRunEditAllowed` (= **CS-3b**), behind the flag, **in
  lockstep** + execution parity tests + the offboarding binding-cleanup hook.

**Ordering invariant (Marcus's constraint):** **CS-3b (let non-creators run/edit) must NOT ship ahead of
CS-4b (execution resolves to the bound connector).** They land together in CS-4b so run/edit permission
never gets ahead of execution binding — a workflow only becomes team-runnable at the exact moment its
private providers resolve to a specific connector.

### 15.10 Tests CS-4a implementation must prove (by area)
- **Repo/migration:** table shape + one-per-node unique + RLS membership-gated SELECT + service-role-only
  writes + GRANTs; offboarding delete scoped to `(accountId, connectorUserId)`.
- **Binding service authz:** editor binds to a shared connector ✓; binding to a **non-shared** connector
  → `connector_not_shared` (the no-silent-share fence); non-member → 404 no-leak; account/native →
  `not_applicable`; cross-account workflow/node → 404.
- **Picker no-leak:** options are `{userId, displayName, role}` only — no email/`provider_account_id`/
  token/scope/metadata; non-eligible viewer gated.
- **Inertness:** with the binding stored, the CS-3a eligibility result and execution are **unchanged**
  until CS-4b (assert the resolver/gate still ignore bindings in CS-4a).

### 15.11 Open questions (recommendation each)
- **OQ-4a-1 — does an *unshared-then-rebound* node keep a stale binding row?** *Rec:* yes, leave it
  inert (resolve-time recheck makes it harmless); CS-4b's offboarding hook + an optional "clear invalid
  bindings" sweep handle hygiene. Don't add a trigger.
- **OQ-4a-2 — multiple nodes, same provider, different bound connectors in one workflow?** Allowed (the
  key is per-node). *Rec:* permit it; each node resolves independently. Mark **unverified** against the
  execution engine's per-node owner context until CS-4b parity tests (the 22B context is already per-node,
  [engine.ts:543-551](../../../services/execution/engine.ts), so this is expected to hold).
- **OQ-4a-3 — should setting a binding require the workflow to currently *use* that provider on that
  node?** *Rec:* yes — validate `node.provider === provider` against the draft definition at set-time
  (reuse the `node_not_found`/`not_applicable` checks from `listEligibleReassignmentTargets`).
