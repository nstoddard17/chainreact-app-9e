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

const INPUT = {
  userId: "user-1",
  accountId: "acct-1",
  workflowId: "wf-1",
  workflowName: "Lead intake → Slack",
};

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
      workflowName: "Lead intake → Slack",
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

describe("provenance snapshot (correction)", () => {
  beforeEach(() => {
    process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
  });

  it("passes null (not undefined) when the activating record has no name", async () => {
    mockLatch.mockResolvedValue(true);
    await latchOnboardingCompletionOnActivation({
      userId: "user-1",
      accountId: "acct-1",
      workflowId: "wf-1",
    });
    expect(mockLatch).toHaveBeenCalledWith(
      expect.objectContaining({ workflowName: null }),
    );
  });

  it("a LATER activation that loses the conditional latch emits no event — original provenance stands", async () => {
    mockLatch.mockResolvedValue(false);
    await latchOnboardingCompletionOnActivation({
      userId: "user-1",
      accountId: "acct-1",
      workflowId: "wf-second",
      workflowName: "Second workflow",
    });
    expect(mockLatch).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).not.toHaveBeenCalled();
  });

  it("CONCURRENCY: two activations race — exactly one wins and one event fires", async () => {
    // The repository's conditional UPDATE is the arbiter; simulate first-wins.
    mockLatch.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await Promise.all([
      latchOnboardingCompletionOnActivation({
        userId: "user-1",
        accountId: "acct-1",
        workflowId: "wf-a",
        workflowName: "A",
      }),
      latchOnboardingCompletionOnActivation({
        userId: "user-1",
        accountId: "acct-1",
        workflowId: "wf-b",
        workflowName: "B",
      }),
    ]);
    expect(mockLatch).toHaveBeenCalledTimes(2);
    expect(mockRecordEvent).toHaveBeenCalledTimes(1);
    // The winner's id and name travel together (one consistent pair).
    const evt = mockRecordEvent.mock.calls[0]![0] as { workflowId: string };
    expect(["wf-a", "wf-b"]).toContain(evt.workflowId);
  });

  it("latch failure still never fails activation (snapshot path included)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockLatch.mockRejectedValue(new Error("constraint violated"));
    await expect(
      latchOnboardingCompletionOnActivation({
        userId: "user-1",
        accountId: "acct-1",
        workflowId: "wf-1",
        workflowName: "Whatever",
      }),
    ).resolves.toBeUndefined();
    consoleSpy.mockRestore();
  });
});
