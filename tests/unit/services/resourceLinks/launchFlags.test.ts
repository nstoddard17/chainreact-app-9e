/**
 * @jest-environment node
 *
 * 5.TRUCK-BRIDGE-1 CS-6 — the launch decision, encoded as tests.
 *
 * Two flags with DELIBERATELY OPPOSITE defaults, and the difference is the
 * whole point:
 *
 *   `ENABLE_RESOURCE_LINKS_UI`        DEFAULT ON  — the feature launched.
 *   `ENABLE_VEHICLE_VIN_BULK_CONFIRM` DEFAULT OFF — bulk VIN confirm is still
 *                                                   blocked on live evidence
 *                                                   that Fleetio populates VIN.
 *
 * Also covers the serving-layer CTA gate: a `link_vehicles` action is stripped
 * when the surface is disabled, so no UI can render a button pointing at a 404,
 * while the persisted classification keeps it as history.
 */
import {
  RESOURCE_LINKS_UI_FLAG,
  VEHICLE_VIN_BULK_CONFIRM_FLAG,
  isResourceLinksUiEnabled,
  isVinBulkConfirmEnabled,
  filterVehicleLinksCta,
} from "@/services/resourceLinks/flags";

beforeEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
});
afterEach(() => {
  delete process.env[RESOURCE_LINKS_UI_FLAG];
  delete process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG];
});

describe("ENABLE_RESOURCE_LINKS_UI — launched ON", () => {
  it("is ON with no environment variable set at all", () => {
    expect(isResourceLinksUiEnabled()).toBe(true);
  });

  it('is OFF only for the exact string "false"', () => {
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    expect(isResourceLinksUiEnabled()).toBe(false);
  });

  it("stays ON for a typo or an unrelated value (fail-visible in the launched direction)", () => {
    for (const value of ["true", "1", "TRUE", "FALSE", "no", "off", "", "yes"]) {
      process.env[RESOURCE_LINKS_UI_FLAG] = value;
      expect(isResourceLinksUiEnabled()).toBe(true);
    }
  });

  it("is read at CALL time, so a rollout toggle needs no re-import", () => {
    expect(isResourceLinksUiEnabled()).toBe(true);
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    expect(isResourceLinksUiEnabled()).toBe(false);
    delete process.env[RESOURCE_LINKS_UI_FLAG];
    expect(isResourceLinksUiEnabled()).toBe(true);
  });
});

describe("ENABLE_VEHICLE_VIN_BULK_CONFIRM — deliberately still OFF", () => {
  it("is OFF by default even though the surface is now ON", () => {
    expect(isResourceLinksUiEnabled()).toBe(true);
    expect(isVinBulkConfirmEnabled()).toBe(false);
  });

  it('turns on only for the exact string "true"', () => {
    for (const value of ["1", "TRUE", "yes", "", "false"]) {
      process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = value;
      expect(isVinBulkConfirmEnabled()).toBe(false);
    }
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    expect(isVinBulkConfirmEnabled()).toBe(true);
  });

  it("cannot be reached when the surface itself is disabled", () => {
    process.env[VEHICLE_VIN_BULK_CONFIRM_FLAG] = "true";
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    expect(isVinBulkConfirmEnabled()).toBe(false);
  });

  it("the two flags are independent constants (no accidental aliasing)", () => {
    expect(RESOURCE_LINKS_UI_FLAG).toBe("ENABLE_RESOURCE_LINKS_UI");
    expect(VEHICLE_VIN_BULK_CONFIRM_FLAG).toBe("ENABLE_VEHICLE_VIN_BULK_CONFIRM");
    expect(RESOURCE_LINKS_UI_FLAG).not.toBe(VEHICLE_VIN_BULK_CONFIRM_FLAG);
  });
});

describe("filterVehicleLinksCta — the serving-layer CTA gate", () => {
  it("passes link_vehicles through while the surface is enabled", () => {
    expect(filterVehicleLinksCta("link_vehicles")).toBe("link_vehicles");
  });

  it("STRIPS link_vehicles when the surface is disabled", () => {
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    expect(filterVehicleLinksCta("link_vehicles")).toBeUndefined();
  });

  it("never touches any other action, in either flag state", () => {
    const others = [
      "reconnect",
      "open_node",
      "retry_later",
      "upgrade_plan",
      "review_pending",
      "contact_support",
    ] as const;
    for (const state of ["true", "false"]) {
      process.env[RESOURCE_LINKS_UI_FLAG] = state;
      for (const action of others) {
        expect(filterVehicleLinksCta(action)).toBe(action);
      }
    }
  });

  it("passes undefined through unchanged", () => {
    expect(filterVehicleLinksCta(undefined)).toBeUndefined();
    process.env[RESOURCE_LINKS_UI_FLAG] = "false";
    expect(filterVehicleLinksCta(undefined)).toBeUndefined();
  });
});
