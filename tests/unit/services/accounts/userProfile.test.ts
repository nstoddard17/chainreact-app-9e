/**
 * @jest-environment node
 *
 * Tests for services/accounts/userProfile (4.ACCOUNT-SETTINGS-3). Mocks the
 * userProfiles repo so the service's normalization (trim, empty→null, length
 * floor) and self-scoped write are exercised in isolation.
 */

const mockUpdate = jest.fn();
jest.mock("@/repositories/userProfiles", () => ({
  updateDisplayName: (...a: unknown[]) => mockUpdate(...a),
}));

import {
  updateOwnDisplayName,
  MAX_DISPLAY_NAME_LENGTH,
} from "@/services/accounts/userProfile";

beforeEach(() => {
  mockUpdate.mockReset().mockResolvedValue(undefined);
});

describe("updateOwnDisplayName", () => {
  it("trims and persists a non-empty name for the caller's own id", async () => {
    const result = await updateOwnDisplayName("u1", "  Ada Lovelace  ");
    expect(result).toEqual({ displayName: "Ada Lovelace" });
    expect(mockUpdate).toHaveBeenCalledWith("u1", "Ada Lovelace");
  });

  it("clears to null when the value is empty / whitespace-only", async () => {
    const result = await updateOwnDisplayName("u1", "   ");
    expect(result).toEqual({ displayName: null });
    expect(mockUpdate).toHaveBeenCalledWith("u1", null);
  });

  it("rejects an over-length name and never writes", async () => {
    const tooLong = "a".repeat(MAX_DISPLAY_NAME_LENGTH + 1);
    await expect(updateOwnDisplayName("u1", tooLong)).rejects.toThrow(/maximum length/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("accepts a name exactly at the max length", async () => {
    const exact = "a".repeat(MAX_DISPLAY_NAME_LENGTH);
    const result = await updateOwnDisplayName("u1", exact);
    expect(result).toEqual({ displayName: exact });
    expect(mockUpdate).toHaveBeenCalledWith("u1", exact);
  });
});
