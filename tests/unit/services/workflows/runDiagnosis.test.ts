/**
 * @jest-environment node
 *
 * Tests for the pure run-diagnostics functions (Slice 4.MCP-STAGE-2B-3, CS-1).
 *
 * Table-driven coverage of `summarizeRunFailure` + `classifyRunVisibility`,
 * precedence, determinism, and a no-leak proof that a FULL secret-bearing run
 * object can never surface raw output / error messages / triggerEvent.
 */
import {
  summarizeRunFailure,
  classifyRunVisibility,
  type RunFailureInput,
  type RunVisibilityInput,
  type RunVisibilityStatus,
} from "@/services/workflows/runDiagnosis";

const CLASSIFICATION = {
  title: "Reconnect Slack",
  description: "Your Slack connection expired.",
  hint: "Reconnect from Apps.",
  action: "reconnect" as const,
  severity: "error" as const,
};

function failureInput(over: Partial<RunFailureInput> = {}): RunFailureInput {
  return {
    status: "failed",
    isTest: false,
    triggeredBy: "manual",
    steps: [
      { nodeId: "trigger-1", status: "succeeded" },
      { nodeId: "action-1", status: "failed", error: { code: "PROVIDER_REAUTH_REQUIRED" } },
      { nodeId: "action-2", status: "skipped" },
    ],
    errorClassification: CLASSIFICATION,
    ...over,
  };
}

describe("summarizeRunFailure", () => {
  it("passes through the stored humanized classification when present", () => {
    const s = summarizeRunFailure(failureInput());
    expect(s.classificationAvailable).toBe(true);
    expect(s.errorClassification).toEqual(CLASSIFICATION);
  });

  it("reports classificationAvailable:false and no fallback when classification is null", () => {
    const s = summarizeRunFailure(failureInput({ errorClassification: null }));
    expect(s.classificationAvailable).toBe(false);
    expect(s.errorClassification).toBeNull();
  });

  it("derives firstFailedNodeId from the first failed step", () => {
    const s = summarizeRunFailure(failureInput());
    expect(s.firstFailedNodeId).toBe("action-1");
    expect(s.failedStepCount).toBe(1);
  });

  it("firstFailedNodeId is null when no step failed", () => {
    const s = summarizeRunFailure(
      failureInput({
        status: "succeeded",
        steps: [
          { nodeId: "t", status: "succeeded" },
          { nodeId: "a", status: "succeeded" },
        ],
        errorClassification: null,
      }),
    );
    expect(s.firstFailedNodeId).toBeNull();
    expect(s.failedStepCount).toBe(0);
  });

  it("per-step output is exactly {nodeId, status, errorCode}", () => {
    const s = summarizeRunFailure(failureInput());
    expect(s.steps).toEqual([
      { nodeId: "trigger-1", status: "succeeded", errorCode: null },
      { nodeId: "action-1", status: "failed", errorCode: "PROVIDER_REAUTH_REQUIRED" },
      { nodeId: "action-2", status: "skipped", errorCode: null },
    ]);
    for (const step of s.steps) {
      expect(Object.keys(step).sort()).toEqual(["errorCode", "nodeId", "status"]);
    }
  });

  it("carries the safe triggeredBy category + isTest", () => {
    const s = summarizeRunFailure(failureInput({ isTest: true, triggeredBy: "test" }));
    expect(s.isTest).toBe(true);
    expect(s.triggeredBy).toBe("test");
  });
});

