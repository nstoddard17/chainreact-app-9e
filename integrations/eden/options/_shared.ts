import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared helpers for the Eden options resolvers (EDEN-4).
 *
 * Auth model: Eden is `token_paste` + **non-refreshable**. Like Trello, the resolvers decrypt the
 * stored token and call the read wrappers directly (no `refreshAndRetry`). A bad token surfaces as
 * `Unauthorized401Error` (from the MCP seam), mapped here to `INTEGRATION_DISCONNECTED`. A read-only
 * token surfaces as `InsufficientScopeError`, mapped to a reconnect-with-write hint. The token, raw
 * envelopes, and any private content NEVER reach the browser — resolvers map only id/name.
 */

export function requireEdenIntegration(ctx: OptionsResolverContext): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError("INTEGRATION_DISCONNECTED", "No active Eden integration. Connect Eden first.");
  }
  return ctx.integration;
}

export function mapEdenOptionsError(err: unknown): never {
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    throw new OptionsResolverError("INTEGRATION_DISCONNECTED", "Reconnect Eden and try again.");
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError("INTEGRATION_DISCONNECTED", "Reconnect Eden with Read & write access and try again.");
  }
  if (err instanceof OptionsResolverError) throw err;
  throw new OptionsResolverError("PROVIDER_ERROR", "Couldn't load Eden options. Try again.");
}

export function filterByLabel<T extends OptionItem>(items: ReadonlyArray<T>, q: string): T[] {
  const lowerQ = q.toLowerCase();
  return lowerQ.length > 0 ? items.filter((i) => i.label.toLowerCase().includes(lowerQ)) : [...items];
}
