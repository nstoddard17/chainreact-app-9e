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
  listActiveByUser,
  type IntegrationRecord,
} from "@/repositories/integrations";
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
 * List the caller's connected integrations as a redacted availability view.
 * Multiple accounts for the same provider produce multiple entries.
 */
export async function getConnectedIntegrationsForAI(
  userId: string,
): Promise<AiToolResult<ConnectedIntegrationsView>> {
  let records: readonly IntegrationRecord[];
  try {
    records = await listActiveByUser(userId);
  } catch {
    return aiToolErr("SERVER_ERROR", "Couldn't load connected integrations.");
  }

  // The view is built field-by-field from a fixed allow-list, so token
  // material is structurally absent — no post-hoc redaction pass is needed
  // (and a blanket pass would wrongly clobber legitimate fields). The no-leak
  // test pins this guarantee.
  const integrations = records.map(toView);
  return aiToolOk({ integrations });
}
