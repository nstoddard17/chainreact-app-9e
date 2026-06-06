# 4.TEAM-WORKFLOWS-1 — Team Workflow Builder Plan

**Type:** Planning / design only. No code, schema, migrations, tests, or UI in this slice.
**Date:** 2026-06-03
**Branch:** `builder-ui-v1-audit-1`
**Source of truth:**
[team-account-launch-closeout.md](./team-account-launch-closeout.md) ·
[team-credential-access-closeout.md](./team-credential-access-closeout.md) ·
[team-credential-consistency-builder-ai-plan.md](./team-credential-consistency-builder-ai-plan.md) ·
credential consistency shipped in 22D-1 `9abab5385` / 22D-2 `57116df28` / 22D-3 `a209e3996` ·
Team/account model through `1fe98b561`.

> **Planning only.** This proposes how Team-account workflows should behave in the existing
> Workflow Builder and breaks the work into slices. Nothing here is built. Account-scoped URLs,
> explicit credential-sharing UI, and owner transfer/leave remain deferred (out of scope).

---

## 1. Context

The account model, billing, deletion, active-account foundation, Team creation/invites/members/roles,
the `/team` page, and the member cap are all in place. The credential-sharing policy is now **enforced
end-to-end** — execution (22B), builder options (22D-2), and AI context (22D-3) all resolve account
providers as account-shared and personal providers as **creator-pinned + creator-only**, and never use,
surface, or enumerate a co-member's personal credential.

What is **not** yet built: the Builder has no Team-aware behavior. It is account-agnostic at the
detail/edit layer, the dormant `workflowId` plumbing into options is unwired, and there is no UI for the
owner-gated credential states the server already returns. This plan closes that gap for a first,
launch-safe Team workflow builder experience.

---

## 2. Current foundation (verified current state)

| Area | Current behavior | Reference |
|------|------------------|-----------|
| **Create workflow** | `POST /api/workflows` uses `requireUserWithAccount()`; `account_id = active account`, `created_by_user_id = caller` | `app/api/workflows/route.ts:20,29-30` |
| **List workflows** | `GET /api/workflows` → `listByAccount(activeAccount)` | `app/api/workflows/route.ts:37,47` |
| **Get / update / lifecycle** | `GET`/`PATCH /api/workflows/[id]`, `activate`/`pause`/`disable` use **bare `requireUser()`** — no route-layer account check; rely on **RLS** | `app/api/workflows/[id]/route.ts:43-62`, `[id]/activate/route.ts:52` |
| **Active-account resolver** | explicit id → stored `active_account_id` → personal fallback; membership-verified; self-heals stale pointer | `services/accounts/activeAccount.ts:104-139` |
| **`requireUserWithAccount`** | returns `{userId, accountId}`; 403 on frozen / non-member; used by create+list+AI routes | `app/api/workflows/_shared.ts:93-127` |
| **Builder → options** | `useOptionsSource({...})` callers do **not** thread `workflowId`; the param exists but is **dormant** | `ComboboxField.tsx:82-86`, `RequiredInputOptionsSourceControl.tsx:43-48`, `useOptionsSource.ts:91` |
| **Builder workflow detail** | `WorkflowDetail` contract returned to client **excludes `accountId` and `createdByUserId`** | `app/workflows/[id]/page.tsx:45-56`, `contracts/workflow.ts` |
| **Roles** | `requireAccountRole(userId, accountId, allowed)`; **only** gates member management (invites/members/role changes). **Zero** workflow gating today | `services/accounts/accountAuthz.ts:22-31`; call sites under `app/api/accounts/[id]/**` |
| **Owner-gated codes** | `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT` returned by options route; client maps them into the **generic `error`** state (no distinct UI) | `services/options/types.ts:46-62`, `lib/api/options.ts:27-39`, `useOptionsSource.ts:254-273` |

**Three concrete gaps** this track must close: (a) detail/lifecycle routes have no route-layer membership
check; (b) the builder never tells the options/AI layer which workflow it is editing (`workflowId`
dormant) and has no `createdByUserId`/`accountId`/viewer-is-creator signal; (c) the owner-gated states
render as generic errors.

