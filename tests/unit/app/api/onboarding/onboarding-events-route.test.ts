/**
 * @jest-environment node
 *
 * POST /api/onboarding/events (5.ONBOARD-1 Batch 4) — client-originated
 * analytics only (CTA clicks + video opens). Strict allow-listed body; can
 * never touch user_onboarding_states or step completion.
 */
import { NextResponse } from "next/server";

const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
}));

const mockRecord = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecord(...a),
}));

import { POST } from "@/app/api/onboarding/events/route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/onboarding/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireUserWithAccount.mockResolvedValue({
    ok: true,
    userId: "user-1",
    accountId: "acct-1",
  });
  mockRecord.mockResolvedValue(undefined);
});

describe("POST /api/onboarding/events", () => {
  it("unauthenticated → gate response, nothing recorded", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    });
    const res = await POST(req({ event: "video_opened" }));
    expect(res.status).toBe(401);
    expect(mockRecord).not.toHaveBeenCalled();
  });


  it("cta_clicked records with step key + creation path for the RESOLVED identity", async () => {
    const res = await POST(
      req({ event: "cta_clicked", stepKey: "create", creationPath: "agent" }),
    );
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
      eventType: "onboarding_cta_clicked",
      stepKey: "create",
      metadata: { creation_path: "agent" },
    });
  });

  it("video_opened records without extras", async () => {
    const res = await POST(req({ event: "video_opened" }));
    expect(res.status).toBe(200);
    expect(mockRecord).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
      eventType: "onboarding_video_opened",
    });
  });

  it("FORGERY: server-only event names and completion writes are rejected (400)", async () => {
    for (const body of [
      { event: "onboarding_completed" },
      { event: "cta_clicked", stepKey: "create", completedAt: "2026-01-01" },
      { event: "cta_clicked", stepKey: "bogus" },
      { event: "cta_clicked" },
    ]) {
      const res = await POST(req(body));
      expect(res.status).toBe(400);
    }
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
