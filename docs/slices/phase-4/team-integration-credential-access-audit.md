# 4.ACCOUNT-MODEL-21 — Team Integration Credential Access Audit

**Type:** Audit / planning only. No code, schema, UI, or product changes in this slice.
**Date:** 2026-06-02
**Scope fences honored:** no provider rewrites, no UI, no billing/team/org changes, no push.

---

## TL;DR

> **Can Team members use each other's Outlook/Gmail today? At execution: YES — silently.**

A Team workflow resolves OAuth credentials by **`(account_id, provider, provider_account_id)` only** —
`connected_by_user_id` is **never consulted** at the execution layer. So any Team member's connected
personal mailbox (Gmail/Outlook) can be used by a workflow running under the Team account, and a
**departed member's credential keeps working** because member removal does not revoke integrations.

The builder options API and AI tools do **not** over-share today — but only incidentally, because they
are still scoped to the caller's **personal** account (`ensurePersonalAccount`) rather than the active
Team account. That is inconsistent with execution and will start over-sharing the moment those paths are
switched to the active account (the account-switcher follow-up).

**Recommendation:** before broadly exposing the Team workflow builder/execution, gate **personal-credential
providers** so a Team workflow uses only the credential attributed to the workflow's
`created_by_user_id`, never an arbitrary co-member's. Keep account-sharing for genuine
workspace/service providers (Slack, Notion, …).

---

## Question-by-question findings

### 1. How are integrations stored after the account_id cutover?
`public.integrations`, owned by `account_id` (NOT NULL, FK `accounts(id)` ON DELETE **RESTRICT**).
`connected_by_user_id` carries provenance (FK `auth.users` ON DELETE **SET NULL**). The legacy `user_id`
column was dropped in `supabase/migrations/20260530000002_integrations_account_cutover.sql`. Soft-disconnect
via `disconnected_at` (no hard delete on disconnect). RLS = account-membership; writes via service-role
(OAuth dispatcher + repo).

### 2. What fields exist today?
From `20260505000002_integrations.sql` + the cutover migration + `repositories/integrations.ts`:
`id, account_id, connected_by_user_id, provider, provider_account_id, display_name,
access_token_encrypted, refresh_token_encrypted, access_token_expires_at, scopes[],
account_metadata jsonb, disconnected_at, created_at, updated_at`.
**There is no `status` column** — "active" is derived as `disconnected_at IS NULL`. Uniqueness:
`integrations_active_unique (account_id, provider, provider_account_id) WHERE disconnected_at IS NULL`.

