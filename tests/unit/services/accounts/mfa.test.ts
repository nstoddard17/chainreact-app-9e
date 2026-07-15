/**
 * @jest-environment node
 *
 * Tests for services/accounts/mfa (SEC-3). Mocks the MFA repository + the shared
 * re-auth so the service's rules are exercised in isolation:
 *   - only a VERIFIED factor counts as "enabled"
 *   - enrollment refuses when already enabled and clears stale unverified factors
 *   - disable requires the password step-up and removes every factor
 *   - login challenge verifies against the verified factor
 */

const mockList = jest.fn();
const mockEnroll = jest.fn();
const mockChallengeVerify = jest.fn();
const mockUnenroll = jest.fn();
const mockGetAAL = jest.fn();

jest.mock("@/repositories/auth/mfa", () => ({
  listTotpFactors: (...a: unknown[]) => mockList(...a),
  enrollTotp: (...a: unknown[]) => mockEnroll(...a),
  challengeAndVerifyTotp: (...a: unknown[]) => mockChallengeVerify(...a),
  unenrollFactor: (...a: unknown[]) => mockUnenroll(...a),
  getAssuranceLevel: (...a: unknown[]) => mockGetAAL(...a),
}));

import {
  getMfaStatus,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  verifyLoginChallenge,
} from "@/services/accounts/mfa";

const verified = {
  id: "f-verified",
  friendlyName: "Authenticator app",
  status: "verified" as const,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};
const unverified = { ...verified, id: "f-unverified", status: "unverified" as const };

beforeEach(() => {
  mockList.mockReset();
  mockEnroll.mockReset();
  mockChallengeVerify.mockReset();
  mockUnenroll.mockReset();
  mockGetAAL.mockReset();
});

describe("getMfaStatus", () => {
  it("enabled only when a verified factor exists", async () => {
    mockList.mockResolvedValueOnce([verified]);
    expect(await getMfaStatus()).toEqual({
      enabled: true,
      factor: { id: "f-verified", friendlyName: "Authenticator app", createdAt: verified.createdAt },
    });
  });

  it("NOT enabled when only an unverified factor exists", async () => {
    mockList.mockResolvedValueOnce([unverified]);
    expect(await getMfaStatus()).toEqual({ enabled: false, factor: null });
  });
});

describe("beginTotpEnrollment", () => {
  it("refuses when a verified factor already exists", async () => {
    mockList.mockResolvedValueOnce([verified]);
    expect(await beginTotpEnrollment()).toEqual({ ok: false, reason: "already_enrolled" });
    expect(mockEnroll).not.toHaveBeenCalled();
  });

  it("clears stale unverified factors, then enrolls a fresh one", async () => {
    mockList.mockResolvedValueOnce([unverified]);
    mockUnenroll.mockResolvedValueOnce(true);
    mockEnroll.mockResolvedValueOnce({
      factorId: "new",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "BASE32SECRET",
      uri: "otpauth://totp/x",
    });
    const result = await beginTotpEnrollment();
    expect(mockUnenroll).toHaveBeenCalledWith("f-unverified");
    expect(result).toEqual({
      ok: true,
      enrollment: {
        factorId: "new",
        qrCode: "data:image/svg+xml;utf-8,<svg/>",
        secret: "BASE32SECRET",
        uri: "otpauth://totp/x",
      },
    });
  });

  it("returns failed when the enroll call fails", async () => {
    mockList.mockResolvedValueOnce([]);
    mockEnroll.mockResolvedValueOnce(null);
    expect(await beginTotpEnrollment()).toEqual({ ok: false, reason: "failed" });
  });
});

describe("confirmTotpEnrollment", () => {
  it("ok on a correct code", async () => {
    mockChallengeVerify.mockResolvedValueOnce(true);
    expect(await confirmTotpEnrollment("f1", "123456")).toEqual({ ok: true });
    expect(mockChallengeVerify).toHaveBeenCalledWith("f1", "123456");
  });

  it("invalid_code on a wrong code (fail-safe)", async () => {
    mockChallengeVerify.mockResolvedValueOnce(false);
    expect(await confirmTotpEnrollment("f1", "000000")).toEqual({ ok: false, reason: "invalid_code" });
  });
});

