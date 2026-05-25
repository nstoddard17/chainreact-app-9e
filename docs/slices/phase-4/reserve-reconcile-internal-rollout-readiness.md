# Reserve/Reconcile — Internal Rollout Readiness Plan (Slice 4.COST-15G)

**Status:** planning / readiness only. **No code, no migration, no live-billing change ships in this slice.**

> **⚠️ Superseding decision (2026-05-25) — §7 allowlist is REJECTED.** ChainReactV2 is pre-launch with no external/public users, so an internal-user allowlist is unnecessary complexity. Live reserve/reconcile is gated by the **global flag `ENABLE_RESERVE_RECONCILE_BILLING` alone** (no `RESERVE_RECONCILE_INTERNAL_USER_IDS`, no public-vs-internal branching). **§7 (allowlist) is obsolete**; ignore it. The engine integration landed in **COST-15H** behind the global flag. Everything else in this doc — shadow-data thresholds (§4–6), ops/sweep plan (§9), observability (§10), rollback (§11), risks (§12) — **still stands** and gates flipping the flag in production.

**Purpose.** Define what must be true before enabling **live** reserve/reconcile billing (now: flip the global flag; verify on dev in COST-15I). This is the checklist + design the implementer works against. Live billing stays flat 1/run until Marcus approves the gates below.

Cross-refs: [reserve-reconcile-billing-design.md](./reserve-reconcile-billing-design.md) (COST-11 model + COST-12..15F status) · [pre-run-workflow-run-lifecycle-design.md](./pre-run-workflow-run-lifecycle-design.md) (COST-15A/B/C/F).

---

## 1. Current status

| Capability | State |
|---|---|
| Flat billing (`deduct_tasks_if_available`, 1/run) | **LIVE + authoritative** |
| Test/dry-run billing skip (COST-2A) | Works (`executionBillingGate({testMode:true})` → no deduct) |
| Reserve/reconcile DB + RPCs (COST-12) | Exist; passed real-DB harness (COST-12C, 64/64) |
| Reserve/reconcile service layer (COST-13) | Exists behind `ENABLE_RESERVE_RECONCILE_BILLING`; **engine not wired** |
| Shadow mode (COST-14) | Exists behind `ENABLE_RESERVE_RECONCILE_SHADOW` (default off) |
| Persisted shadow ledger `billing_shadow_comparisons` (COST-14C) | Exists; applied to dev DB (COST-14D) |
| Dev shadow collection harness (COST-14E) | Works; produced 8 **synthetic** rows; aggregator verified |
| Pre-run `workflow_runs` lifecycle (COST-15A/B/C) | Engine creates-at-start + finalize-update in **flat mode** |
| Stale-running-run sweep (COST-15F) | Service + guarded script exist; dev-DB verified; **not scheduled** |
| **Live reserve/reconcile** | **NOT enabled** (`ENABLE_RESERVE_RECONCILE_BILLING=false`, engine never calls reserve/reconcile RPCs) |

**Net:** every building block exists and is independently verified. What is missing for COST-15D is **organic shadow evidence**, an **allowlist mechanism**, **engine wiring gated by it**, and an **ops/rollback plan** — this doc.

---

## 2. What internal-user live reserve/reconcile means

- **Internal users** = owner / developer / test / explicitly **allowlisted** accounts only. Everyone else (external/public) **stays on flat billing**, unchanged.
- **Live reserve/reconcile** for an allowlisted user means their real runs go through: **estimate → reserve → execute → reconcile actual → release unused reserve**, mutating that user's **real task balance** (`tasks_used` / `tasks_reserved`).
- It is a **real balance effect** for those users — the first time reserve/reconcile touches money. That is why it is gated on the evidence + safety below.
- It is **per-user**, not global: the global flag must be ON **and** the user must be allowlisted (§7). Either alone keeps the run flat-billed.

---

## 3. Remaining prerequisites before COST-15D

Hard gates (all must hold):
1. **Enough organic shadow data** (§4, §5) — real dev/internal runs, not synthetic harness rows.
2. **No unexpected shadow deltas** — no recurring workflow shape with a large unexplained positive delta (§6).
3. **No missing shadow rows** — every real non-test run with the shadow flag wrote exactly one comparison.
4. **No unexplained insufficient-balance results** — every `wouldHaveHadEnoughBalance=false` is attributable to a genuinely low-balance account.
5. **Pre-run row lifecycle stable** (COST-15C shipped) — create-at-start + finalize-update proven in flat mode.
6. **Stale-running sweep available** (COST-15F shipped) — and an execution cadence decided (§9).
7. **Expired-reservation sweep available** (`release_expired_reservations`, COST-12) — and a cadence decided (§9).
8. **Internal-user allowlist design** locked (§7) + tests proving non-allowlisted users stay flat (COST-15H).
9. **Rollback plan** (§11).
10. **Observability plan** (§10) — owner/admin can watch the live signals.
11. **Support/debug playbook** — how to read a stuck reservation, force-release, and reconcile a balance mismatch (§10/§11).

