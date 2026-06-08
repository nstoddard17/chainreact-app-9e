# 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-1 — Business: Deactivate vs Downgrade-to-Team Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, env, Stripe, or
behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`
**Revision:** **1B — supersedes the original "over-cap blocker" model of 1.** The earlier
draft blocked downgrade on member/folder counts (`evaluateDowngrade('team')` / `over_cap` /
"usage ≤ Team caps"). Per Marcus's product decision, **downgrade now intentionally simplifies
the workspace** (removes non-owner members, flattens folders) instead of blocking on usage, and
a separate **Deactivate** path preserves everything. The cap-blocker wording below is corrected
throughout; see §2.

**Source of truth (verified current state — each file read this session):**
[services/accounts/membership.ts](../../../../services/accounts/membership.ts) (`removeMember` — canonical offboarding, owner-removal guard) ·
[services/accounts/leaveAccount.ts](../../../../services/accounts/leaveAccount.ts) (same cascade, self-service) ·
[repositories/workflowNodeCredentials.ts](../../../../repositories/workflowNodeCredentials.ts) (`revokeLiveForMemberServiceRole` — CS-6 grant revoke → fall back to creator) ·
[repositories/integrations.ts](../../../../repositories/integrations.ts) (`softDisconnectPersonalForMember` — 22C personal-credential soft-disconnect) ·
[core/integrations/credentialSharing.ts](../../../../core/integrations/credentialSharing.ts) (personal vs account policy) ·
[repositories/workflowFolders.ts](../../../../repositories/workflowFolders.ts) (`softDelete`/`restore`/`hardDeleteFolderServiceRole`; `listByAccount` live-only) · [services/workflowFolders/trashService.ts](../../../../services/workflowFolders/trashService.ts) (`WORKFLOW_TRASH_RETENTION_DAYS = 7`, batch `delete_operation_id`) ·
[repositories/workflows.ts](../../../../repositories/workflows.ts) (`updateFolder(id, folderId)` — `null` = uncategorized/root; `draftDefinition` jsonb; `accountId` owner; `createdByUserId` provenance) ·
[contracts/workflowDefinition.ts](../../../../contracts/workflowDefinition.ts) (node/edge/config shape — credential-free; tokens never stored here) ·
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) · [core/billing/downgradeRules.ts](../../../../core/billing/downgradeRules.ts) (`evaluateDowngrade` — now only a preview, not a gate) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (`subscription.deleted` — personal-only revert today) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`applyBusinessUpgradeServiceRole`, `BillingSubscriptionSync` — cannot flip `accounts.type`) ·
[supabase/migrations/20260614000000_apply_business_upgrade.sql](../../../../supabase/migrations/20260614000000_apply_business_upgrade.sql) (atomic upgrade RPC — template) ·
[services/accounts/accountFreeze.ts](../../../../services/accounts/accountFreeze.ts) + [accountDeletion.ts](../../../../services/accounts/accountDeletion.ts) + [contracts/accounts.ts](../../../../contracts/accounts.ts) (`deletion_status` enum: only `active` | `pending_deletion`) ·
docs: [platform-billing-remaining-work-audit.md](./platform-billing-remaining-work-audit.md) (§5.B) · [business-upgrade-plan.md](./business-upgrade-plan.md).

**Arc commits referenced:** Business upgrade BU-1…BU-4 (`cd849a9d7`…`7a888a155`) · member offboarding 4.ACCOUNT-MODEL-22C + TEAM-WORKFLOWS-CREDENTIAL-SHARING-6 (CS-6) · workflow folders/trash WF-2…WF-4 · Pro value CS-PRO-1/2 (`03f4ef3b8`, `8ebaa44d1`).

> **Decision plan, not implementation.** Every "today it works like X" traces to a file read
> this session; every "we should do Y" is a labeled recommendation. This doc changes nothing.

---

## 1. Updated summary

A Business (internal `organization`) customer gets **two distinct, explicit paths**, neither
of which deletes workflows or moves them to a personal account:

- **Path A — Deactivate Business** (*preserve everything*): pause the Business workspace —
  members, folders, workflows, and all account data are kept; the account becomes
  read-only/inactive and is **reactivatable** later. No downgrade, no destruction.
- **Path B — Downgrade Business → Team** (*intentionally simplify*): keep using the **same
  `account_id`** as a simpler Team workspace. The owner is retained; **all non-owner members
  are removed via the existing safe offboarding sequence**; the **folder hierarchy is
  flattened** (workflows moved to root/uncategorized, folders sent to Trash); **workflows are
  kept on the account** (never auto-deleted, never transferred to personal). A **credential-free
  workflow-schema export** is offered before the destructive confirmation.

Because downgrade is now **destructive**, the Stripe `subscription.deleted` webhook must **never
silently run it** — on cancel the account defaults to the non-destructive **Deactivate/preserve**
state; **Downgrade-to-Team is only ever a deliberate, explicitly-confirmed user action.** Caps
(members/folders) **no longer block** downgrade — they are the thing downgrade simplifies. All of
this ships dark behind `ENABLE_BUSINESS_DOWNGRADE` (default OFF) + `ENABLE_PLATFORM_BILLING`.

---

## 2. Why the original (1) blocker model changed

Revision 1 treated an over-cap Business (>5 members or >100 folders) as **blocked**: the user had
to reduce members/folders below Team caps before downgrade, gated by `evaluateDowngrade('team')`
with an `over_cap` refusal. **That model is now stale.** The new product decision is that downgrade
**performs** the reduction as an intentional simplification:

- **Member count no longer blocks** — all non-owner members are *removed* as part of downgrade.
- **Folder count no longer blocks** — the hierarchy is *flattened* as part of downgrade.
- The real precondition becomes: **can the safe offboarding sequence run for every non-owner
  member** (it is idempotent and always runnable in practice — §6), and the account is **not
  frozen**, and the **owner is retained** (sole-owner invariant).
- `evaluateDowngrade('team')` / `previewDowngrade('team')` are **demoted from a gate to a preview**
  — useful to *show the customer what will be removed* (member/folder counts), not to block.
- `workflow` count does **not** block (no Team workflow cap exists — verified no workflow-count
  limit in the prior audit). It would only matter if a Team workflow cap is later introduced.

---

## 3. Deactivate vs Downgrade model

| Dimension | **Path A — Deactivate** | **Path B — Downgrade to Team** |
|---|---|---|
| Intent | Pause/stop Business, keep the workspace | Keep using the account as a simpler Team |
| `account_id` | unchanged | unchanged |
| `accounts.type` | stays `organization` | `organization` → `team` (atomic RPC) |
| `account_billing.plan` | stays `business` (status canceled) | → `team` |
| Owner | retained | retained |
| Non-owner members | **kept** | **removed** (existing offboarding) |
| Folders | **kept** | **flattened** (workflows→root, folders→Trash) |
| Workflows | **kept** (read-only while inactive) | **kept**, uncategorized |
| Run history | kept | kept |
| Reactivatable? | **yes** | n/a (it's now a Team account) |
| Destructive? | **no** | **yes** (members + folder hierarchy) |
| Default on `subscription.deleted`? | **yes** (non-destructive default) | **no** — explicit confirm only |

---

## 4. What is preserved

- **Path A (Deactivate):** everything — members, folders, workflows, integrations, API keys,
  run history, account-owned credentials. The account is inactive/read-only and can be reactivated.
- **Path B (Downgrade):** the **owner**, **all workflows** (on the same `account_id`), **run
  history**, **account-owned/service credentials** (Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp
  — they are account-shared, not member-personal, so they survive member removal), **API keys**
  (account-owned), and the **workflow definitions** themselves.

## 5. What is removed (Path B only)

- **All non-owner members** (admins included — per the product decision, *all* non-owner roles).
- **The folder hierarchy** — folders are emptied (workflows reparented to root) and sent to Trash
  (reversible 7 days, then purged by the existing cron). The account ends with **no active Business
  folder structure**.
- **Removed members' personal-credential connections** — soft-disconnected, and their per-node
  credential-ownership grants revoked (a side effect of offboarding, §6), so affected nodes fall
  back to the workflow creator and may need reconnection.
- **Nothing else.** No workflow, integration record, API key, or run is deleted. No data is moved
  to anyone's personal account.

---

## 6. Member removal / offboarding behavior

**Reuse the canonical offboarding seam — do not reinvent it.** `removeMember()`
([membership.ts:88-146](../../../../services/accounts/membership.ts)) already performs, in order:

1. **`revokeLiveForMemberServiceRole()`** — revoke every live (pending|accepted) per-node
   credential-ownership grant the member owns in the account (**CS-6**); affected nodes then
   deterministically fall back to the **workflow creator** ([workflowNodeCredentials.ts:295-345](../../../../repositories/workflowNodeCredentials.ts)).
2. **`softDisconnectPersonalForMember()`** — soft-disconnect the **personal** provider
   integrations that member connected in this account (**22C**); account/service providers
   (Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp) **stay connected** (shared) — classified by
   the single `credentialSharing.ts` policy ([integrations.ts:357-428](../../../../repositories/integrations.ts)).
3. **Delete the membership row** + clear the member's active-account pointer if it named this
   account (retry-safe).

**Downgrade must loop the non-owner members through this same sequence** (or a batch variant of
it), so credential offboarding is consistent with normal member removal. Guards that already hold:
**the owner can never be removed** (`removeMember` returns `owner_target`), so the sole-owner
invariant is preserved for free. Each step is **idempotent**, so a partially-applied downgrade is
**resumable** (re-running skips already-done work).

**Consequence to WARN about (UI):** workflows whose nodes ran under a removed member's *personal*
credential will, after offboarding, fall back to the creator and may need the creator (or owner) to
**reconnect** the provider before those steps run again. This is the same reconnection behavior as
ordinary member removal — downgrade just does it in bulk.

---

## 7. Folder wipe / flatten behavior

Evaluated options (workflows are always reparented to root first via `updateFolder(id, null)`):

| Option | Mechanism | Reversible? | Matches existing model? | Verdict |
|---|---|---|---|---|
| A. workflows→root, **soft-delete** folders | `softDelete` per folder | Yes (admin/cron only) | Partly | OK but Trash path is cleaner |
| B. workflows→root, **hard-delete** folders | `hardDeleteFolderServiceRole` | No | No (bypasses Trash) | Reject — irreversible |
| **C. workflows→root, folders → Trash (7-day restore)** | reuse `trashService` batch soft-delete (`delete_operation_id`) | **Yes, 7 days** | **Yes** (WF-3/WF-4) | **RECOMMENDED** |

**Recommendation: Option C.** Move every workflow to root (`folderId = null`), then send the folders
to **Trash** as one batch (`delete_operation_id`) reusing the existing 7-day restore window
([trashService.ts](../../../../services/workflowFolders/trashService.ts)). This is reversible for a
grace period (safety) yet leaves **no active Business folder hierarchy** after completion (the goal),
and the existing purge cron eventually hard-deletes. The confirmation UI must state clearly that the
folder structure is being removed (restorable from Trash for 7 days; workflows themselves are kept).

---

## 8. Workflow export / import model

**Export and import are entirely NET-NEW** (verified: no `exportWorkflow`/`importWorkflow`/
`duplicate`/`template` code, no `/api/workflows/[id]/export`, no import-to-personal anywhere).

- **Offer (not require) a credential-free export before the downgrade confirm.** A required export
  would block users who don't want it; offering it respects the "you're about to simplify" moment.
- **Export = the workflow graph only.** Source it from `workflows.draft_definition`
  (nodes/edges/config/provider/type/displayName/position) — which is **already credential-free**
  (OAuth tokens live in `integrations`, per-node owner grants in the `workflow_node_credentials`
  side table; neither is in the definition).
- **Export MUST strip / never include:** OAuth tokens, provider account labels/ids, secrets,
  per-node credential grants, `connected_by_user_id`. Config references that *point at* a provider
  resource (e.g. a Slack channel id) are graph data, not secrets — but the export should be framed
  as "recreate-able schema," and import re-resolves credentials/resources in the target account.
- **Import / upload into a personal account is a separate feature** (net-new), out of scope here.
  Cross-account import additionally needs an account-scoped target check + credential re-resolution.
- **Do not implement export/import in this slice** — it is its own slice (CS-BD-4). Until it ships,
  the "Export workflows" affordance in the downgrade dialog is either deferred or shown disabled
  with "coming soon" (no fake control).

---

## 9. Credential / offboarding implications

- **Per-node grants (CS-6):** revoked for every removed member → nodes fall back to the creator
  (§6.1). No accepted grant is ever left pointing at a removed user.
- **Personal credentials (22C):** removed members' personal-provider integrations are
  **soft-disconnected** (not hard-deleted — audit history kept), so Team workflows can no longer
  use them; reconnection by the creator/owner is required for affected steps.
- **Account/service credentials** (Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp): **untouched** —
  they are account-shared and survive the downgrade.
- **API keys & integrations are account-owned** → they remain on the account through the downgrade
  (only *member-personal* connections are offboarded).
- **No co-member credential leakage** is introduced: removal follows the existing single seam; the
  downgrade adds no new credential-sharing path. (Security-review posture preserved.)

---

## 10. Stripe webhook behavior

**Critical change from revision 1.** Because Downgrade is destructive, the webhook **must not run
it automatically**:

- On **`customer.subscription.deleted`** for an `organization` account: set
  `plan_status='canceled'` (today's behavior) and treat the account as **Deactivated (preserve,
  read-only)** — the non-destructive default. **Do NOT** flip type, remove members, or touch
  folders. Personal revert (CS-PPT-1) and team behavior unchanged.
- **Downgrade-to-Team is never webhook-driven.** It runs only from the explicit, confirmed
  Account Settings action (Path B). The webhook has no signal of user *intent* to destroy data, so
  it must default to preserve.
- Invariants preserved: signature-verified over the raw body (300s replay tolerance), deduped by
  event id, recorded after success, source-of-truth model. The destructive downgrade orchestration
  is a **separate, authenticated, service-role chokepoint**, not the webhook.
- **Gating:** all new behavior behind `ENABLE_BUSINESS_DOWNGRADE` (default OFF); with it OFF the
  webhook keeps exactly today's canceled-only behavior and no Deactivate/Downgrade UI shows.

> This supersedes revision 1's "auto-revert when under Team caps" — auto-revert is unsafe now that
> the revert is destructive.

---

## 11. Data / model changes needed

- **Downgrade flip RPC (revised):** a new service-role `apply_business_downgrade` (mirror of the
  upgrade RPC) that atomically flips `organization`→`team` + `plan`→`team` + `tasks_limit`→Team
  policy, re-validating (organization / not frozen) and idempotent. **Drop the `over_cap` refusal
  from revision 1** — the orchestration removes members/flattens folders *before* the flip, so
  there is nothing to refuse. The RPC is the *last* atomic step; member-removal + folder-flatten
  are TS service steps that precede it (they cascade through services, not pure SQL — §12).
- **Deactivate (Path A) state:** the only existing freeze state is `pending_deletion`, which carries
  a **30-day purge deadline** — semantically wrong for "preserve indefinitely, reactivatable." So a
  **non-purging "deactivated/paused" account state is NET-NEW** (extend the account state model +
  reuse the `accountFreeze` read-only enforcement, but with **no `purge_after`** and an explicit
  reactivate transition). **Open decision §15** (new state vs. modeling Deactivate as merely
  "canceled + warn", i.e. not truly read-only).
- **Folder flatten:** **no new schema** — reuses `updateFolder` + `trashService` (Option C, §7).
- **No workflow deletion, no backfill** — billing is dark; no live Business accounts.
- **Export/import:** net-new schema/endpoints — separate slice (§8, CS-BD-4).

---

## 12. Atomicity / RPC recommendation

The full downgrade is **not** expressible as one SQL transaction (member offboarding revokes
grants + soft-disconnects integrations through TS service code). Model it as an **idempotent,
resumable service orchestration** with the atomic flip as the final step:

```
downgradeBusinessToTeam(accountId, actorUserId):   # service-role, behind ENABLE_BUSINESS_DOWNGRADE
  0. re-validate: account is organization, not frozen, actor is owner; else refuse
  1. for each NON-OWNER member:  removeMember(...)            # idempotent (revoke grants → soft-disconnect → delete row)
  2. flatten folders:  updateFolder(wf, null) for all; trashService batch soft-delete folders   # idempotent
  3. apply_business_downgrade RPC:  type→team, plan→team, tasks_limit→Team policy (atomic)        # idempotent
