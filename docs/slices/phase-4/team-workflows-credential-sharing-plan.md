# 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-1 — Explicit Credential Sharing + Creator Reassignment Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, execution,
or credential-sharing behavior changes** in this slice. Nothing pushed.
**Date:** 2026-06-05
**Branch:** `builder-ui-v1-audit-1`
**Arc:** 22A–22D credential consistency + TW-1–TW-5 team builder (all shipped) →
**this plan** → CS-1…CS-6 implementation slices (future).

**Source of truth (verified current state):**
[core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts) (`personal | account` classifier) ·
[services/oauth/credentialResolutionContext.ts](../../../services/oauth/credentialResolutionContext.ts) (AsyncLocalStorage pin) ·
[services/oauth/refreshAndRetry.ts](../../../services/oauth/refreshAndRetry.ts) (lines 155-220, creator-pin + no co-member fallback) ·
[services/execution/engine.ts](../../../services/execution/engine.ts) (lines 504-517, context set once per handler) ·
[repositories/integrations.ts](../../../repositories/integrations.ts) (`getActiveForExecution` 219-250, `softDisconnectPersonalForMember` 345-394) ·
[contracts/workflowDefinition.ts](../../../contracts/workflowDefinition.ts) (`WorkflowNode` 28-54 — no credential field) ·
[services/options/credentialPolicy.ts](../../../services/options/credentialPolicy.ts) (`decideOptionsCredential`) ·
[app/api/options/[source]/route.ts](../../../app/api/options/[source]/route.ts) (`NOT_WORKFLOW_OWNER` gate) ·
[services/ai/tools/workflowContext.ts](../../../services/ai/tools/workflowContext.ts) (`getWorkflowIntegrationAvailabilityForAI`) ·
[services/ai/tools/integrations.ts](../../../services/ai/tools/integrations.ts) (`ownerControlled` redaction) ·
[services/accounts/membership.ts](../../../services/accounts/membership.ts) (`getMemberWorkflowImpact`, `removeMember`) ·
[services/accounts/offboardingImpact.ts](../../../services/accounts/offboardingImpact.ts) ·
[services/accounts/transferOwnership.ts](../../../services/accounts/transferOwnership.ts) (does NOT touch creds/`created_by_user_id`) ·
[docs/slices/phase-4/team/team-credential-access-closeout.md](./team/team-credential-access-closeout.md) ·
[docs/slices/phase-4/phase-4-readiness-closeout.md](./phase-4-readiness-closeout.md) (`b3e55f3b2`).

> **Headline:** Today every personal-provider step in a Team workflow runs under
> **one** user — `workflow.created_by_user_id` — pinned by a single seam
> (`runWithCredentialResolutionContext({ createdByUserId }, handler)` set **once
> per handler** in the engine; read by `refreshAndRetry`). There is **no per-node
> credential owner anywhere** (not in the node schema, not in execution, options,
> AI, or offboarding). When the creator leaves, their personal Team credentials
> are soft-disconnected and those steps fail with a clear "owner has no active
> connection" error — **no one else can take them over.** Recommendation: introduce
> **explicit, consent-gated, per-node credential reassignment** — a personal-provider
> node may optionally carry an **accepted** `credentialOwnerUserId` that **overrides**
> the creator pin; absent that, behavior is byte-for-byte today's. Store the override
> + consent in a **dedicated `workflow_node_credentials` side table** (not in the
> definition JSONB), resolve execution as **node-owner → workflow-creator → clear
> error (never a silent co-member fallback)**, and require the target member to
> **already have an active connection and to consent**. **Do NOT** introduce broad
> team-wide sharing of personal credentials, and **do NOT** rewrite
> `created_by_user_id` (it stays provenance).

---

## 1. Context

Phase 4 readiness is closed at `b3e55f3b2`. Team workflows are **safe** under the
22A–22D + TW-1…TW-5 policy: account/service providers are account-shared, personal
providers are creator-pinned, non-creators cannot fetch/see a creator's personal
options or labels, removed members' personal Team credentials are soft-disconnected,
and the builder shows owner-gated states + credential-ownership badges. The
`team-credential-access-closeout.md` itself names the **only** remaining gap as the
strongest argument to build this next: *a departed creator's personal-provider nodes
cannot be reconnected by anyone else — such workflows are effectively paused on those
steps.*

This plan designs the next collaboration layer — **explicit per-node credential
ownership / reassignment** + **creator-leave remediation** — without changing any
behavior yet.

