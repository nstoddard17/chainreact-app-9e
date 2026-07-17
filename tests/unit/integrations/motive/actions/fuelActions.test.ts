/**
 * @jest-environment node
 *
 * MOTIVE-1 — fuel action handlers: bounded output, refreshAndRetry pinned to the
 * triggering company, friendly get-not-found, id coercion guard. Provider
 * boundary mocked; the real V2 handler path runs.
 */
const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();
const mockGet = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
}));
jest.mock("@/integrations/_shared/motive/api/fuelPurchases", () => ({
  fuelPurchaseCreate: (...a: unknown[]) => mockCreate(...a),
  fuelPurchaseGet: (...a: unknown[]) => mockGet(...a),
  fuelPurchaseDelete: (...a: unknown[]) => mockDelete(...a),
}));

import { createFuelPurchase } from "@/integrations/motive/actions/createFuelPurchase";
import { getFuelPurchase } from "@/integrations/motive/actions/getFuelPurchase";
import { deleteFuelPurchase } from "@/integrations/motive/actions/deleteFuelPurchase";

const MOTIVE_EVENT = {
  provider: "motive",
  eventType: "new_fuel_purchase",
  eventId: "e-1",
  occurredAt: "2026-07-17T00:00:00Z",
  providerAccountId: "8801",
  payload: {},
} as const;

function input(config: Record<string, unknown>) {
  return {
    workflowId: "wf-1",
    userId: "u-1",
    accountId: "acct-1",
    runId: "run-1",
    nodeId: "node-1",
    config,
    triggerEvent: MOTIVE_EVENT,
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("create_fuel_purchase", () => {
  const CFG = {
    vehicleId: "12",
    driverId: "5",
    purchasedAt: "2026-07-17T14:00:00Z",
    jurisdiction: "CA",
    fuelType: "diesel",
    fuel: 40,
    fuelUnit: "gal",
  };

  it("pins refreshAndRetry to the triggering company and returns the bounded projection", async () => {
    mockCreate.mockResolvedValueOnce({ fuelPurchaseId: "999", fuel: 40, fuelUnit: "gal" });
    const res = await createFuelPurchase(input(CFG));
    expect(res.output).toMatchObject({ fuelPurchaseId: "999", fuel: 40 });
    const call = mockRefreshAndRetry.mock.calls[0]![0];
    expect(call).toMatchObject({ provider: "motive", providerAccountId: "8801", accountId: "acct-1" });
    // ids coerced to numbers on the wire.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.objectContaining({ vehicleId: 12, driverId: 5 }) }),
    );
  });

  it("throws on a non-numeric vehicle id (never sends garbage)", async () => {
    await expect(createFuelPurchase(input({ ...CFG, vehicleId: "not-an-id" }))).rejects.toThrow(
      /vehicle id/i,
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects unknown config keys via the strict schema", async () => {
    await expect(createFuelPurchase(input({ ...CFG, wild: true }))).rejects.toThrow();
  });
});

describe("get_fuel_purchase", () => {
  it("returns found:false on a 404 (null from the wrapper)", async () => {
    mockGet.mockResolvedValueOnce(null);
    const res = await getFuelPurchase(input({ fuelPurchaseId: "123" }));
    expect(res.output).toEqual({ found: false });
  });

  it("returns found:true with the projection on a hit", async () => {
    mockGet.mockResolvedValueOnce({ fuelPurchaseId: "123", fuelType: "diesel" });
    const res = await getFuelPurchase(input({ fuelPurchaseId: "123" }));
    expect(res.output).toMatchObject({ found: true, fuelPurchaseId: "123", fuelType: "diesel" });
  });
});

describe("delete_fuel_purchase", () => {
  it("returns a bounded deleted acknowledgement", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    const res = await deleteFuelPurchase(input({ fuelPurchaseId: "77" }));
    expect(res.output).toEqual({ deleted: true, fuelPurchaseId: "77" });
  });
});
