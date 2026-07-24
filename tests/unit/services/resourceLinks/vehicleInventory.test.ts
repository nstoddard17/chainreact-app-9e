/**
 * @jest-environment node
 *
 * Account-scoped vehicle INVENTORY (5.TRUCK-BRIDGE-1 CS-5).
 *
 * REAL: the service, the real Motive/Fleetio API wrappers and their bounded
 * projections, the real Fleetio execution seam, and the REAL registered
 * `motive:vehicles` / `fleetio:vehicles` resolvers (used to PIN label parity).
 * MOCKED: only the integrations repository and the provider HTTP boundary.
 *
 * Business rules protected:
 *   - the integration is looked up for the ACCOUNT passed in,
 *   - no connection ⇒ `disconnected` (a setup step), NOT `error`,
 *   - any provider failure ⇒ `error` with NO message,
 *   - identity fields (VIN / plate) survive for the matcher,
 *   - the labels this module computes are IDENTICAL to the ones the pickers
 *     show — otherwise the Unlinked list and the Fleetio picker would disagree
 *     about what a truck is called.
 */
import { randomBytes } from "node:crypto";

const mockGetActive = jest.fn();
const mockMarkNeedsReconnect = jest.fn();
jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
  markNeedsReconnect: (...a: unknown[]) => mockMarkNeedsReconnect(...a),
}));
jest.mock("@/services/integrations/reconnectNotification", () => ({
  notifyReconnectNeeded: jest.fn(),
}));

import {
  loadMotiveInventory,
  loadFleetioInventory,
  labelForMotiveVehicle,
  labelForFleetioVehicle,
} from "@/services/resourceLinks/vehicleInventory";
import { getOptionsResolver } from "@/services/options/_registry";
import { encryptToken } from "@/core/encryption/tokens";

const ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const FLEETIO_KEY = "fleetio-key-inventory";
const FLEETIO_TOKEN = "fleetio-acct-inventory";
const MOTIVE_TOKEN = "motive-access-inventory";

const ORIGINAL_FETCH = global.fetch;

function fleetioRow() {
  return {
    id: "int-fleetio",
    accountId: ACCOUNT_A,
    provider: "fleetio",
    providerAccountId: "7211",
    accessTokenEncrypted: encryptToken(FLEETIO_KEY),
    extraCredentialsEncrypted: encryptToken(JSON.stringify({ accountToken: FLEETIO_TOKEN })),
    needsReconnectAt: null,
  };
}
function motiveRow() {
  return {
    id: "int-motive",
    accountId: ACCOUNT_A,
    provider: "motive",
    providerAccountId: "mv-1",
    accessTokenEncrypted: encryptToken(MOTIVE_TOKEN),
    refreshTokenEncrypted: null,
    expiresAt: null,
    needsReconnectAt: null,
  };
}
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MOTIVE_WIRE = {
  vehicles: [
    {
      vehicle: {
        id: 88231,
        number: "104",
        make: "Freightliner",
        model: "Cascadia",
        year: 2021,
        vin: "1FUJGLDR0CSBP1234",
        license_plate_state: "TX",
        license_plate_number: "ABC-1234",
        status: "active",
      },
    },
  ],
};

const FLEETIO_WIRE = {
  records: [
    {
      id: 42,
      name: "Truck 104",
      vehicle_status_name: "Active",
      vehicle_type_name: "Truck",
      archived_at: null,
      vin: "1FUJGLDR0CSBP1234",
      license_plate: "TX ABC-1234",
      make: "Freightliner",
      model: "Cascadia",
      year: 2021,
      secret_internal: "must-not-leak",
    },
  ],
  next_cursor: null,
};

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  mockGetActive.mockReset();
  mockMarkNeedsReconnect.mockReset();
  mockMarkNeedsReconnect.mockResolvedValue(false);
});
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