---

## 2. Current credential policy (verified — the locked 22A–22D + TW model)

| Slice | Commit | What it locked |
|---|---|---|
| 22A | `dc1171922` | Provider classifier `credentialSharing: "personal" \| "account"`; account = slack/notion/stripe/shopify/hubspot/mailchimp; **all else personal**, unknown → personal (fail-safe). [core/integrations/credentialSharing.ts](../../../core/integrations/credentialSharing.ts). |
| 22B | `244e0c4d9` | Execution provenance pin. `refreshAndRetry` derives `connectedByUserId = isPersonalCredentialProvider(p) ? ctx.createdByUserId : null` and calls `getActiveForExecution(accountId, p, providerAccountId, { connectedByUserId })`. Missing → clear "workflow owner has no active `<p>` connection" error; **no co-member fallback**. Context set in the engine via `runWithCredentialResolutionContext`. |
| 22C | `13e325dcb` | Offboarding soft-disconnect. `softDisconnectPersonalForMember({ accountId, connectedByUserId })` sets `disconnected_at` on the leaver's **personal** rows only; idempotent; runs in `removeMember` + `leaveAccount` before membership deletion. |
| 22D-1 | `9abab5385` | Options creator-context plumbing — thread `workflowId` → resolve `created_by_user_id` + `accountId` (best-effort, RLS-scoped, never throws). |
| 22D-2 | `57116df28` | Options sharing policy `decideOptionsCredential` → `legacy \| account \| personal-creator \| not-owner`. Non-creator personal → `NOT_WORKFLOW_OWNER` (**no lookup, no resolver call, no label fetch**); creator-unconnected → `OWNER_MUST_CONNECT`. AI options tool mirrors. |
| 22D-3 | `a209e3996` | AI redaction. `getConnectedIntegrationsForAI` + `getWorkflowIntegrationAvailabilityForAI`: account shared; creator's personal full to creator, **`ownerControlled` (label/scope redacted) to non-creator**; co-member personal **never enumerated**; creator-missing → `ownerMustConnect`. |

Team builder arc (TW-1 `7f3307396` route-auth, TW-2 `fa322c9ba` / TW-2B `9bf48c00b`,
TW-3 `8bb57d76f` owner-gated UX, TW-3b `41a4ec97a` badges/banner, TW-4 `9c79856ed`
agent scoping, TW-5 `af46596cd` offboarding warning) made all members able to
create/edit/run/activate, gated personal-provider config to the creator, and added
the **display-only** `CredentialOwnershipBadge` ("Runs under `<creator>`'s connection"
/ "Shared team connection").

**One resolution seam, set at workflow-creator granularity.** The engine wraps each
handler call **once** ([engine.ts:504-517](../../../services/execution/engine.ts)):
`runWithCredentialResolutionContext({ createdByUserId: workflow.createdByUserId }, () => handler(...))`.
This is the entire lever — every personal-provider node in the workflow resolves
through the same single creator id.

---

## 3. Current limitation (verified)

- **No per-node credential owner exists** — confirmed absent in
  [`WorkflowNode`](../../../contracts/workflowDefinition.ts) (`{ id, kind, provider,
  type, config, position, displayName? }`), in the integrations table, in execution,
  options, AI, and offboarding. Node config lives in `workflows.draft_definition`
  JSONB (+ immutable `workflow_revisions.definition` on publish); there is **no node
  table**.
- **Personal-provider steps are tied to `workflow.created_by_user_id`** through the
  single engine seam.
- **Creator-leave breaks silently-to-the-eye:** `softDisconnectPersonalForMember`
  disconnects the creator's personal rows; the next run's `getActiveForExecution`
  returns `null` and the handler throws the connect-required error. The workflow
  stays `active`; **nobody can take over** the personal step.
- **`getMemberWorkflowImpact`** ([offboardingImpact.ts:32-49](../../../services/accounts/offboardingImpact.ts))
  only counts workflows **created by** the leaving member that contain ≥1
  personal-provider node — it has **no concept** of a member who owns a credential
  used by a workflow they did not create.
- **`transferOwnership`** explicitly does **not** touch workflows or `created_by_user_id`.
- **Activation preconditions** ([services/triggers/preconditions.ts](../../../services/triggers/preconditions.ts))
  check provider connectivity, **not** creator/owner availability.

---

## 4. Product definition

