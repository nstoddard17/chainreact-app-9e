/**
 * @jest-environment node
 *
 * Tests for the personal-account deletion client wrappers (4.ACCOUNT-SETTINGS-1).
 * Mocks global fetch so the wire shapes (URL, method, body) and the backend
 * error-code mapping are isolated from the network. Sibling of accounts.test.ts.
 */

import {
  requestAccountDeletion,
  cancelAccountDeletion,
  AccountDeletionError,
} from "@/lib/api/accounts";

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

describe("requestAccountDeletion", () => {
  it("POSTs the typed phrase + password and returns the lifecycle state", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        deletionStatus: "pending_deletion",
        requestedAt: "2026-06-05T00:00:00Z",
        purgeAfter: "2026-07-05T00:00:00Z",
      }),
    );
    const r = await requestAccountDeletion({
      password: "pw",
      confirmText: "delete my account",
    });
    expect(r.deletionStatus).toBe("pending_deletion");
    expect(r.purgeAfter).toBe("2026-07-05T00:00:00Z");
    expect(mockFetch).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "pw", confirmText: "delete my account" }),
    });
  });

  it("maps 409 ACCOUNT_HAS_OWNED_TEAMS → error code + ownedAccounts (with typeLabel)", async () => {
    mockFetch.mockResolvedValueOnce(
      err(409, {
        error: "Transfer ownership or delete the Team/Business accounts you own…",
        code: "ACCOUNT_HAS_OWNED_TEAMS",
        ownedAccountCount: 2,
        ownedAccounts: [
          { id: "t1", name: "Acme Team", type: "team", typeLabel: "Team" },
          { id: "o1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
        ],
      }),
    );
    await expect(
      requestAccountDeletion({ password: "pw", confirmText: "delete my account" }),
    ).rejects.toMatchObject({
      code: "ACCOUNT_HAS_OWNED_TEAMS",
      status: 409,
    });
    // Re-run to assert the structured payload rides on the error.
    mockFetch.mockResolvedValueOnce(
      err(409, {
        code: "ACCOUNT_HAS_OWNED_TEAMS",
        ownedAccounts: [{ id: "o1", name: "Acme Biz", type: "organization", typeLabel: "Business" }],
      }),
    );
    try {
      await requestAccountDeletion({ password: "pw", confirmText: "delete my account" });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(AccountDeletionError);
      const de = e as AccountDeletionError;
      expect(de.ownedAccounts).toEqual([
        { id: "o1", name: "Acme Biz", type: "organization", typeLabel: "Business" },
      ]);
      // Never surfaces the raw internal "Organization" tier.
      expect(de.ownedAccounts?.[0]?.typeLabel).toBe("Business");
    }
  });

  it("maps 401 REAUTH_FAILED → REAUTH_FAILED", async () => {
    mockFetch.mockResolvedValueOnce(
      err(401, { error: "Password confirmation failed.", code: "REAUTH_FAILED" }),
    );
    await expect(
      requestAccountDeletion({ password: "wrong", confirmText: "delete my account" }),
    ).rejects.toMatchObject({ code: "REAUTH_FAILED", status: 401 });
  });

  it("maps a 400 validation failure → INVALID_CONFIRMATION", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: 'Type "delete my account" to confirm.' }));
    await expect(
      requestAccountDeletion({ password: "pw", confirmText: "nope" }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIRMATION", status: 400 });
  });
});

describe("cancelAccountDeletion", () => {
  it("POSTs the cancel route and returns the restored state", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ deletionStatus: "active", requestedAt: null, purgeAfter: null }),
    );
    const r = await cancelAccountDeletion();
    expect(r.deletionStatus).toBe("active");
    expect(mockFetch).toHaveBeenCalledWith("/api/account/delete/cancel", {
      method: "POST",
    });
  });

  it("surfaces a failure as AccountDeletionError", async () => {
    mockFetch.mockResolvedValueOnce(err(500, { error: "boom" }));
    await expect(cancelAccountDeletion()).rejects.toBeInstanceOf(AccountDeletionError);
  });
});
