# 4.TEAM-WORKFLOWS-CLOSEOUT — Team Workflow Builder Support Closeout

**Type:** Closeout / handoff. **Docs only** — no source, schema, migrations, or tests in
this slice.
**Date:** 2026-06-03
**Branch:** `builder-ui-v1-audit-1` (all commits below landed locally; nothing pushed)
**Source plan:** [team-workflows-1-builder-plan.md](./team-workflows-1-builder-plan.md)
**Credential prerequisites:**
[team-account-launch-closeout.md](./team-account-launch-closeout.md) ·
[team-credential-access-closeout.md](./team-credential-access-closeout.md) ·
[team-credential-consistency-builder-ai-plan.md](./team-credential-consistency-builder-ai-plan.md)

> **Read this first.** The Team workflow builder support arc (TW-1 → TW-5) is **complete
> locally** on `builder-ui-v1-audit-1`. Team-account workflows now work end-to-end in the
> Workflow Builder on top of the already-enforced credential-sharing policy. This document
> is a closeout/handoff — not implementation. Nothing new is built here.

---

## 1. Summary

- **Team workflow builder support is implemented** on top of the account/team foundation.
  The Builder is now Team-aware: it authorizes by workflow-account membership, threads the
  workflow id into the options/AI layers, and renders the owner-gated credential states the
  server already returns.
- **The credential-sharing policy is enforced across every surface** — execution (22B),
  builder options (22D-2), AI context (22D-3), and the React Agent (TW-4). Account providers
  resolve as shared team connections; personal providers are creator-pinned + creator-only
  and are never used, surfaced, or enumerated for a co-member.
- **Roles gate people management only; workflow access is membership-based.** All Team
  members can create / edit / run / activate Team workflows. Non-members are rejected at the
  route layer with no credential leak.

---

## 2. Completed commit chain

Local arc on `builder-ui-v1-audit-1` (oldest → newest):

| Slice | Commit | Description |
|-------|--------|-------------|
| Plan (TW-1 builder plan) | `ecf456e96` | Team workflow builder plan (Slice 4.TEAM-WORKFLOWS-1) |
| TW-1 — route auth | `7f3307396` | Explicit account-membership authorization on detail/lifecycle routes (4.TEAM-WORKFLOWS-2) |
| TW-2B — run-now parity | `9bf48c00b` | Align run-now authorization with membership model (4.TEAM-WORKFLOWS-2B) |
| TW-2 — workflowId options plumbing | `fa322c9ba` | Thread `workflowId` into options + distinct owner-gated states (4.TEAM-WORKFLOWS-3) |
| TW-3 — owner-gated credential UX | `8bb57d76f` | Polished owner-gated credential affordance for config-modal pickers (4.TEAM-WORKFLOWS-4) |
| TW-4 — React Agent scoping | `9c79856ed` | Scope React Agent integration grounding to the workflow account (4.TEAM-WORKFLOWS-5) |
| TW-3b — badges / banner | `41a4ec97a` | Team credential badges + active-account mismatch banner (4.TEAM-WORKFLOWS-6) |
| TW-5 — offboarding warning | `af46596cd` | Advisory workflow-impact warning on member removal (4.TEAM-WORKFLOWS-7) |

### Credential prerequisites (pre-arc foundation)

| Slice | Commit | Description |
|-------|--------|-------------|
| 22A | `dc1171922` | Provider credential-sharing classification |
| 22B | `244e0c4d9` | Provenance-pin personal credentials in Team workflows (execution) |
| 22C | `13e325dcb` | Offboarding soft-disconnect for personal credentials |
| 22D-1 | `9abab5385` | Thread workflow-creator context into options paths |
| 22D-2 | `57116df28` | Apply credential-sharing policy to builder + AI options |
| 22D-3 | `a209e3996` | Align AI integrations + workflowContext with credential-sharing policy |

---

## 3. Current behavior

- **Active account controls workflow list / create.** New workflows land in the active
  account (`created_by_user_id = caller`); the list is scoped to the active account.