**"Credential sharing" in V2 = explicit, consent-gated, per-node reassignment of a
personal-provider step to a *specific* consenting member's existing connection.** It
is deliberately **not**:
- broad team-wide pooling of personal credentials (no "everyone can use anyone's Gmail"),
- a credential-export or token-visibility feature (no raw tokens, labels, or emails ever cross members),
- a rewrite of workflow provenance (`created_by_user_id` is untouched).

Account/service providers (Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp) are
**already** account-shared and are **out of scope** — they ignore any node-level owner.

The feature exists to answer two real needs:
1. **Collaboration:** let a Team run a personal-provider step under a chosen member's
   connection (e.g. "this step sends from Dana's Gmail"), with Dana's explicit consent.
2. **Creator-leave remediation:** when the creator leaves, an owner/admin can move
   their personal-provider steps to another consenting member instead of the workflow
   silently dying on those nodes.

---

## 5. Recommended launch model

**Per-node credential reassignment, consent-gated, default = today.**

- A **personal-provider** node may carry an **effective credential owner**
  (`credentialOwnerUserId`) that **overrides** the workflow-creator pin **only when an
  accepted consent grant exists**.
- **Backward-compatible default:** if no accepted override exists for a node, the
  personal provider resolves to `workflow.created_by_user_id` **exactly as today** —
  zero behavior change, no backfill.
- **Account/service providers ignore node owners** and stay account-shared.
- **Reassignment preconditions:** the target member (a) is an active account member
  and (b) **already has an active connection** for that provider in the workflow's
  account. No connection → no reassignment.
- **Consent is mandatory:** owner/admin (or the workflow creator) may **request** a
  reassignment, but it is **inert until the target accepts**. The override only takes
  effect — in execution, options, and AI — once `status = accepted`.
- **No silent co-member fallback, ever** — preserves the 22B invariant. Resolution
  chain is deterministic: **accepted node owner → workflow creator → clear, actionable
  error.**
- **`created_by_user_id` stays provenance** and is never rewritten by this feature.
- **Scope by account type:** the whole feature is a **Team/Business** concern;
  personal accounts (one member) never see it.

Per the task's "do not introduce broad sharing at launch," this ships **explicit
per-node reassignment**, not a sharing pool. A minimal **whole-workflow** fallback
("run this workflow's personal steps as member X") can ship as an early increment if
per-node UI slips (see §15), but per-node is the target.

---

## 6. Data model options

Evaluated against: **security · migration ease · builder complexity · execution
consistency · AI consistency · offboarding · future flexibility.**

| Option | Shape | Security | Migration | Builder | Execution | AI | Offboarding | Future |
|---|---|---|---|---|---|---|---|---|
| **A. Field in draftDefinition JSONB** | `WorkflowNode.credentialOwnerUserId?` | ⚠ embeds a user id in the definition; consent must live elsewhere anyway | ✅ none | ✅ simplest | ✅ node-local | ✅ | ⚠ must walk every definition; **republish bakes a stale owner into immutable revisions** | ⚠ no consent/status, no grant lifecycle |
| **B. `workflow_node_credentials` side table** (recommended) | `(workflow_id, node_id, provider, credential_owner_user_id, status, …)` | ✅ identity stays off the definition; RLS-scoped; consent = a status column | ⚠ one table + RLS + GRANTs | ⚠ join/read per node | ✅ override resolved at run/options | ✅ same flags | ✅ trivial "grants owned by leaving member" query; reassign = row update, **no republish** | ✅ natural home for status/consent/expiry |
| **C. Per-node provider-account selection + owner provenance** | node references a chosen `integration` row; owner = its `connected_by_user_id` | ⚠ surfaces co-member connections → leak risk without strict gating | ⚠ node ref + lookups | ❌ biggest builder change (per-node connection picker) | ✅ | ⚠ must still hide identity | ⚠ | ✅✅ enables multi-connection-per-provider later |
| **D. Share-grants table for personal integrations** | account/provider-level "member X shares their Gmail" pool | ❌ this **is** the broad sharing the brief forbids at launch | ⚠ | ⚠ | ⚠ pool→which one? | ⚠ | ⚠ | ✅✅ but launch-inappropriate |
| **E. Workflow-creator reassignment only** | move a workflow-level "runs-as" user (NOT `created_by_user_id`) | ✅ reuses the single 22B seam unchanged | ✅ one column | ✅ trivial | ✅✅ minimal | ✅ unchanged | ✅ simple | ❌ all-or-nothing; can't mix two members in one workflow |

