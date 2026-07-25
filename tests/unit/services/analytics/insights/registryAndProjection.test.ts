/**
 * ANALYTICS-CONNECTED-DATA-CD-1 — registry validation, ChainReact
 * registration, CS-1 capability parity pin, and client-projection safety.
 */
import {
  getInsightDataset,
  getInsightSource,
  listInsightSources,
  validateCatalog,
} from "@/services/analytics/insights/registry";
import { chainreactCatalog } from "@/services/analytics/insights/chainreact";
import {
  buildClientAnalyticsCatalog,
  ClientAnalyticsCatalogSchema,
} from "@/services/analytics/insights/clientProjection";
import { ANALYTICS_MEASURE_CAPABILITIES } from "@/contracts/analyticsQueryCapabilities";
import type { AnalyticsSourceCatalog } from "@/contracts/analyticsCatalog";

function catalogWith(mutate: (c: AnalyticsSourceCatalog) => void): AnalyticsSourceCatalog {
  const clone = JSON.parse(JSON.stringify(chainreactCatalog)) as AnalyticsSourceCatalog;
  mutate(clone);
  return clone;
}

describe("registry validation (loud failures)", () => {
  it("accepts the ChainReact catalog", () => {
    expect(() => validateCatalog(chainreactCatalog)).not.toThrow();
  });
  it("rejects duplicate dataset/field ids and unknown references", () => {
    expect(() =>
      validateCatalog(catalogWith((c) => c.datasets.push(c.datasets[0]!))),
    ).toThrow(/duplicate dataset/);
    expect(() =>
      validateCatalog(catalogWith((c) => c.datasets[0]!.fields.push({ ...c.datasets[0]!.fields[0]! }))),
    ).toThrow(/duplicate field/);
    expect(() =>
      validateCatalog(catalogWith((c) => (c.datasets[0]!.namedMeasures[1]!.dimensions = ["nope"]))),
    ).toThrow(/unknown dimension/);
    expect(() =>
      validateCatalog(catalogWith((c) => c.datasets[0]!.series.push({ by: "nope", max: 4, modes: [] }))),
    ).toThrow(/series dimension/);
  });
  it("rejects unregistered options sources", () => {
    expect(() =>
      validateCatalog(
        catalogWith((c) => (c.datasets[0]!.fields[0]!.optionsSource = "not:registered")),
      ),
    ).toThrow(/unknown options source/);
  });
  it("rejects donut without part-to-whole and time charts on current-state data", () => {
    // ChainReact legitimately declares donut + part-to-whole `status` since
    // CD-3B, so drop the declaration to exercise the guard itself.
    expect(() =>
      validateCatalog(
        catalogWith((c) => {
          c.datasets[0]!.partToWholeDimensions = [];
          if (!c.datasets[0]!.supportedCharts.includes("donut")) {
            c.datasets[0]!.supportedCharts.push("donut");
          }
        }),
      ),
    ).toThrow(/part-to-whole/);
    // Removing all historical date fields fails loudly — either at the
    // named-measure "time" reference or the current-state chart guard.
    expect(() =>
      validateCatalog(catalogWith((c) => (c.datasets[0]!.dateFields = [{ id: "asof", label: "As of", historical: false }]))),
    ).toThrow(/current-state|unknown dimension time/);
  });
});

describe("ChainReact registration + CS-1 capability parity pin", () => {
  const reg = getInsightDataset("chainreact", "workflow_runs");
  it("chainreact.workflow_runs is registered with its adapter", () => {
    expect(getInsightSource("chainreact")?.source.label).toBe("ChainReact");
    expect(reg?.adapter.datasetId).toBe("workflow_runs");
    expect(reg?.adapter.requiredScopes).toEqual([]);
  });
  it("catalog measures mirror the CS-1 capability matrix (drift pin)", () => {
    const csMeasures = Object.keys(ANALYTICS_MEASURE_CAPABILITIES).sort();
    expect(reg!.capabilities.measures.map((m) => m.id).sort()).toEqual(csMeasures);
    for (const [id, cap] of Object.entries(ANALYTICS_MEASURE_CAPABILITIES)) {
      const m = reg!.capabilities.measures.find((x) => x.id === id)!;
      // Dimension sets must match: CS-1 lists non-KPI dims; catalog null = all.
      const catalogDims = [...(m.dimensions ?? reg!.capabilities.dimensions.map((d) => d.id))].sort();
      expect({ id, dims: catalogDims }).toEqual({ id, dims: [...cap.dimensions].sort() });
      // Empty-bucket + status-filter semantics must match.
      expect({ id, empty: m.emptyValue }).toEqual({ id, empty: cap.emptyBucket });
      expect({ id, statusBlocked: m.incompatibleFilters.includes("status") }).toEqual({
        id, statusBlocked: !cap.statusFilterable,
      });
      expect({ id, compare: m.compare }).toEqual({ id, compare: cap.compare });
    }
  });
  it("series capabilities mirror CS-1 (workflow explicit/top ≤8; status auto)", () => {
    expect(reg!.dataset.series).toEqual([
      { by: "workflow", max: 8, modes: ["explicit", "top"] },
      { by: "status", max: 2, modes: [] },
    ]);
  });
});

describe("client projection", () => {
  it("is deterministic, schema-valid, and includes the ChainReact dataset", () => {
    const a = buildClientAnalyticsCatalog();
    const b = buildClientAnalyticsCatalog();
    expect(a).toEqual(b);
    expect(ClientAnalyticsCatalogSchema.safeParse(a).success).toBe(true);
    const cr = a.sources.find((s) => s.id === "chainreact")!;
    expect(cr.datasets[0]!.measures.map((m) => m.id)).toContain("success_rate");
    expect(cr.datasets[0]!.filters.find((f) => f.id === "workflow")!.optionsSource).toBeNull();
  });
  it("excludes server-only concerns (scopes, execution mode, adapters)", () => {
    const json = JSON.stringify(buildClientAnalyticsCatalog());
    expect(json).not.toContain("requiredScopes");
    expect(json).not.toContain("executionMode");
    expect(json).not.toContain("local_sql");
    expect(json).not.toContain("adapter");
    // CD-2 registered Stripe and CD-4B QuickBooks; ordering stays
    // deterministic (id-sorted).
    expect(listInsightSources().map((s) => s.source.id)).toEqual([
      "chainreact",
      "quickbooks",
      "stripe",
    ]);
  });
});
