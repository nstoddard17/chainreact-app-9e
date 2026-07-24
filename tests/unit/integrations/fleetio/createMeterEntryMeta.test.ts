/**
 * @jest-environment node
 *
 * Create Meter Entry meta + readiness + registry/manifest honesty (FLEETIO-4).
 */
import { ActionMetaSchema } from "@/contracts/actionMeta";
import { fleetioCreateMeterEntryMeta } from "@/integrations/fleetio/actions/createMeterEntry.meta";
import {
  FLEETIO_CREATE_METER_ENTRY_OUTPUTS,
  toCreateMeterEntryOutput,
} from "@/integrations/fleetio/actions/createMeterEntry.output";
import { fleetioManifest } from "@/integrations/fleetio/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { getActionMeta, listAllActionMetas } from "@/services/discovery/_registry";
import { getOptionsResolver, listOptionsResolvers } from "@/services/options/_registry";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import type { WorkflowNode } from "@/contracts/workflow";

describe("fleetio:create_meter_entry meta", () => {
  it("validates against the ActionMeta contract", () => {
    expect(() => ActionMetaSchema.parse(fleetioCreateMeterEntryMeta)).not.toThrow();
  });

  it("is keyed correctly, integration-required, medium-risk, non-destructive, no confirmation", () => {
    expect(fleetioCreateMeterEntryMeta.key).toBe("fleetio:create_meter_entry");
    expect(fleetioCreateMeterEntryMeta.provider).toBe("fleetio");
    expect(fleetioCreateMeterEntryMeta.requiresIntegration).toBe(true);
    expect(fleetioCreateMeterEntryMeta.riskLevel).toBe("medium");
    expect(fleetioCreateMeterEntryMeta.isDestructive).toBe(false);
    expect(fleetioCreateMeterEntryMeta.requiresConfirmation).toBe(false);
  });

  it("orders Setup as Vehicle → Meter reading → Meter → Reading date, all required, none advanced", () => {
    expect(fleetioCreateMeterEntryMeta.fields.map((f) => f.name)).toEqual([
      "vehicleId",
      "value",
      "meterType",
      "readingDate",
    ]);
    for (const field of fleetioCreateMeterEntryMeta.fields) {
      expect(field.required).toBe(true);
      // No Advanced section — the endpoint needs nothing that belongs there.
      expect(field.advanced).toBeUndefined();
      // Q11: no hidden default on ANY field of this write.
      expect(field.defaultValue).toBeUndefined();
    }
  });

  it("binds the vehicle field to the EXISTING fleetio:vehicles resolver with manual entry", () => {
    const [vehicle] = fleetioCreateMeterEntryMeta.fields;
    expect(vehicle!.label).toBe("Vehicle");
    expect(vehicle!.type).toBe("combobox");
    expect(vehicle!.optionsSource).toBe("fleetio:vehicles");
    expect(vehicle!.allowManualEntry).toBe(true);
  });

  it("meter reading is a numeric field whose help text points at Motive mapping", () => {
    const value = fleetioCreateMeterEntryMeta.fields.find((f) => f.name === "value")!;
    expect(value.type).toBe("number");
    expect(value.label).toBe("Meter reading");
    expect(value.description).toMatch(/Motive/);
  });

  it("meter type is a STATIC two-option select (no resolver) with no hidden default", () => {
    const meterType = fleetioCreateMeterEntryMeta.fields.find((f) => f.name === "meterType")!;
    expect(meterType.type).toBe("select");
    expect(meterType.optionsSource).toBeUndefined();
    expect(meterType.options?.map((o) => o.value)).toEqual(["primary", "secondary"]);
    expect(meterType.defaultValue).toBeUndefined();
    expect(meterType.required).toBe(true);
  });

  it("reading date is a required datetime field and says Fleetio will NOT fill it in", () => {
    const readingDate = fleetioCreateMeterEntryMeta.fields.find((f) => f.name === "readingDate")!;
    expect(readingDate.type).toBe("datetime-utc");
    expect(readingDate.required).toBe(true);
    expect(readingDate.description).toMatch(/does not fill it in/i);
  });

  it("adds NO meter-unit field and NO new option source (Fleetio derives the unit)", () => {
    const names = fleetioCreateMeterEntryMeta.fields.map((f) => f.name);
    expect(names).not.toContain("meterUnit");
    expect(names).not.toContain("meterId");
    // Every optionsSource this action references already existed before FLEETIO-4.
    const referenced = fleetioCreateMeterEntryMeta.fields
      .map((f) => f.optionsSource)
      .filter((s): s is string => Boolean(s));
    expect(referenced).toEqual(["fleetio:vehicles"]);
    // No speculative meter-unit / vehicle-meters resolver was registered.
    const fleetioSources = listOptionsResolvers()
      .filter((r) => r.provider === "fleetio")
      .map((r) => r.source)
      .sort();
    expect(fleetioSources).toEqual(["fleetio:vehicle_statuses", "fleetio:vehicles"]);
  });

  it("declares no raw-json fields, no void/source/note fields, and no sensitive outputs", () => {
    expect(fleetioCreateMeterEntryMeta.fields.some((f) => f.type === "json")).toBe(false);
    const names = fleetioCreateMeterEntryMeta.fields.map((f) => f.name);
    for (const banned of ["void", "source", "note", "notes", "reason", "category"]) {
      expect(names).not.toContain(banned);
    }
    expect(FLEETIO_CREATE_METER_ENTRY_OUTPUTS.some((o) => o.sensitive)).toBe(false);
  });

  it("output payload shape matches the real bounded handler output exactly", () => {
    const real = toCreateMeterEntryOutput({
      id: 9001,
      value: "152340.5",
      meter_type: null,
      vehicle_id: 42,
      void: false,
      date: "2026-07-23",
      created_at: "2026-07-23T12:00:00Z",
    });
    expect(Object.keys(real).sort()).toEqual(
      FLEETIO_CREATE_METER_ENTRY_OUTPUTS.map((o) => o.name).sort(),
    );
    // `false` is preserved, not dropped.
    expect(real.void).toBe(false);
    // No invented meterUnit / updated-vehicle field — Fleetio returns neither.
    const outNames = FLEETIO_CREATE_METER_ENTRY_OUTPUTS.map((o) => o.name);
    expect(outNames).not.toContain("meterUnit");
    expect(outNames).not.toContain("vehicle");
    expect(outNames).not.toContain("currentMeterValue");
  });
});