**Recommendation: Option B** (`workflow_node_credentials` side table) as the override
**+ consent record**, with the node in `draft_definition` **unchanged** (no user id in
the definition — consistent with today, where the definition carries no identities and
provenance lives on the workflow row). B wins precisely on this feature's hard parts:
**consent lifecycle** (a `status` column), **reassignment without republish** (a row
update — A would re-bake a stale owner into immutable revisions), and **offboarding
queries** (a one-line "accepted grants owned by the leaving member"). Keep **Option C**
as a future enhancement for multi-connection-per-provider, **Option E** as the optional
early increment, and **reject Option D** for launch (broad sharing).

> **Node-id stability caveat (open decision §16):** B keys on `(workflow_id, node_id)`,
> so node ids must be **stable across edits/republish**. Confirm the builder never
> regenerates node ids on edit; if it can, add an orphan-grant cleanup on save.

---

## 7. Execution resolution model

Single change, at the **existing 22B seam** — move the resolution context from
workflow-creator granularity to **per-node effective-owner** granularity:

- For each node about to execute:
  1. If `isAccountCredentialProvider(node.provider)` → account-shared, **ignore any
     node owner** (unchanged).
  2. Else (personal): `effectiveOwner = acceptedNodeCredentialOwner(workflowId, node.id)
     ?? workflow.createdByUserId`.
  3. Wrap the handler in `runWithCredentialResolutionContext({ createdByUserId:
     effectiveOwner }, …)` **per node** (today it is set once per handler to the
     creator — this becomes per-node-resolved). `refreshAndRetry` is **unchanged**: it
     reads the context and pins `getActiveForExecution(accountId, provider,
     providerAccountId, { connectedByUserId: effectiveOwner })`.
- **No silent fallback:** if the accepted node owner has **no active connection** (e.g.
  they disconnected or left), the node fails with a clear *"the assigned connection for
  this step is no longer available — reassign or reconnect"* error — it does **not**
  silently fall back to the creator at runtime (the fallback to creator happens only
  when the grant is **revoked**, §11, which is an explicit state change, not a runtime
  guess).
- Rename the context field to `effectiveCredentialOwnerUserId` (or keep `createdByUserId`
  with a comment) — internal only; the seam contract is otherwise identical.
- **Pre-resolve once per run:** batch-load the workflow's accepted node-credential
  grants at run start (one query) and pass them into the node loop — no per-node DB
  round-trip beyond the integration lookup that already happens.

---

## 8. Builder / options model

- Extend `decideOptionsCredential` to take the node's **effective owner** (resolved
  from the side table) rather than implicitly the workflow creator. Outcomes are
  **the same four**, just keyed on the effective owner:
  - account/service → account-shared (any member).
  - personal **and requester == effective owner** → `personal-creator` (pinned to that owner).
  - personal **and requester != effective owner** → `not-owner` → `NOT_WORKFLOW_OWNER`,
    **no lookup, no resolver call, no label fetch** (the leak guarantee is unchanged —
    it just protects the *assigned* owner now, not only the creator).
  - effective owner has no connection → `OWNER_MUST_CONNECT`.
- Thread the **node id** into the options request alongside `workflowId` (the
  `ComboboxField` already passes `workflowId`); the route resolves the node's effective
  owner server-side from the side table (never trust a client-supplied owner id).
- The owner-of-record for a node's options is **server-resolved** — the client passes
  identity (`workflowId`, `nodeId`), the server decides whose credential applies.

---

## 9. AI / React Agent model

- The agent's information surface **does not change** — it still sees only **boolean +
  flag** availability per provider/node: `connected`, `ownerControlled`,
  `ownerMustConnect`. It **never** learns *who* owns a credential.
- `getWorkflowIntegrationAvailabilityForAI` becomes node/owner-aware: for a personal
  node with an accepted override, the requester sees `ownerControlled` (if they are not
  the assigned owner) or full availability (if they are) — **identically** to how it
  treats the creator today, with the assigned owner's **label/email/scope redacted to
  the same `null`/`0`**.
- Reassignment changes which user is pinned; the agent's surface is byte-identical.
  All existing redaction (`redactSecrets`, the allow-list view builder,
  `sanitizeAgentMessage`) is unchanged. **Hard rule:** the `credentialOwnerUserId` value
  is internal and must never reach a prompt, a tool result, or a persisted message.

