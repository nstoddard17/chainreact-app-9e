# 4.PLATFORM-BILLING-BUSINESS-DOWNGRADE-1 — Business → Team Downgrade / Cancel Handling Plan

**Type:** Planning / design only. **No source, migrations, tests, UI, env, Stripe, or
behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-07
**Branch:** `builder-ui-v1-audit-1`

**Source of truth (verified current state — each file read this session):**
[core/billing/planPolicy.ts](../../../../core/billing/planPolicy.ts) (tiers/caps; `defaultPlanForAccountType`; `ALLOWED_PLANS_BY_TYPE`) ·
[core/billing/downgradeRules.ts](../../../../core/billing/downgradeRules.ts) (`evaluateDowngrade` — members + folders, strict-over only) ·
[services/billing/downgradePreview.ts](../../../../services/billing/downgradePreview.ts) (`previewDowngrade` — counts members + live folders) ·
[services/billing/stripeBillingWebhook.ts](../../../../services/billing/stripeBillingWebhook.ts) (`subscription.deleted` branch — personal-only revert) ·
[repositories/accountBilling.ts](../../../../repositories/accountBilling.ts) (`applyBusinessUpgradeServiceRole`, `applyBillingSubscriptionSyncServiceRole`, `BillingSubscriptionSync`) ·
[supabase/migrations/20260614000000_apply_business_upgrade.sql](../../../../supabase/migrations/20260614000000_apply_business_upgrade.sql) (the atomic upgrade RPC — template for the downgrade RPC) ·
[services/accounts/memberLimits.ts](../../../../services/accounts/memberLimits.ts) + [services/workflowFolders/folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts) (caps keyed off `account.type`) ·
[services/accounts/invitations.ts](../../../../services/accounts/invitations.ts) + [services/workflowFolders/folderService.ts](../../../../services/workflowFolders/folderService.ts) (member/folder creation gates) ·
[features/account/BillingSection.tsx](../../../../features/account/BillingSection.tsx) (billing UI host) ·
docs: [platform-billing-remaining-work-audit.md](./platform-billing-remaining-work-audit.md) (§5.B) · [billing-plan-metadata-closeout.md](./billing-plan-metadata-closeout.md) · [business-upgrade-plan.md](./business-upgrade-plan.md) · [platform-billing-go-live-checklist.md](./platform-billing-go-live-checklist.md).

**Arc commits referenced:** Business upgrade BU-1…BU-4 (`cd849a9d7`…`7a888a155`) · Pro value CS-PRO-1/2 (`03f4ef3b8`, `8ebaa44d1`).

> **Decision plan, not implementation.** Every "today it works like X" traces to a file read
> this session; every "we should do Y" is a labeled recommendation. This doc changes nothing.

---

## 1. Context

Team → Business upgrade is complete end-to-end (BU-1…BU-4): an atomic RPC flips
`accounts.type` team→organization + `account_billing.plan`→business. The reverse —
**Business → Team downgrade and Business cancellation** — is the strongest remaining
product-completeness gap (remaining-work audit §5.B). Today a canceled Business account
keeps Business caps (25 members / 250 folders) indefinitely without paying — a revenue/
correctness leak (audit Risk R3). Platform billing is still dark behind
`ENABLE_PLATFORM_BILLING` (default OFF), so this can be designed and built before any real
users are affected.

---

## 2. Current codebase findings (verified)

**F1 — Business cancel does NOT revert type/plan.** The webhook `customer.subscription.deleted`
branch sets `plan_status='canceled'` and reverts **only personal** accounts to Free; for
`team`/`organization` it leaves plan + type untouched (verified
[stripeBillingWebhook.ts:192-205](../../../../services/billing/stripeBillingWebhook.ts) — the
`if (account.type === "personal")` guard). So a canceled Business stays `type=organization`,
`plan=business`, `plan_status=canceled`.