- **Workflow id / account controls open / edit / run / activate authorization.** The
  workflow's own `accountId` is authoritative for the edit/run session; the server
  authorizes by membership of that account, resolved server-side from `workflowId`.
- **All Team members can create / edit / run / activate workflows.** No per-resource
  workflow ACLs.
- **Non-members get a no-leak rejection** at the route layer (403 / NOT_FOUND), no longer
  relying on RLS alone.
- **Personal providers are creator-pinned / creator-only.** A non-creator gets a typed
  owner-gated state with no provider fetch; the creator gets normal options or an
  owner-must-connect prompt.
- **Account providers are shared team connections** and resolve for any member.
- **The React Agent respects the same policy** — workflow-account-scoped, creator-pinned
  availability; never suggests or surfaces a co-member's personal credential.
- **Removing a member warns** about the personal-provider workflows that member created and
  that will need remediation.

---

## 4. UX behavior

- **Owner-gated option fields** render a clear disabled state ("Only the workflow owner can
  configure their `<provider>` here — it runs under their connection"), with no fetch.
- **Owner-must-connect** renders clear connect guidance with a connect CTA (creator only).
- **Credential badges** distinguish a shared team connection (account provider) from the
  owner's connection (personal provider — owner display name + provider only).
- **Active-account mismatch banner** is informational only — non-blocking, names both
  accounts, never discards edits.
- **Offboarding warning** is non-blocking — removal proceeds; remediation is manual.

---

## 5. Security / no-leak guarantees

- Co-member personal credentials are **never used, surfaced, enumerated, or suggested** —
  across execution, builder options, AI context, and the React Agent.
- Personal credential **labels / emails / provider-account ids are not shown** to
  non-creators (consistent with the 22D-3 `ownerControlled` redaction: existence and creator
  identity are fine; the personal label/email is not).
- **Team workflow access is membership-based** — authorized against the workflow's own
  account.
- **RLS remains a DB backstop;** explicit route-layer membership checks now exist on the
  detail/lifecycle routes (defense-in-depth, uniform and testable).

---

## 6. Known limitations / deferred

Out of scope for this arc; tracked for future work:

- Explicit credential sharing UI.
- Per-node credential ownership / reassignment.
- Creator transfer / workflow ownership transfer.
- Owner transfer / leave Team.
- Active-account connect-path decision (where a new OAuth connection lands when a team is
  active).
- Account-scoped URLs.
- Paid Teams / Business / Enterprise billing.
- Workflow folders / trash.
- Full collaborative editing indicators ("someone else is editing").

**Strongest follow-up argument:** until creator transfer or explicit credential sharing
exists, a departed creator's personal-provider nodes cannot be reconnected by anyone else —
those workflows are effectively paused on those steps. This is the strongest case for
prioritizing the explicit-sharing/transfer track soon after launch.

---

## 7. Verification baseline

- **Per slice:** typecheck / lint / Jest green at each slice in the arc.
- **Full Jest latest:** **15,318 passed, 0 failed, 89 skipped.**
- **No migrations** introduced anywhere in the TW arc.
- **No billing / org / transfer / account-URL behavior** added — all reuse existing
  primitives (`requireUserWithAccount`, `isMember`, `requireAccountRole`, the credential
  policy, 22B execution).

---

## 8. Recommended next tracks

1. **First:** run the final baseline (full typecheck / lint / Jest) before push / PR.
2. **Then choose one:**
   - **A. Workflow folders / trash planning** — workflow organization.
   - **B. Owner transfer / leave Team planning** — account lifecycle completeness.
   - **C. Active-account connect-path planning** — where a new OAuth connection lands when a
     team is active.
   - **D. Explicit credential sharing planning** — unblocks collaborative personal-provider
     editing and departed-creator remediation.

**Suggested priority:** **Workflow folders / trash planning** if Marcus wants workflow
organization next; **owner transfer / leave planning** if account-lifecycle completeness is
the more pressing gap.
