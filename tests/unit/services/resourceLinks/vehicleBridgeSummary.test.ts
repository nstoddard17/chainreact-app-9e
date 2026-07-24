/**
 * @jest-environment node
 *
 * Apps-page bridge summary (APPS-VL-DESIGN-1).
 *
 * REAL: `loadVehicleBridgeSummary` and the REAL pure `unlinkedVehicles` set
 * difference. MOCKED: only the two data boundaries — `listVehicleLinks` (DB) and
 * `loadMotiveInventory` (the one Motive provider call).
 *
 * Business rules protected:
 *   - paired = the account's active links; unpaired = Motive minus linked.
 *   - a Motive outage yields motiveOk:false and does NOT fabricate an unpaired
 *     count (it would be a lie during a provider failure).
 *   - a member (listVehicleLinks not-ok) reads zero paired, never throws.
 */
const mockListLinks = jest.fn();
jest.mock("@/services/resourceLinks/vehicleLinkService", () => {
  const actual = jest.requireActual("@/services/resourceLinks/vehicleLinkService");
  return {
    unlinkedVehicles: actual.unlinkedVehicles, // REAL pure set difference
    listVehicleLinks: (...a: unknown[]) => mockListLinks(...a),
  };
});

const mockMotive = jest.fn();
jest.mock("@/services/resourceLinks/vehicleInventory", () => ({
  loadMotiveInventory: (...a: unknown[]) => mockMotive(...a),
}));

import { loadVehicleBridgeSummary } from "@/services/resourceLinks/vehicleBridgeSummary";

const ACCOUNT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER = "11111111-1111-4111-8111-111111111111";

function link(sourceVehicleId: string) {
  return {
    id: `l-${sourceVehicleId}`,
    sourceVehicleId,
    sourceLabel: `Unit ${sourceVehicleId}`,
    targetVehicleId: `f-${sourceVehicleId}`,
    targetLabel: `Fleetio ${sourceVehicleId}`,
    matchBasis: "manual" as const,
    confirmedByLabel: null,
    confirmedAt: "2026-07-01T00:00:00.000Z",
  };
}

function motiveVehicle(id: string) {
  return {
    identity: { vehicleId: id, number: id, vin: null, licensePlateNumber: null },
    label: `Unit ${id}`,
  };
}

beforeEach(() => {
  mockListLinks.mockReset();
  mockMotive.mockReset();
});

it("counts paired links and the unpaired Motive remainder", async () => {
  mockListLinks.mockResolvedValue({ ok: true, links: [link("101"), link("102")] });
  mockMotive.mockResolvedValue({
    status: "ok",
    vehicles: [motiveVehicle("101"), motiveVehicle("102"), motiveVehicle("103"), motiveVehicle("104")],
    hasMore: false,
  });

  const summary = await loadVehicleBridgeSummary({ accountId: ACCOUNT, actingUserId: USER });

  expect(summary).toEqual({
    pairedCount: 2,
    unpairedCount: 2, // 103 + 104 have no link
    totalCount: 4,
    motiveOk: true,
    partialInventory: false,
  });
  expect(mockListLinks).toHaveBeenCalledWith({ accountId: ACCOUNT, actingUserId: USER });
  expect(mockMotive).toHaveBeenCalledWith({ accountId: ACCOUNT });
});

it("flags a truncated Motive list as partial", async () => {
  mockListLinks.mockResolvedValue({ ok: true, links: [] });
  mockMotive.mockResolvedValue({ status: "ok", vehicles: [motiveVehicle("1")], hasMore: true });

  const summary = await loadVehicleBridgeSummary({ accountId: ACCOUNT, actingUserId: USER });
  expect(summary.partialInventory).toBe(true);
  expect(summary.totalCount).toBe(1);
  expect(summary.unpairedCount).toBe(1);
});

it("does NOT fabricate an unpaired count when Motive is unavailable", async () => {
  mockListLinks.mockResolvedValue({ ok: true, links: [link("101")] });
  mockMotive.mockResolvedValue({ status: "error", vehicles: [], hasMore: false });

  const summary = await loadVehicleBridgeSummary({ accountId: ACCOUNT, actingUserId: USER });
  expect(summary).toEqual({
    pairedCount: 1,
    unpairedCount: 0,
    totalCount: 1, // only the known paired count — never invents an unpaired figure
    motiveOk: false,
    partialInventory: false,
  });
});

it("treats a not-ok links read (e.g. non-member) as zero paired, without throwing", async () => {
  mockListLinks.mockResolvedValue({ ok: false, reason: "not_member" });
  mockMotive.mockResolvedValue({ status: "ok", vehicles: [motiveVehicle("1")], hasMore: false });

  const summary = await loadVehicleBridgeSummary({ accountId: ACCOUNT, actingUserId: USER });
  expect(summary.pairedCount).toBe(0);
  expect(summary.unpairedCount).toBe(1);
  expect(summary.totalCount).toBe(1);
});