**F2 — Caps are derived from `account.type`, not plan or status.** `memberLimitFor(type)` and
`folderLimitFor(type)` resolve via `planLimitsFor(defaultPlanForAccountType(type))`
([memberLimits.ts](../../../../services/accounts/memberLimits.ts),
[folderLimits.ts](../../../../services/workflowFolders/folderLimits.ts)). An `organization`
account → Business caps **25 / 250 regardless of `plan_status`**. So a canceled Business keeps
full Business caps (the leak). Dropping caps to Team (5 / 100) requires flipping `type`→`team`.

**F3 — A safe downgrade gate already exists, members + folders only.** `evaluateDowngrade(usage,
targetPlan)` ([downgradeRules.ts:35-50](../../../../core/billing/downgradeRules.ts)) blocks only
when `memberCount` or `folderCount` is **strictly over** the target cap (equality is allowed; it
does NOT check tasks). `previewDowngrade(accountId, 'team')`
([downgradePreview.ts](../../../../services/billing/downgradePreview.ts)) gathers the live counts
(`listMembers` length + `listByAccount` live folders) and runs it. **No downgrade flow consumes
this yet** — it is preview-only.

**F4 — The upgrade RPC is the exact template for an atomic downgrade.** `apply_business_upgrade`
([migration](../../../../supabase/migrations/20260614000000_apply_business_upgrade.sql)) is
`SECURITY DEFINER`, `search_path=public`, **service-role-only** (REVOKE public/anon/authenticated),
locks the account `FOR UPDATE`, re-validates (exists / not frozen / currently `team`), flips
`type` + `account_billing` in one transaction, and is idempotent (`already_upgraded` no-op). It
takes `tasks_limit` from the caller so the number stays authoritative in TS, never SQL.

**F5 — Creation gates exist where a "block while canceled" guard would live.** Member adds route
through [invitations.ts](../../../../services/accounts/invitations.ts) and folder creation through
[folderService.ts](../../../../services/workflowFolders/folderService.ts), both consulting the
type-keyed cap helpers (F2). These are the only two seams that would need touching IF we choose to
block new resources on a canceled account.

**F6 — `BillingSubscriptionSync` cannot flip `accounts.type`.** `applyBillingSubscriptionSyncServiceRole`
writes only `account_billing` columns ([accountBilling.ts:75-101](../../../../repositories/accountBilling.ts)).
A type revert MUST go through an RPC that touches both tables atomically (like F4), never the sync
helper — otherwise the system can observe the half-applied `type=organization, plan=team` state
that the upgrade RPC's comment explicitly warns mis-sizes caps.

**F7 — Team-tier pricing shape is ambiguous (open decision).** `defaultPlanForAccountType('team')='team'`
and `STRIPE_PRICE_TEAM` exists, but whether a team-shaped account is a **paid Team subscription**
or a **free baseline for the team shape** is not settled in code I read. This determines whether
Business→Team means "cancel the Business subscription → revert to a free Team baseline" vs "switch
the Stripe subscription to the Team price." See §15.

---

## 3. Product problem

When a Business customer stops paying (cancels in the Stripe Portal) or asks to downgrade, the
account must drop to Team caps **without** silently deleting anything and **without** leaving a
free-Business leak. The hard case is **over-cap**: a Business account with >5 members or >100
folders cannot safely become Team (its data would exceed Team limits). Constraints from the ask:
no auto-destructive changes; no per-seat billing; keep `past_due` warn-only; prefer reusing
`evaluateDowngrade('team')`; prefer an atomic RPC; don't delete members/folders/workflows/
integrations/API keys/runs.

---

## 4. Options considered