---

## 4. Organic shadow data collection plan

Goal: replace COST-14E's synthetic harness rows with **real** flat-vs-proposed data from actual dev/internal usage.

- **Environment:** dev/internal only. Set `ENABLE_RESERVE_RECONCILE_SHADOW=true`; keep **`ENABLE_RESERVE_RECONCILE_BILLING=false`**. Shadow never mutates a balance, so this is safe to leave on continuously in dev.
- **Method:** exercise real (non-test) runs over time — manual Run-now, webhook-triggered, and scheduled where applicable. The engine writes one `billing_shadow_comparisons` row per real run (COST-14C, fail-open).
- **Workflow shapes to cover:** one-action; multi-action (3+); branching (router / if_then_condition — exercises `BRANCHING_UPPER_BOUND`); `native:http_request` (billable native, if safe); partial-failure (succeeds then fails mid-run); filter/router heavy; and across manual / webhook / scheduled triggers (exercises `EVENT_VOLUME_UNKNOWN` / `SCHEDULE_ESTIMATE_UNAVAILABLE`).
- **Review:** `getReserveReconcileShadowStats({from,to})` (canonical TS aggregator) and `npm run review:shadow-comparisons` (ops CLI). Look at totalDelta, estimate-vs-actual variance, refund totals, insufficient-balance count, warning breakdown, and the top positive/negative-delta workflows.
- **Cadence:** collect for a defined window (e.g. ≥ 1–2 weeks of real dev/internal usage, or until the sample size in §5 is met), then review before proposing COST-15D.

---

## 5. Suggested minimum sample size

Practical floor before internal-user live mode:
- **≥ 50–100 shadow comparison rows** from real (non-test) runs.
- **Multiple workflow shapes** (≥ 5 distinct), including **several branching/filter** cases and **several failure** cases.
- **Multiple users/accounts** if available (even 2–3 internal accounts).
- **100% row coverage** — no real non-test run missing its shadow row.
- **0 unexplained shadow persistence failures** (`execution.run.billing_shadow_persist_failed`).

**If the dev app cannot generate this yet:** a smaller window (e.g. 20–30 rows across ≥ 3 shapes) MAY be accepted as a **weaker** evidence base, explicitly labeled as such, with internal rollout limited to **owner-only** and a shorter soak. Do not present a thin sample as strong evidence (honesty gate).

---

## 6. Shadow metric acceptance criteria

"Safe enough for internal-user live" means:
- **Coverage:** 100% of real non-test runs with the shadow flag produce **exactly one** comparison row.
- **No balance effect:** 0 balance mutations from the shadow path; 0 reserve/reconcile RPC calls in shadow mode (engine never calls them when only the shadow flag is on — already true).
- **Delta math internally consistent** (per row): `proposedReconciledTasks == actualBillableTasks`; `deltaVsFlat == proposedReconciledTasks − flatChargedTasks`; `proposedRefundedTasks == estimatedTasksPerRun − actualBillableTasks` when `estimate > actual` (else 0). (COST-14E showed this holds on synthetic data; re-confirm on organic.)
- **No `proposed > estimate`** — reconcile clamps to the reserve (`min(actual, reserved)`); any such row is a bug to investigate before live.
- **Insufficient-balance results explainable** — each `wouldHaveHadEnoughBalance=false` maps to a genuinely low-balance account, not an estimate defect.
- **Warning rates understood** — known/acceptable distribution of `BRANCHING_UPPER_BOUND`, `EVENT_VOLUME_UNKNOWN`, `UNKNOWN_NODE_TYPE`, `SCHEDULE_ESTIMATE_UNAVAILABLE`. A high `UNKNOWN_NODE_TYPE` rate is a red flag (ungrounded nodes → unbillable → estimate gaps) and blocks live until explained.
- **No secret/payload leakage** — comparisons carry only ids/counts/enums/warning **codes** (COST-14C redaction; re-assert on organic).
- **No recurring large positive delta** — no workflow shape routinely showing proposed ≫ flat without a clear (multi-action) explanation.

---

## 7. Internal-user allowlist design

| Option | Summary | Verdict |
|---|---|---|
| **A — env list of user IDs** (`RESERVE_RECONCILE_INTERNAL_USER_IDS`) | Comma-separated UUIDs read at call time. | **Recommended for first internal rollout** — zero schema, instant on/off per user, trivially auditable, removable in one deploy/env edit. |
| B — DB column on the account/profile | e.g. `user_profiles.reserve_reconcile_internal boolean`. | **Next step** once the cohort grows or needs self-serve toggling; migration + admin tooling. Defer past first rollout. |
| C — config table | A dedicated allowlist table. | Overkill now; revisit only if multiple billing cohorts emerge. |
| D — feature-flag provider | External flag service. | Out of scope; no provider in V2 today. |

