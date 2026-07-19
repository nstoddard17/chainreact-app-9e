/**
 * @jest-environment node
 *
 * Route tests for the collaboration onboarding surface (5.ONBOARD-4).
 *
 * Covers required proof 9 (members cannot use checklist routes to perform
 * owner-only actions) plus the auth/forgery/no-leak contract.
 */
const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
}));

const mockGetChecklist = jest.fn();
const mockResolveTrack = jest.fn();
jest.mock("@/services/collaborationOnboarding/checklistState", () => ({
  getCollaborationChecklist: (...a: unknown[]) => mockGetChecklist(...a),
  resolveCurrentTrack: (...a: unknown[]) => mockResolveTrack(...a),
}));

const mockUpdatePresentation = jest.fn();
jest.mock("@/repositories/onboarding/collaborationOnboardingStates", () => ({
  updatePresentationServiceRole: (...a: unknown[]) => mockUpdatePresentation(...a),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

import { GET } from "@/app/api/onboarding/collaboration/route";
import { POST } from "@/app/api/onboarding/collaboration/presentation/route";

const USER = "user-1";
const ACCOUNT = "acct-1";

function signedIn(userId = USER, accountId = ACCOUNT) {
  mockRequireUserWithAccount.mockResolvedValue({ ok: true, userId, accountId });
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/collaboration/presentation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdatePresentation.mockResolvedValue({
    dismissedAt: null,
    minimized: true,
    completedAt: null,
    celebratedAt: null,
  });
});

describe("GET /api/onboarding/collaboration", () => {
  it("refuses an unauthenticated caller before any derivation", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetChecklist).not.toHaveBeenCalled();
  });

  it("derives strictly from the SESSION's (userId, accountId) — no input accepted", async () => {
    signedIn();
    mockGetChecklist.mockResolvedValue({ track: "team_member", steps: [] });
    await GET();
    expect(mockGetChecklist).toHaveBeenCalledWith({
      userId: USER,
      accountId: ACCOUNT,
    });
    // GET takes no arguments at all — there is no seam for a client-supplied
    // account id, role, or track.
    expect(GET.length).toBe(0);
  });

  it("returns null (200) for an ineligible account rather than leaking a 403", async () => {
    signedIn();
    mockGetChecklist.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("maps a derivation failure to a safe 500 with no internals", async () => {
    signedIn();
    mockGetChecklist.mockRejectedValue(new Error("relation ... does not exist"));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "ONBOARDING_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("relation");
  });
});

describe("POST presentation — proof 9: no owner-only action is reachable", () => {
  it("ignores a client-supplied track and uses the SERVER-derived one", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue("team_member");
    // A member attempts to act on the OWNER record.
    const res = await POST(post({ action: "dismiss", track: "team_owner" }));
    // `.strict()` rejects the unknown key outright — the write never happens.
    expect(res.status).toBe(400);
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("writes only to the caller's own derived track", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue("team_member");
    await POST(post({ action: "minimize" }));
    expect(mockResolveTrack).toHaveBeenCalledWith({
      userId: USER,
      accountId: ACCOUNT,
    });
    expect(mockUpdatePresentation).toHaveBeenCalledWith(
      USER,
      ACCOUNT,
      "team_member",
      { minimized: true },
    );
  });

  it("rejects a body attempting to forge completion", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue("team_member");
    for (const body of [
      { action: "dismiss", completedAt: "2026-01-01T00:00:00Z" },
      { action: "celebrated", completed: true },
      { action: "complete" },
      { action: "dismiss", steps: [{ key: "invite_teammate", status: "complete" }] },
    ]) {
      const res = await POST(post(body));
      expect(res.status).toBe(400);
    }
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("exposes no verb that invites, connects, runs, activates, or changes a role/billing", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue("team_owner");
    for (const action of [
      "invite",
      "invite_teammate",
      "connect",
      "run",
      "activate",
      "change_role",
      "assign_admin",
      "upgrade",
      "checkout",
    ]) {
      const res = await POST(post({ action }));
      expect(res.status).toBe(400);
    }
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("404s when the caller has no eligible track to mutate", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue(null);
    const res = await POST(post({ action: "dismiss" }));
    expect(res.status).toBe(404);
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller before parsing or resolving anything", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    const res = await POST(post({ action: "dismiss" }));
    expect(res.status).toBe(403);
    expect(mockResolveTrack).not.toHaveBeenCalled();
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });

  it("accepts the five presentation verbs and returns no account internals", async () => {
    signedIn();
    mockResolveTrack.mockResolvedValue("team_admin");
    const res = await POST(post({ action: "expand" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["ok", "presentation", "track"]);
    expect(Object.keys(body.presentation).sort()).toEqual([
      "celebrationPending",
      "dismissed",
      "minimized",
    ]);
  });

  it("rejects a non-JSON body", async () => {
    signedIn();
    const res = await POST(
      new Request("http://localhost/api/onboarding/collaboration/presentation", {
        method: "POST",
        body: "not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockUpdatePresentation).not.toHaveBeenCalled();
  });
});