---

## 10. Consent and authorization model

- **Initiate a reassignment request:** account **owner/admin** (always); the **workflow
  creator** may also propose for their own workflow (open decision §16 — recommend
  allowing creator-initiated requests, since they already configure the workflow).
- **Consent (accept/decline):** **only the target member** whose connection will be
  used. An override is **inert until `status = accepted`**.
- **Preconditions enforced at accept time and re-checked at execution:** target is an
  active account member **and** has an active (non-disconnected) connection for that
  provider in the workflow's account. Losing the connection later → the node fails with
  the reassign/reconnect error (no silent fallback).
- **Account/service providers:** no reassignment concept (always account-shared);
  requests for them are rejected as not-applicable.
- **State machine:** `none → requested(pending) → accepted | declined`;
  `accepted → revoked` (on leave/remove or manual revoke). Only `accepted` is effective.
- Writes are **service-role / RPC-only** behind owner/admin + target-consent checks
  (mirrors `requireAccountRole` + the membership-management gates); the side table's
  RLS is membership-gated SELECT.

---

## 11. Offboarding / leave / transfer interactions

- **`getMemberWorkflowImpact` evolves** to count **two** classes of breakage for the
  leaving member: (a) workflows they **created** with personal-provider nodes (today),
  **plus** (b) nodes for which they are the **accepted credential owner** (new). The
  offboarding warning copy becomes: *"N steps run under this member's connection (as
  creator or assigned owner) and will stop until reassigned or reconnected."*
- **On remove/leave:** keep the existing `softDisconnectPersonalForMember` step, **and**
  **revoke** the leaving member's accepted node-credential grants (`status = revoked`).
  After revoke, those nodes deterministically fall back to **workflow-creator**
  resolution; if the creator is also gone/disconnected, the node fails with the clear
  connect/reassign error. This keeps the single fallback chain **node-owner(accepted) →
  creator → clear error** and avoids dangling grants pointing at a departed user.
- **Transfer ownership** still does **not** rewrite `created_by_user_id` or touch
  credentials — reassignment remains the **explicit** mechanism. Document the
  interaction so users understand transferring the *account* owner does not move
  *workflow credential* pins.
- **Activation/resume precondition (recommended, open decision §16):** when activating
  or resuming, evaluate each personal node's effective owner; if it has no active
  connection, **warn** (non-blocking, consistent with TW-5) — or **block** if we decide
  activation should guarantee runnability. Recommend **warn** at launch to match
  existing non-blocking offboarding posture.

---

## 12. UI expectations

- **Account/service nodes:** unchanged — "Shared team connection" badge.
- **Personal node, no override:** unchanged — "Runs under `<creator>`'s connection"
  (creator name + provider only; never label/email).
- **Personal node, accepted override:** badge "Runs under `<assigned member>`'s
  connection" (display name only, same redaction rules), plus a **Reassign** affordance
  for owner/admin (and creator, if allowed).
- **Reassignment flow (owner/admin):** pick a target member who **already has** the
  provider connected (members without it are not selectable / shown disabled with
  "not connected"); sends a **request**; node shows **"Reassignment pending `<member>`'s
  approval."**
- **Target member's consent surface:** an inbox/notification "‹workflow› wants to run
  its `<provider>` step under your connection — Accept / Decline" (reuse the
  `notifications` table + `account_invitation`-style pattern; new `type`).
- **Creator-left state:** workflow list / builder flags "Created by a former member —
  `<provider>` step needs reassignment," with the Reassign action for owner/admin.
- **No identity leaks:** a non-owner configuring a personal node still sees the
  disabled-picker "only the assigned member can configure their `<provider>` here" — the
  TW-3 message, now keyed on the assigned owner.

---

## 13. Migration / backfill plan

- **New table `workflow_node_credentials`** (Option B). Sketch (finalized in CS-1):
  ```
  id uuid PK
  workflow_id uuid NOT NULL → workflows(id) ON DELETE CASCADE
  node_id text NOT NULL                 -- node id in draft_definition (stable)
  provider text NOT NULL                -- must be a personal provider
  credential_owner_user_id uuid NOT NULL → auth.users(id) ON DELETE CASCADE
  status text NOT NULL                  -- 'pending' | 'accepted' | 'declined' | 'revoked'
  requested_by_user_id uuid → auth.users(id) ON DELETE SET NULL
  requested_at, decided_at, created_at, updated_at timestamptz
  UNIQUE (workflow_id, node_id)         -- one effective owner per node
  ```
  - **RLS:** membership-gated SELECT (`is_account_member` of the workflow's account,
    freeze-aware via `accounts.deletion_status = 'active'`); **writes service-role /
    RPC-only**. Explicit **Data API GRANTs** (`authenticated` + `service_role`) per the
    post-Oct-2026 cutover rule.
