/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 builder-shape test — send_event. account →
 * property → data-stream cascade, apiSecret field shape, eventParams
 * textarea, persisted-config parse, no-secret-output.
 */
import { googleAnalyticsSendEventMeta } from "@/integrations/google-analytics/actions/sendEvent.meta";
import { SendEventConfigSchema } from "@/integrations/google-analytics/actions/sendEvent.schema";

describe("google-analytics send_event meta — Builder shape", () => {
  it("declares the full cascade + Measurement Protocol fields", () => {
    expect(googleAnalyticsSendEventMeta.fields.map((f) => f.name)).toEqual([
      "accountId",
      "propertyId",
      "measurementId",
      "apiSecret",
      "clientId",
      "eventName",
      "eventParams",
      "userId",
    ]);
  });

  it("account → property → measurementId(data_streams) cascade; propertyId UI-scope (optional)", () => {
    const account = googleAnalyticsSendEventMeta.fields.find((f) => f.name === "accountId")!;
    const property = googleAnalyticsSendEventMeta.fields.find((f) => f.name === "propertyId")!;
    const measurement = googleAnalyticsSendEventMeta.fields.find((f) => f.name === "measurementId")!;
    expect(account.optionsSource).toBe("google-analytics:accounts");
    expect(property.optionsSource).toBe("google-analytics:properties");
    expect(property.dependsOn).toBe("accountId");
    expect(property.required).toBe(false);
    expect(measurement.optionsSource).toBe("google-analytics:data_streams");
    expect(measurement.dependsOn).toBe("propertyId");
    expect(measurement.required).toBe(true);
  });

  it("apiSecret is a required text field (no password FieldType) + eventParams is a record-shaped keyvalue editor (CONFIG-UX-AUDIT-1)", () => {
    const apiSecret = googleAnalyticsSendEventMeta.fields.find((f) => f.name === "apiSecret")!;
    expect(apiSecret.type).toBe("text");
    expect(apiSecret.required).toBe(true);
    const eventParams = googleAnalyticsSendEventMeta.fields.find((f) => f.name === "eventParams")!;
    expect(eventParams.type).toBe("keyvalue");
    expect(eventParams.keyValueShape).toBe("record");
    expect(eventParams.required).toBe(false);
  });

  it("output is structural only — apiSecret/clientId/userId/eventParams never echoed", () => {
    const names = googleAnalyticsSendEventMeta.outputs.map((o) => o.name).sort();
    expect(names).toEqual(["eventName", "sentAt", "success"]);
  });

  it("risk: medium", () => {
    expect(googleAnalyticsSendEventMeta.riskLevel).toBe("medium");
    expect(googleAnalyticsSendEventMeta.isDestructive).toBe(false);
  });

  it("persisted config parses against the runtime schema (record from the keyvalue editor AND legacy JSON string)", () => {
    // Record shape — what the keyvalue editor now commits.
    expect(() =>
      SendEventConfigSchema.parse({
        accountId: "111",
        propertyId: "123456",
        measurementId: "G-ABC123",
        apiSecret: "mp-secret",
        clientId: "111.222",
        eventName: "purchase",
        eventParams: { value: "9.99", currency: "USD" },
        userId: "user-7",
      }),
    ).not.toThrow();
    // Legacy JSON-string shape stays accepted (schema union unchanged).
    expect(() =>
      SendEventConfigSchema.parse({
        accountId: "111",
        propertyId: "123456",
        measurementId: "G-ABC123",
        apiSecret: "mp-secret",
        clientId: "111.222",
        eventName: "purchase",
        eventParams: '{"value":9.99,"currency":"USD"}',
        userId: "user-7",
      }),
    ).not.toThrow();
  });
});
