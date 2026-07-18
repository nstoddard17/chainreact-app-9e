/**
 * @jest-environment node
 *
 * Activation-time completion latch (5.ONBOARD-1 Batch 1): flag-gated,
 * best-effort, and strictly subordinate to activation — a latch failure must
 * resolve without throwing and without leaking anything beyond a safe message.
 */
const mockLatch = jest.fn();
jest.mock("@/repositories/onboarding/userOnboardingStates", () => ({
  latchCompletionServiceRole: (...a: unknown[]) => mockLatch(...a),
}));

const mockRecordEvent = jest.fn();
jest.mock("@/services/onboarding/onboardingEvents", () => ({
  recordOnboardingEvent: (...a: unknown[]) => mockRecordEvent(...a),
}));

import { latchOnboardingCompletionOnActivation } from "@/services/onboarding/completionLatch";

const INPUT = { userId: "user-1", accountId: "acct-1", workflowId: "wf-1" };

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  delete process.env.ENABLE_ONBOARDING_CHECKLIST;
});

describe("latchOnboardingCompletionOnActivation", () => {
  it("flag off (default) → no-op, repository never touched", async () => {
    await latchOnboardingCompletionOnActivation(INPUT);
    expect(mockLatch).not.toHaveBeenCalled();
  });

  it("flag on → latches for the activating (user, account) pair with the workflow as provenance (non-silent)", async () => {
    process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
    mockLatch.mockResolvedValue(true);
    await latchOnboardingCompletionOnActivation(INPUT);
    expect(mockLatch).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
      workflowId: "wf-1",
    });
    // First latch → the one-time completed funnel event.
    expect(mockRecordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "onboarding_completed",
        workflowId: "wf-1",
      }),
    );
  });

  it("already-latched (concurrent/later activation) → no duplicate completed event", async () => {
    process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
    mockLatch.mockResolvedValue(false);
    await latchOnboardingCompletionOnActivation(INPUT);
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("repository failure is swallowed (activation unaffected) and logged message-only", async () => {
    process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockLatch.mockRejectedValue(new Error("db unavailable"));
    await expect(latchOnboardingCompletionOnActivation(INPUT)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[onboarding] completion latch failed"),
      "db unavailable",
    );
    consoleSpy.mockRestore();
  });
});
