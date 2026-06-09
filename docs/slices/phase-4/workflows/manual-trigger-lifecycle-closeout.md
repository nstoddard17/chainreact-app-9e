# 4.MANUAL-TRIGGER-LIFECYCLE-CLOSEOUT — Manual-Trigger Workflow Lifecycle Closeout

**Type:** Closeout / handoff. **Docs-only. No source, migration, test, or UI changes in this
slice. Nothing pushed.**
**Date:** 2026-06-08
**Branch:** `builder-ui-v1-audit-1`

**Scope of this arc:** make the lifecycle treat the native `manual.run` trigger correctly and
consistently — distinguish *manual* from *activatable* triggers; deactivate an active workflow only
when an **activatable** trigger registration goes stale on save; give external→manual edits honest
copy; and stop writing inert `trigger_resources` rows for manual triggers. Folds in the earlier
in-builder Reactivate→Resume recovery and template-replace deactivation work that the manual-trigger
behavior depends on.

**Consolidates (previously scattered):**
[active-edit-stale-trigger-audit.md](./active-edit-stale-trigger-audit.md) ·
[template-replace-lifecycle-audit.md](./template-replace-lifecycle-audit.md). The canonical rule
[workflow-lifecycle.md](../../../rules/workflow-lifecycle.md) is **Slice-1-era and predates this
arc** — see §7 / §9.

---

## 1. Summary

- **`9de70ef4b`** — stronger replace confirmation for active workflows (template replace is a
  trigger-changing operation).
- **`fc19cfd3b`** — active workflows deactivate on template replace (tears down stale registration).
- **`e1051f8c6`** — in-builder **Reactivate** action + disabled-reason banner.
- **`965141b47`** — dashboard "Open builder to reactivate" hint on disabled rows/cards.
- **`431dbb5a5`** — deactivate active workflows on a trigger-changing save (the active-edit /
  stale-trigger guard).
- **`c59c0281d`** — shared save-draft path (PATCH + AI-apply) + correct manual-trigger lifecycle:
  `manual.run` classified as `activation:"manual"` and **not** an activatable trigger; the prior
  false-deactivation on manual edits fixed.
- **`c8ceed32d`** — manual-specific disabled copy after an external→manual trigger edit.
- **`ec2031667`** — stop registering inert `manual.run` `trigger_resources` rows.

---

## 2. Completed commit chain

- `9de70ef4b` — feat(builder): stronger replace confirmation for active workflows (4.WORKFLOWS-BUILDER-TEMPLATES-ACTIVE-WARN-1) _(2026-06-08)_
- `fc19cfd3b` — feat(builder): deactivate active workflows on template replace (CS-XT-IN-BUILDER-ACTIVE-DISABLE) _(2026-06-08)_
- `e1051f8c6` — feat(builder): Reactivate action + disabled-reason banner for disabled workflows (CS-XT-IN-BUILDER-REACTIVATE) _(2026-06-08)_
- `965141b47` — feat(workflows): visible 'Open builder to reactivate' for disabled rows/cards (4.WORKFLOWS-DASHBOARD-DISABLED-RECOVERY-HINT) _(2026-06-08)_
- `431dbb5a5` — feat(workflows): deactivate active workflows on trigger-changing save (4.WORKFLOWS-ACTIVE-EDIT-STALE-TRIGGER) _(2026-06-08)_
- `c59c0281d` — refactor(workflows): shared save-draft path + correct manual-trigger lifecycle (4.WORKFLOWS-SHARED-SAVE-MANUAL-TRIGGER) _(2026-06-08)_
- `c8ceed32d` — fix(workflows): manual-specific disabled copy after external->manual trigger edit _(2026-06-08)_
- `ec2031667` — fix(triggers): stop registering inert manual.run trigger_resources rows _(2026-06-08)_

---

## 3. Current behavior

### Manual vs activatable triggers

The native manual trigger `native:manual.run` has meta `activation:"manual"`
([manualTrigger.meta.ts](../../../../integrations/native/triggers/manualTrigger.meta.ts)). It is
**not activatable**: it has no activation hook and no dispatch path — runs are kicked off only by
`POST /api/workflows/[id]/run-now`, which calls `enqueueRun` directly and **bypasses
`dispatchTriggerEvent` + the `trigger_resources` lookup entirely**
([run-now/route.ts](../../../../app/api/workflows/[id]/run-now/route.ts)). run-now is allowed for
state ∈ `{active, paused, draft}`.

The canonical classifier is `getTriggerMeta(`${provider}:${type}`)?.activation !== "manual"`.
It currently lives as a documented one-liner in **two** places:
[saveDraftDefinition.ts](../../../../services/workflows/saveDraftDefinition.ts) and
[lifecycle.ts](../../../../services/triggers/lifecycle.ts) (hoist deferred — §7).

### Save → deactivation (active-edit / stale-trigger guard)

[saveDraftDefinition.ts](../../../../services/workflows/saveDraftDefinition.ts) is the **shared**
save path used by both `PATCH /api/workflows/[id]` and AI-apply. After the write lands, it
deactivates (via the lifecycle orchestrator, reason `manual_admin`) **only when**
`previousState === "active"` **and** the set of *activatable* triggers changed
([triggerChange.ts](../../../../core/workflows/triggerChange.ts)).

| Edit on an `active` workflow | Deactivates? | Disabled context |
|---|---|---|
| Activatable trigger added / removed / id / provider / type / config change | **Yes** | "Trigger changed — reconnect and reactivate." |
| External → manual-only (`manual.run`) | **Yes** (tears down the stale external registration) | "The previous trigger was removed and its connection disconnected. This workflow now runs manually — nothing to reconnect." |
| `manual.run` ↔ `manual.run` config edit | **No** | — |
| Action / label / layout / edge-only edit | **No** | — |
| Null / stale (no-op) write | **No** | — |

