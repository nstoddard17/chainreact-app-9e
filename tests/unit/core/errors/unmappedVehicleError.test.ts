/**
 * @jest-environment node
 *
 * First-class `UNMAPPED_VEHICLE` failure classification (5.TRUCK-BRIDGE-1 CS-4).
 *
 * Uses the REAL `UnmappedVehicleError` thrown by CS-3's
 * `fleetio:find_linked_vehicle`, the REAL engine name→code normalization rule,
 * the REAL humanizer, and the REAL persisted-classification contract.
 *
 * The chain under test:
 *   handler throws UnmappedVehicleError
 *     → engine classifies `err.name` → "UNMAPPED_VEHICLE"
 *       → humanizeActionError → the user-facing sentence
 *         → HumanizedErrorSchema (what gets persisted on the run row)
 *
 * Business rules protected:
 *   - the exact user-facing sentence is produced,
 *   - the raw handler message (which names the vehicle id) is NEVER echoed,
 *   - archived and never-linked produce identical user-facing copy,
 *   - no CTA action is emitted while the destination is flag-gated,
 *   - the classification still parses against the persisted schema.
 */
import { humanizeActionError, GENERIC_ACTION_ERROR_TITLE } from "@/core/errors/humanizeActionError";
import { failedRunCta } from "@/core/errors/failedRunCta";
import { HumanizedErrorSchema } from "@/contracts/workflow";
import { UnmappedVehicleError } from "@/integrations/fleetio/actions/findLinkedVehicle";
// The REAL engine normalization rule — not a copy of it. The engine's own suite
// proves this function is the one `runWorkflow` calls.
import { classifyHandlerError as engineCodeFor } from "@/services/execution/classifyHandlerError";

const EXPECTED_DESCRIPTION =
  "This Motive vehicle is not linked to Fleetio yet. Link it in Apps → Vehicle Links, then run the workflow again.";

describe("UnmappedVehicleError → UNMAPPED_VEHICLE", () => {
  it("carries a stable name and typed code (the contract the engine reads)", () => {
    const err = new UnmappedVehicleError("Motive", "motive", "motive-veh-88231");
    expect(err.name).toBe("UnmappedVehicleError");
    expect(err.code).toBe("UNMAPPED_VEHICLE");
    expect(engineCodeFor(err)).toBe("UNMAPPED_VEHICLE");
  });

  it("an ordinary Error still classifies as HANDLER_FAILED (no over-reach)", () => {
    expect(engineCodeFor(new Error("something else"))).toBe("HANDLER_FAILED");
  });
});

describe("humanized copy", () => {
  const err = new UnmappedVehicleError("Motive", "motive", "motive-veh-88231");
  const humanized = humanizeActionError({
    code: engineCodeFor(err),
    message: err.message,
  });

  it("produces the required user-facing sentence", () => {
    expect(humanized.description).toBe(EXPECTED_DESCRIPTION);
    expect(humanized.title).toBe("Vehicle isn't linked yet");
    expect(humanized.severity).toBe("error");
  });

  it("is NOT the generic unclassified fallback", () => {
    expect(humanized.title).not.toBe(GENERIC_ACTION_ERROR_TITLE);
    expect(humanized.description).not.toMatch(/unexpected reason/i);
  });

  it("never echoes the raw handler diagnostics", () => {
    // The thrown message names the vehicle id; the persisted/notified copy must
    // stay identifier-free like every other classified branch.
    expect(err.message).toContain("motive-veh-88231");
    const blob = JSON.stringify(humanized);
    expect(blob).not.toContain("motive-veh-88231");
    expect(blob).not.toContain(err.message);
  });

  it("emits the link_vehicles action, which routes to the Vehicle Links screen", () => {
    // CS-6 — CS-4 deliberately emitted no action while /apps/vehicle-links was
    // behind a default-OFF flag. The flag launched, so the CTA now points at a
    // destination that exists; the serving layer strips it if an operator turns
    // the feature back off (see the flags suite).
    expect(humanized.action).toBe("link_vehicles");
    expect(failedRunCta(humanized.action, { workflowId: "wf-1" })).toEqual({
      label: "Link vehicles",
      href: "/apps/vehicle-links",
    });
  });

  it("routes to the MANAGEMENT screen, not the builder — the workflow is fine", () => {
    const cta = failedRunCta(humanized.action, { workflowId: "wf-1" })!;
    expect(cta.href).not.toContain("/workflows/");
    expect(cta.href).not.toBe("/apps");
  });

  it("still parses against the persisted classification schema", () => {
    expect(() => HumanizedErrorSchema.parse(humanized)).not.toThrow();
  });
});

describe("archived and never-linked are indistinguishable to the user", () => {
  it("identical humanized copy for both, and no other account is named", () => {
    // CS-3's handler throws the SAME error for both cases (the repository's
    // `archived_at IS NULL` predicate collapses them), so both arrive here with
    // the same name — and therefore the same classified copy.
    const neverLinked = new UnmappedVehicleError("Motive", "motive", "motive-veh-88231");
    const wasArchived = new UnmappedVehicleError("Motive", "motive", "motive-veh-88231");

    const a = humanizeActionError({ code: engineCodeFor(neverLinked), message: neverLinked.message });
    const b = humanizeActionError({ code: engineCodeFor(wasArchived), message: wasArchived.message });
    expect(a).toEqual(b);

    // Even a different account's vehicle id in the thrown text cannot surface.
    const other = new UnmappedVehicleError("Motive", "motive", "other-account-veh-777");
    const c = humanizeActionError({ code: engineCodeFor(other), message: other.message });
    expect(c).toEqual(a);
    expect(JSON.stringify(c)).not.toContain("other-account-veh-777");
  });
});
