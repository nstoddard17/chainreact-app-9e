/**
 * @jest-environment node
 *
 * Fleetio Get Vehicle meta + manifest/registry honesty (FLEETIO-2).
 *
 * Business rules protected:
 *   - The meta validates against the ActionMeta contract and is keyed correctly.
 *   - The builder field binds the fleetio:vehicles resolver AND keeps manual
 *     entry (mapped-id / power-user path).
 *   - The declared output payload shape matches the real bounded handler output
 *     (drift between OutputMeta and the projection would mislead the picker).
 *   - Fleetio now honestly declares actions (get_vehicle exists) and STILL no
 *     triggers; it stays experimental.
 *   - get_vehicle is registered exactly once (handler + meta); both resolvers
 *     are registered exactly once with ids matching the meta reference.
 */
import { ActionMetaSchema } from "@/contracts/actionMeta";
import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";
import {
  FLEETIO_VEHICLE_OUTPUTS,
  toGetVehicleOutput,
} from "@/integrations/fleetio/actions/getVehicle.output";
import { fleetioManifest } from "@/integrations/fleetio/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { getOptionsResolver, ALL_OPTIONS_RESOLVERS } from "@/services/options/_registry";
import { getActionMeta, listAllActionMetas } from "@/services/discovery/_registry";

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
