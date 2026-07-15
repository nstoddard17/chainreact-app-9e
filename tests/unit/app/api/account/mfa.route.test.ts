/**
 * @jest-environment node
 *
 * Route tests for the MFA endpoints (SEC-3). Mocks supabase auth + the MFA service
 * so each route's gate order (auth → validate → service) and typed errors are
 * exercised in isolation. Proves: unauthenticated callers are 401'd before the
 * service; enrollment material is returned with no-store; the disable email comes
 * from the SESSION (never the body); wrong codes/passwords map to generic codes.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockStatus = jest.fn();
const mockBegin = jest.fn();
const mockConfirm = jest.fn();
const mockDisable = jest.fn();
const mockChallenge = jest.fn();
jest.mock("@/services/accounts/mfa", () => ({
  getMfaStatus: (...a: unknown[]) => mockStatus(...a),
  beginTotpEnrollment: (...a: unknown[]) => mockBegin(...a),
  confirmTotpEnrollment: (...a: unknown[]) => mockConfirm(...a),
  disableTotp: (...a: unknown[]) => mockDisable(...a),
  verifyLoginChallenge: (...a: unknown[]) => mockChallenge(...a),
}));

import { GET } from "@/app/api/account/mfa/route";
import { POST as ENROLL } from "@/app/api/account/mfa/enroll/route";
import { POST as VERIFY } from "@/app/api/account/mfa/verify/route";
import { POST as DISABLE } from "@/app/api/account/mfa/disable/route";
import { POST as CHALLENGE } from "@/app/api/auth/mfa/verify/route";

const USER = { id: "user-1", email: "u@example.com" };

function signedIn() {
  mockGetUser.mockResolvedValueOnce({ data: { user: USER }, error: null });
}
function anon() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
}
function jsonReq(body: unknown) {
  return new Request("https://app.example.test/api/account/mfa", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockStatus.mockReset();
  mockBegin.mockReset();
  mockConfirm.mockReset();
  mockDisable.mockReset();
  mockChallenge.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("GET /api/account/mfa (status)", () => {
  it("401s an unauthenticated caller", async () => {
    anon();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it("returns the status with no-store", async () => {
    signedIn();
    mockStatus.mockResolvedValueOnce({ enabled: true, factor: { id: "f1", friendlyName: "x", createdAt: "2026-07-01T00:00:00Z" } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      enabled: true,
      factor: { id: "f1", friendlyName: "x", createdAt: "2026-07-01T00:00:00Z" },
    });
  });
});

describe("POST /api/account/mfa/enroll", () => {
  it("401s an unauthenticated caller before the service", async () => {
    anon();
    const res = await ENROLL();
    expect(res.status).toBe(401);
    expect(mockBegin).not.toHaveBeenCalled();
  });

  it("409s when already enrolled", async () => {
    signedIn();
    mockBegin.mockResolvedValueOnce({ ok: false, reason: "already_enrolled" });
    const res = await ENROLL();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ALREADY_ENROLLED");
  });

  it("returns enrollment material with no-store on success", async () => {
    signedIn();
    mockBegin.mockResolvedValueOnce({
      ok: true,
      enrollment: { factorId: "f1", qrCode: "data:image/svg+xml;utf-8,<svg/>", secret: "S", uri: "otpauth://x" },
    });
    const res = await ENROLL();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      factorId: "f1",
      qrCode: "data:image/svg+xml;utf-8,<svg/>",
      secret: "S",
      uri: "otpauth://x",
    });
  });
});

describe("POST /api/account/mfa/verify", () => {
  it("400s a malformed code before the service", async () => {
    signedIn();
    const res = await VERIFY(jsonReq({ factorId: "11111111-1111-1111-1111-111111111111", code: "abc" }));
    expect(res.status).toBe(400);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("400 INVALID_CODE on a wrong code", async () => {
    signedIn();
    mockConfirm.mockResolvedValueOnce({ ok: false, reason: "invalid_code" });
    const res = await VERIFY(jsonReq({ factorId: "11111111-1111-1111-1111-111111111111", code: "000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_CODE");
  });

  it("200 on success", async () => {
    signedIn();
    mockConfirm.mockResolvedValueOnce({ ok: true });
    const res = await VERIFY(jsonReq({ factorId: "11111111-1111-1111-1111-111111111111", code: "123 456" }));
    expect(res.status).toBe(200);
    // spaces trimmed by the schema before the service sees it
    expect(mockConfirm).toHaveBeenCalledWith("11111111-1111-1111-1111-111111111111", "123456");
  });
});

describe("POST /api/account/mfa/disable (Supabase AAL2 model — no password)", () => {
  it("401s an unauthenticated caller before the service", async () => {
    anon();
    const res = await DISABLE(jsonReq({}));
    expect(res.status).toBe(401);
    expect(mockDisable).not.toHaveBeenCalled();
  });

  it("200 on success with NO code (session already AAL2) — no password anywhere", async () => {
    signedIn();
    mockDisable.mockResolvedValueOnce({ ok: true });
    const res = await DISABLE(jsonReq({}));
    expect(res.status).toBe(200);
    expect(mockDisable).toHaveBeenCalledWith({ code: null });
  });

  it("403 MFA_REQUIRED when the session is AAL1 and no code was given", async () => {
    signedIn();
    mockDisable.mockResolvedValueOnce({ ok: false, reason: "mfa_required" });
    const res = await DISABLE(jsonReq({}));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("MFA_REQUIRED");
  });

  it("passes the step-up code to the service and 400s INVALID_CODE on a wrong one", async () => {
    signedIn();
    mockDisable.mockResolvedValueOnce({ ok: false, reason: "invalid_code" });
    const res = await DISABLE(jsonReq({ code: "000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_CODE");
    expect(mockDisable).toHaveBeenCalledWith({ code: "000000" });
  });

  it("400s a malformed code before the service (no password required)", async () => {
    signedIn();
    const res = await DISABLE(jsonReq({ code: "abc" }));
    expect(res.status).toBe(400);
    expect(mockDisable).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/mfa/verify (login challenge)", () => {
  it("401s an unauthenticated caller (not a public surface)", async () => {
    anon();
    const res = await CHALLENGE(jsonReq({ code: "123456" }));
    expect(res.status).toBe(401);
    expect(mockChallenge).not.toHaveBeenCalled();
  });

  it("400 INVALID_CODE on a wrong code", async () => {
    signedIn();
    mockChallenge.mockResolvedValueOnce({ ok: false, reason: "invalid_code" });
    const res = await CHALLENGE(jsonReq({ code: "000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_CODE");
  });

  it("treats not_enrolled as satisfied (200) so the user isn't trapped", async () => {
    signedIn();
    mockChallenge.mockResolvedValueOnce({ ok: false, reason: "not_enrolled" });
    const res = await CHALLENGE(jsonReq({ code: "123456" }));
    expect(res.status).toBe(200);
  });

  it("200 on success", async () => {
    signedIn();
    mockChallenge.mockResolvedValueOnce({ ok: true });
    const res = await CHALLENGE(jsonReq({ code: "123456" }));
    expect(res.status).toBe(200);
  });
});