| Option | What it is | Closes leak? | Destructive? | New enforcement | Verdict |
|---|---|---|---|---|---|
| **A. Manual handling only at launch** | Support/dashboard handles every Business cancel; no auto-revert | No (until support acts) | No | None | Acceptable *fallback*; doesn't scale, leak persists |
| **B. Auto-revert on cancel when under Team caps; blocked + action-needed otherwise** | Webhook reverts type→team via atomic RPC iff usage ≤ Team caps; over-cap stays Business+canceled with an action-needed state + self-service completion | Yes for compliant; bounded for over-cap | No | Small (RPC + optional creation guard) | **RECOMMENDED** |
| **C. Always keep canceled Business as Business until manual support** | Never auto-revert | No | No | None | Reject — institutionalizes the leak |
| **D. Force downgrade by removing/blocking excess resources** | Auto-delete or hard-block to fit Team | Yes | **Yes** | Large | **Reject** — destructive, violates "no auto-delete" |

---

## 5. Recommended launch decision

**Adopt Option B**, shipped behind a new `ENABLE_BUSINESS_DOWNGRADE` flag (default OFF; only
meaningful when `ENABLE_PLATFORM_BILLING` is also on), consistent with the platform's dark-launch
discipline:

1. **Atomic revert primitive** — a new service-role `apply_business_downgrade` RPC (mirror of
   F4) that flips `organization`→`team` + `plan`→`team` + `tasks_limit`=Team policy in one
   transaction, **re-counting members + live folders under the row lock** and refusing
   (`reason: 'over_cap'`) if either exceeds the Team cap. Idempotent (no-op if already `team`).
