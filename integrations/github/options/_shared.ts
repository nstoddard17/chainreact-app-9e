import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared guards + error mapping for the GitHub options resolvers —
 * RESOLVERS-1. Mirrors the QuickBooks `_shared` posture, adapted to
 * GitHub's auth model:
 *
 * GitHub is PERSONAL + NON-REFRESHABLE, so resolvers decrypt the stored
 * token and call the read helpers directly (the `github:repos` /
 * Slack / Trello decrypt-direct pattern) — NOT `refreshAndRetry`.
 *
 * Error sanitization (nothing provider-raw reaches the browser):
 *   - 401 → `PROVIDER_REAUTH_REQUIRED` (tokens are non-refreshable;
 *     reconnect is the fix).
 *   - rate limit → `PROVIDER_ERROR` ("try again shortly").
 *   - anything else → `PROVIDER_ERROR` with a static message.
 * Never carries the raw GitHub error body or token in the thrown
 * message.
 */

export function requireGithubIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active GitHub connection. Connect GitHub first.",
    );
  }
  return ctx.integration;
}

/** Map a wrapper/API failure to a sanitized OptionsResolverError. Never returns. */
export function mapGithubOptionsError(err: unknown, what: string): never {
  if (err instanceof OptionsResolverError) throw err;
  if (err instanceof Unauthorized401Error) {
    throw new OptionsResolverError(
      "PROVIDER_REAUTH_REQUIRED",
      `Reconnect GitHub to load your ${what}.`,
    );
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/rate limit/i.test(message)) {
    throw new OptionsResolverError(
      "PROVIDER_ERROR",
      "GitHub's rate limit was reached. Try again shortly.",
    );
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load GitHub ${what}. Try again.`,
  );
}

/** Case-insensitive substring filter on labels, then alpha sort. */
export function filterAndSortByLabel(
  items: readonly OptionItem[],
  q: string,
): OptionItem[] {
  const lowerQ = q.toLowerCase();
  const filtered =
    lowerQ.length > 0
      ? items.filter((item) => item.label.toLowerCase().includes(lowerQ))
      : [...items];
  return filtered.sort((a, b) => a.label.localeCompare(b.label));
}
