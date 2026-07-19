/**
 * @jest-environment node
 *
 * GET /api/onboarding (5.ONBOARD-1 Batch 1): gate order (auth+account first),
 * DTO passthrough, safe failure, and a response no-leak scan. The derivation service is mocked at its module boundary; the route's
 * own mapping runs for real.
 */
import { NextResponse } from "next/server";

const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
  workflowNotFoundResponse: () =>
    NextResponse.json({ error: "WORKFLOW_NOT_FOUND" }, { status: 404 }),
}));

const mockGetChecklist = jest.fn();
jest.mock("@/services/onboarding/checklistState", () => ({
  getOnboardingChecklist: (...a: unknown[]) => mockGetChecklist(...a),
}));

import { GET } from "@/app/api/onboarding/route";

function authedAs(userId: string, accountId: string): void {
  mockRequireUserWithAccount.mockResolvedValue({ ok: true, userId, accountId });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/onboarding", () => {
  it("unauthenticated → the gate's response passes through and nothing derives", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockGetChecklist).not.toHaveBeenCalled();
  });


  it("derives for the RESOLVED (user, account) pair and returns the DTO", async () => {
    authedAs("user-1", "acct-1");
    const dto = { completed: false, steps: [] };
    mockGetChecklist.mockResolvedValue(dto);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject(dto);
    expect(mockGetChecklist).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
    });
  });

  it("derivation failure → safe 500 that leaks no internals", async () => {
    authedAs("user-1", "acct-1");
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockGetChecklist.mockRejectedValue(
      new Error("postgres: relation user_onboarding_states has secrets"),
    );
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "ONBOARDING_UNAVAILABLE" });
    expect(JSON.stringify(body)).not.toContain("postgres");
    consoleSpy.mockRestore();
  });

  it("no-leak scan: a representative DTO response carries no secrets/config surface", async () => {
    authedAs("user-1", "acct-1");
    mockGetChecklist.mockResolvedValue({
      completed: false,
      selectedWorkflow: { id: "wf-1", name: "Lead intake", state: "draft", testable: true },
      workflowOptions: [{ id: "wf-1", name: "Lead intake" }],
      steps: [
        { key: "create", status: "complete" },
        {
          key: "connect",
          status: "current",
          providers: [
            {
              provider: "slack",
              name: "Slack",
              ready: false,
              reconnectNeeded: false,
              canConnect: true,
              adminRequired: false,
            },
          ],
        },
      ],
    });
    const res = await GET();
    const serialized = JSON.stringify(await res.json()).toLowerCase();
    for (const forbidden of ["token", "secret", "config", "scope", "email", "provideraccountid"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
