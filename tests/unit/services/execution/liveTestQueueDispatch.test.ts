/**
 * @jest-environment node
 *
 * WORKFLOW-LIVE-TEST-3 §12/§13 — the queue processor's live-test elevation.
 *
 * The narrow inactive-workflow capability lives HERE: a queued run labeled is_test executes with
 * REAL handlers if and only if a CONSUMED workflow_live_test_sessions row names that exact run.
 * No client field is consulted; the session row can only be minted by the service-role
 * `authorize_live_test_run` transaction. These tests pin every direction of that gate:
 *
 *   - consumed session found  → engine gets testMode:false + recordAsTest:true + draft mode;
 *   - no session              → the dispatch stays a SAFE test (handlers blocked), byte-for-byte
 *                               the pre-existing envelope — an is_test row alone elevates nothing;
 *   - session lookup ERROR    → fail closed to the safe envelope (degraded, never dangerous);
 *   - after the engine returns, the session completes succeeded/failed; a completion failure is
 *     logged and isolated.
 */

const mockGetQueuedRunForDispatch = jest.fn();
const mockFailQueuedRunIfStillQueued = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  getQueuedRunForDispatch: (...a: unknown[]) => mockGetQueuedRunForDispatch(...a),
  listQueuedWorkflowRunsForDispatch: jest.fn(),
  failQueuedRunIfStillQueued: (...a: unknown[]) => mockFailQueuedRunIfStillQueued(...a),
}));

const mockGetConsumedSessionByRunId = jest.fn();
const mockCompleteSessionForRun = jest.fn();
jest.mock("@/repositories/liveTest/workflowLiveTestSessions", () => ({
  getConsumedSessionByRunId: (...a: unknown[]) => mockGetConsumedSessionByRunId(...a),
  completeSessionForRun: (...a: unknown[]) => mockCompleteSessionForRun(...a),
}));

const mockRunWorkflow = jest.fn();
jest.mock("@/services/execution/engine", () => ({
  WorkflowEngine: jest.fn(() => ({ runWorkflow: mockRunWorkflow })),
}));
jest.mock("@/workflow-engine/variables/resolveValue", () => ({ resolveStrict: jest.fn() }));
jest.mock("@/core/errors/humanizeActionError", () => ({
  humanizeActionError: jest.fn(() => ({ title: "h", description: "d", severity: "error" })),
}));

import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import type { QueuedRunDispatch } from "@/repositories/workflowRuns";

function dispatch(overrides: Partial<QueuedRunDispatch> = {}): QueuedRunDispatch {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    triggerNodeId: "trigger",
    triggerEvent: {
      provider: "gmail",
      eventType: "new_email",
      eventId: "msg-1",
      occurredAt: "2026-08-01T10:00:00Z",
      providerAccountId: "pa-1",
      payload: {},
    },
    isTest: true,
    triggeredBy: "test",
    triggeredByUserId: "user-1",
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
    ...overrides,
  } as QueuedRunDispatch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRunWorkflow.mockResolvedValue({ status: "succeeded", steps: [] });
  mockGetConsumedSessionByRunId.mockResolvedValue(null);
  mockCompleteSessionForRun.mockResolvedValue(undefined);
});

describe("live-test queue dispatch — elevation requires the consumed session", () => {
  it("a consumed session naming the run elevates: REAL handlers, test label, DRAFT definition", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockResolvedValue({ id: "sess-1", workflowRunId: "run-1" });

    await processQueuedRun("run-1");

    expect(mockGetConsumedSessionByRunId).toHaveBeenCalledWith("run-1");
    expect(mockRunWorkflow).toHaveBeenCalledTimes(1);
    const input = mockRunWorkflow.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.testMode).toBe(false); // real handlers — the gate is OFF
    expect(input.recordAsTest).toBe(true); // …but the run stays labeled a test
    expect(input.executionDefinitionMode).toBe("draft"); // the consented saved draft
    expect(input.triggeredBy).toBe("test");
  });

  it("WITHOUT a session, an is_test dispatch stays a SAFE test — the label alone elevates nothing", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockResolvedValue(null);

    await processQueuedRun("run-1");

    const input = mockRunWorkflow.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.testMode).toBe(true); // handlers remain BLOCKED
    expect(input.recordAsTest).toBeUndefined();
    expect(input.executionDefinitionMode).toBeUndefined();
    expect(mockCompleteSessionForRun).not.toHaveBeenCalled();
  });

  it("a NON-test dispatch never even looks for a session (real runs are untouched)", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch({ isTest: false, triggeredBy: "webhook" }));

    await processQueuedRun("run-1");

    expect(mockGetConsumedSessionByRunId).not.toHaveBeenCalled();
    const input = mockRunWorkflow.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.testMode).toBe(false);
    expect(input.recordAsTest).toBeUndefined();
  });

  it("a session-lookup ERROR fails closed to the safe envelope (degraded, never dangerous)", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockRejectedValue(new Error("db unavailable"));

    await processQueuedRun("run-1");

    const input = mockRunWorkflow.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.testMode).toBe(true); // blocked handlers — never an accidental real run
    expect(input.recordAsTest).toBeUndefined();
  });
});

describe("live-test queue dispatch — session completion from the run outcome", () => {
  it.each([
    ["succeeded", true],
    ["failed", false],
  ] as const)("an engine result of %s completes the session accordingly", async (status, succeeded) => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockResolvedValue({ id: "sess-1", workflowRunId: "run-1" });
    mockRunWorkflow.mockResolvedValue({ status, steps: [] });

    await processQueuedRun("run-1");

    expect(mockCompleteSessionForRun).toHaveBeenCalledWith({ runId: "run-1", succeeded });
  });

  it("a completion failure is isolated — the drain itself never throws", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockResolvedValue({ id: "sess-1", workflowRunId: "run-1" });
    mockCompleteSessionForRun.mockRejectedValue(new Error("update failed"));

    await expect(processQueuedRun("run-1")).resolves.toBeUndefined();
  });

  it("a safe test never touches session completion", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValue(dispatch());
    mockGetConsumedSessionByRunId.mockResolvedValue(null);
    await processQueuedRun("run-1");
    expect(mockCompleteSessionForRun).not.toHaveBeenCalled();
  });
});