describe("Motive inventory", () => {
  it("keeps the identity fields the matcher needs", async () => {
    // `refreshAndRetry` performs its OWN account-scoped lookup after this
    // module's disconnected-vs-error pre-check, so the row is returned to both.
    mockGetActive.mockResolvedValue(motiveRow());
    global.fetch = jest.fn(async () => jsonResponse(200, MOTIVE_WIRE)) as unknown as typeof fetch;

    const result = await loadMotiveInventory({ accountId: ACCOUNT_A });
    expect(result.status).toBe("ok");
    expect(result.vehicles).toEqual([
      {
        identity: {
          vehicleId: "88231",
          number: "104",
          vin: "1FUJGLDR0CSBP1234",
          licensePlateNumber: "ABC-1234",
        },
        label: "104 — Freightliner Cascadia",
      },
    ]);
  });

  it("looks up the integration for the ACCOUNT it was given", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    await loadMotiveInventory({ accountId: ACCOUNT_A });
    expect(mockGetActive).toHaveBeenCalledWith(ACCOUNT_A, "motive", null);
  });

  it("reports disconnected (not error) with no connection, and makes no call", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await loadMotiveInventory({ accountId: ACCOUNT_A })).toEqual({
      status: "disconnected",
      vehicles: [],
      hasMore: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("collapses a provider failure to a message-free error", async () => {
    mockGetActive.mockResolvedValue(motiveRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(500, { error: "internal db at 10.0.0.4 exploded" }),
    ) as unknown as typeof fetch;
    const result = await loadMotiveInventory({ accountId: ACCOUNT_A });
    expect(result).toEqual({ status: "error", vehicles: [], hasMore: false });
    expect(JSON.stringify(result)).not.toMatch(/10\.0\.0\.4|exploded/i);
  });

  it("skips a vehicle with no id rather than fabricating a key", async () => {
    mockGetActive.mockResolvedValue(motiveRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { vehicles: [{ vehicle: { number: "no-id" } }] }),
    ) as unknown as typeof fetch;
    expect((await loadMotiveInventory({ accountId: ACCOUNT_A })).vehicles).toEqual([]);
  });

  it("never leaks the access token into the result", async () => {
    mockGetActive.mockResolvedValue(motiveRow());
    global.fetch = jest.fn(async () => jsonResponse(200, MOTIVE_WIRE)) as unknown as typeof fetch;
    const blob = JSON.stringify(await loadMotiveInventory({ accountId: ACCOUNT_A }));
    expect(blob).not.toContain(MOTIVE_TOKEN);
  });
});

describe("Fleetio inventory", () => {
  it("keeps VIN, plate, and the archived flag", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () => jsonResponse(200, FLEETIO_WIRE)) as unknown as typeof fetch;

    const result = await loadFleetioInventory({ accountId: ACCOUNT_A });
    expect(result.status).toBe("ok");
    expect(result.vehicles).toEqual([
      {
        identity: {
          vehicleId: "42",
          name: "Truck 104",
          vin: "1FUJGLDR0CSBP1234",
          licensePlate: "TX ABC-1234",
        },
        label: "Truck 104",
        archivedAt: null,
      },
    ]);
    // The bounded projection drops everything else.
    expect(JSON.stringify(result)).not.toContain("must-not-leak");
    expect(JSON.stringify(result)).not.toContain(FLEETIO_KEY);
    expect(JSON.stringify(result)).not.toContain(FLEETIO_TOKEN);
  });

  it("surfaces an archived_at when Fleetio reports one", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [{ ...FLEETIO_WIRE.records[0], archived_at: "2026-07-01T00:00:00Z" }],
        next_cursor: null,
      }),
    ) as unknown as typeof fetch;
    const result = await loadFleetioInventory({ accountId: ACCOUNT_A });
    expect(result.vehicles[0]!.archivedAt).toBe("2026-07-01T00:00:00Z");
  });

  it("reports disconnected when the account has no Fleetio row", async () => {
    mockGetActive.mockResolvedValueOnce(null);
    expect(await loadFleetioInventory({ accountId: ACCOUNT_A })).toEqual({
      status: "disconnected",
      vehicles: [],
      hasMore: false,
    });
  });

  it("collapses a 401 to a message-free error (never a raw provider body)", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () => new Response("bad", { status: 401 })) as unknown as typeof fetch;
    const result = await loadFleetioInventory({ accountId: ACCOUNT_A });
    expect(result).toEqual({ status: "error", vehicles: [], hasMore: false });
  });

  it("flags a truncated page via hasMore", async () => {
    mockGetActive.mockResolvedValueOnce(fleetioRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, { ...FLEETIO_WIRE, next_cursor: "CUR" }),
    ) as unknown as typeof fetch;
    expect((await loadFleetioInventory({ accountId: ACCOUNT_A })).hasMore).toBe(true);
  });
});

