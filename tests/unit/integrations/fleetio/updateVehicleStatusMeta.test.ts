/**
 * @jest-environment node
 *
 * Update Vehicle Status meta + readiness + registry honesty (FLEETIO-3).
 */
import { ActionMetaSchema } from "@/contracts/actionMeta";
import { fleetioUpdateVehicleStatusMeta } from "@/integrations/fleetio/actions/updateVehicleStatus.meta";
import {
  FLEETIO_UPDATE_VEHICLE_STATUS_OUTPUTS,
  toUpdateVehicleStatusOutput,
} from "@/integrations/fleetio/actions/updateVehicleStatus.output";
import { fleetioManifest } from "@/integrations/fleetio/manifest";
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";
import { getActionMeta, listAllActionMetas } from "@/services/discovery/_registry";
import { getOptionsResolver } from "@/services/options/_registry";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import type { WorkflowNode } from "@/contracts/workflow";

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

  // Catalog count updated by FLEETIO-4, which added create_meter_entry.
  it("fleetio exposes exactly three actions (get_vehicle + update_vehicle_status + create_meter_entry), no triggers, still experimental", () => {
    const keys = listAllActionMetas().filter((m) => m.provider === "fleetio").map((m) => m.key).sort();
    expect(keys).toEqual([
      "fleetio:create_meter_entry",
      "fleetio:get_vehicle",
      "fleetio:update_vehicle_status",
    ]);
    expect(fleetioManifest.capabilities.actions).toBe(true);
    expect(fleetioManifest.capabilities.webhookTrigger).toBe(false);
    expect(fleetioManifest.capabilities.pollingTrigger).toBe(false);
    expect(fleetioManifest.isExperimental).toBe(true);
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