**Recommendation: env allowlist (Option A) first → DB column (Option B) later.**

- **Why not a global flag only:** a single global `ENABLE_RESERVE_RECONCILE_BILLING` would flip **every** user to live reserve/reconcile — including public users — the moment it's on. The allowlist makes "on" mean "on for these specific accounts," so a mistaken/early flip cannot bill the public.
- **Avoiding accidental public enablement:** require **both** `ENABLE_RESERVE_RECONCILE_BILLING=true` **and** membership in the allowlist; default the allowlist to empty; treat an empty/unset allowlist as "no one" (never "everyone"). Production must never carry a non-empty allowlist of real customer ids.
- **Tests must prove (COST-15H):** flag-off → flat for everyone; flag-on + non-allowlisted user → flat (no reserve RPC); flag-on + allowlisted user → reserve/reconcile path; empty allowlist → flat for everyone; test mode → always skip regardless.

---

## 8. Required engine behavior for COST-15D (design only — do not implement)

Decision point at execution start (after `createWorkflowRunStart`, replacing the flat-only gate branch):

```
if (testMode)                          → skip billing (COST-2A), execute
else if (!ENABLE_RESERVE_RECONCILE_BILLING)        → FLAT gate (today)
else if (!isReserveReconcileInternalUser(userId))  → FLAT gate (today)
else  // flag on AND allowlisted:
    estimate = estimateWorkflowTaskCost(def)
    reserve  = createBillingReservation({ userId, runId, amount: estimate })   // COST-13 service
    if (!reserve.ok) → BILLING_EXHAUSTED, markWorkflowRunFailedBeforeExecution, return  // BEFORE side effects
    execute nodes (within the hold)
    usage = computeRunTaskUsage(def, steps)
    reconcileBillingReservation({ userId, runId, actual: usage.actualTaskCost })  // charge min(actual,reserved), refund rest
    // on fatal/cancel before/at execution, or crash: releaseBillingReservation (or expiry sweep)
```

- **The reservation IS the run row** — `createWorkflowRunStart` already runs before billing (COST-15C), so `reserve_tasks_if_available` finds the row (no `run_not_found`).
- **Fail-closed reserve:** no hold → do **not** execute billable side effects → surface `BILLING_EXHAUSTED`.
- **Reconcile on success/partial** (charge the succeeded portion); **release on fatal/cancel**; **expiry sweep** is the crash backstop.
- **Shadow** may continue recording comparisons for allowlisted live users (flat-vs-actual becomes live-vs-actual context) — optional, decide at implementation.
- **All other modes unchanged:** flat path is byte-for-byte today's behavior; the COST-13 service already returns `skip("disabled")` when the flag is off, so wiring is additive + reversible.

---

## 9. Ops / sweep requirements

Two **independent** sweeps must be runnable (and eventually scheduled):
- **Stale-running-run sweep** (COST-15F): `staleWorkflowRunSweep` service / `npm run sweep:stale-runs` (guarded). Finalizes runs left `running` by a crash. **Lifecycle only — no billing.**
- **Expired-reservation sweep** (COST-12): `release_expired_reservations` RPC / `releaseExpiredBillingReservations` service. Reclaims `reserved` holds past `reservation_expires_at`. **Billing-hold cleanup.**

**For internal rollout:** manual/on-demand execution of both is acceptable **if documented and actually run** during the soak (e.g. operator runs them each work-day, and after any deploy/restart). **For production rollout:** both MUST be scheduled (cron/route) — non-negotiable.

**Recommended cadence (when scheduled):** stale-running sweep every **10 min**; expired-reservation sweep every **10 min** (≤ the reservation TTL so a crashed hold is reclaimed within one TTL). Set `reservation_expires_at` to a value comfortably above the longest expected run (e.g. 30–60 min) so the sweep never reclaims a live run. Revisit numbers against observed run durations.

---

## 10. Observability / readiness checks

Watch before and during internal live mode (owner/admin):
- **Reserved tasks stuck** — `workflow_runs` rows `billing_status='reserved'` older than the TTL (should be ~0 after the sweep).
- **Reconciled vs reserved** — distribution of `reconciled_task_cost` vs `reserved_task_cost` (estimate accuracy; large gaps ⇒ over-estimation).
- **Release/refund counts** — releases (fatal/cancel) + refunds (reserve − reconcile).
- **`BILLING_EXHAUSTED`** rate for allowlisted users (reservation refusals).
- **`reconcile_over_reserve`** occurrences (should be 0 in v1; a defended diagnostic).
- **Stale running runs** swept (COST-15F output) and **expired reservations released** (sweep output).
- **Task-balance mismatches** — `tasks_used + tasks_reserved` vs ledger sums (COST-11 §parity-style check).
- **Shadow vs live divergence** — for allowlisted users, compare what shadow would have said to what reconcile actually charged.
- **Failed reserve/reconcile service calls** — error logs from the COST-13 service.