- **No backfill.** Absence of an `accepted` row = current creator-pin behavior. The
  feature is purely additive and **off by default**; ship behind a flag
  (`ENABLE_NODE_CREDENTIAL_REASSIGNMENT`) until verified.
- **No change** to `workflows`, `integrations`, `draft_definition`, or
  `workflow_revisions` shapes — the override lives entirely in the side table.

---

## 14. Test plan (for the implementation slices)

**Resolution (CS-2):**
- Personal node with accepted override → executes under the **assigned owner's**
  connection; never the creator's.
- No override → resolves to creator (byte-for-byte today).
- Accepted owner disconnected → clear reassign/reconnect error; **no** silent fallback
  to creator at runtime.
- Account/service node → ignores any override; account-shared.
- Pre-resolve batches grants once per run (no N+1).

**Consent/authorization (CS-3):**
- Owner/admin can request; member cannot; creator-initiate per §16 decision.
- Override inert until `accepted`; `pending`/`declined`/`revoked` resolve to creator.
- Target must be a member with an active connection at accept time; otherwise rejected.
- Account/service reassignment request → rejected as not-applicable.

**Builder/options (CS-4):**
- Assigned owner sees options for their node; non-owner (incl. creator) → `NOT_WORKFLOW_OWNER`,
  **no fetch, no label leak**.
- Owner-with-no-connection → `OWNER_MUST_CONNECT`.

**AI (CS-5):**
- Availability flags reflect the assigned owner; **no** label/email/scope leak;
  `credentialOwnerUserId` never appears in prompts, tool results, or persisted messages.

**Offboarding (CS-6):**
- `getMemberWorkflowImpact` counts created-with-personal **and** owned-node nodes.
- Remove/leave revokes the member's accepted grants; nodes fall back to creator or fail
  clearly; `softDisconnectPersonalForMember` still runs.
- Transfer ownership leaves `created_by_user_id` + grants untouched.

**Security/RLS:** non-members cannot read the side table; client cannot self-assign by
passing a forged owner id (server resolves ownership).

---

## 15. Implementation slice breakdown

- **CS-1 — Schema + repo (no behavior).** `workflow_node_credentials` table, RLS,
  GRANTs, repository, contract type. Flag `ENABLE_NODE_CREDENTIAL_REASSIGNMENT` (off).
- **CS-2 — Execution resolution.** Move the engine context from per-handler-creator to
  **per-node effective owner** (`accepted owner ?? creator`); batch-load grants per run;
  preserve no-silent-fallback. `refreshAndRetry` unchanged.
- **CS-3 — Consent + reassignment service/routes.** Request / accept / decline / revoke;
  owner/admin-initiate + target-consent; precondition checks; service-role/RPC writes.
- **CS-4 — Builder/options.** Thread `nodeId`; server-resolve effective owner in
  `decideOptionsCredential`; UI badges/states (assigned owner, reassign, pending).
- **CS-5 — AI/React Agent.** Owner-aware availability flags; identity never leaked.
- **CS-6 — Offboarding evolution.** Impact counts owned nodes; warning copy; revoke
  grants + fallback on remove/leave; activation/resume precondition (warn).
- **(Optional early increment — Option E):** a whole-workflow "runs-as member X"
  fallback if per-node UI slips; supersedable by CS-2…CS-4 later.

> Ship CS-1…CS-2 behind the flag first (no UI), validate resolution + no-fallback in
> tests, then layer consent (CS-3), UI (CS-4), AI (CS-5), offboarding (CS-6).

---

## 16. Risks / open questions

- **Data model A vs B** (§6): recommend **B** (side table) for consent + no-republish +
  offboarding. Confirm before CS-1.
- **Node-id stability** (§6 caveat): B keys on `(workflow_id, node_id)`; confirm the
  builder never regenerates node ids on edit, or add orphan-grant cleanup.
- **Leaving-owner behavior** (§11): recommend **revoke grant → fall back to creator →
  clear error**. Alternative (leave the node hard-broken with a reassign prompt) is
  stricter but stops surprising "now runs as the creator" jumps — decide.
