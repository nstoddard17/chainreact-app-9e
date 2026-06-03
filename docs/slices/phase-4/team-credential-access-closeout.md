# 4.ACCOUNT-MODEL-CREDENTIAL-CLOSEOUT — Team Credential Access Closeout

**Type:** Closeout / handoff. Docs only — no source, migrations, or tests in this slice.
**Date:** 2026-06-02
**Arc:** 4.ACCOUNT-MODEL-21 → 22A → 22B → 22C → 22D

> **One-line policy (LOCKED):** In a Team account, **personal** OAuth credentials
> (Gmail/Outlook/Drive/…) are NOT team-shared — execution uses the **workflow
> creator's** credential, and only the creator may configure them; **account/service**
> providers (Slack/Notion/Stripe/…) stay account-shared. Unknown providers default
> **personal**.

---

## Why this arc existed (audit finding — slice 21, `6b1f96d38`)

Phase B correctly moved integrations to `account_id` ownership, but the audit
([team-integration-credential-access-audit.md](./team-integration-credential-access-audit.md))
found execution ignored `connected_by_user_id`:

- **Execution over-shared personal credentials** — a Team workflow could silently send as any
  member's Gmail/Outlook; the null-`providerAccountId` path picked an arbitrary row.
- **Removed-member credentials stayed active** — member removal deleted membership only; the
  departed member's personal Team credentials remained usable by Team workflows.
- **Builder / options / AI are personal-account-scoped** (`ensurePersonalAccount`) — no co-member
  leak today, but inconsistent with execution and primed to over-share the moment they flip to
  active-account scope.

## Implemented fixes

| Slice | Commit | What shipped |
|-------|--------|--------------|
| **22A** | `dc1171922` | `core/integrations/credentialSharing.ts` — explicit `credentialSharing: "personal" \| "account"` classification + helpers (`credentialSharingForProvider`, `isPersonalCredentialProvider`, `isAccountCredentialProvider`, `hasExplicitCredentialSharing`). Default unknown → personal. `tokenScope` is explicitly NOT the sharing signal. No runtime change. |
| **22B** | `244e0c4d9` | Execution provenance pin. `services/oauth/credentialResolutionContext.ts` (AsyncLocalStorage) set by the engine per handler; `refreshAndRetry` pins **personal** providers to `workflow.created_by_user_id` via `getActiveForExecution(..., { connectedByUserId })`. `dispatcher.refresh` + `refreshLockKey` thread the pin. Deterministic `ORDER BY created_at ASC`. Missing creator credential → clear connect-required failure, **never** a co-member fallback. Account providers unchanged. Zero handler edits (single seam). |
| **22C** | `13e325dcb` | Offboarding. `repositories/integrations.softDisconnectPersonalForMember({ accountId, connectedByUserId })` soft-disconnects (`disconnected_at`) the removed member's **personal** integrations in that account; account/service providers untouched; idempotent. `services/accounts/membership.removeMember` calls it after the auth gate, before membership deletion (retry-safe). |
| **22D** | `33541cba0` | Builder/options/AI consistency **plan** (no code). [team-credential-consistency-builder-ai-plan.md](./team-credential-consistency-builder-ai-plan.md). Policy locked below; implementation deferred. |

## Final launch policy (LOCKED)

1. **Personal providers are not team-shared by default.**
2. **Account/service providers are account-shared.**
3. **Unknown / unclassified providers default to personal** (fail-safe).
4. **Execution** uses the **workflow creator's** (`created_by_user_id`) personal credential for
   personal providers; account providers resolve the account-shared credential. No silent fallback to
   a co-member's credential — missing creator credential fails clearly.
5. **A removed member's personal Team credentials are soft-disconnected** on member removal; their
   account/service credentials and their own personal-account integrations are untouched.
6. **Builder / options / AI must implement creator-pinned + creator-only for personal providers
   BEFORE any active-account cutover** (see Launch blockers). Specifically:
   - Account/service → active-account shared.
   - Personal → resolve the **creator's** credential; **only the creator** sees the options.
   - Non-creator editor → `NOT_WORKFLOW_OWNER` (no resolver call, no label leak).
   - Creator with no connection → `OWNER_MUST_CONNECT`.
