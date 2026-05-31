/**
 * @jest-environment node
 *
 * Unit tests for the anonymized-ledger retention sweep service
 * (4.ACCOUNT-MODEL-10d). Mocks the repo so no DB is touched.
 */

const mockDeleteExpired = jest.fn();

jest.mock("@/repositories/ledgerAnonymization", () => ({
  deleteExpiredAnonymizedLedgers: (...a: unknown[]) => mockDeleteExpired(...a),
}));

import { purgeExpiredAnonymizedLedgers } from "@/services/accounts/ledgerPurge";

beforeEach(() => {
  mockDeleteExpired.mockReset();
});

describe("purgeExpiredAnonymizedLedgers", () => {
  it("delegates to the repo with an ISO `now` and returns per-table counts", async () => {
    mockDeleteExpired.mockResolvedValueOnce({
      taskUsageEvents: 5,
      aiCostEvents: 2,
      billingShadowComparisons: 1,
      total: 8,
    });
    const now = new Date("2026-09-01T00:00:00.000Z");
    const r = await purgeExpiredAnonymizedLedgers(now);
    expect(mockDeleteExpired).toHaveBeenCalledWith(now.toISOString());
    expect(r).toEqual({
      taskUsageEvents: 5,
      aiCostEvents: 2,
      billingShadowComparisons: 1,
      total: 8,
    });
  });

  it("defaults `now` to the current time when omitted", async () => {
    mockDeleteExpired.mockResolvedValueOnce({
      taskUsageEvents: 0,
      aiCostEvents: 0,
      billingShadowComparisons: 0,
      total: 0,
    });
    await purgeExpiredAnonymizedLedgers();
    expect(mockDeleteExpired).toHaveBeenCalledTimes(1);
    const arg = mockDeleteExpired.mock.calls[0][0] as string;
    expect(typeof arg).toBe("string");
    expect(Number.isNaN(Date.parse(arg))).toBe(false);
  });
});