Recovery is the existing **Reactivate → Resume** flow: Reactivate marks `eligible_to_resume`;
Resume re-registers triggers off the current draft and re-checks preconditions. Disabled workflows
surface the reason via the in-builder banner (`e1051f8c6`) and a dashboard "Open builder to
reactivate" hint (`965141b47`). Template replace on an active workflow is itself a trigger-changing
operation and deactivates the same way (`fc19cfd3b`, behind a stronger confirmation `9de70ef4b`).

### Trigger registration

[registerWorkflowTriggers](../../../../services/triggers/lifecycle.ts) now filters to **activatable
triggers only**, so `native:manual.run` registers nothing — no inert `trigger_resources` row is
written. Teardown (`unregisterWorkflowTriggers`) is unchanged and tolerant of the row's absence
(`deleteByWorkflow` is a no-op when no row exists). Non-manual triggers register exactly as before;
unknown trigger metadata is fail-safe **activatable**.

---

## 4. Security / no-leak guarantees

No change to the security posture this arc. Inherited invariants preserved:

- run-now authorization is **account-membership** based (a member may run a Team workflow while a
  different account is active); a non-member collapses to the same 404 as missing/deleted — no
  existence leak. `created_by_user_id` is provenance only, never consulted for authz.
- The destructive-action confirmation gate on real-mode run-now is unchanged.
- No tokens, credential labels, emails, or provider-account ids are surfaced by any copy added here
  (the manual disabled-copy string is generic and names no integration).

---

## 5. Data / RLS / model notes

- **No tables added or changed. No migration. RLS / GRANT posture unchanged.**
- Net data effect: `trigger_resources` now gains **one fewer inert row** per manual-only activation.
  `trigger_resources.account_id` continues to store the *provider* account id (Slice
  4.ACCOUNT-MODEL-6); V2 ownership is resolved via the `workflows.account_id` join in the read paths
  — neither is touched here.
- **Pre-existing inert `native:manual.run` rows are NOT backfilled/deleted** (see §7).

---

## 6. UI behavior

- External→manual edits on an active workflow now show honest disabled copy ("…now runs manually —
  nothing to reconnect.") instead of telling the user to reconnect an integration that does not
  exist. The shared banner still appends "Use **Reactivate** in the header when you're ready."
- Disabled workflows expose the reason (in-builder banner) and a one-click route back to the builder
  (dashboard hint). No new/fake lifecycle controls shipped; manual edits no longer falsely flip an
  active workflow to disabled.

---

## 7. Deferred / known limitations

- **No backfill** of pre-existing inert `native:manual.run` `trigger_resources` rows. They are
  harmless (never read by any dispatch / poll / receive / renewal path) and are cleaned up naturally
  on the next deactivate/delete. A migration was judged not worth the risk.
- **`isActivatableTrigger` duplicated** in `saveDraftDefinition.ts` and `lifecycle.ts` (documented,
  cross-referenced one-liner). Hoisting to a shared `core/workflows` helper is deferred —
  intentionally kept the blast radius small. Pick up only if a third copy appears or drift is
  observed.
- **Canonical rule is stale.** [workflow-lifecycle.md](../../../rules/workflow-lifecycle.md) is
  Slice-1-era: it still describes "manual-only = *zero* trigger nodes" and does **not** mention the
  `native:manual.run` trigger node, the run-now dispatch bypass, the active-edit deactivation, or
  template-replace deactivation. **Recommended follow-up:** update that rule to match this arc. This
  closeout does **not** modify it.
- **No new workflow state, no feature flag, no `publish` / `active_revision`** — all still deferred
  per the lifecycle rule's "Deferred decisions."

---

## 8. Verification baseline

**Newly measured this session** (per slice; targeted suites + typecheck + lint only):

- **Inert-row slice (`ec2031667`):** `npx tsc --noEmit` → clean; `npx jest` on
  `services/triggers/lifecycle.test.ts` + `app/api/workflows/activate-route.test.ts` +
  `runNow-route.test.ts` → **97/97**; broad `tests/unit/services/triggers` +
  `tests/unit/services/workflows` → **267/267 across 20 suites**; `npx eslint` on touched files →
  clean.
- **Manual-copy slice (`c8ceed32d`):** `npx tsc --noEmit` → clean; `npx jest`
  `services/workflows/saveDraftDefinition.test.ts` → **15/15**; `npx eslint` touched files → clean.

**NOT run this session:** the full repo-wide (~2117-test) sweep was not executed for these slices.
Verification was targeted + typecheck + eslint, which is proportionate for the change sizes but is
**not** a full-suite green bar.

**Migrations:** none in this arc (nothing to apply). **Feature flags:** none added or toggled by
this arc.

---

## 9. Recommended next tracks

1. **Update the canonical lifecycle rule** ([workflow-lifecycle.md](../../../rules/workflow-lifecycle.md))
   to describe manual vs activatable triggers, the run-now dispatch bypass, and the active-edit /
   template-replace deactivation behaviors. Highest-leverage: the rule is the living reference code
   cites, and it currently misdescribes manual workflows.
2. **Hoist `isActivatableTrigger`** into a shared helper once a third consumer appears (test-backed,
   mechanical).
3. **(Optional) One-off cleanup** of stale inert `native:manual.run` `trigger_resources` rows if a
   data-hygiene pass is ever wanted — low value, not required.

---

## 10. Closeout confirmation

Docs-only. Nothing pushed. Doc path:
`docs/slices/phase-4/workflows/manual-trigger-lifecycle-closeout.md`.