describe("disableTotp (Supabase AAL2 model — no password)", () => {
  it("refuses when not enrolled (no verified factor)", async () => {
    mockList.mockResolvedValueOnce([]);
    expect(await disableTotp()).toEqual({ ok: false, reason: "not_enrolled" });
    expect(mockGetAAL).not.toHaveBeenCalled();
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("removes every factor directly when the session is already AAL2 (no code needed)", async () => {
    mockList.mockResolvedValueOnce([verified, unverified]);
    mockGetAAL.mockResolvedValueOnce({ currentLevel: "aal2", nextLevel: "aal2" });
    mockUnenroll.mockResolvedValue(true);
    expect(await disableTotp()).toEqual({ ok: true });
    expect(mockChallengeVerify).not.toHaveBeenCalled();
    expect(mockUnenroll).toHaveBeenCalledWith("f-verified");
    expect(mockUnenroll).toHaveBeenCalledWith("f-unverified");
  });

  it("requires a code (mfa_required) on an AAL1 session with no code — and does NOT unenroll", async () => {
    mockList.mockResolvedValueOnce([verified]);
    mockGetAAL.mockResolvedValueOnce({ currentLevel: "aal1", nextLevel: "aal2" });
    expect(await disableTotp({})).toEqual({ ok: false, reason: "mfa_required" });
    expect(mockChallengeVerify).not.toHaveBeenCalled();
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("rejects a wrong step-up code (invalid_code) — and does NOT unenroll", async () => {
    mockList.mockResolvedValueOnce([verified]);
    mockGetAAL.mockResolvedValueOnce({ currentLevel: "aal1", nextLevel: "aal2" });
    mockChallengeVerify.mockResolvedValueOnce(false);
    expect(await disableTotp({ code: "000000" })).toEqual({ ok: false, reason: "invalid_code" });
    expect(mockChallengeVerify).toHaveBeenCalledWith("f-verified", "000000");
    expect(mockUnenroll).not.toHaveBeenCalled();
  });

  it("elevates with a correct code on AAL1, then removes every factor", async () => {
    mockList.mockResolvedValueOnce([verified, unverified]);
    mockGetAAL.mockResolvedValueOnce({ currentLevel: "aal1", nextLevel: "aal2" });
    mockChallengeVerify.mockResolvedValueOnce(true);
    mockUnenroll.mockResolvedValue(true);
    expect(await disableTotp({ code: "123456" })).toEqual({ ok: true });
    expect(mockChallengeVerify).toHaveBeenCalledWith("f-verified", "123456");
    expect(mockUnenroll).toHaveBeenCalledWith("f-verified");
    expect(mockUnenroll).toHaveBeenCalledWith("f-unverified");
  });
});

describe("verifyLoginChallenge", () => {
  it("verifies against the verified factor", async () => {
    mockList.mockResolvedValueOnce([verified]);
    mockChallengeVerify.mockResolvedValueOnce(true);
    expect(await verifyLoginChallenge("123456")).toEqual({ ok: true });
    expect(mockChallengeVerify).toHaveBeenCalledWith("f-verified", "123456");
  });

  it("not_enrolled when there is no verified factor", async () => {
    mockList.mockResolvedValueOnce([unverified]);
    expect(await verifyLoginChallenge("123456")).toEqual({ ok: false, reason: "not_enrolled" });
    expect(mockChallengeVerify).not.toHaveBeenCalled();
  });

  it("invalid_code on a wrong code", async () => {
    mockList.mockResolvedValueOnce([verified]);
    mockChallengeVerify.mockResolvedValueOnce(false);
    expect(await verifyLoginChallenge("000000")).toEqual({ ok: false, reason: "invalid_code" });
  });
});