---

## 3. Recommended launch scope

- **Use the active account** as the workspace selector. Workflows are created in and listed from the
  active account (already true). The Builder edits a specific workflow **by id**; that workflow's own
  `accountId` is authoritative for the edit/run session.
- **All Team members can view / create / edit / run / activate Team workflows.** Roles continue to gate
  **people management only** — no per-resource workflow ACLs for launch.
- **Personal-provider node configuration is creator-only** (enforced server-side already). Non-creator
  editors can still edit non-credential fields and account-provider nodes, and can run/activate.
- **React Agent respects the same policy** — never suggests or surfaces a co-member's personal
  credential; personal-provider guidance for non-creators is owner-gated.
- **Creator leaving** does not delete their Team workflows; personal-provider nodes they own may require
  remediation (reconnect-by-owner / transfer / explicit sharing) that does not exist yet — documented as
  a known limitation, not a blocker.

This is the smallest scope that ships Team workflows safely on top of the already-enforced credential
policy, while deferring everything that needs new ownership primitives.

---

## 4. Account scoping model

**Two distinct scopes, deliberately separated:**

1. **Workspace scope (active account)** — drives *which workflows you see and where new ones land*.
   List + create already resolve the active account via `requireUserWithAccount()`. No change needed to
   the model; the switcher is the control surface.
2. **Workflow scope (the workflow's own `accountId`)** — drives *who may open/edit/run a specific
   workflow*. A workflow is globally addressable by id (`/workflows/[id]`); since account-scoped URLs are
   deferred, the **id is the anchor** and the account is never in the URL. Authorization = "is the caller
   a member of `workflow.accountId`?"

**Q1 — How does the Builder know which account it operates in?** It doesn't need to *choose* one — it
operates on the workflow it loaded, whose `accountId` is fixed at create time. The server authorizes by
membership of that account. The client only needs to pass `workflowId` (which it already has as the route
param) to options/AI so the server resolves the workflow account + creator.

**Q2 — Active account, explicit id, or both?** Both, at different layers: **active account** for
list/create (workspace), **the workflow's own account** for edit/run (resolved server-side from
`workflowId`). The Builder never passes an account id directly.

**Q3 — Is active-account scoping enough without account-scoped URLs?** **Yes.** The workflow id uniquely
identifies the workflow and (server-side) its account; membership is checked there. Account-scoped URLs
are a deep-link/shareability nicety, not a correctness requirement for the first Team builder.

**Q4 — User switches active account while editing.** Low hazard by design: the open Builder is pinned to
the loaded workflow id and does **not** reload based on the active-account pointer. Recommended behavior:
keep the session open; the server re-checks membership of `workflow.accountId` on every save/run/activate
(see §5/§12). If membership was lost (e.g. the user was removed from that team in another tab), the next
write returns 403 and the Builder surfaces a "you no longer have access to this workspace's workflow"
state. Optional polish: a non-blocking banner when the active account no longer matches the workflow's
account ("You're editing a workflow in *Acme Team* while *Personal* is active"). Do **not** silently
discard edits on switch.

---

## 5. Workflow create / list / edit / run / activate rules

| Action | Rule | Backend change needed |
|--------|------|----------------------|
| **Create** | Lands in the active account; `created_by_user_id = caller`. Any member. | None (works today) |
| **List** | Active account only. | None (works today) |
| **Open / Get** | Any member of `workflow.accountId`. | **Add** route-layer membership check (today bare `requireUser` + RLS) |
| **Edit / Update draft** | Any member of `workflow.accountId`. Personal-provider node *config* is creator-gated (server returns owner-gated states). | **Add** membership check; thread `workflowId` to options |
| **Run (test)** | Any member; execution already pins personal creds to the creator (22B). | Membership check |
| **Activate / pause / disable** | Any member for launch (see §6 open decision on activate). | **Add** membership check |

