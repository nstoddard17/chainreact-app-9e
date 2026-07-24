/**
 * @jest-environment node
 *
 * Get Vehicle builder readiness (FLEETIO-2).
 *
 * Readiness is gated by `core/workflows/requiredFields.ts` — the SINGLE source
 * of truth the builder form AND the server execution-readiness validator both
 * use. Driving it with the REAL fleetio meta proves the same behavior a user
 * sees in the builder, without rendering the whole config modal:
 *
 *   - A node with no vehicle is NOT ready (clear "Vehicle" gap).
 *   - A picked vehicle id satisfies readiness.
 *   - A MAPPED / dynamic {{...}} vehicle id satisfies readiness (a non-empty
 *     value is not "missing" — the resolver need not load for a mapped id to be
 *     valid, per the batch's readiness rule).
 *   - A whitespace-only id is still a gap (Q5-consistent emptiness).
 *
 * The vehicle field also allows manual entry (asserted in getVehicleMeta.test),
 * so ComboboxField preserves a typed/mapped id when the resolver fails to load —
 * that widget behavior is covered by ComboboxField's own tests; here we prove the
 * readiness contract the field feeds.
 */
import { fleetioGetVehicleMeta } from "@/integrations/fleetio/actions/getVehicle.meta";
import {
  buildRequiredFieldsByType,
  missingRequiredFields,
} from "@/core/workflows/requiredFields";
import type { WorkflowNode } from "@/contracts/workflow";

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
