/**
 * @jest-environment node
 *
 * Route tests for /api/account/notification-preferences (4.ACCOUNT-SETTINGS-4).
 * Mocks supabase auth + the preferences service so the route's guards
 * (auth → validate → service) are exercised in isolation.
 *
 * Proves: read/write are scoped to the SESSION user id (never the body);
 * unauthenticated + malformed payloads are rejected before the service.
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({ auth: { getUser: () => mockGetUser() } })),
}));

const mockGetOwn = jest.fn();
const mockUpdateOwn = jest.fn();
jest.mock("@/services/accounts/notificationPreferences", () => ({
  getOwnNotificationPreferences: (...a: unknown[]) => mockGetOwn(...a),
  updateOwnNotificationPreferences: (...a: unknown[]) => mockUpdateOwn(...a),
}));

import { GET, PATCH } from "@/app/api/account/notification-preferences/route";

const USER_ID = "user-1";
const PREFS = { productUpdates: false, workflowAlerts: true, teamActivity: true };

function req(body: unknown) {
  return new Request("https://app.example.test/api/account/notification-preferences", {
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
  mockGetOwn.mockReset();
  mockUpdateOwn.mockReset();
  jest.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  (console.info as jest.Mock).mockRestore?.();
});

describe("GET /api/account/notification-preferences", () => {
  it("401s an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetOwn).not.toHaveBeenCalled();
  });

  it("returns the SESSION user's own preferences", async () => {
    signedIn();
    mockGetOwn.mockResolvedValueOnce(PREFS);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, preferences: PREFS });
    expect(mockGetOwn).toHaveBeenCalledWith(USER_ID);
  });
});

describe("PATCH /api/account/notification-preferences", () => {
  it("401s an unauthenticated caller and never touches the service", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const res = await PATCH(req(PREFS));
    expect(res.status).toBe(401);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("400s a non-boolean / malformed payload before the service", async () => {
    signedIn();
    const res = await PATCH(
      req({ productUpdates: "yes", workflowAlerts: true, teamActivity: true }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("400s a payload missing a key", async () => {
    signedIn();
    const res = await PATCH(req({ workflowAlerts: true, teamActivity: true }));
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("400s a payload with an unknown key (strict)", async () => {
    signedIn();
    const res = await PATCH(req({ ...PREFS, smtpHost: "evil" }));
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });

  it("updates the SESSION user's own preferences and returns them", async () => {
    signedIn();
    const next = { productUpdates: true, workflowAlerts: false, teamActivity: true };
    mockUpdateOwn.mockResolvedValueOnce(next);
    const res = await PATCH(req(next));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, preferences: next });
    expect(mockUpdateOwn).toHaveBeenCalledWith(USER_ID, next);
  });

  it("cannot target another user: an id in the body is ignored — the session id is used", async () => {
    signedIn();
    mockUpdateOwn.mockResolvedValueOnce(PREFS);
    // Unknown keys 400 under strict, so the attacker can't even smuggle a userId.
    const res = await PATCH(req({ ...PREFS, userId: "victim" }));
    expect(res.status).toBe(400);
    expect(mockUpdateOwn).not.toHaveBeenCalled();
  });
});
