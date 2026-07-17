/**
 * @jest-environment node
 *
 * MOTIVE-1 — options resolvers: id values + recognizable labels, disconnected
 * guard, sanitized provider errors, local q filtering, hasMore hint.
 */
const mockRefreshAndRetry = jest.fn();
const mockVehicleList = jest.fn();
const mockDriverList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class Unauthorized401Error extends Error {},
  IntegrationActionRequiredError: class IntegrationActionRequiredError extends Error {},
  InsufficientScopeError: class InsufficientScopeError extends Error {},
}));
jest.mock("@/integrations/_shared/motive/api/vehicles", () => ({
  vehicleList: (...args: unknown[]) => mockVehicleList(...args),
}));
jest.mock("@/integrations/_shared/motive/api/drivers", () => ({
  driverList: (...args: unknown[]) => mockDriverList(...args),
}));

import { OptionsResolverError } from "@/services/options/types";
import { motiveVehiclesResolver } from "@/integrations/motive/options/vehicles";
import { motiveDriversResolver } from "@/integrations/motive/options/drivers";

const INTEGRATION = {
  id: "int-1",
  accountId: "acct-1",
  provider: "motive",
  providerAccountId: "8801",
  accountMetadata: {},
};

function ctx(overrides: Record<string, unknown> = {}) {
  return { accountId: "acct-1", userId: "u-1", q: "", deps: {}, integration: INTEGRATION, ...overrides } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("motive:vehicles", () => {
  it("returns id values with recognizable labels", async () => {
    mockVehicleList.mockResolvedValueOnce([
      { vehicleId: "12", number: "Truck 12", make: "Freightliner", model: "Cascadia" },
      { vehicleId: "13", number: null, make: null, model: null },
    ]);
    const result = await motiveVehiclesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value).sort()).toEqual(["12", "13"]);
    const truck = result.items.find((i) => i.value === "12")!;
    expect(truck.label).toContain("Truck 12");
  });

  it("filters locally on q", async () => {
    mockVehicleList.mockResolvedValueOnce([
      { vehicleId: "1", number: "Truck A" },
      { vehicleId: "2", number: "Van B" },
    ]);
    const result = await motiveVehiclesResolver.resolve(ctx({ q: "van" }));
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });

  it("throws INTEGRATION_DISCONNECTED without an integration (no fetch)", async () => {
    await expect(motiveVehiclesResolver.resolve(ctx({ integration: null }))).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    expect(mockVehicleList).not.toHaveBeenCalled();
  });

  it("sanitizes provider failures to PROVIDER_ERROR", async () => {
    mockVehicleList.mockRejectedValueOnce(new Error("raw provider stack with ids"));
    const err = await motiveVehiclesResolver.resolve(ctx()).catch((e) => e as OptionsResolverError);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((err as OptionsResolverError).message).not.toContain("stack");
  });

  it("advertises hasMore when a full page returns", async () => {
    mockVehicleList.mockResolvedValueOnce(
      Array.from({ length: 100 }, (_v, i) => ({ vehicleId: String(i), number: `T${i}` })),
    );
    const result = await motiveVehiclesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("motive:drivers", () => {
  it("labels drivers by name and disambiguates with email", async () => {
    mockDriverList.mockResolvedValueOnce([
      { driverId: "5", firstName: "Jane", lastName: "Doe", email: "jane@acme.test" },
      { driverId: "6", firstName: null, lastName: null, email: "no-name@acme.test", username: "nn" },
    ]);
    const result = await motiveDriversResolver.resolve(ctx());
    const jane = result.items.find((i) => i.value === "5")!;
    expect(jane.label).toContain("Jane Doe");
    // Driver with no name falls back to email/username, never empty.
    const other = result.items.find((i) => i.value === "6")!;
    expect(other.label.length).toBeGreaterThan(0);
  });
});