7. **Editor-scoped personal options are rejected** — they would diverge the builder from execution
   (editor picks from their account; the run uses the creator's) and cause confusing runtime failures.

## Provider classification (source: `core/integrations/credentialSharing.ts`)

| Class | Providers |
|-------|-----------|
| **account** (shared org/service resource) | `slack`, `notion`, `stripe`, `shopify`, `hubspot`, `mailchimp` |
| **personal** (acts as the connecting human) | `gmail`, `microsoft-outlook`, `microsoft-outlook-calendar`, `google-calendar`, `google-drive`, `google-sheets`, `google-docs`, `google-analytics`, `microsoft-onedrive`, `microsoft-onenote`, `microsoft-excel`, `microsoft-teams`, `dropbox`, `discord` |
| **personal** (audit "needs decision" → defaulted personal for launch safety) | `github`, `facebook`, `airtable`, `trello`, `monday` |
| **personal** (default) | any provider not explicitly classified |

The coverage test fails the build if a newly-registered provider is left unclassified.

## Tests / guards that now exist

- `tests/unit/core/integrations/credentialSharing.test.ts` — classification values; **every registered
  provider explicitly classified** (no silent default); unknown → personal.
- `tests/unit/repositories/integrations-getActiveForExecution.test.ts` — `connectedByUserId` filter +
  deterministic `ORDER BY created_at`.
- `tests/unit/services/oauth/credentialResolutionContext.test.ts` — ALS round-trip.
- `tests/unit/services/oauth/credentialResolutionScoping.test.ts` — personal pinned to creator; Team-by-A
  can't resolve B's Gmail; no-fallback failure; refresh pinned; account providers not pinned; no-context
  fallback.
- `tests/unit/repositories/integrations-softDisconnectPersonalForMember.test.ts` — personal-only scope;
  account providers untouched; idempotency; scope filters.
- `tests/unit/services/accounts/membership.test.ts` — `removeMember` offboarding call + ordering + no
  disconnect on gate failure.
- `tests/unit/repositories/integrations-cross-account-isolation.test.ts` — cross-account isolation
  (kept green through the signature change).

## Deferred implementation (NOT built — plan only)

- **22D-1** — options creator context: thread `workflowId`/creator into `/api/options/[source]` +
  `resolveOptionsSourceForAI` (the options request carries no workflow/creator today — gating prereq).
- **22D-2** — options sharing policy: classify provider; account → active-account; personal →
  creator-pinned + `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT`; cover decrypt-direct AND `refreshAndRetry`
  resolver auth styles; flip these paths to active account **behind** the gate.
- **22D-3** — AI context redaction/scoping: `integrations`/`workflowContext` filter personal-provider
  availability to the creator; move ownership guards to active account.
- **Active-account connect-path decision** — does connecting a provider while a team is active create the
  integration on the team account (connector as `connected_by_user_id`) or stay personal? Blocks useful
  active-account options for personal providers.
- **Explicit credential sharing UI** (later) — per-node connection ownership + owner opt-in to share a
  personal credential with the team. Only then is collaborative personal-provider editing first-class.

## Launch blockers (DO NOT regress)

Until **22D-1/2/3** land, do **NOT**:

- switch `/api/options/[source]` from personal account → active account;
- switch the AI tools (`options`, `integrations`, `workflowContext`) from personal account → active
  account;
- expose the Team workflow builder / editing broadly (personal-provider options would diverge from
  execution, or — if naively active-account-scoped — leak co-member credentials/resources);
- add active-account-aware provider connection flows.

Keeping builder/options/AI on `ensurePersonalAccount` is the safe interim state (no co-member leak); the
only cost is the builder↔execution mismatch for team workflows, which are not broadly exposed yet.

## Status

- **Execution + offboarding: COMPLETE and enforced** (22A/22B/22C, tests green, full suite passing).
- **Builder/options/AI: policy LOCKED, implementation DEFERRED** (22D plan). Implement 22D-1/2/3 only
  when actively moving into Team workflow builder/AI scoping.
