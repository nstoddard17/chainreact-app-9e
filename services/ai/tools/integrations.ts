/**
 * AI grounding tool for the caller's connected integrations (Slice 4.AI-2).
 *
 * Plan reference: docs/slices/phase-4/ai-architecture-react-agent-plan.md §5/§8.
 *
 * Returns integration AVAILABILITY, never credentials. The view is built by
 * explicit allow-list (provider / account label / account scope / scope count)
 * so token material is structurally absent. Read-only; no model calls.
 *
 * Scope: `listActiveByUser` is RLS-scoped to the caller, so this only ever
 * returns the caller's own active integrations — disconnected providers
 * simply don't appear (the agent infers "not connected" from absence). V2
 * does not yet model per-integration health / reconnect state; when that
 * lands (see plan §8 follow-up) it is added here without changing the shape's
 * redaction guarantees.
 */

import type { TokenScope } from "@/contracts/integration";
import { getProvider } from "@/integrations/_registry";
import {
  listActiveByAccount,
  type IntegrationRecord,
} from "@/repositories/integrations";
import { ensurePersonalAccount } from "@/services/accounts/ensurePersonalAccount";
import { isAccountCredentialProvider } from "@/core/integrations/credentialSharing";
import { resolveWorkflowCreatorContext } from "@/services/options/workflowCreatorContext";
import { aiToolErr, aiToolOk, type AiToolResult } from "./types";

export interface ConnectedIntegrationView {
  readonly provider: string;
  /** Always true — only active (non-disconnected) rows are returned. */
  readonly connected: true;
  /** Provider-supplied account display name (e.g. "My Slack Team"), or null. */
  readonly accountLabel: string | null;
  /**
   * Whether the integration is user- or workspace-bound (the manifest's
   * `tokenScope`). Named `accountScope` here to avoid any confusion with token
   * material — this is a binding enum (`"user" | "workspace"`), never a token.
   */
  readonly accountScope: TokenScope | null;
  /** Count of granted OAuth scopes (the scope strings themselves are omitted to stay compact). */
  readonly scopeCount: number;
  /**
   * The installing-user's identity INSIDE this provider, when the OAuth flow
   * captures it (Slice 4.AI-17). Used by the planner to resolve "me" in
   * phrases like "send me a Slack DM" → the actual Slack user id, instead of
   * asking the user for an id they shouldn't have to type. Provider-specific
   * source map:
   *
   *   - `slack`: `accountMetadata.authedUserId` — the `authed_user.id` field
   *     Slack returns from `oauth.v2.access`. NOT the bot user id, NOT the
   *     team id, NOT a token. Public Slack id (U-prefixed); the same id the
   *     user types into the Send DM action's `userId` field manually.
   *
   * Other providers populate this only as their OAuth captures the field
   * (Gmail's `providerAccountId` is already the email, so a future iteration
   * may surface it here for consistency). Omitted when unknown — the planner
   * then asks via `requiredUserInput`.
   */
  readonly currentUserId?: string;
  /**
   * Slice 4.ACCOUNT-MODEL-22D-3 — set when this is a PERSONAL-credential
   * provider connected by the workflow OWNER and the requester is NOT the
   * owner. The owner's `accountLabel` / `currentUserId` / scope detail are
   * redacted (label → null, scopeCount → 0, currentUserId omitted): the
   * requester learns the step will run under the owner's connection WITHOUT any
   * identifying metadata. Absent for the owner's own view, account providers,
   * and the no-workflow-context legacy view.
   */
  readonly ownerControlled?: true;
}

export interface ConnectedIntegrationsView {
  readonly integrations: readonly ConnectedIntegrationView[];
}

/**
 * Per-provider mapping of the installing user's in-provider identity
 * (Slice 4.AI-17). Read-only allow-list — only documented metadata fields
 * are reachable, and only ones that are public identifiers (no tokens).
 * Returns undefined when the provider doesn't yet have a "me" capture
 * path, so the planner falls back to `requiredUserInput`.
 */
