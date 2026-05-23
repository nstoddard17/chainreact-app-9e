import {
  DiscordApiError,
  DiscordBotTokenMissingError,
  NotFoundError,
} from "@/integrations/_shared/discord/errors";
import { OptionsResolverError } from "@/services/options/types";

/**
 * Shared error-classification helper for the Discord options
 * resolvers — Slice 3.DISCORD-3.
 *
 * Discord differs from refreshable-OAuth providers (Mailchimp /
 * HubSpot / Google Sheets) on the failure surface because there is no
 * per-user OAuth token in play at action time. All API calls
 * authenticate as the global env bot, so the failure modes available
 * to a resolver are:
 *
 *   - `DiscordBotTokenMissingError`: the deployment is misconfigured
 *     (`DISCORD_BOT_TOKEN` env var unset). Operator action required —
 *     NOT a user reconnect. Surfaces as `PROVIDER_ERROR` with a
 *     user-facing message that doesn't blame the workflow author.
 *
 *   - `NotFoundError`: the requested guild / channel / role no longer
 *     exists (renamed, archived, bot removed from server). The
 *     resolver returns empty `items` rather than throwing — same
 *     "parent no longer exists" pattern HubSpot uses for deal stages.
 *     Caller of this helper should check for `NotFoundError` BEFORE
 *     calling this and short-circuit on its own. This helper is for
 *     all-other-errors.
 *
 *   - `DiscordApiError` 401: the bot token is invalid / revoked. Same
 *     "operator action required" class as the missing-token case.
 *     `PROVIDER_ERROR`.
 *
 *   - `DiscordApiError` 403: bot is not in the guild OR lacks
 *     permissions for the requested resource. Distinct from "user
 *     needs to reconnect" — the user's Discord identity OAuth is
 *     irrelevant; this is a bot-install / bot-permissions issue. We
 *     surface as `PROVIDER_ERROR` with bot-context guidance.
 *
 *   - Anything else: `PROVIDER_ERROR` with a generic caller-friendly
 *     message. Raw provider response bodies are NEVER passed through
 *     (the bot-token value would leak via the URL in some error
 *     shapes).
 *
 * Never throws `INTEGRATION_DISCONNECTED` from this helper — that
 * code is for refreshable-OAuth providers whose user-OAuth token has
 * decayed. Discord's per-user OAuth row isn't load-bearing for
 * resolver calls. The route's pre-call integration gate (when
 * `requiresIntegration: true`) still returns `INTEGRATION_DISCONNECTED`
 * when no integration row exists at all — that path doesn't reach the
 * resolver.
 */
export function classifyDiscordResolverError(
  err: unknown,
  resourceLabel: string,
): OptionsResolverError {
  if (err instanceof DiscordBotTokenMissingError) {
    return new OptionsResolverError(
      "PROVIDER_ERROR",
      "Discord bot is not configured. Contact your workspace admin.",
    );
  }
  if (err instanceof DiscordApiError) {
    if (err.status === 401) {
      return new OptionsResolverError(
        "PROVIDER_ERROR",
        "Discord bot token is invalid. Contact your workspace admin.",
      );
    }
    if (err.status === 403) {
      return new OptionsResolverError(
        "PROVIDER_ERROR",
        `Discord bot lacks access to ${resourceLabel}. Confirm the bot is added to your server and has the required permissions.`,
      );
    }
  }
  return new OptionsResolverError(
    "PROVIDER_ERROR",
    `Couldn't load Discord ${resourceLabel}. Try again.`,
  );
}

export { NotFoundError };