**Defense-in-depth note:** RLS already gates row visibility by account membership, so the routes are not
*insecure* today — but the route layer should still assert membership of `workflow.accountId` explicitly
(mirrors the AI tools' `loadOwned` membership guard shipped in 22D-3) so behavior is uniform and testable
without depending solely on RLS.

---

## 6. Role behavior

**Recommendation: roles gate people management only — not workflow access — for launch.** (Q5/Q6/Q7)

- **Q5 (who can create):** All members. Gating creation to owner/admin adds friction with no safety
  benefit (creation is free of credential risk; execution credential safety is already enforced).
- **Q6 (who can edit/run/activate):** All members. Personal-provider credential safety does not depend on
  roles — it depends on creator-pinning, which is enforced regardless of role.
- **Q7 (should roles gate workflow actions at all):** No, for launch. Today roles gate only member
  management; keeping that boundary avoids inventing a per-resource permission model (explicitly out of
  scope). The current `member` role can already use Team workflows/integrations/runs per the launch
  closeout's documented role rules.

**Open decision (flagged, not blocking):** Should **activate** (which arms live triggers and can incur
billing) be restricted to `owner`/`admin`? Recommended **no** for launch (consistency + simplicity), but
this is the single most defensible place to add a role gate later if abuse/cost concerns arise. If chosen,
it reuses `requireAccountRole(userId, workflow.accountId, ["owner","admin"])` — no new primitive.

---

## 7. Credential behavior in Builder UI

Threading `workflowId` into the options layer (un-dormanting 22D-1 plumbing) makes the server apply the
22D-2 policy. The Builder then renders the typed results:

- **Account-provider node** (Slack/Notion/Stripe/…): options resolve the **shared team credential**.
  Picker behaves normally for every member. Show a subtle "shared team connection" affordance (§11).
- **Personal-provider node, viewer is the creator:** options resolve the creator's pinned credential;
  picker behaves normally.
- **Personal-provider node, viewer is NOT the creator → `NOT_WORKFLOW_OWNER`:** picker is **disabled** and
  shows an owner-gated state: *"Only the workflow owner can configure their `<provider>` here — this step
  runs under their connection."* **No options are fetched** (server performs no lookup), so nothing leaks.
- **Personal-provider node, viewer is the creator but not connected → `OWNER_MUST_CONNECT`:** picker shows
  *"Connect `<provider>` to configure and run this workflow"* with a connect CTA.
- **Non-credential fields** (text, numbers, mappings, logic) and **account-provider nodes** remain fully
  editable by any member, including on a personal-provider node the viewer doesn't own (only the
  credential-bound option fields are gated).

**Q8 (personal-provider nodes for non-creator editors):** editable except the credential-bound option
fields, which show the `NOT_WORKFLOW_OWNER` gated state.
**Q9 (`NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT` UI):** distinct, typed field states (disabled picker +
explanatory copy + connect CTA for the owner case) — not a generic error/"Try again". Requires client
status branching in `useOptionsSource` (today both collapse to `error`).
**Q10 (display credential ownership):** per node, show whether it runs on a **shared team connection**
(account provider) or **the workflow owner's connection** (personal provider). For personal providers,
show only the **owner's display name** (already visible in the `/team` roster) + provider — **never** the
provider-account label/email/resource metadata (consistent with 22D-3's `ownerControlled` redaction:
existence-of-connection and creator identity are fine; the personal label/email is not).

---

## 8. React Agent behavior

The AI tools already enforce the policy (22D-3). The remaining work is **wiring**, not new policy.

- **Q11 (React Agent in Team workflows):** Respect the same policy. Thread `workflowId` into the planner /
  explain tool call sites (today `getConnectedIntegrationsForAI(userId)` is called without a workflow id —
  the documented 22D-3 follow-up), so the agent sees workflow-account-scoped, creator-pinned availability
  and the redacted `ownerControlled` / `ownerMustConnect` states for personal providers.
