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
 * Shared helpers for the Microsoft OneDrive options resolvers —
 * Slice 4.ONEDRIVE-META-2.
 *
 * The two OneDrive resolvers (`folders`, `items`) share the same
 * integration guard, dependency guard, error sanitization, q-filter, and
 * modified-date formatter. Centralizing them keeps each resolver file to
 * its mapping logic and avoids duplicating the sanitization rules (which
 * must never leak the access/refresh token, raw Graph bodies, file
 * contents, or `@microsoft.graph.downloadUrl` URLs).
 *
 * **Auth model.** OneDrive is OAuth v2 + **refreshable** (manifest
 * `refreshable: true`). Resolvers wrap the Graph read in
 * `refreshAndRetry({ provider: "microsoft-onedrive", accountId })`
 * (the Excel / OneNote pattern) so a stale access token triggers exactly
 * one refresh + retry — NOT the Trello decrypt-direct pattern (Trello is
 * non-refreshable). Transport stays in `api/driveItemsList`; this module
 * adds none.
 */

/** Single-page size for the OneDrive pickers (Graph `$top`). */
export const PAGE_SIZE = 100;

/**
 * Resolve + return the active integration, or throw a sanitized
 * INTEGRATION_DISCONNECTED. The route already short-circuits when no
 * active row exists; this is in-resolver defense-in-depth for direct
 * invocations.
 */
export function requireOneDriveIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Microsoft OneDrive integration. Connect OneDrive first.",
    );
  }
  return ctx.integration;
}

/**
 * Read a required dependency value or throw MISSING_DEPENDENCY. The route
 * validates `requiredDeps` before dispatch; this in-resolver guard covers
 * direct invocations and keeps the no-API-call contract explicit.
 * `humanLabel` drives a caller-safe hint ("Select a folder first.").
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
 * token, raw Graph response bodies, file contents, or download URLs.
 * Returns `never` so callers can use it as a terminating statement in a
 * `catch` (TS definite-assignment friendly).
 *
 * Note: `NotFoundError` is intentionally NOT handled here — a missing /
 * no-access parent folder is a cascade fallback (return empty items),
 * which is control flow the child resolver owns before delegating here.
 */
export function mapOneDriveOptionsError(err: unknown): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Microsoft OneDrive and try again.",
    );
  }
  if (err instanceof OptionsResolverError) {
    // A guard (MISSING_DEPENDENCY etc.) already classified this — keep it.
    throw err;
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    "Couldn't load OneDrive items. Try again.",
  );
}

/**
 * Case-insensitive substring filter on each item's `label`. Preserves
 * input order — callers that want a different order sort BEFORE filtering.
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
 * Format a `Modified YYYY-MM-DD` description from a Graph
 * `lastModifiedDateTime` ISO string. Returns `undefined` for missing /
 * malformed values. Mirrors the Excel workbooks resolver — modified dates
 * are safe, non-secret metadata that disambiguate similarly-named items.
 */
export function formatModified(lastModifiedDateTime: unknown): string | undefined {
  if (
    typeof lastModifiedDateTime !== "string" ||
    lastModifiedDateTime.length === 0
  ) {
    return undefined;
  }
  const datePart = lastModifiedDateTime.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return undefined;
  return `Modified ${datePart}`;
}
