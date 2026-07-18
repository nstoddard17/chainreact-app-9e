/**
 * @jest-environment node
 *
 * 5.ONBOARD-1 Batch 4 — fail-open, content-free onboarding event recorder.
 * Proves: flag gate, allow-list sanitization (nothing outside the schema can
 * pass), and that a repository failure never escapes (analytics can never
 * interrupt a user flow).
 */
const mockInsert = jest.fn();
jest.mock("@/repositories/onboarding/onboardingEvents", () => ({
  insertServiceRole: (...a: unknown[]) => mockInsert(...a),
}));

import { recordOnboardingEvent } from "@/services/onboarding/onboardingEvents";

const BASE = {
  userId: "user-1",
  accountId: "acct-1",
  eventType: "onboarding_shown" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ENABLE_ONBOARDING_CHECKLIST = "true";
  mockInsert.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.ENABLE_ONBOARDING_CHECKLIST;
});

describe("recordOnboardingEvent", () => {
  it("flag off (default) → records nothing", async () => {
    delete process.env.ENABLE_ONBOARDING_CHECKLIST;
    await recordOnboardingEvent(BASE);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("records the sanitized row (ids + keys only)", async () => {
    await recordOnboardingEvent({
      ...BASE,
      eventType: "onboarding_cta_clicked",
      stepKey: "connect",
      workflowId: "wf-1",
      provider: "slack",
      metadata: { creation_path: "template" },
    });
    expect(mockInsert).toHaveBeenCalledWith({
      userId: "user-1",
      accountId: "acct-1",
      eventType: "onboarding_cta_clicked",
      stepKey: "connect",
      workflowId: "wf-1",
      provider: "slack",
      metadata: { creation_path: "template" },
    });
  });

  it("SANITIZATION: disallowed metadata keys, unsafe strings, bogus step/provider are all dropped", async () => {
    await recordOnboardingEvent({
      ...BASE,
      stepKey: "not-a-step",
      provider: "Sneaky Provider With Spaces!",
      metadata: {
        creation_path: "manual",
        minutes_from_first_shown: 12.7,
        silent: true,
        // Everything below must be dropped:
        email: "user@example.com",
        token: "provider-secret-shaped-value",
        config: { to: "someone@example.com" },
        user_role: "owner<script>",
      },
    });
    const row = mockInsert.mock.calls[0]![0] as Record<string, unknown>;
    expect(row.stepKey).toBeUndefined();
    expect(row.provider).toBeUndefined();
    expect(row.metadata).toEqual({
      creation_path: "manual",
      minutes_from_first_shown: 13,
      silent: true,
    });
    expect(JSON.stringify(row)).not.toContain("example.com");
    expect(JSON.stringify(row)).not.toContain("secret-shaped");
  });

  it("FAIL-OPEN: repository failure is swallowed after a message-only log", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockInsert.mockRejectedValue(new Error("db down"));
    await expect(recordOnboardingEvent(BASE)).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[onboarding] event recording failed"),
      "db down",
    );
    consoleSpy.mockRestore();
  });
});
