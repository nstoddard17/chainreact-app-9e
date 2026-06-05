/**
 * @jest-environment node
 *
 * Tests for services/accounts/notificationPreferences (4.ACCOUNT-SETTINGS-4).
 * Mocks the userProfiles repo so the service's self-scoped pass-through is
 * exercised in isolation.
 */

const mockGet = jest.fn();
const mockUpdate = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  getNotificationPreferences: (...a: unknown[]) => mockGet(...a),
  updateNotificationPreferences: (...a: unknown[]) => mockUpdate(...a),
}));

import {
  getOwnNotificationPreferences,
  updateOwnNotificationPreferences,
} from "@/services/accounts/notificationPreferences";

const PREFS = { productUpdates: true, workflowAlerts: false, teamActivity: true };

beforeEach(() => {
  mockGet.mockReset();
  mockUpdate.mockReset().mockResolvedValue(undefined);
});

describe("notification preferences service", () => {
  it("reads the caller's own preferences", async () => {
    mockGet.mockResolvedValueOnce(PREFS);
    const result = await getOwnNotificationPreferences("u1");
    expect(result).toEqual(PREFS);
    expect(mockGet).toHaveBeenCalledWith("u1");
  });

  it("writes the caller's own preferences and returns the stored shape", async () => {
    const result = await updateOwnNotificationPreferences("u1", PREFS);
    expect(result).toEqual(PREFS);
    expect(mockUpdate).toHaveBeenCalledWith("u1", PREFS);
  });
});
