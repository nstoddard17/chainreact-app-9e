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

/**
 * Split the `repository` dep (`owner/repo` — the exact value `github:repos`
 * stores) into `{ owner, repo }`, or `null` when it isn't `owner/repo`-shaped.
 *
 * Returns null rather than throwing: a half-typed manual entry is the normal
 * mid-edit state, and every repo-scoped resolver (`branches` / `labels` /
 * `assignees`) turns null into an empty option list — an empty picker with
 * manual entry beats a scary error state. Deliberately NOT
 * `actions/_parseRepository.ts`, which throws AND echoes the raw value into
 * the message (fine for a handler, wrong for a browser-facing picker).
 */
export function parseRepositoryDep(
  repository: string,
): { owner: string; repo: string } | null {
  const slash = repository.indexOf("/");
  if (
    slash <= 0 ||
    slash === repository.length - 1 ||
    repository.slice(slash + 1).includes("/") ||
    /\s/.test(repository)
  ) {
    return null;
  }
  return {
    owner: repository.slice(0, slash),
    repo: repository.slice(slash + 1),
  };
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
