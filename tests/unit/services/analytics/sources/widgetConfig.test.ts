import {
  AnalyticsWidgetConfigSchema,
  AnalyticsWidgetSchema,
  widgetSourceKind,
} from "@/contracts/analytics";

/**
 * Widget config forward-compat (Slice ANALYTICS-SOURCES-1): the discriminated
 * `dataSource` is additive — every legacy widget still parses and reads as
 * internal; connected-app sources parse; junk is rejected (.strict + union).
 */

describe("widget config back-compat + dataSource discriminator", () => {
  it("parses a legacy config (no dataSource) and reads as internal", () => {
    const parsed = AnalyticsWidgetConfigSchema.parse({ source: "any", metric: "runs" });
    expect(widgetSourceKind(parsed)).toBe("internal");
    expect(parsed.dataSource).toBeUndefined();
  });

  it("defaults source and treats an empty config as internal", () => {
    const parsed = AnalyticsWidgetConfigSchema.parse({});
    expect(parsed.source).toBe("any");
    expect(widgetSourceKind(parsed)).toBe("internal");
  });

  it("accepts an explicit internal dataSource", () => {
    const parsed = AnalyticsWidgetConfigSchema.parse({ dataSource: { kind: "internal" } });
    expect(widgetSourceKind(parsed)).toBe("internal");
  });

  it("accepts a connected_app dataSource and reads as connected_app", () => {
    const parsed = AnalyticsWidgetConfigSchema.parse({
      dataSource: {
        kind: "connected_app",
        provider: "stripe",
        metricKey: "revenue",
        groupBy: "day",
        filters: { currency: "usd", live: true },
      },
    });
    expect(widgetSourceKind(parsed)).toBe("connected_app");
    if (parsed.dataSource?.kind === "connected_app") {
      expect(parsed.dataSource.provider).toBe("stripe");
      expect(parsed.dataSource.metricKey).toBe("revenue");
    }
  });

  it("rejects an unknown dataSource kind", () => {
    expect(
      AnalyticsWidgetConfigSchema.safeParse({ dataSource: { kind: "sql_injection" } }).success,
    ).toBe(false);
  });

  it("rejects a connected_app dataSource missing provider/metricKey", () => {
    expect(
      AnalyticsWidgetConfigSchema.safeParse({ dataSource: { kind: "connected_app" } }).success,
    ).toBe(false);
    expect(
      AnalyticsWidgetConfigSchema.safeParse({
        dataSource: { kind: "connected_app", provider: "stripe" },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown top-level keys (.strict)", () => {
    expect(
      AnalyticsWidgetConfigSchema.safeParse({ source: "any", evilField: "x" }).success,
    ).toBe(false);
  });

  it("a full legacy widget still validates unchanged", () => {
    const widget = AnalyticsWidgetSchema.parse({
      id: "ov-runs",
      type: "stat",
      size: "s",
      title: "Runs",
      icon: "Bolt",
      config: { source: "any", metric: "runs" },
    });
    expect(widgetSourceKind(widget.config)).toBe("internal");
  });
});
