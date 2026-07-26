import { z } from "zod";
import { listInsightSources, getInsightDataset } from "./registry";
import {
  currentInsightsEnvironment,
  isSourceExposed,
  type InsightsEnvironment,
} from "./exposure";

/**
 * CLIENT-SAFE catalog projection (CD-1, audit §9 — runtime projection, not a
 * checked-in generated artifact; the repo has no generated-source pattern and
 * this avoids build complexity). CD-3 consumes this via a server component /
 * loader to render the App → Data → Show → Group by builder and grey out
 * invalid choices; server validation stays authoritative.
 *
 * Deterministic (registry ordering is id-sorted) and EXCLUDES every
 * server-only concern: raw OAuth scopes (adapters keep them), execution
 * modes/adapters, cache keys, provider endpoints, credential identifiers.
 * The existing hand-maintained widget catalog (connectedAppSources.ts) is
 * untouched — old widgets keep working; providers migrate individually.
 */

export const ClientAnalyticsCatalogSchema = z
  .object({
    sources: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
          credentialMode: z.enum(["internal", "account", "personal"]),
          connectionRequired: z.boolean(),
          /** "hidden" never reaches the client; "preview" appears only in
           * development builds (marked in the builder UI). */
          exposure: z.enum(["preview", "public"]),
          providerId: z.string().nullable(),
          attributionPrefix: z.string().optional(),
          datasets: z.array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                description: z.string().optional(),
                measures: z.array(
                  z
                    .object({
                      id: z.string(),
                      label: z.string(),
                      unit: z.string(),
                      emptyValue: z.enum(["zero", "null"]),
                      dimensions: z.array(z.string()).nullable(),
                      incompatibleFilters: z.array(z.string()),
                      compare: z.boolean(),
                    })
                    .strict(),
                ),
                dimensions: z.array(
                  z
                    .object({
                      id: z.string(),
                      label: z.string(),
                      kind: z.enum(["time", "category", "entity", "boolean"]),
                      optionsSource: z.string().nullable().optional(),
                    })
                    .strict(),
                ),
                filters: z.array(
                  z
                    .object({
                      id: z.string(),
                      label: z.string(),
                      valueType: z.enum(["entity_ids", "category_values", "boolean"]),
                      optionsSource: z.string().nullable().optional(),
                      maxSelections: z.number().int().positive(),
                      values: z
                        .array(z.object({ id: z.string(), label: z.string() }).strict())
                        .optional(),
                    })
                    .strict(),
                ),
                dateFields: z.array(
                  z.object({ id: z.string(), label: z.string() }).strict(),
                ),
                charts: z.array(z.string()),
                partToWholeDimensions: z.array(z.string()),
                series: z.array(
                  z
                    .object({
                      by: z.string(),
                      max: z.number().int(),
                      modes: z.array(z.enum(["explicit", "top"])),
                    })
                    .strict(),
                ),
                compare: z.boolean(),
                limits: z
                  .object({
                    maxRangeDays: z.number().int(),
                    maxCategoryRows: z.number().int(),
                  })
                  .strict(),
                freshness: z
                  .object({ mode: z.enum(["live", "cached"]), ttlSeconds: z.number() })
                  .strict(),
                previewSafe: z.boolean(),
                scopeNote: z.string().optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
export type ClientAnalyticsCatalog = z.infer<typeof ClientAnalyticsCatalogSchema>;

export function buildClientAnalyticsCatalog(
  opts: { environment?: InsightsEnvironment } = {},
): ClientAnalyticsCatalog {
  const environment = opts.environment ?? currentInsightsEnvironment();
  const visible = listInsightSources().filter((c) =>
    isSourceExposed(c.source.exposure, environment),
  );
  const catalog: ClientAnalyticsCatalog = {
    sources: visible.map((c) => ({
      id: c.source.id,
      label: c.source.label,
      ...(c.source.description ? { description: c.source.description } : {}),
      credentialMode: c.source.credentialMode,
      connectionRequired: c.source.connectionRequired,
      // Narrowed by the filter above — "hidden" can't reach here.
      exposure: c.source.exposure === "public" ? "public" : "preview",
      providerId: c.source.providerId,
      ...(c.source.attributionPrefix
        ? { attributionPrefix: c.source.attributionPrefix }
        : {}),
      datasets: c.datasets.map((ds) => {
        const reg = getInsightDataset(c.source.id, ds.id)!;
        const caps = reg.capabilities;
        return {
          id: ds.id,
          label: ds.label,
          ...(ds.description ? { description: ds.description } : {}),
          measures: caps.measures.map((m) => ({
            id: m.id,
            label: m.label,
            unit: m.unit,
            emptyValue: m.emptyValue,
            dimensions: m.dimensions ? [...m.dimensions] : null,
            incompatibleFilters: [...m.incompatibleFilters],
            compare: m.compare,
          })),
          dimensions: caps.dimensions.map((d) => ({
            id: d.id,
            label: d.label,
            kind: d.kind,
            ...(d.optionsSource !== undefined ? { optionsSource: d.optionsSource } : {}),
          })),
          filters: caps.filters.map((f) => ({
            id: f.id,
            label: f.label,
            valueType: f.valueType,
            ...(f.optionsSource !== undefined ? { optionsSource: f.optionsSource } : {}),
            maxSelections: f.maxSelections,
            ...(f.values ? { values: f.values.map((v) => ({ ...v })) } : {}),
          })),
          dateFields: ds.dateFields
            .filter((d) => d.historical)
            .map((d) => ({ id: d.id, label: d.label })),
          charts: [...ds.supportedCharts],
          partToWholeDimensions: [...ds.partToWholeDimensions],
          series: ds.series.map((s) => ({ by: s.by, max: s.max, modes: [...s.modes] })),
          compare: ds.compare,
          limits: {
            maxRangeDays: ds.queryLimits.maxRangeDays,
            maxCategoryRows: ds.queryLimits.maxCategoryRows,
          },
          freshness: { mode: ds.freshness.mode, ttlSeconds: ds.freshness.ttlSeconds },
          previewSafe: ds.previewSafe,
          ...(ds.scopeNote ? { scopeNote: ds.scopeNote } : {}),
        };
      }),
    })),
  };
  return ClientAnalyticsCatalogSchema.parse(catalog);
}
