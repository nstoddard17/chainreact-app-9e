/**
 * @jest-environment node
 *
 * Route tests for PATCH /api/account/profile — self-serve display-name update
 * (4.ACCOUNT-SETTINGS-3). Mocks supabase auth + the profile service so the
 * route's guards (auth → validate → service) are exercised in isolation.
 *
 * Proves: the write is scoped to the SESSION user id (never the body);
 * unauthenticated + over-length payloads are rejected before the service.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockUpdateOwn = jest.fn();
jest.mock("@/services/accounts/userProfile", () => ({
  updateOwnDisplayName: (...a: unknown[]) => mockUpdateOwn(...a),
}));

import { PATCH } from "@/app/api/account/profile/route";

const USER_ID = "user-1";

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/profile", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function signedIn() {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: USER_ID, email: "u@example.com" } },
    error: null,
  });
}

beforeEach(() => {
  mockGetUser.mockReset();
  mockUpdateOwn.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("PATCH /api/account/profile", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await PATCH(req({ displayName: "Ada" }));
    expect(res.status).toBe(401);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("400s an over-length display name before the service", async () => {
    signedIn();
    const res = await PATCH(req({ displayName: "a".repeat(81) }));
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("400s a malformed body (missing displayName)", async () => {
    signedIn();
    const res = await PATCH(req({}));
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("updates the SESSION user's own display name and returns the stored value", async () => {
    signedIn();
    mockUpdateOwn.mockResolvedValueOnce({ displayName: "Ada Lovelace" });
    const res = await PATCH(req({ displayName: "  Ada Lovelace  " }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, displayName: "Ada Lovelace" });
    // Scoped to the caller's own session id — body cannot target another user.
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, "  Ada Lovelace  ");
  });

  it("cannot target another user: a userId in the body is ignored — the session id is used", async () => {
    signedIn();
    mockUpdateOwn.mockResolvedValueOnce({ displayName: "Mallory" });
    const res = await PATCH(
      req({ displayName: "Mallory", userId: "victim", id: "victim" }),
    );
    expect(res.status).toBe(200);
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, "Mallory");
  });

  it("accepts an empty string (clears the name) and returns null", async () => {
    signedIn();
    mockUpdateOwn.mockResolvedValueOnce({ displayName: null });
    const res = await PATCH(req({ displayName: "" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, displayName: null });
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, "");
  });
});
