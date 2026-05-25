/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 builder-shape test — create_conversion_event.
 * account → property cascade, eventName/countingMethod/customEvent,
 * persisted-config parse.
 */
import { googleAnalyticsCreateConversionEventMeta } from "@/integrations/google-analytics/actions/createConversionEvent.meta";
import { CreateConversionEventConfigSchema } from "@/integrations/google-analytics/actions/createConversionEvent.schema";

describe("google-analytics create_conversion_event meta — Builder shape", () => {
  it("declares accountId + propertyId + eventName + countingMethod + customEvent", () => {
    expect(googleAnalyticsCreateConversionEventMeta.fields.map((f) => f.name)).toEqual([
      "accountId",
      "propertyId",
      "eventName",
      "countingMethod",
      "customEvent",
    ]);
  });

  it("account → property cascade (propertyId required)", () => {
    const property = googleAnalyticsCreateConversionEventMeta.fields.find((f) => f.name === "propertyId")!;
    expect(property.optionsSource).toBe("google-analytics:properties");
    expect(property.dependsOn).toBe("accountId");
    expect(property.required).toBe(true);
  });

  it("countingMethod is a static enum select; customEvent is a boolean", () => {
    const cm = googleAnalyticsCreateConversionEventMeta.fields.find((f) => f.name === "countingMethod")!;
    expect(cm.type).toBe("select");
    expect(cm.options?.map((o) => o.value)).toEqual(["ONCE_PER_EVENT", "ONCE_PER_SESSION"]);
    const ce = googleAnalyticsCreateConversionEventMeta.fields.find((f) => f.name === "customEvent")!;
    expect(ce.type).toBe("boolean");
  });

  it("risk: medium; eventName output sensitive (business goal); no secrets", () => {
    expect(googleAnalyticsCreateConversionEventMeta.riskLevel).toBe("medium");
    expect(
      googleAnalyticsCreateConversionEventMeta.outputs.find((o) => o.name === "eventName")!.sensitive,
    ).toBe(true);
  });

  it("persisted config parses against the runtime schema", () => {
    expect(() =>
      CreateConversionEventConfigSchema.parse({
        accountId: "111",
        propertyId: "123456",
        eventName: "purchase",
        countingMethod: "ONCE_PER_EVENT",
        customEvent: false,
      }),
    ).not.toThrow();
  });
});
