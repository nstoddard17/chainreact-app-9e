/**
 * @jest-environment node
 *
 * Tests for the personal-account deletion client wrappers (4.ACCOUNT-SETTINGS-1;
 * universal email-code confirmation added in
 * ACCOUNT-DELETION-UNIVERSAL-VERIFICATION-1). Mocks global fetch so the wire
 * shapes (URL, method, body) and the backend error-code mapping are isolated
 * from the network. Sibling of accounts.test.ts.
 */

import {
  requestAccountDeletion,
  cancelAccountDeletion,
  retryAccountDeletionBilling,
  sendAccountDeletionCode,
  verifyAccountDeletionCode,
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
  it("POSTs ONLY the typed DELETE confirmation — no password field on the wire", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        deletionStatus: "pending_deletion",
        requestedAt: "2026-06-05T00:00:00Z",
        purgeAfter: "2026-07-05T00:00:00Z",
      }),
    );
    const r = await requestAccountDeletion({ confirmText: "DELETE" });
    expect(r.deletionStatus).toBe("pending_deletion");
    expect(r.purgeAfter).toBe("2026-07-05T00:00:00Z");
    expect(mockFetch).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmText: "DELETE" }),
    });
    // The universal contract: nothing password-shaped is ever sent.
    const body = mockFetch.mock.calls[0]![1].body as string;
    expect(body).not.toMatch(/password/i);
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
      requestAccountDeletion({ confirmText: "DELETE" }),
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
      await requestAccountDeletion({ confirmText: "DELETE" });
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

  it("maps 401 VERIFICATION_REQUIRED → VERIFICATION_REQUIRED", async () => {
    mockFetch.mockResolvedValueOnce(
      err(401, {
        error: "Verify a code sent to your email before deleting your account.",
        code: "VERIFICATION_REQUIRED",
      }),
    );
    await expect(
      requestAccountDeletion({ confirmText: "DELETE" }),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED", status: 401 });
  });

  it("maps a bare 401 (no code) → VERIFICATION_REQUIRED, not a password failure", async () => {
    mockFetch.mockResolvedValueOnce(err(401, {}));
    await expect(
      requestAccountDeletion({ confirmText: "DELETE" }),
    ).rejects.toMatchObject({ code: "VERIFICATION_REQUIRED" });
  });

  it("maps a 400 validation failure → INVALID_CONFIRMATION", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: 'Type "DELETE" to confirm.' }));
    await expect(
      requestAccountDeletion({ confirmText: "nope" }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIRMATION", status: 400 });
  });

  it("maps 403 MFA_REQUIRED through unchanged", async () => {
    mockFetch.mockResolvedValueOnce(
      err(403, { error: "Confirm your two-factor code first.", code: "MFA_REQUIRED" }),
    );
    await expect(
      requestAccountDeletion({ confirmText: "DELETE" }),
    ).rejects.toMatchObject({ code: "MFA_REQUIRED", status: 403 });
  });
});