describe("summarizeRunFailure — no-leak", () => {
  it("a full secret-bearing run object cannot surface raw output / messages / triggerEvent", () => {
    // Structural typing lets a FULL WorkflowRunRecord-shaped object through; the
    // function must read only the safe fields.
    const fullRun = {
      id: "run-1",
      workflowId: "wf-1",
      accountId: "acct-1",
      triggeredByUserId: "user-SECRET",
      status: "failed",
      isTest: false,
      triggeredBy: "manual",
      triggerNodeId: "trigger-1",
      triggerEvent: { rawPayload: "SECRET_TRIGGER_BODY", email: "victim@example.com" },
      fatalError: { code: "X", message: "FATAL_SECRET_MESSAGE" },
      errorClassification: CLASSIFICATION,
      steps: [
        {
          nodeId: "action-1",
          status: "failed",
          output: { secret: "STEP_OUTPUT_SECRET", token: "xoxb-LEAK" },
          error: {
            code: "PROVIDER_REAUTH_REQUIRED",
            message: "RAW_PROVIDER_ERROR_MESSAGE",
            details: { body: "RAW_PROVIDER_BODY" },
          },
        },
      ],
      startedAt: "2026-06-01T00:00:00Z",
      finishedAt: "2026-06-01T00:00:01Z",
      createdAt: "2026-06-01T00:00:00Z",
    };
    const s = summarizeRunFailure(fullRun as unknown as RunFailureInput);
    const json = JSON.stringify(s);
    for (const forbidden of [
      "SECRET_TRIGGER_BODY",
      "victim@example.com",
      "FATAL_SECRET_MESSAGE",
      "STEP_OUTPUT_SECRET",
      "xoxb-LEAK",
      "RAW_PROVIDER_ERROR_MESSAGE",
      "RAW_PROVIDER_BODY",
      "user-SECRET",
    ]) {
      expect(json).not.toContain(forbidden);
    }
    // The safe error CODE is still present.
    expect(json).toContain("PROVIDER_REAUTH_REQUIRED");
    // No raw step keys survived.
    for (const step of s.steps) {
      expect(step).not.toHaveProperty("output");
      expect(step).not.toHaveProperty("error");
    }
  });
});

describe("classifyRunVisibility", () => {
  const AUTH = { authorizedAccountId: "acct-1" };
  const run = (over: Partial<RunVisibilityInput> = {}): RunVisibilityInput => ({
    status: "succeeded",
    isTest: false,
    accountId: "acct-1",
    ...over,
  });

  const cases: Array<{
    name: string;
    run: RunVisibilityInput | null;
    ctx: Parameters<typeof classifyRunVisibility>[1];
    expected: RunVisibilityStatus;
  }> = [
    { name: "NOT_FOUND when run is null", run: null, ctx: AUTH, expected: "NOT_FOUND" },
    {
      name: "WRONG_ACCOUNT when the run belongs to another account",
      run: run({ accountId: "acct-other", status: "failed" }),
      ctx: AUTH,
      expected: "WRONG_ACCOUNT",
    },
    {
      name: "RUNNING for a non-terminal row",
      run: run({ status: "running" }),
      ctx: AUTH,
      expected: "RUNNING",
    },
    {
      name: "TEST_RUN when a terminal test run and toggle off",
      run: run({ isTest: true, status: "failed" }),
      ctx: AUTH,
      expected: "TEST_RUN",
    },
    {
      name: "FAILED_VISIBLE for a terminal failed non-test run",
      run: run({ status: "failed" }),
      ctx: AUTH,
      expected: "FAILED_VISIBLE",
    },
    {
      name: "COMPLETED_VISIBLE for a terminal succeeded non-test run",
      run: run({ status: "succeeded" }),
      ctx: AUTH,
      expected: "COMPLETED_VISIBLE",
    },
    {
      name: "test run becomes visible when includeTestRuns is true",
      run: run({ isTest: true, status: "failed" }),
      ctx: { authorizedAccountId: "acct-1", includeTestRuns: true },
      expected: "FAILED_VISIBLE",
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(classifyRunVisibility(c.run, c.ctx)).toBe(c.expected);
    });
  }
});

describe("classifyRunVisibility — precedence (multiple conditions true)", () => {
  it("WRONG_ACCOUNT wins over RUNNING (never reveals a foreign run's state)", () => {
    expect(
      classifyRunVisibility(
        { status: "running", isTest: true, accountId: "acct-other" },
        { authorizedAccountId: "acct-1" },
      ),
    ).toBe("WRONG_ACCOUNT");
  });

  it("RUNNING wins over TEST_RUN (running is hidden for everyone)", () => {
    expect(
      classifyRunVisibility(
        { status: "running", isTest: true, accountId: "acct-1" },
        { authorizedAccountId: "acct-1" },
      ),
    ).toBe("RUNNING");
  });

  it("TEST_RUN wins over FAILED_VISIBLE when the toggle is off", () => {
    expect(
      classifyRunVisibility(
        { status: "failed", isTest: true, accountId: "acct-1" },
        { authorizedAccountId: "acct-1", includeTestRuns: false },
      ),
    ).toBe("TEST_RUN");
  });

  it("is deterministic for identical inputs", () => {
    const input: RunVisibilityInput = { status: "failed", isTest: false, accountId: "acct-1" };
    const ctx = { authorizedAccountId: "acct-1" };
    expect(classifyRunVisibility(input, ctx)).toBe(classifyRunVisibility(input, ctx));
  });
});
