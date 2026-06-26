# Connected Apps Recovery — Manual QA Checklist

**Type:** QA procedure (docs only). No source, migrations, tests, UI, or behavior
changes. Nothing pushed.
**Date:** 2026-06-26
**Branch:** `v2-main`

**Why this exists:** The Connected-Apps recovery arc
([closeout](./connected-apps-recovery-ux-closeout.md), commits `507a228e8` →
`e7ba8bc33` → `e9bd83c36` → `0150fe2bc`) is fully covered by deterministic unit /
component tests. The **one** remaining verification caveat is live: there is no safe
automated way to force a *runtime* 401 on a smoke-owned connection without real
provider mutation (closeout §7 / §9). This checklist is the explicit procedure for
that single live loop.

**Run as:** a tester with access to a **smoke-owned** account + a smoke-owned
provider connection only. Not for production / customer environments.

---

## 0. Safety notes (read first)

- **Do NOT revoke, delete, or rotate real customer or production provider
  credentials.** Use a smoke-owned connection on a smoke-owned account only.
- **Do NOT trigger send / broadcast / publish / payment actions** during QA. Use a
  workflow whose dependent step is a **read / fetch / list** action so the auth call
  happens without an outbound side effect. (Test mode skips external actions, so to
  exercise the real 401 you must run a real but **non-mutating** action.)
- **Record provider / account / integration ids in your LOCAL notes only.** Never
  paste them into this doc, a committed file, a commit message, a PR, or a shared
  channel. They are opaque ids but still account-identifying.
- If anything looks like it touched a row you did not intend (wrong account, wrong
  provider, a second row flipping), **stop** and capture the state in local notes.
- Revoking provider-side is the controlled break for this test. Re-connect (Step 7)
  restores the smoke connection when done.

---

## 1. Preconditions

- [ ] Logged in as the smoke tester; **active account** = the smoke-owned account.
- [ ] Branch `v2-main` at or after `e9bd83c36` (CS-2) is what is running.
- [ ] A smoke-owned provider connection is **connected and healthy** on the Apps page
      (status pill shows the connected state, no "Reconnect needed").
- [ ] A workflow exists that uses that connection in a **non-mutating** step
      (read/list/fetch), and it can be run manually or on a background trigger.
- [ ] Note (local only) the provider, account, and the integration row you will break.

---

## 2. Checklist

### A. Break the smoke-owned credential

- [ ] Revoke / invalidate the **smoke-owned** connection **provider-side** (revoke the
      app's access in the provider's account security settings), so the next API call
      returns a durable 401.
- [ ] Confirm you did NOT disconnect from inside ChainReact (this test exercises the
      *runtime auth-failure* path, not the explicit Disconnect path).

### B. Background / dependent run hits the auth failure

- [ ] Run the dependent workflow (manual run or wait for its trigger) so the broken
      step's principal call 401s.
- [ ] Confirm the run **fails** with an action-required / auth error (the original run
      failure must still surface — recovery marking is best-effort and never masks it).
- [ ] Confirm a **transient** failure would NOT have marked the row (informational: only
      the durable auth-required exits flip the row — `refresh_not_supported` /
      `refresh_failed`; 5xx / network / config do not).

### C. The exact row flips to reconnect-needed

- [ ] On the Apps page, the broken app's **status pill** now reads **"Reconnect
      needed"** (`AppStatusPill`).
- [ ] Expanding the card shows the per-row reconnect-needed chip
      (`app-card-reconnect-needed`) + its copy (`app-card-reconnect-needed-copy`) on
      **exactly the row you broke**.
- [ ] **No other row** on that app (or any other app) flipped. Per-row only.

### D. Collapsed-card recovery is discoverable — single row

- [ ] With the card **collapsed** and exactly **one** reconnectable broken row, the card
      shows a direct **Reconnect** button (`app-card-collapsed-reconnect`).
- [ ] The button is reachable **without** first finding the expand chevron.

### E. Collapsed-card recovery — multiple / mixed rows

- [ ] Break a **second** reconnectable row on the same app (smoke-owned only), collapse
      the card.
- [ ] The card now shows **"Review reconnects"** (`app-card-collapsed-review`) instead of
      a direct Reconnect, and clicking it **expands** the card (it does not auto-pick an
      identity to re-auth).
- [ ] (Optional) A card whose only broken rows are **non-reconnectable/blocked** shows
      the "Reconnect needed" pill but **no actionable button** (never a dead control).

### F. Per-row reconnect targets the exact integration row

- [ ] From the collapsed single-row Reconnect (Step D) OR the expanded per-row
      **Reconnect** button, start OAuth in reconnect mode.
- [ ] The OAuth flow targets **the exact integration row** that was broken (same
      provider + same account); the callback identity-match refuses a different account.

### G. Successful reconnect clears needsReconnect

- [ ] Complete OAuth for the broken row.
- [ ] The row's reconnect-needed state **clears** (`needs_reconnect_at` reset on
      `upsertActive`): the per-row chip is gone and, once all broken rows are fixed, the
      status pill returns to the connected state.
- [ ] Re-running the dependent workflow now **succeeds**.

### H. Notification appears only once

- [ ] After the first runtime 401 (Step B), exactly **one** reconnect-needed
      notification was delivered to the **connector** (`connected_by_user_id`).
- [ ] Re-running the failing workflow again **before** reconnecting does **not** produce
      a second notification (one-shot: conditional `needs_reconnect_at IS NULL → now()`
      UPDATE gates the notify).
- [ ] (Informational) If the connector user row is absent, no notification fires and no
      owner/admin escalation happens — known limitation, not a bug (closeout §7).

### I. Disconnect warning / cascade is unchanged

- [ ] Trigger an explicit **Disconnect** on a smoke-owned row from the Apps page.
- [ ] The workflow-impact **warning** still appears before confirming.
- [ ] On confirm: soft-disconnect → workflow **cascade** fires when the last active row
      is removed → best-effort provider revoke — all behaving as before this arc (no
      regression from CS-1 / CS-2).

---

## 3. If a real issue is found

This checklist is QA-only. If a step reveals a genuine inconsistency between
documented behavior and the running app, capture it in local notes (with ids kept
local), then open a **separate** narrow slice to fix it. Do not expand this doc into a
fix and do not modify recovery source from the QA pass.

## 4. Reference (verified source, do not edit during QA)

- Execution-seam mark: [services/oauth/refreshAndRetry.ts](../../../../services/oauth/refreshAndRetry.ts)
- One-shot conditional UPDATE: [repositories/integrations.ts](../../../../repositories/integrations.ts) (`markNeedsReconnect`)
- One-shot notify: [services/integrations/reconnectNotification.ts](../../../../services/integrations/reconnectNotification.ts)
- Collapsed-action derivation: [features/apps/collapsedReconnect.ts](../../../../features/apps/collapsedReconnect.ts)
- Card render + testids: [features/apps/AppCard.tsx](../../../../features/apps/AppCard.tsx), [features/apps/AppStatusPill.tsx](../../../../features/apps/AppStatusPill.tsx)
- DTO no-leak (booleans + opaque id only): [app/apps/_shared.ts](../../../../app/apps/_shared.ts), [contracts/apps.ts](../../../../contracts/apps.ts)
- Disconnect (unchanged): [services/integrations/disconnect.ts](../../../../services/integrations/disconnect.ts)

**Nothing pushed.**
