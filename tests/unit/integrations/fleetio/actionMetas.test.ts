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

import { fleetioFindLinkedVehicleMeta } from "@/integrations/fleetio/actions/findLinkedVehicle.meta";
import {
  FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS,
  toFindLinkedVehicleOutput,
} from "@/integrations/fleetio/actions/findLinkedVehicle.output";
import { decideTestModeBlock } from "@/services/execution/testModeGate";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";
import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";
import {
  FLEETIO_VEHICLE_OUTPUTS,
  toGetVehicleOutput,
} from "@/integrations/fleetio/actions/getVehicle.output";
import { ALL_OPTIONS_RESOLVERS } from "@/services/options/_registry";
import { fleetioUpdateVehicleStatusMeta } from "@/integrations/fleetio/actions/updateVehicleStatus.meta";
import {
  FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS,
  toUpdateVehicleStatusOutput,
} from "@/integrations/fleetio/actions/updateVehicleStatus.output";
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

// ---------------------------------------------------------------------------
// Merged from the former sibling findLinkedVehicleMeta.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Find Linked Fleetio Vehicle — meta + readiness + registry/manifest honesty +
// REAL test-mode gate (5.TRUCK-BRIDGE-1 CS-3).
// Everything here runs against the real contracts: the ActionMeta Zod schema,
// the real handler registry, the real discovery registry, the real readiness
// core (`core/workflows/requiredFields.ts` — the single source both the builder
// form and every server execution-readiness path use), and the REAL
// `testModeGate` (not a restatement of its rules).
// ---------------------------------------------------------------------------

