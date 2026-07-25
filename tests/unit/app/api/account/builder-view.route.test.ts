/**
 * @jest-environment node
 *
 * Route tests for /api/account/builder-view (BUILDER-VIEW-DEFAULT-1).
 * Mocks supabase auth + the preference service so the route's guards
 * (auth → validate → service) are exercised in isolation.
 *
 * Proves: read/write are scoped to the SESSION user id (never the body);
 * null clears the default; unauthenticated + malformed payloads are
 * rejected before the service runs.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetOwn = jest.fn();
const mockUpdateOwn = jest.fn();
jest.mock("@/services/accounts/builderViewPreference", () => ({
  getOwnDefaultBuilderView: (...a: unknown[]) => mockGetOwn(...a),
  updateOwnDefaultBuilderView: (...a: unknown[]) => mockUpdateOwn(...a),
}));

import { GET, PATCH } from "@/app/api/account/builder-view/route";

const USER_ID = "user-1";

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/builder-view", {
    method: "PATCH",
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: USER_ID } } });
  mockGetOwn.mockReset().mockResolvedValue("document");
  mockUpdateOwn.mockReset().mockImplementation(async (_id, view) => view);
});

describe("GET /api/account/builder-view", () => {
  it("returns the caller's own default (session-scoped user id)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, defaultBuilderView: "document" });
    expect(mockGetOwn).toHaveBeenCalledWith(USER_ID);
  });

  it("401s when unauthenticated, before the service runs", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetOwn).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/account/builder-view", () => {
  it("updates to a valid view for the session user", async () => {
    const res = await PATCH(req({ defaultBuilderView: "visual" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, defaultBuilderView: "visual" });
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, "visual");
  });

  it("null clears the default (→ ask on new workflows)", async () => {
    const res = await PATCH(req({ defaultBuilderView: null }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, defaultBuilderView: null });
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, null);
  });

  it("400s on an unknown view or unknown keys, before the service runs", async () => {
    for (const body of [
      { defaultBuilderView: "canvas" },
      { defaultBuilderView: "visual", extra: true },
      {},
    ]) {
      const res = await PATCH(req(body));
      expect(res.status).toBe(400);
    }
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("401s when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(req({ defaultBuilderView: "visual" }));
    expect(res.status).toBe(401);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });
});
