/**
 * @jest-environment node
 *
 * Tests for services/accounts/passwordChange (4.ACCOUNT-SETTINGS-7 / SEC-2).
 * Mocks the shared re-auth + the password repo so the service's order
 * (validate → step-up → update) and its refusal paths are exercised in isolation.
 */

const mockReauth = jest.fn();
jest.mock("@/services/accounts/accountDeletionReauth", () => ({
  verifyPasswordReauth: (...a: unknown[]) => mockReauth(...a),
}));

const mockUpdate = jest.fn();
jest.mock("@/repositories/authPassword", () => ({
  updateSessionUserPassword: (...a: unknown[]) => mockUpdate(...a),
}));

import {
  changeOwnPassword,
  MIN_PASSWORD_LENGTH,
} from "@/services/accounts/passwordChange";

beforeEach(() => {
  mockReauth.mockReset();
  mockUpdate.mockReset();
});

const EMAIL = "u@example.com";

describe("changeOwnPassword", () => {
  it("rejects a too-short new password before re-auth or update", async () => {
    const result = await changeOwnPassword({
      email: EMAIL,
      currentPassword: "current-pw",
      newPassword: "a".repeat(MIN_PASSWORD_LENGTH - 1),
    });
    expect(result).toEqual({ ok: false, reason: "validation" });
    expect(mockReauth).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a new password equal to the current password", async () => {
    const result = await changeOwnPassword({
      email: EMAIL,
      currentPassword: "samePassword1",
      newPassword: "samePassword1",
    });
    expect(result).toEqual({ ok: false, reason: "validation" });
    expect(mockReauth).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does NOT update when the current-password step-up fails", async () => {
    mockReauth.mockResolvedValueOnce({ ok: false, reason: "invalid_credentials" });
    const result = await changeOwnPassword({
      email: EMAIL,
      currentPassword: "wrong-current",
      newPassword: "brand-new-pw",
    });
    expect(result).toEqual({ ok: false, reason: "reauth_failed" });
    expect(mockReauth).toHaveBeenCalledWith(EMAIL, "wrong-current");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("updates the password only after a successful step-up", async () => {
    mockReauth.mockResolvedValueOnce({ ok: true });
    mockUpdate.mockResolvedValueOnce(true);
    const result = await changeOwnPassword({
      email: EMAIL,
      currentPassword: "right-current",
      newPassword: "brand-new-pw",
    });
    expect(result).toEqual({ ok: true });
    expect(mockReauth).toHaveBeenCalledWith(EMAIL, "right-current");
    expect(mockUpdate).toHaveBeenCalledWith("brand-new-pw");
  });

  it("surfaces an update failure as update_failed", async () => {
    mockReauth.mockResolvedValueOnce({ ok: true });
    mockUpdate.mockResolvedValueOnce(false);
    const result = await changeOwnPassword({
      email: EMAIL,
      currentPassword: "right-current",
      newPassword: "brand-new-pw",
    });
    expect(result).toEqual({ ok: false, reason: "update_failed" });
  });
});
