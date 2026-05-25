/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 builder-shape test — find_conversion. account →
 * property → conversion-event cascade, persisted-config parse.
 */
import { googleAnalyticsFindConversionMeta } from "@/integrations/google-analytics/actions/findConversion.meta";
import { FindConversionConfigSchema } from "@/integrations/google-analytics/actions/findConversion.schema";

describe("google-analytics find_conversion meta — Builder shape (3-hop cascade)", () => {
  it("declares accountId + propertyId + conversionEventName", () => {
    expect(googleAnalyticsFindConversionMeta.fields.map((f) => f.name)).toEqual([
      "accountId",
      "propertyId",
      "conversionEventName",
    ]);
  });

  it("account → property → conversionEventName cascade", () => {
    const property = googleAnalyticsFindConversionMeta.fields.find((f) => f.name === "propertyId")!;
    const conversion = googleAnalyticsFindConversionMeta.fields.find((f) => f.name === "conversionEventName")!;
    expect(property.optionsSource).toBe("google-analytics:properties");
    expect(property.dependsOn).toBe("accountId");
    expect(property.required).toBe(true);
    expect(conversion.optionsSource).toBe("google-analytics:conversion_events");
    expect(conversion.dependsOn).toBe("propertyId");
    expect(conversion.required).toBe(true);
  });

  it("risk: low (read-only lookup)", () => {
    expect(googleAnalyticsFindConversionMeta.riskLevel).toBe("low");
  });

  it("persisted config parses against the runtime schema", () => {
    expect(() =>
      FindConversionConfigSchema.parse({
        accountId: "111",
        propertyId: "123456",
        conversionEventName: "purchase",
      }),
    ).not.toThrow();
  });
});