Use existing COST-7 owner analytics + the shadow aggregator where possible. **Gap to document:** there is no live reserve/reconcile dashboard yet (shadow analytics exist; a live `billingMode`-segmented view is a COST-15J/owner-analytics follow-up). Until then, rely on direct queries + sweep output + structured logs.

---

## 11. Rollback plan

- **Instant disable:** set `ENABLE_RESERVE_RECONCILE_BILLING=false` (or empty the allowlist). The COST-13 service returns `skip("disabled")`; the engine reverts to the flat gate immediately. `deduct_tasks_if_available` is never removed (COST-17 only), so flat is always the fallback.
- **Leave shadow on** if desired (still non-mutating) to keep collecting comparison data.
- **Drain stuck reservations:** run `release_expired_reservations` (or a targeted manual `release_task_reservation(userId, runId)`) so no allowlisted user is left with `tasks_reserved` held.
- **Keep all ledger/audit + reserve/reconcile rows** for debugging — do **not** delete historical `workflow_runs` billing fields or `task_usage_events`. Rollback is reversible state, not data destruction.
- **Reconcile balances** if needed: any user whose `tasks_reserved` is non-zero after disable gets it released; verify `tasks_used` matches the ledger.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| **Overbilling** | Reconcile charges `min(actual, reserved)` + refunds the rest; shadow evidence before live; allowlist limits blast radius. |
| **Underbilling** | Reserve = estimator upper bound; actual ≤ reserved; `UNKNOWN_NODE_TYPE` watch + min-balance guard for ungrounded nodes. |
| **Stranded reservations** | `reservation_expires_at` + `release_expired_reservations` sweep (scheduled for prod, run during internal soak). |
| **Duplicate reconcile** | RPC idempotent on `billing_status` (second call returns stored result). |
| **Engine crash mid-run** | Stale-running sweep finalizes the run row (COST-15F); expiry sweep reclaims the hold. |
| **Allowlist misconfiguration** | Empty allowlist = no one; both flag AND membership required; COST-15H tests assert non-allowlisted stay flat. |
| **Wrong env in production** | Production allowlist must be empty/internal-only; gate flip is a reviewed change; default-off everywhere. |
| **Insufficient organic data** | §5 minimum + honesty gate (thin sample → owner-only, labeled weaker). |
| **Shadow/live mismatch** | Compare reconcile output to shadow projection per allowlisted user; investigate before widening. |
| **User confusion** | Internal users only; UI keeps simple task language; invisible refunds (COST-11 §13). |

---

## 13. Recommended next slices

- **COST-15G** — this readiness plan (doc only).
- **COST-15H** — internal allowlist helper (`isReserveReconcileInternalUser`, env `RESERVE_RECONCILE_INTERNAL_USER_IDS`) + service-gating tests (flag/allowlist/test-mode matrix). **No engine wiring.**
- **COST-15I** — engine live reserve/reconcile for **allowlisted users only**, behind flag + allowlist (the §8 design). Flat remains default + fallback.
- **COST-15J** — internal live verification: owner-analytics/queries for reserved/reconciled/released + balance parity; soak review.
- **COST-15K** — schedule the stale-running + expired-reservation sweeps (cron/route) — required before any broader rollout.
- **COST-16** — production rollout plan (global cutover), only after internal soak + COST-15J/K.

(Affirmed; matches the prompt's proposed order. COST-15K may run in parallel with 15I/J since the sweeps are independent of the engine wiring.)

---

## 14. Acceptance criteria

This readiness doc is acceptable because it:
- **Keeps live billing unchanged** — no code/migration/flag change ships here.
- **Defines internal vs external users** (§2) and a concrete **allowlist strategy** (§7, env-first).
- **Defines required shadow data before live** (§4 plan, §5 sample size, §6 acceptance metrics).
- **Defines acceptance metrics** for "safe enough" (§6).
- **Defines rollback** (§11) and **ops/sweep requirements + cadence** (§9).
- **Defines observability** + the current gap (§10).
- **Keeps AI / templates / custom nodes out of scope** but future-compatible (the estimator/reserve path is shape-agnostic per COST-11 §15).

**This document changes nothing at runtime.** It is the gate COST-15H/I/J/K execute against; COST-15D (internal live) does not begin until §3's prerequisites are met and Marcus approves.