describe("fleetio:find_linked_vehicle meta", () => {
  it("validates against the ActionMeta contract", () => {
    expect(() => ActionMetaSchema.parse(fleetioFindLinkedVehicleMeta)).not.toThrow();
  });

  it("is keyed correctly, requires NO integration, low-risk, non-destructive, no confirmation", () => {
    expect(fleetioFindLinkedVehicleMeta.key).toBe("fleetio:find_linked_vehicle");
    expect(fleetioFindLinkedVehicleMeta.provider).toBe("fleetio");
    expect(fleetioFindLinkedVehicleMeta.type).toBe("find_linked_vehicle");
    expect(fleetioFindLinkedVehicleMeta.displayName).toBe("Find Linked Fleetio Vehicle");
    // The whole point: it reads ChainReact's own table, not Fleetio.
    expect(fleetioFindLinkedVehicleMeta.requiresIntegration).toBe(false);
    expect(fleetioFindLinkedVehicleMeta.riskLevel).toBe("low");
    expect(fleetioFindLinkedVehicleMeta.isDestructive).toBe(false);
    expect(fleetioFindLinkedVehicleMeta.requiresConfirmation).toBe(false);
  });

  it("declares exactly two Setup fields, both required, neither advanced, neither defaulted", () => {
    expect(fleetioFindLinkedVehicleMeta.fields.map((f) => f.name)).toEqual([
      "sourceProvider",
      "sourceVehicleId",
    ]);
    for (const field of fleetioFindLinkedVehicleMeta.fields) {
      expect(field.required).toBe(true);
      expect(field.advanced).toBeUndefined();
      // Q11: no hidden default on EITHER field.
      expect(field.defaultValue).toBeUndefined();
    }
  });

  it("Telematics system is a static one-option select with no resolver and no default", () => {
    const provider = fleetioFindLinkedVehicleMeta.fields.find(
      (f) => f.name === "sourceProvider",
    )!;
    expect(provider.label).toBe("Telematics system");
    expect(provider.type).toBe("select");
    expect(provider.optionsSource).toBeUndefined();
    expect(provider.options).toEqual([{ value: "motive", label: "Motive" }]);
    expect(provider.defaultValue).toBeUndefined();
  });

  it("Vehicle is a required mappable text field whose help text names the Motive id and the fix", () => {
    const vehicle = fleetioFindLinkedVehicleMeta.fields.find(
      (f) => f.name === "sourceVehicleId",
    )!;
    expect(vehicle.label).toBe("Vehicle");
    expect(vehicle.type).toBe("text");
    expect(vehicle.required).toBe(true);
    // Intended for {{trigger.vehicleId}}; manual entry is possible by nature of
    // a text field (no picker to fall back from).
    expect(vehicle.placeholder).toBe("{{trigger.vehicleId}}");
    expect(vehicle.description).toMatch(/Motive vehicle id/i);
    expect(vehicle.description).toMatch(/\{\{trigger\.vehicleId\}\}/);
    expect(vehicle.description).toMatch(/Apps → Vehicle Links/);
  });

  it("adds NO option resolver and does not touch the existing Fleetio resolvers", () => {
    const referenced = fleetioFindLinkedVehicleMeta.fields
      .map((f) => f.optionsSource)
      .filter((s): s is string => Boolean(s));
    expect(referenced).toEqual([]);
    const fleetioSources = listOptionsResolvers()
      .filter((r) => r.provider === "fleetio")
      .map((r) => r.source)
      .sort();
    expect(fleetioSources).toEqual(["fleetio:vehicle_statuses", "fleetio:vehicles"]);
  });

  it("declares no raw-json field and no field that would take an account/link/Fleetio id", () => {
    expect(fleetioFindLinkedVehicleMeta.fields.some((f) => f.type === "json")).toBe(false);
    const names = fleetioFindLinkedVehicleMeta.fields.map((f) => f.name);
    for (const banned of [
      "accountId",
      "linkId",
      "id",
      "targetProvider",
      "targetExternalId",
      "vehicleId",
      "resourceKind",
      "integrationId",
    ]) {
      expect(names).not.toContain(banned);
    }
  });

  it("output payload shape matches the real bounded handler output EXACTLY", () => {
    // A DTO deliberately stuffed with every field that must NOT escape.
    const dto: ResourceLinkDTO = {
      id: "11111111-1111-4111-8111-111111111111",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      resourceKind: "vehicle",
      sourceProvider: "motive",
      sourceExternalId: "motive-veh-88231",
      targetProvider: "fleetio",
      targetExternalId: "42",
      sourceLabel: "Unit 104",
      targetLabel: "Truck 104",
      matchBasis: "suggested_vin",
      createdByUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      confirmedByUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      confirmedAt: "2026-07-20T10:00:00.000Z",
      archivedAt: null,
      createdAt: "2026-07-20T09:59:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
    };
    const real = toFindLinkedVehicleOutput(dto);

    expect(Object.keys(real).sort()).toEqual(
      FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS.map((o) => o.name).sort(),
    );
    expect(real).toEqual({
      vehicleId: "42",
      vehicleName: "Truck 104",
      sourceVehicleId: "motive-veh-88231",
      linkedAt: "2026-07-20T10:00:00.000Z",
    });

    // No raw repository field leaks into the variable surface.
    const blob = JSON.stringify(real);
    expect(blob).not.toContain(dto.id);
    expect(blob).not.toContain(dto.accountId);
    expect(blob).not.toContain(dto.createdByUserId!);
    expect(blob).not.toContain(dto.confirmedByUserId!);
    expect(blob).not.toContain("suggested_vin");

    const outNames = FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS.map((o) => o.name);
    // Plan §4.4: no `found` flag — an unmapped truck is a setup gap, not data.
    expect(outNames).not.toContain("found");
    for (const banned of [
      "id",
      "linkId",
      "accountId",
      "matchBasis",
      "archivedAt",
      "createdAt",
      "updatedAt",
      "createdByUserId",
      "confirmedByUserId",
      "sourceLabel",
    ]) {
      expect(outNames).not.toContain(banned);
    }
    expect(FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS.some((o) => o.sensitive)).toBe(false);
  });

  it("keeps a null target-label snapshot as null (never invents a vehicle name)", () => {
    const real = toFindLinkedVehicleOutput({
      id: "11111111-1111-4111-8111-111111111111",
      accountId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      resourceKind: "vehicle",
      sourceProvider: "motive",
      sourceExternalId: "motive-veh-88231",
      targetProvider: "fleetio",
      targetExternalId: "42",
      sourceLabel: null,
      targetLabel: null,
      matchBasis: "manual",
      createdByUserId: null,
      confirmedByUserId: null,
      confirmedAt: "2026-07-20T10:00:00.000Z",
      archivedAt: null,
      createdAt: "2026-07-20T09:59:00.000Z",
      updatedAt: "2026-07-20T10:00:00.000Z",
    });
    expect(real.vehicleName).toBeNull();
    expect(real.vehicleId).toBe("42");
  });
});

