# 4.APPS-RECOVERY-UX — Connected-Apps Recovery UX Arc Closeout

**Type:** Closeout / handoff (docs only). **No source, migrations, tests, UI, or
behavior changes in this slice. Nothing pushed.**
**Date:** 2026-06-26
**Branch:** `v2-main`

**Arc:** plan → CS-APPS-RECOVERY-1 → CS-APPS-RECOVERY-2 → this verification closeout.
**Plan doc:** [connected-apps-recovery-ux-plan.md](./connected-apps-recovery-ux-plan.md).

**Source of truth (files verified for this closeout):**
[services/oauth/refreshAndRetry.ts](../../../../services/oauth/refreshAndRetry.ts) (execution-seam mark) ·
[repositories/integrations.ts](../../../../repositories/integrations.ts) (`markNeedsReconnect` conditional UPDATE) ·
[services/integrations/reconnectNotification.ts](../../../../services/integrations/reconnectNotification.ts) (one-shot notify) ·
[services/oauth/dispatcher.ts](../../../../services/oauth/dispatcher.ts) (refresh-path mark; revoke) ·
[features/apps/collapsedReconnect.ts](../../../../features/apps/collapsedReconnect.ts) (collapsed-action derivation) ·
[features/apps/AppCard.tsx](../../../../features/apps/AppCard.tsx) (card render) ·
[app/apps/_shared.ts](../../../../app/apps/_shared.ts) + [contracts/apps.ts](../../../../contracts/apps.ts) (DTO) ·
[services/integrations/disconnect.ts](../../../../services/integrations/disconnect.ts) (unchanged) ·
[services/integrations/reconnect.ts](../../../../services/integrations/reconnect.ts) (unchanged).

---

## 1. Summary

The arc made connected-app recovery **complete and discoverable** without rebuilding
the parts that already worked. The audit (plan `507a228e8`) established that per-row
Reconnect, real Disconnect+revoke+workflow-cascade, the workflow-impact warning, and
the account/team credential rules were **already shipped**. Two surgical fixes closed
the actual gaps: **CS-1** (`e7ba8bc33`) makes execution-time auth failures flip the
specific integration row to "Reconnect needed" + one-shot notify (previously a
background-failing non-refreshable credential left the Apps card green-while-broken);
**CS-2** (`e9bd83c36`) surfaces a recovery affordance on the **collapsed** card so the
per-row Reconnect is reachable without first discovering the expand chevron.

## 2. Completed commit chain

- `507a228e8` — docs(apps): connected-apps recovery UX audit + plan (4.APPS-RECOVERY-UX) _(2026-06-26)_
- `e7ba8bc33` — feat(integrations): mark reconnect-needed at the execution seam (CS-APPS-RECOVERY-1) _(2026-06-26)_
- `e9bd83c36` — feat(apps): collapsed-card reconnect discoverability (CS-APPS-RECOVERY-2) _(2026-06-26)_
- _(this)_ docs(apps): connected-apps recovery UX closeout (CS-APPS-RECOVERY-3) _(2026-06-26)_

All local on `v2-main`; **nothing pushed.**

## 3. Current behavior (end to end)

1. **A connection breaks at runtime.** A workflow action's principal call 401s →
   [`refreshAndRetry`](../../../../services/oauth/refreshAndRetry.ts). On the two
   **durable** auth-required exits — a non-refreshable credential that 401'd
   (`refresh_not_supported`) and a refresh that succeeded but whose retry still 401'd
   (`refresh_failed`) — it best-effort marks **exactly that integration row** as
   `needs_reconnect_at` and fires one connector notification. A dead refresh grant on
   a refreshable provider is already marked by the dispatcher; Slack's proactive
   health check and the builder option-load path also mark. **Not** marked on
   transient (5xx / network / config) failures.
2. **The Apps page reflects it.** `app/apps/_shared.ts` projects `needs_reconnect_at`
   to the per-row `needsReconnect` boolean (and `app.needsReconnect` = OR of rows). The
   status pill shows "Reconnect needed"; per-row chips/copy mark each broken row.
3. **Recovery is discoverable.** On the **collapsed** card,
   [`deriveCollapsedReconnect`](../../../../features/apps/collapsedReconnect.ts) decides:
   exactly one reconnectable row needing reconnect → a direct **Reconnect** button
   (reuses the per-row reconnect flow with that row's opaque `integrationId` +
   `accountId`); multiple/mixed → **Review reconnects** (expands the card); only-blocked
   or healthy → no actionable button (status pill still warns). Hidden once expanded.
4. **The user reconnects.** Direct/expanded Reconnect starts OAuth in reconnect mode
   (`POST …/oauth/[provider]/connect` `{reconnect:{integrationId, accountId}}` →
   `resolveReconnectTarget`); the callback identity-match refuses to refresh a different
   account; `upsertActive` clears `needs_reconnect_at`.
5. **Disconnect is unchanged.** `DELETE …/integrations/[id]` → `disconnectIntegration`
   (soft-disconnect → workflow cascade when last active row → best-effort revoke), with
   the advisory workflow-impact warning. **No change in this arc.**

## 4. Security / no-leak guarantees (unchanged, re-verified)

