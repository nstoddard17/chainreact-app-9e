# Public MCP — integration-usage authorization

Status: foundation shipped (Slice 4.PUBLIC-MCP-USAGE-1). Public MCP endpoint stays
gated by `ENABLE_PUBLIC_MCP` (default OFF). No write/run tools exist yet.

## The rule

Public MCP tokens are **account-scoped**: a token is bound to exactly one account,
and every request is verified (valid + not revoked + not expired) and re-checks that
the token minter is still a member of that account.

**Account scope is not enough.** Provider integrations require a SECOND,
actor-level authorization. Account ownership of an integration does **not** mean
every team member, MCP token, or external LLM may use that external identity.

- **Shared service / account integrations** (Slack, Stripe, Notion, Shopify,
  HubSpot, Mailchimp, …) — shared by classification. Usable by any account member.
- **Member-connected identity integrations** (Outlook mailboxes, Gmail mailboxes,
  personal Google/Microsoft calendars, Drive, OneDrive, Discord, …) — **private to
  the connector by default**. The connector may always use their own connection.
  A different member may use it **only** when explicit connection-sharing is enabled
  (`ENABLE_CONNECTION_SHARING`) **and** the connector opted that row into
  `integration_sharing_scope = 'shared_with_account'`.

This grants **no more** than the ChainReact UI's run/edit gate. With
`ENABLE_CONNECTION_SHARING` OFF (today's default) the rule is byte-identical to the
legacy creator-pinned `viewerMayRunEdit`: a co-member can never use another member's
mailbox/calendar identity. There is **no invented broad sharing** — the only sharing
honored is the existing `integration_sharing_scope` column, read through the
canonical fail-safe helper `effectiveIntegrationSharingScope`.

## The seam

`canActorUseIntegrationForMcp({ actorUserId, accountId, integrationId, purpose })`
([services/mcp/integrationUsage.ts](../../services/mcp/integrationUsage.ts)) is the
reusable gate every current and future MCP tool that touches a connection must pass.
It composes, in order:

1. **Existence + account scope** — `getByIdForAccountServiceRole(accountId, id)`
   filters on `(id, account_id)`, so an integration from another account resolves to
   `not_found` (opaque; no cross-account existence oracle).
2. **Membership** — the actor must still be a member (offboarding → `not_a_member`,
   before the usage policy runs).
3. **Usage policy** — `decideIntegrationUsage`
   ([core/integrations/integrationUsagePolicy.ts](../../core/integrations/integrationUsagePolicy.ts)),
   pure, reusing `credentialSharing` classification + `effectiveIntegrationSharingScope`.
   A denied member-connected identity returns the typed
   `INTEGRATION_NOT_ALLOWED_FOR_ACTOR` (`reason: "integration_not_allowed_for_actor"`).

`purpose` (`"read" | "configure_workflow" | "run_workflow"`) is threaded for future
per-purpose tightening; v1 applies the identity rule uniformly. Run-time per-node
owner ambiguity (2+ sharers) is resolved by the engine's existing `resolveNodeOwner`
when run tools land — not here.

## list_integrations

`list_integrations` annotates each connection with a per-viewer
`usage: "available" | "not_available"` plus a safe id-free `reason`, derived from the
same policy. It never marks another member's private identity usable, and never
exposes `connected_by_user_id`, OAuth scopes, token/encrypted columns, or provider
payloads.

## Before adding write/run tools

`create_workflow_draft`, `update_workflow_draft`, `run_workflow_now`, activation,
delete, disconnect, billing, and member-management tools are **out of scope** here.
When they land, each must call `canActorUseIntegrationForMcp` (with the matching
`purpose`) for every integration it would configure or run, and must not weaken the
member-connected-identity default.

## Tests

- [core/integrations/integrationUsagePolicy.test.ts](../../tests/unit/core/integrations/integrationUsagePolicy.test.ts) — pure rule (own vs co-member, account/service, flag-gated sharing, fail-safe defaults).
- [services/mcp/integrationUsage.test.ts](../../tests/unit/services/mcp/integrationUsage.test.ts) — ordered chain (cross-account not_found → membership → policy).
- [services/mcp/serialize.test.ts](../../tests/unit/services/mcp/serialize.test.ts) / [server.test.ts](../../tests/unit/services/mcp/server.test.ts) — `usage` annotation + no provenance/secret leak.
- [tests/integration/security/mcp-tokens-rls.test.ts](../../tests/integration/security/mcp-tokens-rls.test.ts) — live-DB account isolation, token/offboarding revocation, and co-member private-identity denial.
