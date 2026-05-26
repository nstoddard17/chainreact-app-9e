import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Shared helpers for the Microsoft Teams options resolvers —
 * Slice 4.TEAMS-META-2.
 *
 * The two Teams resolvers (`teams`, `channels`) share the same integration
 * guard, dependency guard, error sanitization, q-filter, and description
 * formatter. Centralizing them keeps each resolver file to its mapping
 * logic and avoids duplicating the sanitization rules (which must never
 * leak the access/refresh token, raw Graph bodies, channel message
 * content, or member emails).
 *
 * **Auth model.** Teams is OAuth v2 + **refreshable** → resolvers wrap the
 * Graph read in `refreshAndRetry({ provider: "microsoft-teams", accountId })`
 * (the Excel / OneDrive pattern), NOT the Trello decrypt-direct pattern.
 * Transport stays in `api/teamsList` / `api/channelsList`; this module adds
 * none.
 */

/**
 * Resolve + return the active integration, or throw a sanitized
 * INTEGRATION_DISCONNECTED. The route already short-circuits when no active
 * row exists; this is in-resolver defense-in-depth for direct invocations.
 */
export function requireTeamsIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Microsoft Teams integration. Connect Teams first.",
    );
  }
  return ctx.integration;
}

/**
 * Read a required dependency value or throw MISSING_DEPENDENCY. The route
 * validates `requiredDeps` before dispatch; this in-resolver guard covers
 * direct invocations and keeps the no-API-call contract explicit.
 */
export function requireDep(
  ctx: OptionsResolverContext,
  name: string,
  humanLabel: string,
): string {
  const value = ctx.deps[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new OptionsResolverError(
      "MISSING_DEPENDENCY",
      `Select a ${humanLabel} first.`,
    );
  }
  return value;
}

/**
 * Map a thrown error to a sanitized OptionsResolverError. NEVER leaks the
 * token, raw Graph response bodies, channel message content, or member
 * emails. Returns `never` so callers can use it as a terminating statement
 * in a `catch` (TS definite-assignment friendly).
 *
 * Note: `NotFoundError` is intentionally NOT handled here — a missing /
 * no-access parent team is a cascade fallback (return empty items), which
 * is control flow the child resolver owns before delegating here.
 */
export function mapTeamsOptionsError(err: unknown): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Microsoft Teams and try again.",
    );
  }
  if (err instanceof OptionsResolverError) {
    // A guard (MISSING_DEPENDENCY etc.) already classified this — keep it.
    throw err;
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    "Couldn't load Teams options. Try again.",
  );
}

/**
 * Case-insensitive substring filter matching either `label` OR
 * `description`. Teams display names can collide (multiple "General"
 * channels across teams), so matching the description (team/channel
 * description, membershipType) widens findability.
 */
export function filterByLabelOrDescription<T extends OptionItem>(
  items: ReadonlyArray<T>,
  q: string,
): T[] {
  const lowerQ = q.toLowerCase();
  if (lowerQ.length === 0) return [...items];
  return items.filter(
    (i) =>
      i.label.toLowerCase().includes(lowerQ) ||
      (i.description !== undefined &&
        i.description.toLowerCase().includes(lowerQ)),
  );
}

const MAX_DESCRIPTION = 160;

/**
 * Trim + length-cap a raw description into a safe, non-verbose picker
 * `description`, or `undefined` when empty / non-string. Team & channel
 * descriptions are user-authored titles (not secrets), but can be long —
 * cap them so the picker stays readable.
 */
export function safeDescription(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > MAX_DESCRIPTION
    ? `${trimmed.slice(0, MAX_DESCRIPTION)}…`
    : trimmed;
}
