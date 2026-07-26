import {
  AnalyticsSourceCatalogSchema,
  type AnalyticsDataset,
  type AnalyticsSourceCatalog,
} from "@/contracts/analyticsCatalog";
import {
  deriveDatasetCapabilities,
  type ResolvedDatasetCapabilities,
} from "@/contracts/analyticsCatalogDerive";
import type {
  ConnectedAnalyticsQuery,
  ConnectedAnalyticsResult,
} from "@/contracts/connectedAnalytics";
import { getOptionsResolver } from "@/services/options/_registry";
import { chainreactCatalog, chainreactWorkflowRunsAdapter } from "./chainreact";
import { quickbooksInsightsCatalog, quickbooksInvoicesAdapter } from "./quickbooks";
import { shopifyInsightsCatalog, shopifyOrdersAdapter } from "./shopify";
import { stripeInsightsCatalog, stripePaymentsAdapter } from "./stripe";

/**
 * Connected-analytics CATALOG + ADAPTER registry (CD-1).
 *
 * Server-owned. Sources register a validated catalog plus one execution
 * adapter per dataset. Registration is STATIC (module-level, below) — no
 * dynamic runtime registration, no override of an existing source, mirroring
 * services/analytics/sources/registry.ts. Every catalog is validated at
 * module load; a bad declaration throws immediately (loud in dev/tests).
 *
 * Server-only concerns that deliberately do NOT live in the client-safe
 * catalog contract sit on the adapter registration: required OAuth scopes
 * (raw strings stay server-side) and the execution implementation.
 */

/** Trusted server-resolved execution context. NEVER built from client input. */
export interface AnalyticsExecutionContext {
  accountId: string;
  userId: string;
  /** Injected clock for deterministic tests. */
  now?: number;
}

export interface AnalyticsDatasetAdapter {
  sourceId: string;
  datasetId: string;
  /** Raw provider scope strings this dataset needs — server-side only. */
  requiredScopes: readonly string[];
  query(
    ctx: AnalyticsExecutionContext,
    query: ConnectedAnalyticsQuery,
  ): Promise<ConnectedAnalyticsResult>;
}

export interface RegisteredDataset {
  catalog: AnalyticsSourceCatalog;
  dataset: AnalyticsDataset;
  capabilities: ResolvedDatasetCapabilities;
  adapter: AnalyticsDatasetAdapter;
}

interface SourceEntry {
  catalog: AnalyticsSourceCatalog;
  datasets: Map<string, RegisteredDataset>;
}

const sources = new Map<string, SourceEntry>();

function fail(msg: string): never {
  throw new Error(`analytics insights registry: ${msg}`);
}

/** Exported for tests — the same validation `registerSource` runs at load. */
export function validateCatalog(catalog: AnalyticsSourceCatalog): void {
  // Zod re-parse (defense against hand-built objects skipping the schema).
  AnalyticsSourceCatalogSchema.parse(catalog);
  const datasetIds = new Set<string>();
  for (const ds of catalog.datasets) {
    if (datasetIds.has(ds.id)) fail(`duplicate dataset id ${catalog.source.id}.${ds.id}`);
    datasetIds.add(ds.id);

    const ids = new Set<string>();
    for (const f of ds.fields) {
      if (ids.has(f.id)) fail(`${ds.id}: duplicate field id ${f.id}`);
      ids.add(f.id);
      if (f.optionsSource && !getOptionsResolver(f.optionsSource)) {
        fail(`${ds.id}.${f.id}: unknown options source ${f.optionsSource}`);
      }
    }
    const dateIds = new Set<string>();
    for (const d of ds.dateFields) {
      if (dateIds.has(d.id) || ids.has(d.id)) fail(`${ds.id}: duplicate date field id ${d.id}`);
      dateIds.add(d.id);
    }

    const caps = deriveDatasetCapabilities(ds);
    const measureIds = new Set<string>();
    for (const m of caps.measures) {
      if (measureIds.has(m.id)) fail(`${ds.id}: measure id collision ${m.id}`);
      measureIds.add(m.id);
    }
    const dimensionIds = new Set(caps.dimensions.map((d) => d.id));
    const filterIds = new Set(caps.filters.map((f) => f.id));
    for (const m of caps.measures) {
      for (const d of m.dimensions ?? []) {
        if (!dimensionIds.has(d)) fail(`${ds.id}.${m.id}: unknown dimension ${d}`);
      }
      for (const f of m.incompatibleFilters) {
        if (!filterIds.has(f)) fail(`${ds.id}.${m.id}: unknown incompatible filter ${f}`);
      }
    }
    for (const s of ds.series) {
      if (!dimensionIds.has(s.by) || s.by === "time") {
        fail(`${ds.id}: series dimension ${s.by} is not a categorical dimension`);
      }
    }
    for (const p of ds.partToWholeDimensions) {
      if (!dimensionIds.has(p)) fail(`${ds.id}: part-to-whole dimension ${p} unknown`);
    }
    if (ds.supportedCharts.includes("donut") && ds.partToWholeDimensions.length === 0) {
      fail(`${ds.id}: donut requires declared part-to-whole dimensions`);
    }
    const hasHistorical = ds.dateFields.some((d) => d.historical);
    if (!hasHistorical && (ds.supportedCharts.includes("line") || dimensionIds.has("time"))) {
      fail(`${ds.id}: current-state dataset cannot declare time-series charts`);
    }
  }
}

function registerSource(
  catalog: AnalyticsSourceCatalog,
  adapters: readonly AnalyticsDatasetAdapter[],
): void {
  if (sources.has(catalog.source.id)) fail(`source ${catalog.source.id} already registered`);
  validateCatalog(catalog);
  const datasets = new Map<string, RegisteredDataset>();
  for (const ds of catalog.datasets) {
    const adapter = adapters.find(
      (a) => a.sourceId === catalog.source.id && a.datasetId === ds.id,
    );
    if (!adapter) fail(`${catalog.source.id}.${ds.id}: no adapter registered`);
    datasets.set(ds.id, {
      catalog,
      dataset: ds,
      capabilities: deriveDatasetCapabilities(ds),
      adapter,
    });
  }
  sources.set(catalog.source.id, { catalog, datasets });
}

// ── Static registrations (approved sources only) ─────────────────────────────
registerSource(chainreactCatalog, [chainreactWorkflowRunsAdapter]);
registerSource(quickbooksInsightsCatalog, [quickbooksInvoicesAdapter]);
registerSource(shopifyInsightsCatalog, [shopifyOrdersAdapter]);
registerSource(stripeInsightsCatalog, [stripePaymentsAdapter]);

// ── Lookups ──────────────────────────────────────────────────────────────────

export function getInsightSource(sourceId: string): AnalyticsSourceCatalog | null {
  return sources.get(sourceId)?.catalog ?? null;
}

export function getInsightDataset(
  sourceId: string,
  datasetId: string,
): RegisteredDataset | null {
  return sources.get(sourceId)?.datasets.get(datasetId) ?? null;
}

/** Deterministic (id-sorted) listing for the client projection. */
export function listInsightSources(): readonly AnalyticsSourceCatalog[] {
  return [...sources.values()]
    .map((s) => s.catalog)
    .sort((a, b) => a.source.id.localeCompare(b.source.id));
}