### 3. Does `getActiveForExecution(accountId, provider, …)` ignore `connected_by_user_id`?
**Yes.** `repositories/integrations.ts:205-229` filters `account_id = $1 AND provider = $2 [AND
provider_account_id = $3] AND disconnected_at IS NULL` then `.limit(1).maybeSingle()`. Provenance is not a
predicate. `refreshAndRetry` (every action handler's credential path) calls it the same way
(`services/oauth/refreshAndRetry.ts:160`).

### 4. Can multiple users connect the same provider inside one Team account?
**Yes**, as long as `provider_account_id` differs. The unique index keys on
`(account_id, provider, provider_account_id)`. Two members each connecting their own Gmail
(`alice@…`, `bob@…`) produce two active rows with different `connected_by_user_id`. Same mailbox →
blocked to one active row (a re-connect by a different member updates tokens but **preserves the original
`connected_by_user_id`** — `repositories/integrations.ts:141-145`).

### 5. If multiple Outlook/Gmail integrations exist in one Team account, how does the workflow choose?
Handlers derive `providerAccountId` from the **trigger event** only when the trigger provider equals the
action provider (e.g. `sendEmail.ts:92-95`); otherwise it is **null**. With `providerAccountId = null`,
`getActiveForExecution` returns `.limit(1)` with **no `ORDER BY`** → an **arbitrary / non-deterministic**
row among the members' credentials. So: Outlook-triggered workflow → the mailbox that fired the trigger;
manual / scheduled / cross-provider trigger → "whichever row Postgres returns first." This is both a
security and a correctness/auditability problem.

### 6. Do options resolvers and AI context expose integrations connected by other users?
**Not today — but incidentally.** All three read paths still resolve the **caller's personal account**:
- Options API: `app/api/options/[source]/route.ts:144` → `ensurePersonalAccount(auth.userId)`.
- AI integrations tool: `services/ai/tools/integrations.ts:113` → `ensurePersonalAccount(userId)`.
- AI workflow context: `services/ai/tools/workflowContext.ts:71` → `ensurePersonalAccount(userId)`.

So they currently surface the caller's own personal integrations, not Team co-members'. This is **the
opposite inconsistency**: the builder previews/AI run against personal creds while **execution** runs
against the Team account's creds. When the account-switcher follow-up flips these to the active account
(as their own TODO comments anticipate), they will expose **every** Team integration unless a provenance
filter is added.

### 7. Can a regular member select another member's credential during workflow setup?
There is **no credential/connection picker** in the builder — options sources list provider *resources*
(channels, sheets, …), not credentials. A member therefore cannot *explicitly* choose a co-member's
credential; instead the engine resolves one *implicitly* at run time (per Q5), which can be a co-member's.

### 8. Can a workflow run under another member's credential after that member leaves?
**Yes.** `services/accounts/membership.ts` `removeMember` deletes the membership row and clears the active
pointer, but does **not** touch `integrations`. The row keeps `account_id = <team>` and stays active, so
Team workflows keep using the departed member's token until it fails refresh or someone disconnects it.
`connected_by_user_id` is `SET NULL` only on **auth.users** deletion, not on membership removal. Only a
**full account purge** revokes integrations (`services/accounts/accountPurge.ts:181-185`). **This is an
offboarding security gap.**

### 9. Are Slack/Stripe-style integrations different from Gmail/Outlook personal-mailbox integrations?
Conceptually yes, but **no first-class classifier exists**. The closest signal, manifest `tokenScope`, is
an unreliable proxy (tally: **44 `"user"`, 3 `"workspace"`**):
- `"workspace"`: Slack, Notion (represent a shared workspace).
- `"user"` but genuinely org/service-shared: **Stripe, Shopify, HubSpot, Mailchimp, Trello, Monday**.
- `"user"` and genuinely personal (acting *as a human*): **Gmail, Outlook (+Calendar), Google Drive/
  Sheets/Docs/Calendar/Analytics, OneDrive, OneNote, Teams, Dropbox, Discord**.

`tokenScope` answers "is the token bound to a user or a workspace for multi-account keying" — **not**
"may the whole team act with it." We should not overload it for the sharing policy.

### 10. Which providers are personal vs team-shared?
Proposed classification (conservative; unknown → personal):

| Class | Providers | Rationale |
|------|-----------|-----------|
| **Personal** (act-as-a-human; do NOT auto-share) | gmail, microsoft-outlook, microsoft-outlook-calendar, google-calendar, google-drive, google-sheets, google-docs, google-analytics, microsoft-onedrive, microsoft-onenote, microsoft-teams, dropbox, discord | The token impersonates the connecting person's mailbox / drive / chat identity. |
| **Account/service** (sharing matches semantics) | slack, notion, stripe, shopify, hubspot, mailchimp | The token represents a shared workspace / store / portal / business the team jointly operates. |
| **Needs product decision** | github, facebook, airtable, trello, monday | Can be either personal or org-shared depending on how the org uses them. Default personal until decided. |

### 11. What should the launch rule be before explicit credential sharing exists?
See **Recommended launch rule** below.

---

## Current behavior summary

- **Ownership:** correct — `account_id` owns integrations; `connected_by_user_id` is provenance only.
- **Execution:** account-scoped, provenance-blind. Personal mailboxes are de-facto **account-shared** to
  every Team member, and the specific credential is chosen non-deterministically when not trigger-derived.
- **Offboarding:** departed members' credentials remain active and usable by Team workflows.
- **Builder options / AI:** still personal-account-scoped (pre-switcher), so no co-member leakage *yet*,
  but inconsistent with execution and primed to over-share once switched to the active account.
- **Visibility:** `listActiveByAccount` (co-member RLS) already lets any Team member *see* that a provider
  is connected and its display label (often a personal email) for all Team integrations — metadata only,
  no tokens.

## Security / privacy risks (ranked)

| # | Severity | Risk |
|---|----------|------|
| R1 | **High** | Cross-member credential use at execution — a Team workflow can send email / act as a co-member's personal Gmail/Outlook without consent. |
| R2 | **High** | Persistent access after offboarding — a removed member's tokens keep working under Team workflows; member removal never revokes them. |
| R3 | **Medium** | Non-deterministic selection — null `providerAccountId` + no `ORDER BY` makes "which mailbox sent this" unpredictable and unauditable. |
| R4 | **Medium (latent)** | Builder/AI ↔ execution inconsistency — personal-scoped previews vs team-scoped execution today; over-exposure the moment options/AI switch to the active account. |
| R5 | **Low** | Metadata visibility — co-members can see each other's connected providers + labels (personal emails) via the account roster of integrations. |

## Recommended launch rule

Keep the schema. **Do not** change ownership (`account_id`) or remove `connected_by_user_id`.

1. **Classify providers** with an explicit `credentialSharing: "personal" | "account"` signal (manifest
   field or central map). Default unknown → **personal** (fail safe).
2. **Personal providers — provenance-pinned resolution.** A Team workflow may use a personal credential
   **only** if it was connected by the workflow's `created_by_user_id` (which already exists on
   `workflows`). Resolution filters `connected_by_user_id = workflow.created_by_user_id`. No match →
   **fail with a clear "connect <provider> to run this workflow" error**; never silently fall back to a
   co-member's credential.
3. **Account/service providers — account-shared resolution** stays as-is (the token is a shared org
   resource).
