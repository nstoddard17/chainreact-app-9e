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
([team-integration-credential-access-audit.md](../team-integration-credential-access-audit.md))
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
| **22D (plan)** | `33541cba0` | Builder/options/AI consistency **plan**. [team-credential-consistency-builder-ai-plan.md](./team-credential-consistency-builder-ai-plan.md). Policy locked below; implemented across 22D-1/2/3. |
| **22D-1** | `9abab5385` | Options creator context (plumbing). `workflowId` threaded into `/api/options/[source]` + `resolveOptionsSourceForAI` + `lib/api/options` + `useOptionsSource`; `services/options/workflowCreatorContext.ts` resolves the workflow's `created_by_user_id` + `accountId` (best-effort, RLS-scoped, never throws). No behavior flip — provenance carry-through only. |
| **22D-2** | `57116df28` | Options sharing policy. `services/options/credentialPolicy.ts` (`decideOptionsCredential`) classifies the provider; options route + AI options tool resolve account providers against the workflow account (shared) and personal providers pinned to the creator — `NOT_WORKFLOW_OWNER` for a non-creator editor (no lookup / no provider fetch), `OWNER_MUST_CONNECT` when the creator hasn't connected. Both resolver auth styles covered (pre-resolved row + 22B credential-resolution context for `refreshAndRetry`). No-workflow-context path keeps the legacy editor-personal-account behavior. |
| **22D-3** | `a209e3996` | AI context redaction/scoping. `getConnectedIntegrationsForAI` is workflow-context-aware (account providers shared; creator's personal in full to the creator, redacted `ownerControlled` to a non-creator; co-member personal omitted). `workflowContext.loadOwned` authorizes by account **membership** (team workflows addressable). New `getWorkflowIntegrationAvailabilityForAI` reports per-provider availability creator-pinned with `ownerControlled` / `ownerMustConnect`, carrying provider id + flags only — never a label/email/token/scope. |

## Final launch policy (LOCKED)

1. **Personal providers are not team-shared by default.**
2. **Account/service providers are account-shared.**
3. **Unknown / unclassified providers default to personal** (fail-safe).
4. **Execution** uses the **workflow creator's** (`created_by_user_id`) personal credential for
   personal providers; account providers resolve the account-shared credential. No silent fallback to
   a co-member's credential — missing creator credential fails clearly.
5. **A removed member's personal Team credentials are soft-disconnected** on member removal; their
   account/service credentials and their own personal-account integrations are untouched.
6. **Builder / options / AI enforce creator-pinned + creator-only for personal providers**
   (IMPLEMENTED — 22D-1/2/3). Specifically:
   - Account/service → workflow-account shared.
   - Personal → resolve the **creator's** credential; **only the creator** sees the options.
   - Non-creator editor → `NOT_WORKFLOW_OWNER` (no resolver call, no provider fetch, no label leak).
   - Creator with no connection → `OWNER_MUST_CONNECT`.
   - AI context: non-creator personal-provider availability is **redacted** (`ownerControlled`, no
     label/email/id); a co-member's personal credential is **never used, surfaced, or enumerated**;
     the workflow owner's missing personal credential reports `ownerMustConnect`.
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
- `tests/unit/services/options/workflowCreatorContext.test.ts` — creator resolution (id + accountId);
  blank/not-found/throw → null (no leak, never throws) [22D-1].
- `tests/unit/services/options/credentialPolicy.test.ts` — the pure decision matrix (legacy / account /
  personal-creator / not-owner; unknown defaults personal) [22D-2].
- `tests/unit/app/api/options/options-route.test.ts` + `tests/unit/services/ai/tools/options.test.ts` —
  account-shared resolve; creator-pinned resolve (incl. the 22B resolution context reaching the
  resolver); non-creator `NOT_WORKFLOW_OWNER` with **zero** lookup/dispatch; creator-missing
  `OWNER_MUST_CONNECT`; legacy no-context path unchanged [22D-2].
- `tests/unit/services/ai/tools/integrations.test.ts` — account-shared visible to non-creator; creator
  full view; non-creator `ownerControlled` redaction (no label/email); co-member personal dropped;
  legacy fallback [22D-3].
- `tests/unit/services/ai/tools/workflowContext.test.ts` — membership addressability + non-member
  `NOT_FOUND`; availability creator-pinned with `ownerControlled` / `ownerMustConnect`; co-member
  personal never counted [22D-3].

## Still deferred (NOT built — genuine follow-ups)

The credential-consistency arc (22D-1/2/3) is **complete**. These remain out of scope:

- **Active-account connect-path decision** — does connecting a provider while a team is active create the
  integration on the team account (connector as `connected_by_user_id`) or stay personal? The options/AI
  policy is safe either way (personal providers are creator-pinned), but this decision is the prerequisite
  for *useful* personal-provider connections in a team context.
- **Explicit credential sharing UI** (later) — per-node connection ownership + owner opt-in to share a
  personal credential with the team. Only then is collaborative personal-provider editing first-class
  (today a non-creator sees a redacted owner-required state, never the creator's resources).
- **Planner/explain call-site scoping** — the React-Agent planner/explain entry points still call
  `getConnectedIntegrationsForAI(userId)` without a workflow id (legacy editor-personal-account view —
  leak-free). Threading workflow scope there is part of broad Team-workflow support, not credential safety.
- Out of this arc entirely (tracked in the launch closeout): outbound invite email, owner transfer / leave,
  Team → Org upgrade, paid Teams / Stripe.

## Launch posture (DO NOT regress)

The credential-sharing policy is now enforced across **execution, builder options, AI options, and AI
context** — so **broad Team workflow work may proceed**. The previous "do not expose the Team workflow
builder / do not flip options/AI to active-account scope" blockers are **lifted** because the flip already
shipped *with* the policy:

- Account/service providers resolve the workflow account (shared); personal providers are creator-pinned
  and creator-only; co-member personal credentials are never used, surfaced, or enumerated.
- A non-creator editor gets a typed `NOT_WORKFLOW_OWNER` (options) / `ownerControlled` redacted state (AI),
  never the creator's resources or labels.

Must-not-regress: do not reintroduce a co-member fallback for personal providers, do not let
options/AI surface another member's personal label/email/resource metadata, and keep unknown providers
defaulting to **personal**.

## Status

- **Execution + offboarding: COMPLETE and enforced** (22A/22B/22C).
- **Builder options + AI options + AI context: COMPLETE and enforced** (22D-1 `9abab5385`,
  22D-2 `57116df28`, 22D-3 `a209e3996`). Tests green; full suite passing (15,259 tests at 22D-3).
- **The 22D credential-consistency arc is closed.** Broad Team workflow builder/AI work is unblocked.
