/**
 * @jest-environment node
 *
 * Tests for the changePassword client wrapper (4.ACCOUNT-SETTINGS-7 / SEC-2).
 * Mocks global fetch so the wire shape + error mapping are isolated.
 */

import { changePassword, AccountApiError } from "@/lib/api/accounts";

const mockFetch = jest.fn();
beforeEach(() => {
  mockFetch.mockReset();
  (globalThis as unknown as { fetch: jest.Mock }).fetch = mockFetch;
});

function ok(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as unknown as Response;
}
function err(status: number, body: unknown = {}) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

describe("changePassword", () => {
  it("PATCHes the password route with current + new password", async () => {
    mockFetch.mockResolvedValueOnce(ok({ ok: true }));
    await changePassword({ currentPassword: "old", newPassword: "longenough1" });
    expect(mockFetch).toHaveBeenCalledWith("/api/account/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "old", newPassword: "longenough1" }),
    });
  });

  it("maps a wrong current password (401) to an AccountApiError with the message", async () => {
    mockFetch.mockResolvedValueOnce(err(401, { error: "Password confirmation failed.", code: "REAUTH_FAILED" }));
    await expect(
      changePassword({ currentPassword: "wrong", newPassword: "longenough1" }),
    ).rejects.toMatchObject({ status: 401, message: "Password confirmation failed." });
  });

  it("maps a 400 validation error", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: "New password must be at least 8 characters." }));
    await expect(
      changePassword({ currentPassword: "old", newPassword: "short" }),
    ).rejects.toBeInstanceOf(AccountApiError);
  });
});