function extractCurrentUserId(
  record: IntegrationRecord,
): string | undefined {
  if (record.provider === "slack") {
    const id = record.accountMetadata?.["authedUserId"];
    return typeof id === "string" && id.length > 0 ? id : undefined;
  }
  return undefined;
}

function toView(record: IntegrationRecord): ConnectedIntegrationView {
  const manifest = getProvider(record.provider);
  const currentUserId = extractCurrentUserId(record);
  return {
    provider: record.provider,
    connected: true,
    accountLabel: record.displayName,
    accountScope: manifest?.tokenScope ?? null,
    scopeCount: record.scopes.length,
    ...(currentUserId ? { currentUserId } : {}),
  };
}

/**
 * Redacted view of a PERSONAL provider connected by the workflow OWNER, shown
 * to a NON-owner editor (Slice 4.ACCOUNT-MODEL-22D-3). Carries the provider +
 * binding enum only — the owner's display name (often their email), in-provider
 * id, and scope detail are stripped. The agent learns the step runs under the
 * owner's connection without any data that identifies the owner.
 */
function toOwnerControlledView(record: IntegrationRecord): ConnectedIntegrationView {
  const manifest = getProvider(record.provider);
  return {
    provider: record.provider,
    connected: true,
    accountLabel: null,
    accountScope: manifest?.tokenScope ?? null,
    scopeCount: 0,
    ownerControlled: true,
  };
}

/**
 * List the connected integrations as a redacted availability view.
 * Multiple accounts for the same provider produce multiple entries.
 *
 * **Credential-sharing policy (Slice 4.ACCOUNT-MODEL-22D-3).** When a
 * `workflowId` is supplied AND resolves (the requester is a member of the
 * workflow's account — `getById` is RLS-scoped), the view is scoped to that
 * workflow's account and filtered the way execution (22B) resolves credentials:
 *   - **account/service providers** (Slack / Notion / Stripe / …) → shown,
 *     account-shared.
 *   - **personal providers connected by the workflow creator** → full view for
 *     the creator; a redacted `ownerControlled` view for a non-creator editor
 *     (no label / email / in-provider id).
 *   - **personal providers connected by a CO-MEMBER** → omitted entirely; a
 *     co-member's personal credential is never enumerated to anyone.
 *
 * Without a workflow context the legacy behavior is preserved: the requester's
 * OWN personal account, full view — every row is the requester's own
 * credential, so nothing leaks.
 *
 * The `workflowId` resolution is best-effort: an absent / unresolvable id falls
 * back to the legacy personal-account view (never an error).
 */
export async function getConnectedIntegrationsForAI(
  userId: string,
  workflowId?: string,
): Promise<AiToolResult<ConnectedIntegrationsView>> {
  const workflowCreator =
    workflowId !== undefined
      ? await resolveWorkflowCreatorContext(workflowId)
      : null;

  let records: readonly IntegrationRecord[];
  try {
    const accountId = workflowCreator
      ? workflowCreator.accountId
      : (await ensurePersonalAccount(userId)).id;
    records = await listActiveByAccount(accountId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load connected integrations.");
  }

  // The view is built field-by-field from a fixed allow-list, so token
  // material is structurally absent — no post-hoc redaction pass is needed
  // (and a blanket pass would wrongly clobber legitimate fields). The no-leak
  // test pins this guarantee.

  // No workflow context → editor's own account; the full view is safe.
  if (!workflowCreator) {
    return aiToolOk({ integrations: records.map(toView) });
  }

  // Workflow context → apply the credential-sharing policy per row.
  const isCreator = userId === workflowCreator.createdByUserId;
  const integrations: ConnectedIntegrationView[] = [];
  for (const record of records) {
    if (isAccountCredentialProvider(record.provider)) {
      integrations.push(toView(record)); // account-shared, team-visible
      continue;
    }
    // personal provider — only the creator's credential is ever surfaced.
    if (record.connectedByUserId !== workflowCreator.createdByUserId) {
      continue; // co-member personal credential — never enumerated
    }
    integrations.push(
      isCreator ? toView(record) : toOwnerControlledView(record),
    );
  }
  return aiToolOk({ integrations });
}