- **Creator-initiated requests** (§10): allow the workflow creator (not just owner/admin)
  to request reassignment? Recommend yes.
- **Activation precondition** (§11): **warn** (match TW-5 non-blocking) vs **block**
  activation when an effective owner has no connection — decide.
- **Multi-connection-per-provider** (Option C): a member with two connections of the
  same provider can't pick *which* at the node level under B — future enhancement.
- **Account-type gating:** confirm the feature is hidden entirely on personal accounts
  (one member, nothing to share).
- **Consent surface:** reuse `notifications` (`account_invitation`-style) for the
  accept/decline inbox, or build a dedicated requests view? Recommend reuse.
- **No broad-sharing creep:** explicitly reject Option D at launch; revisit only with a
  deliberate "credential pool" product decision.

---

## 17. Acceptance criteria (for this planning slice)

- A committed planning doc at this path; **no** source, migration, test, UI, execution,
  or credential-sharing behavior change; nothing pushed.
- States, from verified evidence, that today personal-provider steps are
  **workflow-creator-pinned** via the single engine seam, that **no per-node credential
  owner exists** anywhere, and that creator-leave leaves those steps unrecoverable.
- Locks the recommended model: **explicit, consent-gated, per-node credential
  reassignment**; **default = today** (creator pin) with **no backfill**;
  **node-owner → creator → clear error** resolution with **no silent co-member
  fallback**; target must **already be connected and consent**; account/service
  providers unchanged; **`created_by_user_id` never rewritten**; **no broad sharing**.
- Recommends **Option B** (`workflow_node_credentials` side table) with A/C/E/D
  evaluated, defines the execution/builder/AI/consent/offboarding policies, gives a
  CS-1…CS-6 breakdown, and records the open decisions.

---

## Report summary

- **Current policy (verified):** account/service providers account-shared; personal
  providers **creator-pinned** by one engine seam (`runWithCredentialResolutionContext`
  set once per handler to `workflow.created_by_user_id`, read by `refreshAndRetry`);
  non-creators get `NOT_WORKFLOW_OWNER` with **no fetch/leak**; AI sees redacted
  `ownerControlled`/`ownerMustConnect` flags only; offboarding soft-disconnects the
  leaver's personal creds + a non-blocking warning. **No per-node owner exists** in
  schema, execution, options, AI, or offboarding; `transferOwnership` never touches
  creds or `created_by_user_id`.
- **Recommended launch model:** explicit, **consent-gated, per-node** credential
  reassignment; a personal node may carry an **accepted** `credentialOwnerUserId` that
  **overrides** the creator pin; **absent override = today** (no backfill); resolution
  **node-owner → creator → clear error**, **never** a silent co-member fallback; target
  must already be connected **and consent**; account/service unchanged;
  `created_by_user_id` untouched; **no broad team-wide sharing**.
- **Recommended data model:** **Option B — `workflow_node_credentials` side table**
  (override **+ consent status**, keyed `(workflow_id, node_id)`), definition JSONB
  unchanged. Wins on consent lifecycle, reassignment-without-republish, and offboarding
  queries. A (in-definition) rejected for republish-staleness; C (per-node connection)
  deferred for multi-connection; D (share-grants pool) rejected as broad sharing; E
  (whole-workflow) optional early increment.
- **Execution/builder/AI policy:** move the existing 22B context seam to **per-node
  effective owner**; `decideOptionsCredential` keyed on the **server-resolved** node
  owner (same `NOT_WORKFLOW_OWNER` no-leak guarantee); AI surface **byte-identical**
  (boolean + redacted flags; owner id never leaks).
- **Consent/offboarding policy:** owner/admin (and creator) **request**, **target
  consents**; only `accepted` is effective; `getMemberWorkflowImpact` extends to
  owned-nodes; remove/leave **revokes** grants → fallback to creator → clear error;
  transfer unchanged; activation warns (non-blocking).
- **Implementation breakdown:** CS-1 schema → CS-2 execution (flagged) → CS-3 consent →
  CS-4 builder/options → CS-5 AI → CS-6 offboarding; optional Option-E early increment.
- **Open decisions:** A-vs-B, node-id stability, leaving-owner fallback-vs-hard-break,
  creator-initiated requests, activation warn-vs-block, multi-connection (C),
  account-type gating, consent surface reuse.
