/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-4 — GA4 discovery-registry coverage.
 *
 * Pins the 6-action surface: keys + displayOrder, key===provider:type,
 * camelCase field/output names, no secret-shaped outputs, resolver wiring
 * (accounts → properties → data_streams / conversion_events), runtime
 * field-name parity, risk classifications, sensitive-output markings,
 * apiSecret-is-an-input-not-an-output, excluded actions absent, no Universal
 * Analytics, and no Google-verification caveats in user-facing copy. No GA
 * trigger metas.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "google-analytics:run_report",
  "google-analytics:run_pivot_report",
  "google-analytics:get_realtime_data",
  "google-analytics:find_conversion",
  "google-analytics:send_event",
  "google-analytics:create_conversion_event",
];

describe("google-analytics discovery — surface", () => {
  it("registers exactly 6 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("google-analytics");
    expect(metas).toHaveLength(6);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
    expect(metas.map((m) => m.displayOrder)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it("registers NO GA trigger metas (deferred/rejected — D-GA3)", () => {
    expect(listTriggerMetasForProvider("google-analytics")).toEqual([]);
  });

  it("every key equals provider:type, category data, requiresIntegration", () => {
    for (const m of listActionMetasForProvider("google-analytics")) {
      expect(m.provider).toBe("google-analytics");
      expect(m.key).toBe(`google-analytics:${m.type}`);
      expect(m.category).toBe("data");
      expect(m.requiresIntegration).toBe(true);
    }
  });
});

describe("google-analytics discovery — field-name parity + hygiene", () => {
  it("field names match the GA-2 runtime schema names exactly", () => {
    const expected: Record<string, string[]> = {
      "google-analytics:run_report": ["accountId", "propertyId", "dateRange", "startDate", "endDate", "metrics", "dimensions", "limit"],
      "google-analytics:run_pivot_report": ["accountId", "propertyId", "dateRange", "startDate", "endDate", "metrics", "dimensions", "pivotDimensions", "limit"],
      "google-analytics:get_realtime_data": ["accountId", "propertyId", "metrics", "dimensions", "limit"],
      "google-analytics:find_conversion": ["accountId", "propertyId", "conversionEventName"],
      "google-analytics:send_event": ["accountId", "propertyId", "measurementId", "apiSecret", "clientId", "eventName", "eventParams", "userId"],
      "google-analytics:create_conversion_event": ["accountId", "propertyId", "eventName", "countingMethod", "customEvent"],
    };
    for (const [key, fields] of Object.entries(expected)) {
      expect(getActionMeta(key)!.fields.map((f) => f.name)).toEqual(fields);
    }
  });

  it("all field + output names are camelCase", () => {
    for (const m of listActionMetasForProvider("google-analytics")) {
      for (const f of m.fields) expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      for (const o of m.outputs) expect(o.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it("no secret-shaped output names anywhere (incl. apiSecret/clientSecret)", () => {
    const BANNED = ["token", "accessToken", "refreshToken", "clientSecret", "apiSecret", "secret", "apiKey"];
    for (const m of listActionMetasForProvider("google-analytics")) {
      const names = m.outputs.map((o) => o.name);
      for (const b of BANNED) expect(names).not.toContain(b);
    }
  });
});

describe("google-analytics discovery — resolver wiring (accounts → properties → …)", () => {
  it("every action: accountId → :accounts (no dep, UI-scope/optional); propertyId → :properties dependsOn accountId", () => {
    for (const m of listActionMetasForProvider("google-analytics")) {
      const account = m.fields.find((f) => f.name === "accountId")!;
      const property = m.fields.find((f) => f.name === "propertyId")!;
      expect(account.optionsSource).toBe("google-analytics:accounts");
      expect(account.dependsOn).toBeUndefined();
      expect(account.required).toBe(false);
      expect(property.optionsSource).toBe("google-analytics:properties");
      expect(property.dependsOn).toBe("accountId");
    }
  });

  it("propertyId is required on every action EXCEPT send_event (UI-scope there)", () => {
    for (const m of listActionMetasForProvider("google-analytics")) {
      const property = m.fields.find((f) => f.name === "propertyId")!;
      if (m.key === "google-analytics:send_event") {
        expect(property.required).toBe(false);
      } else {
        expect(property.required).toBe(true);
      }
    }
  });

  it("send_event: measurementId → :data_streams dependsOn propertyId (required)", () => {
    const f = getActionMeta("google-analytics:send_event")!.fields.find((x) => x.name === "measurementId")!;
    expect(f.optionsSource).toBe("google-analytics:data_streams");
    expect(f.dependsOn).toBe("propertyId");
    expect(f.required).toBe(true);
  });

  it("find_conversion: conversionEventName → :conversion_events dependsOn propertyId (required)", () => {
    const f = getActionMeta("google-analytics:find_conversion")!.fields.find((x) => x.name === "conversionEventName")!;
    expect(f.optionsSource).toBe("google-analytics:conversion_events");
    expect(f.dependsOn).toBe("propertyId");
    expect(f.required).toBe(true);
  });

  it("dateRange is a static enum (8 presets incl. custom); countingMethod is a static enum", () => {
    const dr = getActionMeta("google-analytics:run_report")!.fields.find((f) => f.name === "dateRange")!;
    expect(dr.type).toBe("select");
    expect(dr.options?.map((o) => o.value)).toContain("custom");
    expect(dr.options).toHaveLength(8);
    const cm = getActionMeta("google-analytics:create_conversion_event")!.fields.find((f) => f.name === "countingMethod")!;
    expect(cm.options?.map((o) => o.value)).toEqual(["ONCE_PER_EVENT", "ONCE_PER_SESSION"]);
  });
});

describe("google-analytics discovery — apiSecret is a sensitive INPUT, never an output", () => {
  it("send_event declares apiSecret as a required text field and NEVER outputs it", () => {
    const m = getActionMeta("google-analytics:send_event")!;
    const apiSecret = m.fields.find((f) => f.name === "apiSecret")!;
    expect(apiSecret.type).toBe("text"); // no password FieldType exists
    expect(apiSecret.required).toBe(true);
    expect(m.outputs.map((o) => o.name)).not.toContain("apiSecret");
    // send_event output is structural only — no clientId/userId/eventParams echo.
    expect(m.outputs.map((o) => o.name).sort()).toEqual(["eventName", "sentAt", "success"]);
    for (const leaky of ["clientId", "userId", "eventParams"]) {
      expect(m.outputs.map((o) => o.name)).not.toContain(leaky);
    }
  });
});

describe("google-analytics discovery — risk classifications", () => {
  it("reads are low; send_event + create_conversion_event are medium; none destructive", () => {
    const low = [
      "google-analytics:run_report",
      "google-analytics:run_pivot_report",
      "google-analytics:get_realtime_data",
      "google-analytics:find_conversion",
    ];
    for (const k of low) expect(getActionMeta(k)!.riskLevel).toBe("low");
    for (const k of ["google-analytics:send_event", "google-analytics:create_conversion_event"]) {
      expect(getActionMeta(k)!.riskLevel).toBe("medium");
    }
    for (const m of listActionMetasForProvider("google-analytics")) {
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("google-analytics discovery — sensitive outputs", () => {
  it("report rows + realtime aggregates + conversion names are sensitive; opaque ids are not", () => {
    expect(getActionMeta("google-analytics:run_report")!.outputs.find((o) => o.name === "rows")!.sensitive).toBe(true);
    expect(getActionMeta("google-analytics:run_pivot_report")!.outputs.find((o) => o.name === "rows")!.sensitive).toBe(true);
    const rt = getActionMeta("google-analytics:get_realtime_data")!.outputs;
    for (const n of ["activeUsers", "pageViews", "eventCount", "rows"]) {
      expect(rt.find((o) => o.name === n)!.sensitive).toBe(true);
    }
    expect(getActionMeta("google-analytics:find_conversion")!.outputs.find((o) => o.name === "eventName")!.sensitive).toBe(true);
    expect(getActionMeta("google-analytics:create_conversion_event")!.outputs.find((o) => o.name === "eventName")!.sensitive).toBe(true);
    // Opaque ids not sensitive.
    for (const m of listActionMetasForProvider("google-analytics")) {
      for (const o of m.outputs) {
        if (["propertyId", "conversionEventId", "rowCount", "success"].includes(o.name)) {
          expect(o.sensitive).not.toBe(true);
        }
      }
    }
  });
});

describe("google-analytics discovery — excluded actions + no Universal Analytics", () => {
  it("create_measurement_secret + get_user_activity are absent", () => {
    expect(getActionMeta("google-analytics:create_measurement_secret")).toBeUndefined();
    expect(getActionMeta("google-analytics:get_user_activity")).toBeUndefined();
  });

  it("no Universal Analytics strings (viewId / UA- / Universal Analytics) in any meta", () => {
    const blob = JSON.stringify(listActionMetasForProvider("google-analytics"));
    expect(blob).not.toMatch(/viewId/i);
    expect(blob).not.toMatch(/universal analytics/i);
    expect(blob).not.toMatch(/\bUA-\d/);
  });
});

describe("google-analytics discovery — no Google-verification caveats in user-facing copy", () => {
  it("no description / label / placeholder mentions OAuth verification, sensitive scope, or launch readiness", () => {
    const FORBIDDEN = [
      /verification/i,
      /sensitive scope/i,
      /app review/i,
      /launch readiness/i,
      /requires approval/i,
      /pending approval/i,
    ];
    const offenders: string[] = [];
    for (const m of listActionMetasForProvider("google-analytics")) {
      const strings: string[] = [m.displayName, m.description];
      if (m.riskDescription) strings.push(m.riskDescription);
      for (const f of m.fields) {
        strings.push(f.label);
        if (f.description) strings.push(f.description);
        if (f.placeholder) strings.push(f.placeholder);
        for (const o of f.options ?? []) strings.push(o.label);
      }
      for (const o of m.outputs) if (o.description) strings.push(o.description);
      for (const s of strings) {
        for (const pat of FORBIDDEN) if (pat.test(s)) offenders.push(`${m.key}: "${s}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