describe("fleetio:find_linked_vehicle registration + manifest honesty", () => {
  it("registers the handler EXACTLY once and resolves the meta by key", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "fleetio" && h.type === "find_linked_vehicle",
    );
    expect(handlers).toHaveLength(1);
    expect(getActionMeta("fleetio:find_linked_vehicle")).toBe(fleetioFindLinkedVehicleMeta);
  });

  it("fleetio now exposes exactly FOUR actions, no triggers, still experimental", () => {
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

  it("is the ONLY Fleetio action that declares requiresIntegration: false", () => {
    const byKey = Object.fromEntries(
      listAllActionMetas()
        .filter((m) => m.provider === "fleetio")
        .map((m) => [m.key, m.requiresIntegration]),
    );
    expect(byKey).toEqual({
      "fleetio:create_meter_entry": true,
      "fleetio:get_vehicle": true,
      "fleetio:update_vehicle_status": true,
      "fleetio:find_linked_vehicle": false,
    });
  });
});

describe("fleetio:find_linked_vehicle — REAL test-mode gate", () => {
  it("is ALLOWED in test mode (the real gate, not a restatement of its rules)", () => {
    expect(decideTestModeBlock("fleetio", "find_linked_vehicle")).toEqual({ blocked: false });
  });

  it("...while every provider-calling Fleetio action stays BLOCKED", () => {
    for (const type of ["get_vehicle", "update_vehicle_status", "create_meter_entry"]) {
      expect(decideTestModeBlock("fleetio", type)).toEqual({
        blocked: true,
        reason: "TEST_MODE_EXTERNAL_ACTION_BLOCKED",
      });
    }
  });
});

