# 4.ACCOUNT-MODEL-22D — Builder / Options / AI Credential Consistency Plan

**Type:** Planning / audit only. No code, schema, or UI changes in this slice.
**Date:** 2026-06-02
**Source of truth:** [team-integration-credential-access-audit.md](./team-integration-credential-access-audit.md) ·
22A `dc1171922` · 22B `244e0c4d9` · 22C `13e325dcb` · `core/integrations/credentialSharing.ts`

---

## TL;DR

Execution is now safe (22B pins personal credentials to the workflow creator; account/service
providers stay account-shared; 22C revokes a departed member's personal creds). **Builder options and
AI tools are NOT yet on that policy** — they resolve the **editor's personal account** via
`ensurePersonalAccount`. That accidentally avoids co-member leakage today, but it also means:

1. **Builder ≠ execution** for personal providers — the dropdowns show resources from the *editor's*
   personal credential while execution runs on the *creator's* credential (22B). Picking a value that
   exists in the editor's account but not the creator's → a runtime "resource not found" surprise.
2. **AI tools can't operate on team workflows at all** — `variables`/`workflowContext` gate on
   `record.accountId === ensurePersonalAccount(...)`, which is false for a team workflow.
3. **A latent leak** — the moment options/AI are flipped to active-account scope (the switcher
   follow-up) *without* a policy, they will expose every co-member's personal credential + resource
   labels, because the options lookup (`getActiveForExecution(account, provider, null)`) has no
   provenance filter.

**Recommendation:** before flipping options/AI to active-account scope, apply the 22A classification
there too — **account providers → active-account shared; personal providers → creator-pinned and
creator-only** (a non-creator editor sees a "the workflow owner connects this" state, never the
creator's resources). This keeps the builder consistent with execution and leaks nothing.

---

## Current path inventory

**Credential / resource-resolution paths (in 22D scope):**

| Path | File | Today | Uses a credential to… |
|------|------|-------|----------------------|
| Builder options API | `app/api/options/[source]/route.ts:144` | `ensurePersonalAccount(auth.userId)` → `getActiveForExecution(personal, provider, null)` → passes integration to resolver | resolver decrypts token / `refreshAndRetry` and calls the provider to list resources (channels, sheets, …) |
| AI options tool | `services/ai/tools/options.ts:104` | same as above, `userId`-scoped | same resolver path |
| AI integrations tool | `services/ai/tools/integrations.ts:112` | `listActiveByAccount(personal)` | exposes availability (provider, label, scope count) — never tokens |
| AI workflow context | `services/ai/tools/workflowContext.ts:71` | `ensurePersonalAccount` for the ownership guard + per-node integration-connectivity check | reports which providers a node needs are connected |

**Account-scoping paths (NOT credential policy — the switcher's concern, listed for completeness):**
`app/apps/page.tsx`, `app/runs/page.tsx`, `app/workflows/page.tsx`, `app/api/runs/route.ts`,
`app/api/ai/usage/route.ts`, `services/billing/workflowCostPreview.ts`, `services/ai/tools/variables.ts:131`
(ownership guard only — reads upstream node *output shapes*, never a credential), and the AI
plan/apply/repair routes (`app/api/workflows/[id]/ai/{plan,apply}`, `.../runs/[runId]/ai/repair`,
`services/ai/{apply,repair}`) which use `ensurePersonalAccount` for the workflow-ownership guard.

**Connect path (explicitly out of 22D scope, but a prerequisite for "active-account options"):**
`services/oauth/dispatcher.ts:148` lands new OAuth connections in the **personal** account today.

**Resolver auth split (relevant to any implementation):** some resolvers `decryptToken` the
passed-in integration directly (Slack, non-refreshable); others call `refreshAndRetry` (refreshable —
Excel/OneNote/Trello). The options route does **not** set the 22B credential-resolution context, so
`refreshAndRetry`-based resolvers currently run unpinned (account-scoped). Any policy must cover both
auth styles.

---

## Question-by-question

**1. Which builder/options/AI paths call `ensurePersonalAccount`?**
The four credential paths above + the account-scoping paths listed. The credential-relevant ones are
the options route, the AI options tool, the AI integrations tool, and AI workflow context.

**2. Which should eventually resolve the active account instead?**
All of them — but the credential paths must carry the sharing policy *before* that flip, or they leak.
The account-scoping paths flip as part of the switcher with no credential implication.

**3. For personal providers, whose credential should options/AI use?**
**The workflow creator's** (`workflows.created_by_user_id`) — the same identity 22B uses at execution.
Using the *current signed-in editor's* credential (the de-facto state today) decouples the builder from
execution and causes runtime surprises (see Q4/Q5). Node/action-owner is rejected — V2 has no per-node
credential ownership model, and inventing one is the explicit long-term "explicit sharing" work, not a
launch rule.

**4. Team workflow created by A, edited by B — builder behavior?**
Execution will use A's personal credential (22B). For consistency the builder should resolve personal-
provider options against **A's** credential too. But surfacing A's resource *labels* (Slack channel
names, spreadsheet titles, Gmail labels) to B is itself personal-data exposure. **Recommended:** show
personal-provider options **only to the creator (A)**; a non-creator editor (B) sees a gated
"only the workflow owner can configure their `<provider>` here — it runs under their connection" state.

**5. Should a member editing a workflow see resource options from the creator's personal credential?**
**No (recommended).** That would leak A's personal resource metadata to B. Gate it to the creator.
(Alternative — allow it for WYSIWYG — is a real product option; see Open decisions.)

**6. Should personal-provider options say "connect your own account" or "workflow owner must connect"?**
**"Workflow owner must connect."** Since execution uses the creator's credential, prompting the editor
to connect *their own* would be misleading (their credential isn't the one that runs). When the
*creator* is the one editing and hasn't connected → "Connect `<provider>` to configure and run this
workflow" (mirrors 22B's no-fallback failure).

**7. Should account providers stay account-shared in builder/options/AI?**
**Yes.** Slack/Notion/Stripe/Shopify/HubSpot/Mailchimp are shared org resources — resolve the
active-account credential, same as execution. No provenance gate.

**8. What should AI workflow context include/omit for personal credentials?**
Report only **availability** for the credential the run will actually use (the creator's), and only to
the creator. Never include another member's credential label/email/account id. For account providers,
report account-level availability. Omit raw scope strings / tokens (already the case).

**9. How do we avoid leaking co-member credential labels/emails through options/AI?**
(a) Account providers: shared, so their labels are legitimately team-visible. (b) Personal providers:
never resolve a *co-member's* credential for a non-owner — gate to the creator, so a co-member's label
is never fetched. (c) The AI integrations/`listActiveByAccount` availability view must filter personal-
provider entries to those connected by the viewer (or the workflow creator in workflow context), not
list every member's personal connection.

**10. What must be implemented before switching options/AI from personal → active account?**
1. **Provider classification gate** in the options route + AI options/integrations/context (reuse
   `credentialSharingForProvider`).
2. **Creator context for options.** The options route currently receives **no `workflowId`/creator** —
   only `source` + `q` + `deps`. Creator-pinning requires threading the workflow id (or creator id)
   into `/api/options/[source]` and the AI options tool. This is a request-contract change and is the
   gating prerequisite.
3. **Both resolver auth styles** (decrypt-direct + `refreshAndRetry`) must honor the pin — either set
   the 22B credential-resolution context around the resolver, or pre-resolve the integration with
   `getActiveForExecution(account, provider, providerAccountId, { connectedByUserId })`.
4. **AI ownership guards** (`variables`/`workflowContext`/plan/apply/repair) move from personal account
   to active account (switcher cutover) so team workflows are addressable at all.

Until all four land, keeping options/AI on `ensurePersonalAccount` is the safer state (no co-member
leak) — the only cost is the builder↔execution mismatch for team workflows, which today are not broadly
exposed anyway.

---

## Recommended policy

> **Primary: creator-pinned + creator-only for personal providers; account-shared for account providers.**

- **Account/service providers** (`credentialSharingForProvider === "account"`): options + AI resolve the
  **active-account** shared credential. No gate. Matches execution.
- **Personal providers** (`=== "personal"`, incl. unknown default):
  - Options/AI resolve the credential **connected by the workflow creator** (`created_by_user_id`) — the
    same one 22B executes with (`getActiveForExecution(account, provider, pa, { connectedByUserId: creator })`).
  - **Only the creator** sees those options. A non-creator editor gets a typed, non-leaking state:
    `NOT_WORKFLOW_OWNER` → "This step runs under the workflow owner's `<provider>` connection. Ask the
    owner to set it up." (no resource list fetched, so no label leak).
  - Creator with no connection → `OWNER_MUST_CONNECT` → "Connect `<provider>` to configure and run this
    workflow" (mirrors 22B's execution failure).
- **AI context**: personal-provider availability reported only for the creator's credential and only to
  the creator; co-member personal connections are never enumerated. Account providers: account-level.

**Tradeoffs.** This favors *no leakage + builder==execution consistency* over *collaborative editing of
personal-provider nodes*. Cost: until explicit credential sharing ships, only the workflow creator can
configure personal-provider node options; other editors see a clear owner-gated message. The rejected
alternative — **editor-scoped options** (each editor uses their own personal credential) — keeps each
editor's view private but decouples the builder from execution (editor B picks a channel from B's
account; the workflow runs on A's account; the id may not exist there → confusing runtime failure), so
it is not recommended as the launch rule.

---

## Implementation slices (only if approved — none built in 22D)

- **22D-1 — Options creator context (prerequisite).** Thread `workflowId` (→ resolve `created_by_user_id`)
  into `/api/options/[source]` + `resolveOptionsSourceForAI`. Contract + caller (`lib/api/options.ts`,
  `useOptionsSource`) change; no behavior change yet (still personal-account until 22D-2).
- **22D-2 — Options sharing policy.** In the options route + AI options tool: classify provider; account
  → active-account lookup; personal → creator-pinned lookup + `NOT_WORKFLOW_OWNER` / `OWNER_MUST_CONNECT`
  typed results; cover both resolver auth styles. Flip these two paths from personal → active account
  *behind* the gate.
- **22D-3 — AI context redaction + scoping.** `integrations`/`workflowContext` tools: classify + filter
  personal-provider availability to the creator; move ownership guards to active account.
- **(separate track) Switcher cutover** for the account-scoping paths (apps/runs/workflows/billing) +
  the **connect path** decision (does a new OAuth connection in a team context land in the team account?).
- **(future) Explicit credential sharing** — per-node connection ownership + owner opt-in to share a
  personal credential with the team. Only then does collaborative personal-provider editing become safe.

## Tests required (per implementation slice, when built)

- Options route/tool: account provider → active-account credential resolved; personal provider + editor
  is creator → creator's credential; personal + editor ≠ creator → `NOT_WORKFLOW_OWNER`, **no resolver
  call / no provider fetch**; personal + creator missing → `OWNER_MUST_CONNECT`.
- No-leak: a non-creator editor never triggers a lookup of a co-member's personal credential (assert
  `getActiveForExecution` is never called with another member's provenance).
- AI integrations/context: personal-provider entries filtered to the creator; co-member personal labels
  absent from the serialized output (extend the existing no-leak test).
- Account-provider parity: Slack/Notion options unchanged (account-shared) in builder + AI.
- Existing 22A/22B/22C + options-route + AI-tool tests stay green.

## Open product decisions

1. **Leak vs WYSIWYG (Q5).** Recommended: gate personal-provider options to the creator (no leak).
   Product may prefer letting co-editors *see* the creator's resource options for smoother team editing
   — that accepts exposing the creator's personal resource labels. Decision needed.
2. **Connect-path target.** Should connecting a provider while a team account is active create the
   integration on the **team** account (with the connector as `connected_by_user_id`) or stay personal?
   This blocks "active-account options" being useful for personal providers.
3. **Per-node credential ownership / explicit sharing** — the long-term fix that makes collaborative
   personal-provider workflows first-class. Scope TBD.
4. **Should personal-provider node config be creator-only** even in the UI affordance (disable the
   field for non-creators), or just gated at resolve time? UI decision for a later builder slice.