describe("label parity with the REAL pickers (drift guard)", () => {
  /**
   * The Unlinked list and the Fleetio picker must call a truck the same thing.
   * These assertions run the REAL resolvers over the SAME wire payload and
   * compare their option labels to this module's — so a future change to either
   * label rule fails here rather than as a confusing screen.
   */
  it("motive labels match `motive:vehicles` exactly", async () => {
    const resolver = getOptionsResolver("motive:vehicles")!;
    mockGetActive.mockResolvedValue(motiveRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        vehicles: [
          { vehicle: { id: 1, number: "104", make: "Freightliner", model: "Cascadia" } },
          { vehicle: { id: 2, number: "205", make: null, model: null } },
          { vehicle: { id: 3, number: null, make: "Volvo", model: "VNL" } },
          { vehicle: { id: 4, number: null, make: null, model: null } },
        ],
      }),
    ) as unknown as typeof fetch;

    const resolved = await resolver.resolve({
      userId: "u",
      integration: motiveRow() as never,
      q: "",
      deps: {},
    });
    const inventory = await loadMotiveInventory({ accountId: ACCOUNT_A });

    const byId = new Map(inventory.vehicles.map((v) => [v.identity.vehicleId, v.label]));
    expect(resolved.items.length).toBeGreaterThan(0);
    for (const item of resolved.items) {
      expect(byId.get(item.value)).toBe(item.label);
    }
  });

  it("fleetio labels match `fleetio:vehicles` exactly", async () => {
    const resolver = getOptionsResolver("fleetio:vehicles")!;
    mockGetActive.mockResolvedValue(fleetioRow());
    global.fetch = jest.fn(async () =>
      jsonResponse(200, {
        records: [
          { id: 42, name: "Truck 104" },
          { id: 43, name: "   " },
          { id: 44, name: null },
        ],
        next_cursor: null,
      }),
    ) as unknown as typeof fetch;

    const resolved = await resolver.resolve({
      userId: "u",
      integration: fleetioRow() as never,
      q: "",
      deps: {},
    });
    const inventory = await loadFleetioInventory({ accountId: ACCOUNT_A });

    const byId = new Map(inventory.vehicles.map((v) => [v.identity.vehicleId, v.label]));
    expect(resolved.items.length).toBeGreaterThan(0);
    for (const item of resolved.items) {
      expect(byId.get(item.value)).toBe(item.label);
    }
  });

  it("label helpers never emit an 'undefined'-bearing string", () => {
    expect(labelForMotiveVehicle({ vehicleId: "9", number: null, make: null, model: null })).toBe("9");
    expect(labelForMotiveVehicle({ vehicleId: "9", number: "  ", make: "Volvo", model: null })).toBe("Volvo");
    expect(labelForFleetioVehicle({ vehicleId: "9", name: null })).toBe("Vehicle 9");
    expect(labelForFleetioVehicle({ vehicleId: "9", name: "   " })).toBe("Vehicle 9");
    for (const label of [
      labelForMotiveVehicle({ vehicleId: "9", number: null, make: null, model: null }),
      labelForFleetioVehicle({ vehicleId: "9", name: null }),
    ]) {
      expect(label).not.toContain("undefined");
      expect(label).not.toContain("null");
    }
  });
});