- **Q12 (who can use AI):** **All members**, consistent with edit access. The credential policy already
  prevents leaks regardless of who invokes the agent, so gating AI to creator/owner/admin would add
  friction without a safety gain. For a non-creator on a personal-provider step, the agent surfaces
  owner-gated guidance ("the workflow owner must connect/configure `<provider>`") rather than co-member
  credential data.
- The agent must **never** suggest using another member's personal credential and must not echo a
  co-member's personal label/email — already guaranteed by the tools; the test plan re-asserts it through
  the threaded call path.

---

## 9. Creator-leaves / offboarding behavior

- **Q13 (creator leaves the Team):** Team workflows are **account-owned**, so they **stay in the Team** —
  nothing is deleted. But 22C soft-disconnects the departed member's **personal** Team credentials, so any
  **personal-provider node** in their workflows loses the credential it ran under. Result: execution fails
  with a clear connect-required error, and the Builder shows the `OWNER_MUST_CONNECT`-style state for those
  nodes. Account-provider nodes are unaffected (shared).
- **Q14 (require creator transfer before removal?):** **No** for launch — transfer isn't built and
  blocking removal on it would strand offboarding. Instead, surface a **non-blocking warning** at member
  removal: *"This member created N workflow(s) with personal-provider steps that will stop running until
  reconnected or reassigned."* Removal proceeds; remediation is manual until transfer/explicit sharing
  ships.
- **Known limitation (document honestly):** until creator transfer or explicit credential sharing exists,
  a departed creator's personal-provider nodes **cannot be reconnected by anyone else** (there is no
  per-node ownership reassignment). Such workflows are effectively paused on those steps. This is the
  strongest argument for prioritizing the explicit-sharing/transfer track soon after launch.

---

## 10. Deferred — explicit credential sharing (and adjacent)

Out of scope for this track; required before collaborative personal-provider editing is first-class:

- **Per-node connection ownership / reassignment** — let an owner/admin point a personal-provider node at
  a different member's (opted-in) credential.
- **Owner opt-in to share a personal credential** with the team.
- **Creator transfer** of a workflow (and bulk transfer on offboarding).
- **Owner transfer / leave Team**, **account-scoped URLs**, **active-account connect-path decision**
  (where a new OAuth connection lands when a team is active), **paid Teams / Stripe** — all tracked in the
  launch closeout, unchanged by this plan.

**Q15 (what waits for explicit sharing):** any flow where a *non-creator* needs to *configure or supply*
a personal-provider credential — collaborative personal-provider editing, node credential reassignment,
and creator-departure remediation. Until then, non-creators get the owner-gated states.

---

## 11. UX states / errors

| State | Trigger | Builder rendering |
|-------|---------|-------------------|
| Normal picker | account provider, or personal provider + viewer is creator (connected) | standard options dropdown |
| **Owner-gated (read-only)** | `NOT_WORKFLOW_OWNER` | disabled picker + "Only the workflow owner can configure their `<provider>` here — it runs under their connection." No fetch. |
| **Owner-must-connect** | `OWNER_MUST_CONNECT` | "Connect `<provider>` to configure and run this workflow." + connect CTA (creator only) |
| **Shared-connection badge** | account provider on a Team workflow | small "Shared team connection" tag |
| **Owner-connection badge** | personal provider on a Team workflow | "Runs under `<creator display name>`'s connection" — name + provider only, no label/email |
| **Lost-access** | save/run/activate returns 403 (membership lost) | non-destructive banner: "You no longer have access to this workspace's workflow." |
| **Active-account mismatch (optional)** | open workflow's account ≠ active account | non-blocking banner naming both |

All credential-bound copy must avoid the co-member personal label/email (policy invariant).

---

## 12. API / repository / service changes needed (for the build slices)

1. **Membership scoping on detail/lifecycle routes** — `GET`/`PATCH /api/workflows/[id]`,
   `activate`/`pause`/`disable`: after loading the workflow, assert `isMember(caller, workflow.accountId)`
   (reuse `repositories/accountMemberships.isMember`, the same primitive 22D-3 used in `loadOwned`). 403
   otherwise. Defense-in-depth over RLS; makes the rule explicit + testable.