```

- **Order matters:** members are removed and folders flattened **before** the type flip, because
  member/folder caps derive from `accounts.type` (flipping first would briefly make a `team` account
  hold >5 members / >100 folders — a transient illegal state). Flipping **last** means the account is
  already simplified when it becomes Team.
- **Each step idempotent** → a failure mid-orchestration is **resumable** (re-run skips done work);
  this replaces single-transaction atomicity, which isn't possible here.
- **The flip itself is atomic** (RPC) so the system never observes `type=team, plan=business` (or
  inverse). The `BillingSubscriptionSync` helper **must not** be used for the type flip (it can't
  touch `accounts.type`).

---

## 13. UI / confirmation requirements

In Account Settings → Plan & billing, for an **owner** on an `organization` account (flag ON, not
frozen) — present **two clearly separated, non-adjacent-by-accident** affordances:

- **"Deactivate Business"** (Path A) — explains: workspace is paused and becomes read-only;
  members/folders/workflows/data are kept; reactivate anytime. Confirmation is light (non-destructive).
- **"Downgrade to Team"** (Path B) — an **explicit destructive confirmation** that lists exactly
  what will happen, sourced from real counts (`previewDowngrade('team')` as a *preview*, not a gate):
  - "**N non-owner members will be removed** (admins included)." 
  - "Their personal app connections will be disconnected; workflows using them may need reconnecting."
  - "**Your folders will be removed** (workflows are kept and moved to Uncategorized; folders are
    restorable from Trash for 7 days)."
  - "**No workflows are deleted; nothing moves to your personal account.**"
  - **"Export your workflows first"** affordance (disabled/"coming soon" until CS-BD-4 ships).
  - Requires an explicit confirm (e.g. type-to-confirm or a clearly-labeled destructive button).
- **Owner-only** for both (non-owners never see them); server-side authorization is authoritative;
  no Stripe id/secret rendered; generic typed errors. **No fake controls** — every button maps to a
  real backend path (the export affordance stays disabled until its backend exists).

---

## 14. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Destructive downgrade run without intent (e.g. via webhook on cancel) | Webhook **never** downgrades; defaults to Deactivate/preserve; downgrade needs explicit confirm (§10) |
| R2 | Partial downgrade (some members removed, flip not applied) | Idempotent, **resumable** orchestration; atomic flip last (§12) |
| R3 | Transient illegal `team`-with->5-members state | Remove members + flatten folders **before** the type flip (§12) |
| R4 | Workflows silently broken after offboarding (lost personal creds) | Explicit UI warning + reconnection is the known existing behavior (§6, §13) |
| R5 | Folder flatten irreversible / data loss feel | Option C = Trash with 7-day restore; workflows themselves never deleted (§7) |
| R6 | User wanted to keep a workflow but has no export | Offer credential-free export before confirm; ship CS-BD-4 before enabling Pro… er, before enabling downgrade in prod (§8) |
| R7 | Deactivate conflated with deletion (purge) | Deactivate is a **non-purging** state, distinct from `pending_deletion` (§11) — net-new state, explicit reactivate |
| R8 | Owner accidentally removed | `removeMember` owner guard + orchestration only loops **non-owner** members (§6) |
| R9 | Behavior change shipped before tested | `ENABLE_BUSINESS_DOWNGRADE` default OFF; dark-launch + test mode first |

---

## 15. Implementation slice breakdown (future — not this slice)

- **CS-BD-1 (revised) — downgrade orchestration + atomic flip.** `downgradeBusinessToTeam` service
  (same `account_id`; org→team; plan→team; owner retained; non-owner members removed via the
  existing `removeMember` offboarding; folders flattened via `updateFolder`+Trash; workflows kept;
  **no credential export, no workflow deletion**) + the `apply_business_downgrade` RPC (atomic flip,
  **no `over_cap` refusal**). Idempotent/resumable. `db:push`. Tests: §16.
- **CS-BD-2 (revised) — webhook on `subscription.deleted`.** Behind `ENABLE_BUSINESS_DOWNGRADE`:
  default to **Deactivate/preserve** (canceled, non-destructive); **never** auto-run the destructive
  downgrade. Tests: org cancel → canceled + preserved, no member/folder change; flag OFF → today's
  behavior; personal/team unchanged.
- **CS-BD-3 — Account Settings UI.** Separate **Deactivate** and **Downgrade-to-Team** paths;
  explicit destructive confirm for downgrade with the real preview + warnings; **Export workflows**
  affordance (disabled until CS-BD-4).
- **CS-BD-4 — workflow export/import (net-new).** Credential-free schema export from
  `draft_definition`; import/upload into a personal account as a separate feature (cross-account
  target check + credential re-resolution). Enables the export affordance in CS-BD-3.
- **CS-BD-0 (if chosen, §15 decision) — Deactivate account state.** Net-new non-purging
  `deactivated/paused` state reusing the `accountFreeze` read-only enforcement + reactivate
  transition. Needed only if Deactivate must be truly read-only (vs "canceled + warn").
- **Deferred:** Team-as-paid price-switching; `past_due` escalation; Enterprise.

---

## 16. Test plan (for the implementation slices)

- **Orchestration (CS-BD-1):** non-owner members removed through the real offboarding (grants
  revoked, personal integrations soft-disconnected, account/service kept); owner retained; folders
  flattened (workflows reparented to root, folders in Trash, restorable); workflows + run history +
  account-owned creds/API keys intact; **resumable** (re-run after a simulated mid-failure completes
  cleanly); flip atomic; **service-role-only** RPC EXECUTE (authenticated/anon cannot).
- **Webhook (CS-BD-2):** org `subscription.deleted` → canceled + preserved, **no** member/folder
  mutation; flag OFF → today's behavior; personal revert + team unchanged; signature/dedup intact.
- **UI (CS-BD-3):** destructive confirm shows real counts + all warnings; export affordance disabled
  pre-CS-BD-4; owner-only; no Stripe id leak; existing billing UI suites green.
- **Export (CS-BD-4):** export contains graph only and **never** tokens/labels/secrets/grants;
  import re-resolves credentials in the target account.
- **Existing suites stay green:** `removeMember`/`leaveAccount`, `workflowNodeCredentials`,
  `integrations` offboarding, `workflowFolders`/trash, `apply_business_upgrade`, `stripeBillingWebhook`.

---

## 17. Open decisions for Marcus

1. **Deactivate state model (§11):** a **net-new non-purging `deactivated/paused`** account state
   (truly read-only, reactivatable, reuses freeze enforcement) — **or** model Deactivate as just
   "subscription canceled, account stays organization, warn-only (keeps running)"? *(Recommendation:
   net-new non-purging state if we want a real read-only pause; otherwise the lighter "canceled +
   warn" — confirm which.)*
2. **On `subscription.deleted`, default to Deactivate/preserve** (recommended) and require an
   explicit in-app action to Downgrade — confirm. *(Strongly recommended; never auto-destroy.)*
3. **Folder flatten = Trash (Option C, 7-day restore)** vs hard-delete? *(Recommendation: Trash.)*
4. **Export before downgrade: offered, not required** (recommended) — confirm. And the **export
   format** (e.g. a versioned JSON of `draft_definition`).
5. **Order/timing:** confirm members+folders are simplified **before** the type flip (§12).
6. **Run history retained after downgrade** — recommended **yes** (confirm).
7. **Should Downgrade be available while the subscription is still active** (immediate, owner-
   initiated) or only after cancel? *(Recommendation: allow owner-initiated downgrade anytime it's
   explicitly confirmed; billing then reflects via portal/cancel.)*
8. **CS-BD-4 (export) a prerequisite** for enabling downgrade in prod, or can downgrade ship with
   export "coming soon"? *(Recommendation: ship export before enabling destructive downgrade so
   users can save work first.)*

---

## 18. Acceptance criteria

**For this planning slice (met now):**
- [x] Docs-only plan **revised to the Deactivate-vs-Downgrade model**; stale cap-blocker wording
      corrected (no remaining "folders/members block downgrade", "usage ≤ Team caps", "over_cap" as
      a live gate — only as superseded/preview references).
- [x] Every current-state claim cited to a file read this session.
- [x] ≥2 alternatives evaluated per sub-decision (folder wipe, deactivate state); clear
      recommendations; nothing pushed.

**For the implementation slices to later meet:**
- [ ] Downgrade keeps the same `account_id`, retains the owner, removes only non-owner members **via
      the existing offboarding seam**, flattens folders to Trash, **keeps all workflows** (no delete,
      no personal transfer), and flips type/plan atomically + resumably.
- [ ] The webhook **never** auto-runs the destructive downgrade; cancel defaults to preserve.
- [ ] No member/folder/workflow/integration/API-key/run is **hard-deleted** by downgrade.
- [ ] A credential-free export is available (CS-BD-4) before destructive confirm; export never
      leaks tokens/labels/secrets/grants.
- [ ] `ENABLE_BUSINESS_DOWNGRADE` default OFF; `ENABLE_PLATFORM_BILLING` default OFF.

---

## 19. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, schema, env, or Stripe change.
- No flag created or flipped (`ENABLE_BUSINESS_DOWNGRADE` is a *recommendation*).
- `ENABLE_PLATFORM_BILLING` left default OFF.
- No git push. Docs-only local commit.

---

## 20. Verification performed for this plan

- `npm run lint:structure` → **OK** (run this session).
- Grepped the downgrade doc for stale wording ("folders block downgrade", "member count blocks
  downgrade", "usage ≤ Team caps", "over_cap"): the only remaining occurrences are the **explicit
  supersession notes** (§2) and the demoted-to-preview references — no live cap-blocker model remains.
- Confirmed via code inspection that **export/import is net-new**, **`removeMember` is the canonical
  offboarding seam**, **folders support soft-delete + 7-day Trash**, and the **only freeze state is
  `pending_deletion` (purging)** — a non-purging Deactivate state is net-new.
- **Full `npx jest` NOT run** — docs-only, zero source changes; inherited baseline from CS-PRO-2
  (`8ebaa44d1`). Not re-measured here.

---

## 21. Recommended next step

Get Marcus's call on **§17.1 (Deactivate state model)** and **§17.2 (webhook defaults to preserve)**,
then implement **CS-BD-1** — the `downgradeBusinessToTeam` orchestration (reusing `removeMember` +
folder Trash) plus the atomic `apply_business_downgrade` flip RPC. Ship **CS-BD-4 (export)** before
enabling destructive downgrade in production so users can save their work first.

**Doc path:** `docs/slices/phase-4/account-settings/business-downgrade-plan.md`.
**Docs-only. Nothing pushed.**
