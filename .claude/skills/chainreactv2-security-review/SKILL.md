---
name: chainreactv2-security-review
description: Use for auditing OR implementing any ChainReactV2 area that handles sensitive state — OAuth tokens, personal/account credentials, API keys, webhooks, account/team membership, RLS policies, service-role RPCs/routes, account deletion, owner transfer/leave, team-workflow credential reassignment, billing/usage gates, or public (unauthenticated) endpoints. Enforces no-leak defaults (no token/email/label/scope/hash exposure, non-members can't infer existence, 404/no-leak, service-role-only writes, RLS+GRANT correctness, secrets shown once then hashed/encrypted, public endpoints have no session/active-account state and need durable rate limiting), and requires a threat note, RLS/GRANT review, no-leak tests, typed error mapping, and explicit confirmation of what did not change.
---

# ChainReactV2 Security Review / No-Leak Skill

Use this whenever a slice touches sensitive surface area. It applies to both **audits**
(produce a risk doc) and **implementation** (build it safely + prove no leaks).

> **Context first.** Before gathering ChainReactV2 repo/project context, follow the
> [`chainreactv2-mcp-context`](../chainreactv2-mcp-context/SKILL.md) skill — use the MCP for
> curated project memory and the relevant rule docs (`account-ownership-model`,
> `database-security`, `oauth-dispatcher`, `webhook-receipt-routes`) to orient, then inspect
> the actual code/RLS/routes before reviewing or changing anything.

## When this skill is mandatory

OAuth tokens · personal or account credentials · API keys/secrets · inbound/outbound
webhooks · account & team membership · RLS policies · service-role RPCs/routes · account
deletion · owner transfer / member leave · team-workflow credential reassignment ·
billing/usage gates · any public (unauthenticated) endpoint.

## Security defaults (non-negotiable)

**Credential / token exposure**
- Never expose OAuth tokens, refresh tokens, or raw secrets anywhere — not in responses,
  logs, errors, AI prompts/tool results, or persisted messages.
- A provider's account **label / email / scope list / scope count / token** must not leak
  across members unless intentionally allowed. Default for a co-member viewing someone's
  personal provider is the redacted `ownerControlled` shape
  ([`services/ai/tools/integrations.ts`](../../../services/ai/tools/integrations.ts) →
  `toOwnerControlledView`: `accountLabel: null`, `scopeCount: 0`, `ownerControlled: true`).
  Co-member personal providers are **never enumerated** at all.
- Personal-provider steps resolve **node-owner/creator → clear error**, never a silent
  co-member fallback (preserves the 22B invariant in
  [`services/oauth/refreshAndRetry.ts`](../../../services/oauth/refreshAndRetry.ts)).

**Existence / inference**
- Non-members must not be able to **infer that a resource exists.** Prefer **404 / generic
  no-leak** over 403 when distinguishing them would reveal existence or ownership.
- The client passes identity (`accountId`, `workflowId`, `nodeId`); the **server resolves
  who owns/may access** — never trust a client-supplied owner/account id.

**Database access**
- Writes to sensitive tables are **service-role / RPC only**, behind explicit role +
  consent checks (mirror `requireAccountRole` / membership gates). Route files must not
  hand raw service clients to clients.
- Authenticated **direct** (PostgREST/supabase-js) access must be **RLS-safe and
  GRANT-safe**: RLS gates rows, GRANTs let the role touch the table. Both required.
- Don't duplicate provider classification (personal vs account) in SQL — the central
  source is [`core/integrations/credentialSharing.ts`](../../../core/integrations/credentialSharing.ts).
  SQL should not re-encode that map.

**Secrets lifecycle**
- Raw API keys / secrets are shown **once at creation**, then only a prefix/last-4.
- Store a **hash or encrypted** value, never the raw secret. Compare by hash.

**Public endpoints**
- Must NOT use session auth or active-account state (no cookies/Zustand active account).
  Authenticate by the endpoint's own credential (e.g. API key hash, webhook signature).
- Need **durable (not in-memory) rate limiting** before being turned ON in production.
- Verify inbound webhook signatures; dedup deliveries.

**Flags**
- Risky/public features ship behind `process.env.ENABLE_<NAME> === "true"`, **default
  OFF**, until verified.

## Required deliverables for a sensitive slice

1. **Threat / risk note** — what's sensitive here, who could see what they shouldn't, what
   could be forged or inferred, and how this slice closes it. (For an audit, this is the
   doc's core.)
2. **RLS + GRANT review** for any migration — see
   [`migration-security-checklist.md`](./migration-security-checklist.md).
3. **No-leak tests** — assert no token/email/label/scope/scope-count/hash appears in
   responses, AI surfaces, or logs; assert non-members get 404/no-leak; assert
   service-role-only writes are unreachable by authenticated direct access.
4. **Typed error mapping** — sensitive failures map to typed, generic errors
   (`NOT_WORKFLOW_OWNER`, `OWNER_MUST_CONNECT`, etc.), never raw provider/DB errors that
   leak detail.
5. **No raw-secret logging** — confirm log sites are scrubbed.
6. **Explicit "what did not change"** — name the invariants you preserved (e.g. "no
   co-member fallback added", "`created_by_user_id` not rewritten").

## Output

- **Audit:** a doc under `docs/slices/<phase>/...` (use the planning-doc structure) +
  this skill's threat note. Docs-only, local commit, no push.
- **Implementation:** the change + no-leak tests + the security report. Run
  `npm run typecheck`, `npm run lint:migrations` (if migrations), and the relevant
  `npm test` suites. If the slice creates a migration, also apply it to the V2 dev DB with
  `npm run db:push` by default (unless Marcus explicitly says not to) — only after the
  RLS + GRANT review passes. `db:push` ≠ git push; only git push stays forbidden. Local
  commit, no git push.

Use [`no-leak-test-checklist.md`](./no-leak-test-checklist.md) to make the test pass
meaningful.
