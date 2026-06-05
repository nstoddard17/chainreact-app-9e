/**
 * @jest-environment node
 *
 * Route tests for PATCH /api/account/password (4.ACCOUNT-SETTINGS-7 / SEC-2).
 * Mocks supabase auth + the password-change service so the route's guards
 * (auth → validate → service) and typed errors are exercised in isolation.
 *
 * Proves: the email comes from the SESSION (never the body); validation +
 * wrong-current-password are rejected with the right typed codes.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockChange = jest.fn();
jest.mock("@/services/accounts/passwordChange", () => ({
  changeOwnPassword: (...a: unknown[]) => mockChange(...a),
}));

import { PATCH } from "@/app/api/account/password/route";

const USER_ID = "user-1";
const EMAIL = "u@example.com";

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/password", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function signedIn() {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID, email: EMAIL } },
    error: null,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockChange.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("PATCH /api/account/password", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await PATCH(req({ currentPassword: "x", newPassword: "longenough1" }));
    expect(res.status).toBe(401);
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("400s a short new password before the service", async () => {
    signedIn();
    const res = await PATCH(req({ currentPassword: "current", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("400s when the new password equals the current (Zod refine)", async () => {
    signedIn();
    const res = await PATCH(req({ currentPassword: "samePassword1", newPassword: "samePassword1" }));
    expect(res.status).toBe(400);
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("400s a malformed body (missing currentPassword)", async () => {
    signedIn();
    const res = await PATCH(req({ newPassword: "longenough1" }));
    expect(res.status).toBe(400);
    expect(mockChange).not.toHaveBeenCalled();
  });

  it("401 REAUTH_FAILED on a wrong current password", async () => {
    signedIn();
    mockChange.mockResolvedValueOnce({ ok: false, reason: "reauth_failed" });
    const res = await PATCH(req({ currentPassword: "wrong", newPassword: "longenough1" }));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("REAUTH_FAILED");
  });

  it("500 PASSWORD_UPDATE_FAILED when the update fails", async () => {
    signedIn();
    mockChange.mockResolvedValueOnce({ ok: false, reason: "update_failed" });
    const res = await PATCH(req({ currentPassword: "right", newPassword: "longenough1" }));
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("PASSWORD_UPDATE_FAILED");
  });

  it("200 { ok: true } on success, calling the service with the SESSION email", async () => {
    signedIn();
    mockChange.mockResolvedValueOnce({ ok: true });
    const res = await PATCH(
      req({ currentPassword: "right", newPassword: "longenough1", email: "victim@x.io" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    // Email is the session's — a body email is ignored.
    expect(mockChange).toHaveBeenCalledWith({
      email: EMAIL,
      currentPassword: "right",
      newPassword: "longenough1",
    });
  });
});