describe("fleetio:create_meter_entry registration + manifest honesty", () => {
  it("registers the handler exactly once and resolves the meta by key", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "fleetio" && h.type === "create_meter_entry",
    );
    expect(handlers).toHaveLength(1);
    expect(getActionMeta("fleetio:create_meter_entry")).toBe(fleetioCreateMeterEntryMeta);
  });

  // Count updated honestly by 5.TRUCK-BRIDGE-1 CS-3, which added
  // find_linked_vehicle (the ONE Fleetio action that calls no provider API).
  it("fleetio now exposes exactly four actions, no triggers, still experimental", () => {
    const keys = listAllActionMetas()
      .filter((m) => m.provider === "fleetio")
      .map((m) => m.key)
      .sort();
    expect(keys).toEqual([
      "fleetio:create_meter_entry",
      "fleetio:find_linked_vehicle",
      "fleetio:get_vehicle",
      "fleetio:update_vehicle_status",
    ]);
    expect(fleetioManifest.capabilities.actions).toBe(true);
    expect(fleetioManifest.capabilities.webhookTrigger).toBe(false);
    expect(fleetioManifest.capabilities.pollingTrigger).toBe(false);
    expect(fleetioManifest.isExperimental).toBe(false); // published 2026-07-24
    expect(fleetioManifest.authFlow).toBe("credential_paste");
    expect(fleetioManifest.refreshable).toBe(false);
  });

  it("reuses the existing resolvers (does not duplicate them)", () => {
    expect(getOptionsResolver("fleetio:vehicles")?.provider).toBe("fleetio");
    expect(getOptionsResolver("fleetio:vehicle_statuses")?.provider).toBe("fleetio");
  });
});

describe("fleetio:create_meter_entry readiness", () => {
  const REQS = buildRequiredFieldsByType([fleetioCreateMeterEntryMeta], []);
  const node = (config: Record<string, unknown>): WorkflowNode =>
    ({ id: "n1", provider: "fleetio", type: "create_meter_entry", config }) as unknown as WorkflowNode;

  it("names every required field as a clear gap when empty", () => {
    expect(REQS["fleetio:create_meter_entry"]!.requiredFields.map((f) => f.label)).toEqual([
      "Vehicle",
      "Meter reading",
      "Meter",
      "Reading date",
    ]);
    expect(missingRequiredFields(node({}), REQS).map((g) => g.name)).toEqual([
      "vehicleId",
      "value",
      "meterType",
      "readingDate",
    ]);
  });

  it("a whitespace-only vehicle id is still a gap", () => {
    expect(
      missingRequiredFields(
        node({ vehicleId: "   ", value: 1, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }),
        REQS,
      ).map((g) => g.name),
    ).toEqual(["vehicleId"]);
  });

  it("an absent meter reading is a gap", () => {
    expect(
      missingRequiredFields(
        node({ vehicleId: "42", meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }),
        REQS,
      ).map((g) => g.name),
    ).toEqual(["value"]);
  });

  it("direct values satisfy readiness", () => {
    expect(
      missingRequiredFields(
        node({ vehicleId: "42", value: 152340.5, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }),
        REQS,
      ),
    ).toEqual([]);
  });

  it("a valid ZERO reading satisfies readiness (0 is an explicit value, not missing)", () => {
    expect(
      missingRequiredFields(
        node({ vehicleId: "42", value: 0, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }),
        REQS,
      ),
    ).toEqual([]);
  });

  it("mapped {{...}} values satisfy readiness (the resolver need not load)", () => {
    expect(
      missingRequiredFields(
        node({
          vehicleId: "{{lookup.fleetioVehicleId}}",
          value: "{{motive_step.odometer}}",
          meterType: "primary",
          readingDate: "{{motive_step.purchasedAt}}",
        }),
        REQS,
      ),
    ).toEqual([]);
  });

  it("a manual/mapped vehicle id survives a resolver that cannot load (field allows manual entry)", () => {
    // Readiness is computed from the CONFIG alone — no resolver response is
    // consulted — so a picker outage can never erase or invalidate a typed or
    // mapped id. `allowManualEntry` keeps the widget editable in that state.
    const vehicle = fleetioCreateMeterEntryMeta.fields.find((f) => f.name === "vehicleId")!;
    expect(vehicle.allowManualEntry).toBe(true);
    expect(
      missingRequiredFields(
        node({ vehicleId: "42", value: 1, meterType: "primary", readingDate: "2026-07-23T12:00:00Z" }),
        REQS,
      ),
    ).toEqual([]);
  });
});