2. **Builder detail contract** — extend the `WorkflowDetail` returned by the builder page to carry the
   minimum the UI needs: `isViewerCreator: boolean` and `creatorDisplayName: string | null` (derived
   server-side). **Do not** ship raw `createdByUserId`/`accountId` to the client unless needed; the server
   already enforces the policy, and the client only needs to render ownership affordances. (Decision: the
   server returning the owner-gated *option codes* is sufficient for gating; the contract fields are for
   labels/badges only.)
3. **Thread `workflowId` into options** — `ComboboxField` + `RequiredInputOptionsSourceControl` pass
   `workflowId` into `useOptionsSource` (un-dormant 22D-1). The Builder already has the id (route param).
4. **Client status branching** — `useOptionsSource` maps `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT` to
   distinct states (not generic `error`); `OptionsApiErrorCode` already includes them.
5. **React Agent call-site scoping** — thread `workflowId` into `getConnectedIntegrationsForAI` and the
   workflow-context tool calls in the planner/explain entry points (the 22D-3 follow-up).
6. **(Optional) Offboarding warning** — member-removal flow computes a count of workflows the departing
   member created that contain personal-provider nodes, surfaced as a non-blocking warning. No execution
   change (22C already soft-disconnects).

No migrations. No new tables. No billing changes. All reuse existing primitives
(`requireUserWithAccount`, `isMember`, `requireAccountRole`, the credential policy, 22B execution).

---

## 13. Test plan (for the build slices — Q16)

**No-leak / credential safety (highest priority):**
- Non-creator opening a Team workflow with a personal-provider node → option field returns
  `NOT_WORKFLOW_OWNER`, **no provider fetch**, and the serialized builder/API payload contains **no**
  co-member personal label/email/resource metadata.
- React Agent on a Team workflow (non-creator) → integration availability shows the personal provider as
  `ownerControlled` (redacted) or `ownerMustConnect`; never a co-member credential label; never a
  suggestion to use one.
- Account-provider option fields resolve the shared team credential for any member (availability stays
  visible).

**Account scoping / authorization:**
- Member of Team A **cannot** GET/PATCH/activate a Team B workflow (403 / NOT_FOUND), via the new
  route-layer membership check (not just RLS).
- Create lands in the active account; list returns only active-account workflows.
- Membership lost mid-session → next save/run/activate returns 403.

**Role behavior:**
- A `member` (non-owner/admin) can create, edit non-credential fields, run, and activate a Team workflow
  (asserts roles do **not** gate workflow access).
- (If the activate role-gate decision flips) only owner/admin can activate.

**Creator/ownership:**
- Creator can configure their own personal-provider node; `OWNER_MUST_CONNECT` when they haven't
  connected.
- After the creator's offboarding (22C soft-disconnect), their personal-provider nodes report
  owner-must-connect in the builder and fail execution clearly.

**Regression:** all 22A/22B/22C/22D-1/2/3 suites stay green; existing builder/options/AI tests updated only
where the threaded `workflowId` intentionally changes behavior.

---

## 14. Implementation slice breakdown (proposed; none built here)

- **TW-1 — Backend workflow account authorization.** Add explicit `isMember(caller, workflow.accountId)`
  checks to `GET`/`PATCH /api/workflows/[id]` + `activate`/`pause`/`disable`. Tests for cross-account 403 +
  member success. (Backend only; no UI.)
- **TW-2 — Builder workflow context plumbing.** Thread `workflowId` from the Builder into
  `useOptionsSource` (ComboboxField + RequiredInputOptionsSourceControl); add `useOptionsSource` status
  branching for `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT`; extend `WorkflowDetail` with
  `isViewerCreator` + `creatorDisplayName`. (Wiring + contract; minimal/no visual polish.)
- **TW-3 — Builder credential UX.** Render the owner-gated field states + shared/owner-connection badges.
  (UI slice; depends on TW-2.)