2. **Webhook decides at cancel time** — extend the `subscription.deleted` branch: for an
   `organization` account, always set `plan_status='canceled'` (today's behavior), and **if** the
   atomic RPC reports usage ≤ Team caps, also revert to Team. Over-cap → stays Business+canceled
   (no revert), which is the action-needed state.
3. **Self-service in Account Settings** — for an owner/admin on an `organization` account (flag
   ON): a "Downgrade to Team" affordance driven by `previewDowngrade('team')`. Under caps → guide
   the user to the Stripe Portal to cancel (the webhook then reverts), or "Complete downgrade" for
   an **already-canceled** over-cap account that has since reduced usage (calls the RPC directly —
   safe, the subscription is already gone). Over caps → show the exact blockers ("Members 8 / 5",
   "Folders 140 / 100") and disable completion until reduced.
4. **No auto-deletion, ever.** Over-cap accounts keep their data; the user reduces members/folders
   to finish the downgrade. `past_due` stays warn-only (unchanged).

---

## 6. Downgrade / cancel model

```
Business (organization, plan=business)
        │  cancel in Stripe Portal  → subscription.deleted (verified webhook)
        ▼
  set plan_status='canceled'           ← always (today's behavior, kept)
        │
        ├─ usage ≤ Team caps ─► apply_business_downgrade RPC (atomic):
        │                         type→team, plan→team, tasks_limit→Team policy   ✅ caps drop to 5/100
        │
        └─ usage  > Team caps ─► NO revert. Stays organization+canceled = "action needed":
                                  • lifecycle banner already warns "Canceled" (CS-5)
                                  • Account Settings shows blockers + "reduce to finish"
                                  • once reduced, "Complete downgrade to Team" → RPC succeeds
```

- **Timing:** the revert happens at `subscription.deleted` (not period-end). Stripe's
  `cancel_at_period_end` keeps the subscription active until period end; the deletion event fires
  when it actually ends, which is the correct moment to drop caps. (No separate "downgrade pending"
  column needed — see §8.)
- **Self-service vs portal:** the actual *billing* cancel goes through the Stripe Portal
  (`ManageBillingButton`, already shipped) — we do not build a bespoke cancel API. Our UI adds the
  **pre-cancel preview** and the **post-cancel completion** for the over-cap case.

---

## 7. Over-cap handling

- **Do NOT auto-revert** an over-cap account (would create Team-illegal data). Verified safe to
  detect via `evaluateDowngrade('team')` (F3).
- **State = derived, not stored:** "Business downgrade pending / action needed" = `type=organization`
  **AND** `plan_status='canceled'`. No new column (§8).
- **Show, don't delete:** Account Settings lists the exact over-cap blockers and asks the user to
  remove members/folders. Nothing is removed automatically.
- **The leak window:** an over-cap canceled account keeps Business caps until it reduces usage.
  Two mitigations, in order of preference:
  - **(Recommended, CS-BD-3) Minimal creation guard:** while `type=organization` AND
    `plan_status='canceled'`, block creating **new** members/folders beyond the **Team** caps at
    the two existing gates (F5). This stops the account *growing* on a canceled plan and nudges
    toward downgrade. It is the *only* new enforcement this plan adds — bounded to two call sites,
    flag-gated. **Open decision §15.3** (some teams may prefer warn-only).
  - **(Fallback) Warn-only:** rely on the CS-5 "Canceled" banner + the action-needed UI; accept the
    leak until the user reduces usage. Lower effort, weaker.
- **`canceled` does not block existing operation** (workflows keep running — past_due/canceled are
  warn-only by decision); the guard, if adopted, blocks only *new* member/folder creation.

---

## 8. Data / model changes needed

- **New migration:** `apply_business_downgrade` RPC (service-role-only, SECURITY DEFINER,
  `search_path=public`, REVOKE public/anon/authenticated, GRANT service_role) — mirrors F4.
  Applied via `npm run db:push` at implementation time.
- **No new column.** The "action needed / downgrade-pending" state is derivable from
  `(type, plan_status)`; adding a column would duplicate truth. (Open decision §15.4 if a future
  reporting need argues otherwise.)
- **No change to `account_billing` schema** — `plan`, `plan_status`, `tasks_limit` already exist.
- **No data migration / backfill** — billing is dark; there are no live Business accounts.

---

## 9. Atomicity / RPC recommendation

A **new `apply_business_downgrade(p_account_id, p_plan_status, …, p_tasks_limit)` RPC** modeled
exactly on `apply_business_upgrade` (F4):

- Locks the account `FOR UPDATE`; re-validates: exists, not frozen, currently `organization`
  (no-op `already_team` if `team`; reject `not_downgradeable` if `personal`).
- **Re-counts members + live folders under the lock** and returns `reason: 'over_cap'` (with the
  counts) if either exceeds the Team cap — making the eligibility check race-safe against a
  concurrent member-add (a service-layer-only check could be bypassed; the RPC's recount cannot).
- In one transaction: `accounts.type`→`team`, `account_billing.plan`→`team`,
  `plan_status`=passed value, `tasks_limit`=Team policy (caller-supplied, authoritative in TS).
- Idempotent + replay-safe (Stripe retries) via the `type='organization'` UPDATE guard.
- Returns `{ ok, applied, reason }` like the upgrade RPC; the webhook records the event regardless
  of an `over_cap`/no-op outcome (don't loop Stripe), throwing only on a real DB error so Stripe
  retries.

This guarantees the system never observes the half-applied `type=organization, plan=team` (or the
inverse) state the upgrade RPC comment warns about. **The sync helper (F6) must NOT be used for the
type flip.**

---

## 10. Stripe webhook behavior

- Extend the **`customer.subscription.deleted`** resolution for `organization` accounts: keep
  `plan_status='canceled'`; additionally attempt the downgrade RPC; on `over_cap`/no-op, fall back
  to the canceled-only sync (today's behavior). Personal revert (CS-PPT-1) and team behavior
  unchanged.
- **Invariants preserved:** signature-verified over the raw body (300s replay tolerance), deduped
  by event id, recorded **after** success, source-of-truth model (no route writes plan/type except
  the post-cancel "Complete downgrade" RPC call, which is itself a guarded service-role chokepoint).
- **Gating:** the auto-revert is wrapped in `ENABLE_BUSINESS_DOWNGRADE` (default OFF) so it can be
  rolled out independently; with it OFF the webhook keeps exactly today's canceled-only behavior.

---

## 11. Account Settings UI expectations

- For an owner/admin on an `organization` account (flag ON, not frozen), a **"Downgrade to Team"**
  affordance in `BillingSection` (sibling to the existing `BusinessUpgradePanel` / `ManageBillingButton`):
  - **Under Team caps:** explain Team caps (5 / 100) and route to the Stripe Portal to cancel
    Business (the webhook then reverts). Honest copy: the change completes after Stripe + webhook.
  - **Over Team caps:** show the exact blockers from `previewDowngrade('team')` ("Members 8 / 5",
    "Folders 140 / 100"), disable completion, and tell the user to reduce — nothing is deleted.
  - **Already canceled + now under caps:** a "Complete downgrade to Team" button → guarded route →
    `apply_business_downgrade` RPC (subscription already gone).
- Reuses the established no-leak posture: no Stripe id/secret rendered, owner/admin-gated server-side,
  generic typed errors. **No fake controls** — every button maps to a real backend path.

---

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Half-applied `type`/`plan` mismatch mis-sizes caps | Atomic RPC (§9); never use the sync helper for the type flip (F6) |
| R2 | Race: member/folder added between the eligibility check and the revert | RPC re-counts **under the row lock** and refuses `over_cap` (§9) |
| R3 | Revenue leak: over-cap canceled account keeps Business caps until it reduces | Auto-revert closes it for compliant accounts; CS-BD-3 creation guard stops further growth (§7) |
| R4 | Stripe Portal cancel can't be blocked by us for over-cap users | We don't block it — the webhook handles the outcome safely (stays Business+canceled) (§6) |
| R5 | Auto-revert behavior change shipped before tested | `ENABLE_BUSINESS_DOWNGRADE` default OFF; dark-launch + test mode first (§10) |
| R6 | Webhook loops Stripe on a permanent `over_cap` | Record the event on `over_cap`/no-op; throw only on real DB error (§9) |
| R7 | Team-pricing ambiguity (F7) makes "downgrade = cancel" wrong if Team is itself paid | Open decision §15.1; this plan models "cancel Business → Team baseline"; a price-switch variant is a deferred follow-up |

---

## 13. Implementation slice breakdown (future — not this slice)

- **CS-BD-1 — atomic downgrade primitive.** `apply_business_downgrade` migration + repo wrapper
  (`applyBusinessDowngradeServiceRole`, `tasks_limit` from `planLimitsFor('team')`). `db:push`.
  Tests: RPC reverts a compliant org→team atomically; refuses `over_cap` (with counts); no-op when
  already team; rejects personal/frozen; service-role-only EXECUTE (authenticated cannot).
- **CS-BD-2 — webhook auto-revert.** Extend `subscription.deleted` org branch behind
  `ENABLE_BUSINESS_DOWNGRADE`; under caps → RPC revert, else canceled-only. Tests: under-cap org →
  reverted; over-cap org → canceled, no revert, event recorded; flag OFF → today's behavior; team/
  personal unchanged.
- **CS-BD-3 — over-cap creation guard (decision §15.3).** Block new members/folders beyond Team
  caps while `type=organization` AND `plan_status='canceled'`, at the two gates (F5), flag-gated.
  Tests: blocked when canceled+org; allowed when active; team/personal unaffected.
- **CS-BD-4 — self-service UI + completion route.** "Downgrade to Team" / "Complete downgrade"
  affordances + the guarded post-cancel RPC route. Tests: preview blockers shown; completion only
  when under caps; owner/admin + flag gates; no Stripe id leak.
- **Deferred:** Team-as-paid price-switching (pending §15.1); past_due escalation; Enterprise.

---

## 14. Test plan (for the implementation slices)

- **RPC (CS-BD-1):** atomic org→team revert; `over_cap` refusal with member/folder counts; recount
  under lock (concurrency); idempotent no-op; personal/frozen rejection; **service-role-only EXECUTE**
  (authenticated/anon cannot) — mirror the `apply_business_upgrade` test suite.
- **Webhook (CS-BD-2):** signature/dedup unchanged; under-cap org `subscription.deleted` → revert;
  over-cap → canceled only + recorded; `ENABLE_BUSINESS_DOWNGRADE` OFF → no revert; personal revert
  + team behavior unchanged.
- **Guard (CS-BD-3):** new member/folder blocked on canceled org; allowed on active org/team/personal.
- **UI (CS-BD-4):** blockers rendered from `previewDowngrade('team')`; completion gated; no Stripe id
  in DOM; existing billing UI suites stay green.
- **Existing suites stay green:** `apply_business_upgrade`, `stripeBillingWebhook`, `downgradeRules`,
  `downgradePreview`, BillingSection.

---

## 15. Open decisions for Marcus

1. **Team pricing shape (F7):** is Team a **paid** subscription or the **free baseline** for a
   team-shaped account? If paid, Business→Team is a *price switch*, not a cancel — needs a variant.
   *(Recommendation: model launch as "cancel Business → Team baseline"; defer price-switching.)*
2. **Launch posture (§4/§5):** confirm **Option B** (auto-revert under caps + action-needed
   over-cap) behind `ENABLE_BUSINESS_DOWNGRADE` (default OFF). *(Recommended.)* Or accept **Option A**
   (manual-only) for the very first launch and ship B right after.
3. **Over-cap creation guard (CS-BD-3, §7):** block new members/folders on a canceled over-cap
   account, or warn-only? *(Recommendation: build the minimal guard — it's the only durable fix for
   the leak's growth, bounded to two seams.)*
4. **Downgrade-pending column:** derive the state from `(type, plan_status)` (recommended) or add an
   explicit column for reporting? *(Recommendation: derive; no column.)*
5. **Immediate vs period-end self-service downgrade:** for an *active* (not-yet-canceled) Business
   wanting to downgrade, do we only support portal-cancel (→ period-end), or also an immediate
   in-app downgrade? *(Recommendation: portal-cancel only at launch; no bespoke cancel API.)*

---

## 16. Acceptance criteria

**For this planning slice (met now):**
- [x] Docs-only plan created; no source/migration/test/UI/env/Stripe change.
- [x] Every current-state claim cited to a file read this session (F1–F7).
- [x] ≥3 options evaluated (A–D) with a clear recommendation; nothing pushed.

**For the implementation slices to later meet:**
- [ ] CS-BD-1: atomic, service-role-only `apply_business_downgrade` that refuses `over_cap` under a lock.
- [ ] CS-BD-2: webhook auto-reverts only when under Team caps; over-cap stays Business+canceled; flag-gated.
- [ ] No member/folder/workflow/integration/API-key/run is ever auto-deleted.
- [ ] Caps correctly drop to Team (5 / 100) only after a successful atomic revert.
- [ ] `past_due` remains warn-only; Team/Business *upgrade* and personal revert behavior unchanged.
- [ ] `ENABLE_BUSINESS_DOWNGRADE` default OFF; `ENABLE_PLATFORM_BILLING` default OFF.

---

## 17. Hard boundaries (what this slice did NOT do)

- No source, migration, test, UI, schema, env, or Stripe change.
- No flag created or flipped (`ENABLE_BUSINESS_DOWNGRADE` is a *recommendation*).
- `ENABLE_PLATFORM_BILLING` left default OFF.
- No git push. Docs-only local commit.

---

## 18. Verification performed for this plan

- `npm run lint:structure` → **OK** (run this session).
- Confirmed **no existing Business→Team downgrade flow** (grep — only the deferral notes in the
  closeout / business-upgrade plan and the preview-only `evaluateDowngrade`/`previewDowngrade`).
- **Full `npx jest` NOT run** — docs-only, zero source changes; inherited baseline from the latest
  billing slices (CS-PRO-2 `8ebaa44d1`). Not re-measured here.

---

## 19. Recommended next step

Get Marcus's call on **§15.1 (Team pricing shape)** and **§15.2 (Option B)**, then implement
**CS-BD-1** (the atomic `apply_business_downgrade` RPC) — the smallest, highest-leverage primitive;
everything else (webhook revert, guard, UI) builds on it.

**Doc path:** `docs/slices/phase-4/account-settings/business-downgrade-plan.md`.
**Docs-only. Nothing pushed.**
