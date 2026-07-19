/**
 * @jest-environment node
 *
 * Learning-evidence recorder tests (5.ONBOARD-4) — the integrity half of
 * required proof 11: member learning steps require REAL usage evidence that a
 * client cannot forge.
 */
const mockFindRecordedTypes = jest.fn();
jest.mock("@/repositories/onboarding/onboardingEvents", () => ({
  findRecordedTypesServiceRole: (...a: unknown[]) => mockFindRecordedTypes(...a),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

const mockRequireUserWithAccount = jest.fn();
jest.mock("@/app/api/workflows/_shared", () => ({
  requireUserWithAccount: (...a: unknown[]) => mockRequireUserWithAccount(...a),
}));

import { recordCollaborationLearningEvent } from "@/services/collaborationOnboarding/learningEvents";
import { POST as eventsPOST } from "@/app/api/onboarding/events/route";

const USER = "user-1";
const ACCOUNT = "acct-1";

beforeEach(() => {
  jest.clearAllMocks();
  mockFindRecordedTypes.mockResolvedValue(new Set());
  mockRecordEvent.mockResolvedValue(undefined);
});

describe("the client events route cannot forge a learning step", () => {
  it("rejects every collaboration learning event type", async () => {
    mockRequireUserWithAccount.mockResolvedValue({
      ok: true,
      userId: USER,
      accountId: ACCOUNT,
    });
    // This is the attack the design forbids: a member curling their own
    // learning steps to green without ever visiting anything.
    for (const event of [
      "collab_workspace_explored",
      "collab_shared_workflow_opened",
      "collab_apps_viewed",
      "collab_team_viewed",
    ]) {
      const res = await eventsPOST(
        new Request("http://localhost/api/onboarding/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event }),
        }),
      );
      expect(res.status).toBe(400);
    }
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });
});

describe("recordCollaborationLearningEvent", () => {
  it("records the event for the given (user, account)", async () => {
    await recordCollaborationLearningEvent({
      userId: USER,
      accountId: ACCOUNT,
      eventType: "collab_team_viewed",
    });
    expect(mockRecordEvent).toHaveBeenCalledWith({
      userId: USER,
      accountId: ACCOUNT,
      eventType: "collab_team_viewed",
    });
  });

  it("is write-once — a repeat visit records nothing new", async () => {
    mockFindRecordedTypes.mockResolvedValue(new Set(["collab_apps_viewed"]));
    await recordCollaborationLearningEvent({
      userId: USER,
      accountId: ACCOUNT,
      eventType: "collab_apps_viewed",
    });
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("is fail-open — a recorder failure never throws into navigation", async () => {
    mockRecordEvent.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordCollaborationLearningEvent({
        userId: USER,
        accountId: ACCOUNT,
        eventType: "collab_team_viewed",
      }),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("is fail-open when the existence probe itself fails", async () => {
    mockFindRecordedTypes.mockRejectedValue(new Error("db down"));
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordCollaborationLearningEvent({
        userId: USER,
        accountId: ACCOUNT,
        eventType: "collab_apps_viewed",
      }),
    ).resolves.toBeUndefined();
    expect(mockRecordEvent).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("carries a workflow id only for the shared-workflow-opened event", async () => {
    await recordCollaborationLearningEvent({
      userId: USER,
      accountId: ACCOUNT,
      eventType: "collab_shared_workflow_opened",
      workflowId: "wf-1",
    });
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ workflowId: "wf-1" }),
    );
  });
});
