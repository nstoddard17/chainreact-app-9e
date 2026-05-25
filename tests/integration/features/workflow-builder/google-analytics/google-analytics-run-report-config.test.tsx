/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 builder-shape test — run_report. account →
 * property cascade, metric/dimension/date fields, persisted-config parse.
 */
import { googleAnalyticsRunReportMeta } from "@/integrations/google-analytics/actions/runReport.meta";
import { RunReportConfigSchema } from "@/integrations/google-analytics/actions/runReport.schema";

describe("google-analytics run_report meta — Builder shape", () => {
  it("declares accountId + propertyId + dateRange + startDate + endDate + metrics + dimensions + limit", () => {
    expect(googleAnalyticsRunReportMeta.fields.map((f) => f.name)).toEqual([
      "accountId",
      "propertyId",
      "dateRange",
      "startDate",
      "endDate",
      "metrics",
      "dimensions",
      "limit",
    ]);
  });

  it("account → property cascade (accountId UI-scope optional; propertyId required, dependsOn accountId)", () => {
    const account = googleAnalyticsRunReportMeta.fields.find((f) => f.name === "accountId")!;
    const property = googleAnalyticsRunReportMeta.fields.find((f) => f.name === "propertyId")!;
    expect(account.optionsSource).toBe("google-analytics:accounts");
    expect(account.required).toBe(false);
    expect(property.optionsSource).toBe("google-analytics:properties");
    expect(property.dependsOn).toBe("accountId");
    expect(property.required).toBe(true);
  });

  it("metrics is a required multi-select; dimensions an optional multi-select", () => {
    const metrics = googleAnalyticsRunReportMeta.fields.find((f) => f.name === "metrics")!;
    const dimensions = googleAnalyticsRunReportMeta.fields.find((f) => f.name === "dimensions")!;
    expect(metrics.type).toBe("select");
    expect(metrics.multiple).toBe(true);
    expect(metrics.required).toBe(true);
    expect(dimensions.multiple).toBe(true);
    expect(dimensions.required).toBe(false);
  });

  it("risk: low (read-only)", () => {
    expect(googleAnalyticsRunReportMeta.riskLevel).toBe("low");
  });

  it("persisted config (preset range, with UI-scope accountId) parses against the runtime schema", () => {
    expect(() =>
      RunReportConfigSchema.parse({
        accountId: "111",
        propertyId: "123456",
        dateRange: "last_7_days",
        metrics: ["sessions", "totalUsers"],
        dimensions: ["date"],
      }),
    ).not.toThrow();
  });

  it("persisted config (custom range) parses with startDate + endDate", () => {
    expect(() =>
      RunReportConfigSchema.parse({
        propertyId: "123456",
        dateRange: "custom",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        metrics: ["sessions"],
        limit: 50,
      }),
    ).not.toThrow();
  });
});