- **TW-4 — React Agent team scoping.** Thread `workflowId` into the planner/explain AI tool call sites so
  the agent runs the workflow-account-scoped, creator-pinned policy. (The 22D-3 follow-up.)
- **TW-5 — Offboarding warning (optional).** Non-blocking "N workflows will need remediation" warning at
  member removal. (No execution change.)
- **Deferred track (separate):** explicit credential sharing / per-node ownership reassignment / creator
  transfer / account-scoped URLs / connect-path decision.

Suggested order: **TW-1 → TW-2 → TW-3 → TW-4 → TW-5**. TW-1 is the safety floor; TW-2/3 deliver the visible
Team builder; TW-4 extends parity to AI; TW-5 is a polish/communication safety net.

---

## 15. Risks / open questions

1. **Activate role-gate (open product decision).** Gate `activate` to owner/admin, or leave it open to all
   members? Recommended open for launch; flagged because activate arms live triggers + can incur cost.
2. **Showing creator identity on personal-provider nodes (privacy nuance).** Recommended to show the
   creator's display name (already visible in the roster) + provider, but never the personal label/email.
   Confirm this is acceptable product-wise (it reveals "Alice created this and has `<provider>` connected",
   which co-membership already implies).
3. **Departed-creator workflows are stuck on personal-provider nodes** until transfer/explicit sharing.
   Accept as a documented launch limitation, or prioritize a minimal transfer first? Recommended: ship the
   builder, document the limitation, prioritize transfer/explicit-sharing next.
4. **Concurrent editing** by multiple members of one Team workflow. The existing optimistic-lock on draft
   update (`updateDraftDefinitionIfRevisionMatches`) covers correctness; UX for "someone else is editing"
   is out of scope but worth noting.
5. **Active-account mismatch banner** — ship in TW-3 or defer? Low risk either way; recommend a lightweight
   banner in TW-3.
6. **`WorkflowDetail` contract growth** — keep it minimal (`isViewerCreator`, `creatorDisplayName`) to
   avoid leaking ownership internals to the client.

---

## 16. Acceptance criteria (for the eventual build, not this doc)

- A Team member can create, open, edit (non-credential fields), run, and activate Team workflows; lists
  are scoped to the active account.
- Detail/lifecycle routes reject non-members of the workflow's account (explicit check, not only RLS).
- Personal-provider option fields are creator-only: a non-creator gets a typed owner-gated state with **no
  provider fetch**; the creator gets normal options or `OWNER_MUST_CONNECT`.
- Account-provider option fields resolve the shared team credential for any member.
- No builder/API/AI payload ever exposes a co-member's personal credential label/email/resource metadata;
  the React Agent never suggests using one.
- Roles gate people management only; workflow access is membership-based (modulo the optional activate
  gate if chosen).
- Creator offboarding leaves workflows in the Team; their personal-provider nodes surface
  owner-must-connect rather than silently using a co-member credential.
- All prior credential-arc tests (22A/22B/22C/22D-1/2/3) remain green.

---

## Report summary

- **Account scoping model:** active account for list/create (workspace); the workflow's own `accountId` +
  membership for open/edit/run (resolved server-side from `workflowId`). Active-account scoping is
  sufficient without account-scoped URLs.
- **Role / workflow access:** all members create/edit/run/activate; roles gate people management only.
  Optional future activate gate is the one flagged exception.
- **Personal-provider nodes:** creator-only configuration (enforced server-side); non-creators get typed
  owner-gated states and can still edit non-credential + account-provider nodes.
- **React Agent / team policy:** same credential policy, available to all members; thread `workflowId`
  into AI tool call sites; never surface/suggest co-member personal credentials.
- **Slice breakdown:** TW-1 backend auth → TW-2 builder context plumbing → TW-3 credential UX → TW-4 AI
  scoping → TW-5 offboarding warning; explicit credential sharing/transfer deferred.
- **Open product decisions:** (1) activate role-gate? (2) show creator identity on personal-provider
  nodes? (3) accept departed-creator stuck-node limitation vs. prioritize transfer? (4) ship the
  active-account-mismatch banner now or later?
