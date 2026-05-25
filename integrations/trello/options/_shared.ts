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
 * Shared helpers for the Trello options resolvers — Slice 4.TRELLO-META-2.
 *
 * The five Trello resolvers (`boards`, `lists`, `cards`, `members`,
 * `labels`) share the same integration guard, dependency guard, error
 * sanitization, and q-filter. Centralizing them here keeps each resolver
 * file to its mapping logic and avoids duplicating the sanitization rules
 * (which must never leak the user token / raw Trello bodies / card
 * descriptions / comments / attachment URLs / request URLs).
 *
 * **Auth model.** Trello is token-ingest + **non-refreshable** (manifest
 * `refreshable: false`). Unlike the Airtable / Microsoft resolvers (which
 * wrap calls in `refreshAndRetry`), the Trello resolvers decrypt the
 * stored token and call the read helpers directly — mirroring the
 * trigger `activate` (`decryptToken(integration.accessTokenEncrypted)`)
 * and the Slack resolver precedent. A 401 surfaces from `trelloRequest`
 * as `Unauthorized401Error`, which this module maps to
 * `INTEGRATION_DISCONNECTED` ("reconnect Trello") — there is no token to
 * refresh. Transport stays in `api/_request.ts`; this module adds none.
 */

/**
 * Resolve + return the active integration, or throw a sanitized
 * INTEGRATION_DISCONNECTED. The route already short-circuits when no
 * active row exists; this is in-resolver defense-in-depth for direct
 * invocations.
 */
export function requireTrelloIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Trello integration. Connect Trello first.",
    );
  }
  return ctx.integration;
}

/**
 * Read a required dependency value or throw MISSING_DEPENDENCY. The route
 * validates `requiredDeps` before dispatch; this in-resolver guard covers
 * direct invocations and keeps the no-API-call contract explicit.
 * `humanLabel` drives a caller-safe hint ("Select a board first.").
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
 * user token, raw Trello response bodies, card descriptions / comments /
 * attachment URLs, or request URLs (which carry `?key=`/`?token=`).
 * Returns `never` so callers can use it as a terminating statement in a
 * `catch` (TS definite-assignment friendly).
 *
 * Note: `TrelloNotFoundError` is intentionally NOT handled here — a
 * missing / no-access parent board is a cascade fallback (return empty
 * items), which is control flow each child resolver owns before
 * delegating to this mapper.
 */
export function mapTrelloOptionsError(err: unknown): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Trello and try again.",
    );
  }
  if (err instanceof OptionsResolverError) {
    // A guard (MISSING_DEPENDENCY etc.) already classified this — keep it.
    throw err;
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    "Couldn't load Trello options. Try again.",
  );
}

/**
 * Case-insensitive substring filter on each item's `label`. Used by the
 * boards / lists / cards resolvers (whose label is the only meaningful
 * search axis). Members + labels use `filterByLabelOrDescription` so
 * username / color also match.
 */
export function filterByLabel<T extends OptionItem>(
  items: ReadonlyArray<T>,
  q: string,
): T[] {
  const lowerQ = q.toLowerCase();
  return lowerQ.length > 0
    ? items.filter((i) => i.label.toLowerCase().includes(lowerQ))
    : [...items];
}

/**
 * Case-insensitive substring filter matching either `label` OR
 * `description`. Used by the members resolver (label=fullName,
 * description=username → matches on either) and the labels resolver
 * (label=name|color, description=color → matches name or color), per the
 * TRELLO-META-2 plan's "filter on label/username" / "label/color" rules.
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