4. **Offboarding** — when a member is removed from (or later leaves) a Team, **soft-disconnect the personal
   integrations they connected** for that account (`disconnected_at = now()` where
   `connected_by_user_id = <removed user>` and provider is personal). At minimum they must stop resolving.
5. **Builder/AI consistency** — when options + AI tools move to active-account scope, apply the **same**
   provenance filter for personal providers so previews and execution agree.
6. **Determinism** — give the null-`providerAccountId` path a stable `ORDER BY created_at` regardless of
   the above, removing arbitrary selection.

## Recommended implementation slices (if adopted)

- **Slice A — provider classification.** Add `credentialSharing` to the manifest contract; set it per
  provider; export `isPersonalCredentialProvider(provider)`. *No behavior change yet.*
- **Slice B — execution provenance scoping.** Extend `getActiveForExecution` (+ `refreshAndRetry`) with an
  optional `connectedByUserId` filter and deterministic ordering; the engine passes
  `workflow.created_by_user_id` for personal providers; account providers unchanged.
- **Slice C — offboarding revoke.** On `removeMember` (and a future leave flow), soft-disconnect personal
  integrations connected by the departing member for that account.
- **Slice D — builder/AI consistency.** When options/AI adopt active-account scope, carry the provenance
  filter so they never surface or resolve a co-member's personal credential.
- **(Future, out of scope) — explicit credential sharing.** Per-node connection picker + an owner opt-in to
  share a specific personal credential with the team. Only then does account-wide personal sharing become
  intentional rather than accidental.

## Tests required to prove the rule

- **Repo (Slice B):** `getActiveForExecution` with `connectedByUserId` returns only that user's row; null
  path is deterministically ordered. (`tests/unit/repositories/integrations-getActiveForExecution.test.ts`)
- **Execution security:** a Team workflow created by member A, with both A's and B's Gmail connected,
  resolves **A's** credential — never B's — and a manual trigger never picks B's mailbox.
- **No-fallback:** personal provider with no credential for `created_by_user_id` → clear connect-required
  failure, **not** a co-member's credential.
- **Account providers unchanged:** Slack/Notion still resolve the single account-shared row.
- **Offboarding (Slice C):** after removing member B, a Team workflow can no longer resolve B's Gmail.
- **Classification (Slice A):** every provider manifest carries a `credentialSharing` value; unknown
  defaults to personal.
- **Builder/AI (Slice D):** options + AI tools return only the caller-usable credential for personal
  providers once active-account scoped.

## Provenance / evidence (file references)

- `repositories/integrations.ts` — `getActiveForExecution` (L205-229, provenance-blind, null-path
  `.limit(1)` no order), `upsertActive` preserves `connected_by_user_id` (L141-145), `listActiveByAccount`
  (co-member RLS).
- `services/oauth/refreshAndRetry.ts:160,217` — handler credential resolution path.
- `integrations/microsoft-outlook/actions/sendEmail.ts:92-112` — trigger-derived-or-null
  `providerAccountId`.
- `app/api/options/[source]/route.ts:144`, `services/ai/tools/integrations.ts:113`,
  `services/ai/tools/workflowContext.ts:71` — personal-account scoping (pre-switcher).
- `services/accounts/membership.ts` (`removeMember`) — no integration revoke on member removal.
- `services/accounts/accountPurge.ts:181-185` — integrations revoked only on full account purge.
- `supabase/migrations/20260530000002_integrations_account_cutover.sql`,
  `20260530000003_workflows_account_cutover.sql` (`workflows.created_by_user_id` provenance),
  `20260505000002_integrations.sql` (base schema; no `status`).
- Manifests: `tokenScope` tally 44 `"user"` / 3 `"workspace"` — not a reliable sharing classifier.

## AI guidance context note (HERMES-AGENT-MEMORY-SCOPE-GUARD, 2026-06-21)

The same personal-vs-account credential classification (`core/integrations/credentialSharing.ts`)
now also gates what AI workflow guidance may learn about credentials. `buildSafeGuidanceContext`
(`services/ai-guidance/guidanceContextPolicy.ts`) may summarize **account-shared** connection
availability and the **caller's own** connections, but NEVER another member's private connection — a
team workflow that uses a personal-provider connection owned by a different member yields only a
generic notice (no owner identity/credential). A team/shared account does not share private AI memory;
guidance is request-scoped (no durable AI memory store). See
`docs/slices/phase-5/hermes-agent-production-topology.md` (AI context / memory scopes).

HERMES-AGENT-CREDENTIAL-AVAILABILITY-CONTEXT (2026-06-21) wired the LIVE source:
`services/integrations/guidanceCredentialAvailability.ts` reads `integrations.listActiveByAccount` and
returns provider KEYS (+ registry display names) only — account-class → account-shared; the current
user's own personal connections → their own; another member's private connection excluded. No token /
secret / provider account id / integration id / owner id / account id / row displayName. Conservative:
explicitly-shared personal connections (CS slices) are not yet summarized as account-shared.