- **Per-row only.** CS-1 marks `initialRow.id` / `refreshedRow.id` (the execution's
  pinned row) — never provider-wide or account-wide. CS-2 acts on a single row's opaque
  id.
- **One-shot.** `markNeedsReconnect` is a conditional `needs_reconnect_at IS NULL → now()`
  UPDATE; notify fires only on the first transition. Concurrent 401s coalesce in the
  refresh lock + the conditional UPDATE.
- **Never masks the run failure.** Mark/notify are best-effort (swallowed); the original
  `IntegrationActionRequiredError` always surfaces.
- **DTO no-leak preserved.** The Apps DTO emits only booleans (`needsReconnect`,
  `canReconnect`, `canDisconnect`, …) + the opaque row id; the raw `needs_reconnect_at`
  timestamp, tokens, scopes, provider account ids, and connector id are never emitted
  (pinned by `_shared` DTO-safety tests — green this session).
- **Credential asymmetry intact.** Account/service providers: owner/admin for
  connect/reconnect/disconnect. Personal: disconnect = owner/admin OR connector,
  reconnect = **connector only**. CS-2 inherits these via the existing `canReconnect`
  gate (no new authz path).

## 5. Data / RLS / model notes

- **No schema change in this arc.** `needs_reconnect_at` (migration `20260624000000`),
  the reconnect-needed notification type (`20260625000000`), and the authenticated-write
  revoke (`20260627000000`) all **predate** this arc and are already applied. CS-1/CS-2
  add **no** migration.
- **No new tables / RLS / GRANT changes.** Writes continue through service-role repo
  functions per the existing posture.
- **Account-scoped throughout.** Reconnect/disconnect resolve `(account, integrationId)`;
  no cross-account leakage.

## 6. UI behavior

- Collapsed card with one reconnectable broken row → a **Reconnect** button
  (`app-card-collapsed-reconnect`, reconnect variant) bound to that row.
- Collapsed card with multiple/mixed broken rows → **Review reconnects**
  (`app-card-collapsed-review`, amber, light+dark variants) that expands the card.
- Collapsed card with only blocked broken rows → status pill "Reconnect needed", **no**
  actionable button (never a dead control).
- Healthy card → visually unchanged.
- Expanded per-row Reconnect / Disconnect / Share / Connect-another → **unchanged**.
- **No fake/unsupported controls**: every affordance reuses a real, authorized backend
  flow (the per-row reconnect OAuth start).

## 7. Deferred / known limitations

- **Live revoke smoke — manual QA pending.** There is no safe automated path to force a
  *runtime* 401 on a smoke-owned connection without real provider mutation, so the
  end-to-end "revoke → background run fails → card flips to Reconnect needed →
  notification → reconnect clears it" loop is verified by deterministic unit/component
  tests, not a live run. Manual QA: connect a smoke-owned account, revoke it
  provider-side, run a dependent workflow, confirm the card flips + notification fires.
- **Notification recipient = connector** (`connected_by_user_id`); when null (e.g.
  connector's user row deleted) the notify is skipped — no owner/admin escalation
  (inherited from the existing `notifyReconnectNeeded` contract; not built here).
- **Collapsed Review** reuses the existing expand state; no scroll-into-view was added
  (the accounts list is immediately within the card).
- **CS-2 multi-row policy:** the collapsed card never auto-picks an identity to re-auth;
  it expands instead. Intentional (don't guess).

## 8. Verification baseline

**All run THIS session (2026-06-26), newly measured:**
- `npx jest refreshAndRetry + services/oauth + services/integrations + features/apps + app/apps + AppsPage` → **36 suites / 439 tests pass**.
- `npx jest app/apps/_shared + services/integrations/disconnect + …/reconnect` → **3 suites / 65 tests pass** (DTO-safety, disconnect, reconnect — all unchanged-behavior confirmations).
- `npx tsc --noEmit` (full repo) → **exit 0**.
- `eslint` (refreshAndRetry.ts, collapsedReconnect.ts, AppCard.tsx) → **0 errors**.
- `npm run lint:structure` → **OK** (≤50 files/leaf).

**Migrations:** none added this arc; the supporting migrations are pre-applied (§5).
**Feature flags:** none added. The recovery surface (reconnect/disconnect/the new
collapsed affordance) is **unflagged** — these are correctness/discoverability fixes.
Only connection **Sharing** is gated (`ENABLE_CONNECTION_SHARING`, pre-existing,
unrelated). `HERMES_AGENT_ENABLED` untouched.

## 9. Recommended next tracks

- **Live recovery QA** (the deferred manual smoke above) — the only verification gap.
- **Owner/admin reconnect escalation** when a member's broken personal connection blocks
  team workflows and the connector is unavailable (today: connector-only reconnect +
  connector-only notify). Product decision required.
- **Scroll-into-view on Review** for long account lists (minor UX polish).

## 10. Closeout confirmation

The Connected Apps recovery UX arc is **closed**: per-row reconnect (pre-existing) +
real disconnect (pre-existing) + execution-time reconnect-needed signal (CS-1) +
collapsed-card discoverability (CS-2), all verified green this session, with one
deferred manual live-QA caveat. **Docs-only. Nothing pushed.** Doc:
`docs/slices/phase-4/workflows/connected-apps-recovery-ux-closeout.md`.
