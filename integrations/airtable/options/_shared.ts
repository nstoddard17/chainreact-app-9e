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
import type { AirtableTableMetadata } from "@/integrations/airtable/api/bases";

/**
 * Shared helpers for the Airtable options resolvers — Slice 4.AIRTABLE-META-2.
 *
 * The five Airtable resolvers (`bases`, `tables`, `fields`, `views`,
 * `attachment_fields`) share the same integration guard, dependency
 * guard, error sanitization, table lookup, and q-filter. Centralizing
 * them here keeps each resolver file to its mapping logic and avoids
 * duplicating the sanitization rules (which must never leak tokens /
 * raw Airtable bodies / record data). Transport + auth refresh stay in
 * the existing `api/_request.ts` + `services/oauth/refreshAndRetry.ts`
 * — this module adds no new transport.
 */

/**
 * Airtable metadata-API field `type` strings that denote an attachment
 * field. The canonical Web API value is `multipleAttachments`
 * (https://airtable.com/developers/web/api/field-model#multipleattachment).
 * `attachment` is accepted defensively because V2's internal
 * type-polymorphism layer (`_shared/airtable/fields.ts`) names the
 * write-side discriminator `attachment`; matching both avoids a silent
 * "no attachment fields found" if a surface reports the short name.
 */
export const ATTACHMENT_FIELD_METADATA_TYPES: ReadonlySet<string> = new Set([
  "multipleAttachments",
  "attachment",
]);

/**
 * Resolve + return the active integration, or throw a sanitized
 * INTEGRATION_DISCONNECTED. The route already short-circuits when no
 * active row exists; this is in-resolver defense-in-depth for direct
 * invocations.
 */
export function requireAirtableIntegration(
  ctx: OptionsResolverContext,
): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "No active Airtable integration. Connect Airtable first.",
    );
  }
  return ctx.integration;
}

/**
 * Read a required dependency value or throw MISSING_DEPENDENCY. The
 * route validates `requiredDeps` before dispatch; this in-resolver guard
 * covers direct invocations and keeps the no-API-call contract explicit.
 * `humanLabel` drives a caller-safe hint ("Select a base first.").
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
 * Map a thrown error to a sanitized OptionsResolverError. NEVER leaks
 * tokens, refresh tokens, raw Airtable response bodies, record data, or
 * request URLs. Returns `never` so callers can use it as a terminating
 * statement in a `catch` (TS definite-assignment friendly).
 *
 * Note: `NotFoundError` is intentionally NOT handled here — a missing /
 * no-access parent base or table is a cascade fallback (return empty
 * items), which is control flow each resolver owns before delegating to
 * this mapper.
 */
export function mapAirtableOptionsError(err: unknown): never {
  if (
    err instanceof IntegrationActionRequiredError ||
    err instanceof Unauthorized401Error
  ) {
    throw new OptionsResolverError(
      "INTEGRATION_DISCONNECTED",
      "Reconnect Airtable and try again.",
    );
  }
  if (err instanceof OptionsResolverError) {
    // A guard (MISSING_DEPENDENCY etc.) already classified this — keep it.
    throw err;
  }
  throw new OptionsResolverError(
    "PROVIDER_ERROR",
    "Couldn't load Airtable options. Try again.",
  );
}

/**
 * Find a table in a base schema by id OR name — mirrors the runtime
 * `tablesGet` lookup (`actions` accept either; the trigger uses ids).
 * Returns `undefined` when no table matches (caller maps to empty items).
 */
export function findTable(
  tables: ReadonlyArray<AirtableTableMetadata>,
  idOrName: string,
): AirtableTableMetadata | undefined {
  return tables.find((t) => t.id === idOrName || t.name === idOrName);
}

/**
 * Case-insensitive substring filter on each item's `label`. Preserves
 * input order (Airtable schema order is meaningful — it mirrors the
 * table-tab / field-column / view order in the Airtable UI). Bases get
 * an explicit alpha sort in their own resolver; everything else keeps
 * Airtable's order.
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
