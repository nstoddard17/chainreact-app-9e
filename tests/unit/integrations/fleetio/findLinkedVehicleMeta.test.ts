/**
 * @jest-environment node
 *
 * Find Linked Fleetio Vehicle — meta + readiness + registry/manifest honesty +
 * REAL test-mode gate (5.TRUCK-BRIDGE-1 CS-3).
 *
 * Everything here runs against the real contracts: the ActionMeta Zod schema,
 * the real handler registry, the real discovery registry, the real readiness
 * core (`core/workflows/requiredFields.ts` — the single source both the builder
 * form and every server execution-readiness path use), and the REAL
 * `testModeGate` (not a restatement of its rules).
 */
import { ActionMetaSchema } from "@/contracts/actionMeta";
import { fleetioFindLinkedVehicleMeta } from "@/integrations/fleetio/actions/findLinkedVehicle.meta";
import {
  FLEETIO_FIND_LINKED_VEHICLE_OUTPUTS,
  toFindLinkedVehicleOutput,
} from "@/integrations/fleetio/actions/findLinkedVehicle.output";
import { fleetioManifest } from "@/integrations/fleetio/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { getActionMeta, listAllActionMetas } from "@/services/discovery/_registry";
import { listOptionsResolvers } from "@/services/options/_registry";
import { decideTestModeBlock } from "@/services/execution/testModeGate";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import type { WorkflowNode } from "@/contracts/workflow";
import type { ResourceLinkDTO } from "@/contracts/resourceLinks";

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
    for (const req of REQS["fleetio:find_linked_vehicle"]!.requiredFields) {
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