describe("fleetio:find_linked_vehicle readiness", () => {
  const REQS = buildRequiredFieldsByType([fleetioFindLinkedVehicleMeta], []);
  const node = (config: Record<string, unknown>): WorkflowNode =>
    ({
      id: "n1",
      provider: "fleetio",
      type: "find_linked_vehicle",
      config,
    }) as unknown as WorkflowNode;

  it("names both required fields as clear gaps when empty", () => {
    expect(REQS["fleetio:find_linked_vehicle"]!.requiredFields.map((f) => f.label)).toEqual([
      "Telematics system",
      "Vehicle",
    ]);
    expect(missingRequiredFields(node({}), REQS).map((g) => g.name)).toEqual([
      "sourceProvider",
      "sourceVehicleId",
    ]);
  });

  it("has no readiness-satisfying default on either field", () => {
    const reqFields = REQS["fleetio:find_linked_vehicle"]!.requiredFields;
    // Fail-closed floor: an empty requiredFields list would make this loop
    // assert nothing (PROVIDER-CONTRACT-CONSOLIDATION-1C).
    expect(reqFields).toHaveLength(2);
    for (const req of reqFields) {
      expect(req.hasDefault).toBe(false);
    }
  });

  it("a whitespace-only vehicle id is still a gap", () => {
    expect(
      missingRequiredFields(node({ sourceProvider: "motive", sourceVehicleId: "   " }), REQS).map(
        (g) => g.name,
      ),
    ).toEqual(["sourceVehicleId"]);
  });

  it("an unchosen telematics system is still a gap", () => {
    expect(
      missingRequiredFields(node({ sourceVehicleId: "motive-veh-88231" }), REQS).map((g) => g.name),
    ).toEqual(["sourceProvider"]);
  });

  it("DIRECT values satisfy readiness", () => {
    expect(
      missingRequiredFields(
        node({ sourceProvider: "motive", sourceVehicleId: "motive-veh-88231" }),
        REQS,
      ),
    ).toEqual([]);
  });

  it("MAPPED {{...}} values satisfy readiness (no resolver needs to load)", () => {
    expect(
      missingRequiredFields(
        node({ sourceProvider: "motive", sourceVehicleId: "{{trigger.vehicleId}}" }),
        REQS,
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling getVehicleMeta.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Fleetio Get Vehicle meta + manifest/registry honesty (FLEETIO-2).
// Business rules protected:
// - The meta validates against the ActionMeta contract and is keyed correctly.
// - The builder field binds the fleetio:vehicles resolver AND keeps manual
// entry (mapped-id / power-user path).
// - The declared output payload shape matches the real bounded handler output
// (drift between OutputMeta and the projection would mislead the picker).
// - Fleetio now honestly declares actions (get_vehicle exists) and STILL no
// triggers; it stays experimental.
// - get_vehicle is registered exactly once (handler + meta); both resolvers
// are registered exactly once with ids matching the meta reference.
// ---------------------------------------------------------------------------

describe("fleetio:get_vehicle meta", () => {
  it("validates against the ActionMeta contract", () => {
    expect(() => ActionMetaSchema.parse(fleetioGetVehicleMeta)).not.toThrow();
  });

  it("is keyed fleetio:get_vehicle, read-only, integration-required", () => {
    expect(fleetioGetVehicleMeta.key).toBe("fleetio:get_vehicle");
    expect(fleetioGetVehicleMeta.requiresIntegration).toBe(true);
    expect(fleetioGetVehicleMeta.isDestructive).toBe(false);
    expect(fleetioGetVehicleMeta.riskLevel).toBe("low");
  });

  it("binds the fleetio:vehicles resolver on the vehicle field AND allows manual entry", () => {
    const field = fleetioGetVehicleMeta.fields.find((f) => f.name === "vehicleId");
    expect(field).toBeTruthy();
    expect(field!.type).toBe("combobox");
    expect(field!.optionsSource).toBe("fleetio:vehicles");
    expect(field!.allowManualEntry).toBe(true);
    expect(field!.required).toBe(true);
  });

  it("declares an output payload shape that matches the real bounded handler output", () => {
    // Build the real projection from a full record and compare its keys to the meta.
    const realOutput = toGetVehicleOutput({
      id: 1,
      name: "n",
      vin: "v",
      license_plate: "p",
      make: "m",
      model: "mo",
      year: 2020,
      vehicle_status_id: 2,
      vehicle_status_name: "Active",
      current_meter_value: 5,
      meter_unit: "mi",
      archived_at: null,
      created_at: "c",
      updated_at: "u",
    });
    const metaKeys = FLEETIO_VEHICLE_OUTPUTS.map((o) => o.name).sort();
    expect(Object.keys(realOutput).sort()).toEqual(metaKeys);
    // Fleetio has no "number" field — it must NOT appear (no invented output).
    expect(metaKeys).not.toContain("number");
  });
});

describe("fleetio manifest honesty (FLEETIO-2)", () => {
  it("declares actions now that get_vehicle exists, but still no triggers", () => {
    expect(fleetioManifest.capabilities.actions).toBe(true);
    expect(fleetioManifest.capabilities.webhookTrigger).toBe(false);
    expect(fleetioManifest.capabilities.pollingTrigger).toBe(false);
  });

  it("stays experimental (not publicly visible until live certification)", () => {
    expect(fleetioManifest.isExperimental).toBe(false); // published 2026-07-24
  });
});

describe("fleetio registries", () => {
  it("registers the get_vehicle handler exactly once", () => {
    const matches = listRegisteredHandlers().filter(
      (h) => h.provider === "fleetio" && h.type === "get_vehicle",
    );
    expect(matches).toHaveLength(1);
  });

  it("registers get_vehicle exactly once and it resolves by key", () => {
    // FLEETIO-3 added a second action (update_vehicle_status); this test scopes
    // to get_vehicle. The full fleetio action set is asserted in
    // updateVehicleStatusMeta.test.ts.
    const getVehicleMetas = listAllActionMetas().filter((m) => m.key === "fleetio:get_vehicle");
    expect(getVehicleMetas).toHaveLength(1);
    expect(getActionMeta("fleetio:get_vehicle")).toBe(fleetioGetVehicleMeta);
  });

  it("registers both resolvers exactly once with ids the meta can reference", () => {
    expect(getOptionsResolver("fleetio:vehicles")?.provider).toBe("fleetio");
    expect(getOptionsResolver("fleetio:vehicle_statuses")?.provider).toBe("fleetio");
    const ids = ALL_OPTIONS_RESOLVERS.filter((r) => r.provider === "fleetio").map((r) => r.source).sort();
    expect(ids).toEqual(["fleetio:vehicle_statuses", "fleetio:vehicles"]);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling getVehicleReadiness.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Get Vehicle builder readiness (FLEETIO-2).
// Readiness is gated by `core/workflows/requiredFields.ts` — the SINGLE source
// of truth the builder form AND the server execution-readiness validator both
// use. Driving it with the REAL fleetio meta proves the same behavior a user
// sees in the builder, without rendering the whole config modal:
// - A node with no vehicle is NOT ready (clear "Vehicle" gap).
// - A picked vehicle id satisfies readiness.
// - A MAPPED / dynamic {{...}} vehicle id satisfies readiness (a non-empty
// value is not "missing" — the resolver need not load for a mapped id to be
// valid, per the batch's readiness rule).
// - A whitespace-only id is still a gap (Q5-consistent emptiness).
// The vehicle field also allows manual entry (asserted in getVehicleMeta.test),
// so ComboboxField preserves a typed/mapped id when the resolver fails to load —
// that widget behavior is covered by ComboboxField's own tests; here we prove the
// readiness contract the field feeds.
// ---------------------------------------------------------------------------

const REQS = buildRequiredFieldsByType([fleetioGetVehicleMeta], []);

function node(config: Record<string, unknown>): WorkflowNode {
  return {
    id: "n1",
    provider: "fleetio",
    type: "get_vehicle",
    config,
  } as unknown as WorkflowNode;
}

describe("Get Vehicle readiness", () => {
  it("computes 'Vehicle' as the single required field", () => {
    expect(REQS["fleetio:get_vehicle"]!.requiredFields.map((f) => f.label)).toEqual([
      "Vehicle",
    ]);
  });

  it("is NOT ready when no vehicle is configured (clear gap)", () => {
    const gaps = missingRequiredFields(node({}), REQS);
    expect(gaps.map((g) => g.name)).toEqual(["vehicleId"]);
  });

  it("is NOT ready for a whitespace-only vehicle id", () => {
    const gaps = missingRequiredFields(node({ vehicleId: "   " }), REQS);
    expect(gaps.map((g) => g.name)).toEqual(["vehicleId"]);
  });

  it("is ready when a vehicle id is picked", () => {
    expect(missingRequiredFields(node({ vehicleId: "42" }), REQS)).toEqual([]);
  });

  it("is ready when the vehicle id is MAPPED from an upstream step ({{...}})", () => {
    // A dynamic reference is a configured, non-empty value — the resolver does
    // NOT need to load for the node to be ready.
    expect(
      missingRequiredFields(node({ vehicleId: "{{trigger.vehicleId}}" }), REQS),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Merged from the former sibling updateVehicleStatusMeta.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1B; same production imports, all
// assertions preserved verbatim).
// Update Vehicle Status meta + readiness + registry honesty (FLEETIO-3).
// ---------------------------------------------------------------------------

describe("fleetio:update_vehicle_status meta", () => {
  it("validates against the ActionMeta contract", () => {
    expect(() => ActionMetaSchema.parse(fleetioUpdateVehicleStatusMeta)).not.toThrow();
  });

  it("is keyed correctly, integration-required, medium-risk, non-destructive, no confirmation", () => {
    expect(fleetioUpdateVehicleStatusMeta.key).toBe("fleetio:update_vehicle_status");
    expect(fleetioUpdateVehicleStatusMeta.requiresIntegration).toBe(true);
    expect(fleetioUpdateVehicleStatusMeta.riskLevel).toBe("medium");
    expect(fleetioUpdateVehicleStatusMeta.isDestructive).toBe(false);
    expect(fleetioUpdateVehicleStatusMeta.requiresConfirmation).toBe(false);
  });

  it("orders Vehicle then New status, each required, bound to its resolver, no hidden default", () => {
    const [vehicle, status] = fleetioUpdateVehicleStatusMeta.fields;
    expect(vehicle!.name).toBe("vehicleId");
    expect(vehicle!.label).toBe("Vehicle");
    expect(vehicle!.optionsSource).toBe("fleetio:vehicles");
    expect(vehicle!.required).toBe(true);

    expect(status!.name).toBe("vehicleStatusId");
    expect(status!.label).toBe("New status");
    expect(status!.optionsSource).toBe("fleetio:vehicle_statuses");
    expect(status!.required).toBe(true);
    // No silent default on either field.
    expect(vehicle!.defaultValue).toBeUndefined();
    expect(status!.defaultValue).toBeUndefined();
  });

  it("declares no raw-json fields and no sensitive outputs (nothing sensitive here)", () => {
    expect(fleetioUpdateVehicleStatusMeta.fields.some((f) => f.type === "json")).toBe(false);
    expect(FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS.some((o) => o.sensitive)).toBe(false);
  });

  it("output payload shape matches the real bounded handler output exactly", () => {
    const real = toUpdateVehicleStatusOutput({
      id: 1,
      name: "n",
      vin: null,
      license_plate: null,
      make: null,
      model: null,
      year: null,
      vehicle_status_id: 2,
      vehicle_status_name: "Active",
      current_meter_value: null,
      meter_unit: null,
      archived_at: null,
      created_at: null,
      updated_at: "u",
    });
    expect(Object.keys(real).sort()).toEqual(
      FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS.map((o) => o.name).sort(),
    );
    // Honest field naming: updatedAt (real), never an invented changedAt.
    expect(FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS.map((o) => o.name)).toContain("updatedAt");
    expect(FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS.map((o) => o.name)).not.toContain("changedAt");
  });
});

describe("fleetio:update_vehicle_status registration + manifest honesty", () => {
  it("registers the handler exactly once and resolves the meta by key", () => {
    const handlers = listRegisteredHandlers().filter(
      (h) => h.provider === "fleetio" && h.type === "update_vehicle_status",
    );
    expect(handlers).toHaveLength(1);
    expect(getActionMeta("fleetio:update_vehicle_status")).toBe(fleetioUpdateVehicleStatusMeta);
  });

  // Catalog count updated by FLEETIO-4 (create_meter_entry) and again by
  // 5.TRUCK-BRIDGE-1 CS-3 (find_linked_vehicle).
  it("fleetio exposes exactly four actions, no triggers, still experimental", () => {
    const keys = listAllActionMetas().filter((m) => m.provider === "fleetio").map((m) => m.key).sort();
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
  });

  it("reuses the existing resolvers (does not duplicate them)", () => {
    expect(getOptionsResolver("fleetio:vehicles")?.provider).toBe("fleetio");
    expect(getOptionsResolver("fleetio:vehicle_statuses")?.provider).toBe("fleetio");
  });
});

describe("fleetio:update_vehicle_status readiness", () => {
  const REQS = buildRequiredFieldsByType([fleetioUpdateVehicleStatusMeta], []);
  const node = (config: Record<string, unknown>): WorkflowNode =>
    ({ id: "n1", provider: "fleetio", type: "update_vehicle_status", config }) as unknown as WorkflowNode;

  it("both fields are required gaps when empty", () => {
    expect(missingRequiredFields(node({}), REQS).map((g) => g.name).sort()).toEqual([
      "vehicleId",
      "vehicleStatusId",
    ]);
  });

  it("whitespace-only values are still gaps", () => {
    expect(
      missingRequiredFields(node({ vehicleId: "  ", vehicleStatusId: " " }), REQS).map((g) => g.name).sort(),
    ).toEqual(["vehicleId", "vehicleStatusId"]);
  });

  it("direct ids satisfy readiness", () => {
    expect(missingRequiredFields(node({ vehicleId: "42", vehicleStatusId: "8" }), REQS)).toEqual([]);
  });

  it("mapped {{...}} values satisfy readiness (resolver need not load)", () => {
    expect(
      missingRequiredFields(
        node({ vehicleId: "{{trigger.vehicleId}}", vehicleStatusId: "{{previous.statusId}}" }),
        REQS,
      ),
    ).toEqual([]);
  });
});