describe("sendAccountDeletionCode", () => {
  it("POSTs an EMPTY body — the destination address is never client-supplied", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        ok: true,
        maskedEmail: "c••••••••@gmail.com",
        expiresAt: "2026-06-05T00:10:00Z",
        resendAvailableAt: "2026-06-05T00:01:00Z",
        codeLength: 6,
        maxAttempts: 5,
      }),
    );
    const sent = await sendAccountDeletionCode();
    expect(sent.maskedEmail).toBe("c••••••••@gmail.com");
    expect(sent.maxAttempts).toBe(5);
    expect(mockFetch).toHaveBeenCalledWith("/api/account/delete/verification-code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = mockFetch.mock.calls[0]![1].body as string;
    expect(body).not.toMatch(/@/);
  });

  it("carries retryAfterSeconds on a 429 RESEND_TOO_SOON", async () => {
    mockFetch.mockResolvedValueOnce(
      err(429, {
        error: "You just requested a code.",
        code: "RESEND_TOO_SOON",
        retryAfterSeconds: 42,
      }),
    );
    try {
      await sendAccountDeletionCode();
      throw new Error("should have thrown");
    } catch (e) {
      const de = e as AccountDeletionError;
      expect(de.code).toBe("RESEND_TOO_SOON");
      expect(de.retryAfterSeconds).toBe(42);
    }
  });

  it("maps NO_VERIFIED_EMAIL and EMAIL_UNAVAILABLE through unchanged", async () => {
    mockFetch.mockResolvedValueOnce(
      err(409, { error: "No verified email.", code: "NO_VERIFIED_EMAIL" }),
    );
    await expect(sendAccountDeletionCode()).rejects.toMatchObject({
      code: "NO_VERIFIED_EMAIL",
    });
    mockFetch.mockResolvedValueOnce(
      err(502, { error: "We couldn't send the verification email.", code: "EMAIL_UNAVAILABLE" }),
    );
    await expect(sendAccountDeletionCode()).rejects.toMatchObject({
      code: "EMAIL_UNAVAILABLE",
    });
  });
});

describe("verifyAccountDeletionCode", () => {
  it("POSTs the code in the BODY (never a query string) and returns the window", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({ ok: true, authorizationExpiresAt: "2026-06-05T00:06:00Z" }),
    );
    const r = await verifyAccountDeletionCode("123456");
    expect(r.authorizationExpiresAt).toBe("2026-06-05T00:06:00Z");
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe("/api/account/delete/verification-code/verify");
    expect(url).not.toContain("123456");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456" });
  });

  it("carries attemptsRemaining on INVALID_CODE", async () => {
    mockFetch.mockResolvedValueOnce(
      err(400, {
        error: "That code isn't right.",
        code: "INVALID_CODE",
        attemptsRemaining: 3,
      }),
    );
    try {
      await verifyAccountDeletionCode("000000");
      throw new Error("should have thrown");
    } catch (e) {
      const de = e as AccountDeletionError;
      expect(de.code).toBe("INVALID_CODE");
      expect(de.attemptsRemaining).toBe(3);
    }
  });

  it("maps CODE_EXPIRED / TOO_MANY_ATTEMPTS / NO_ACTIVE_CODE through unchanged", async () => {
    for (const [status, code] of [
      [410, "CODE_EXPIRED"],
      [429, "TOO_MANY_ATTEMPTS"],
      [409, "NO_ACTIVE_CODE"],
    ] as const) {
      mockFetch.mockResolvedValueOnce(err(status, { error: "nope", code }));
      await expect(verifyAccountDeletionCode("000000")).rejects.toMatchObject({ code });
    }
  });
});

describe("retryAccountDeletionBilling", () => {
  it("POSTs the dedicated retry route with NO body (no password, no code)", async () => {
    mockFetch.mockResolvedValueOnce(
      ok({
        deletionStatus: "pending_deletion",
        requestedAt: "t",
        purgeAfter: "t2",
        billingCancellation: "canceled",
      }),
    );
    const r = await retryAccountDeletionBilling();
    expect(r.billingCancellation).toBe("canceled");
    expect(mockFetch).toHaveBeenCalledWith("/api/account/delete/retry-billing", {
      method: "POST",
    });
  });

  it("surfaces a still-failing cancellation with the real frozen state", async () => {
    mockFetch.mockResolvedValueOnce(
      err(502, {
        code: "BILLING_CANCELLATION_FAILED",
        error: "We still couldn't cancel your subscription.",
        deletionStatus: "pending_deletion",
        requestedAt: "t",
        purgeAfter: "t2",
      }),
    );
    try {
      await retryAccountDeletionBilling();
      throw new Error("should have thrown");
    } catch (e) {
      const de = e as AccountDeletionError;
      expect(de.code).toBe("BILLING_CANCELLATION_FAILED");
      expect(de.deletionState?.deletionStatus).toBe("pending_deletion");
      expect(de.deletionState?.billingCancellation).toBe("failed");
    }
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
