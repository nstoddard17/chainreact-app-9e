/**
 * @jest-environment node
 *
 * Tests for services/execution/runQueueProcessor.ts (Slice 6.DURABLE-QUEUE-1).
 *
 * Business rules protected:
 *   - the processor reaches the (unchanged) engine for each queued run;
 *   - the run-now inline drain is a no-op when the row is already gone/claimed;
 *   - a pre-claim fatal (engine never claimed the row) is finalized 'failed' so
 *     the cron never re-selects it forever (stuck-queued recovery);
 *   - a thrown engine run is isolated and does not abort the batch.
 *
 * Mocks are at external boundaries only: the repository (DB) and the engine
 * class (provider execution). The processor's own orchestration is exercised.
 */

const mockGetQueuedRunForDispatch = jest.fn();
const mockListQueuedWorkflowRunsForDispatch = jest.fn();
const mockFailQueuedRunIfStillQueued = jest.fn();
jest.mock("@/repositories/workflowRuns", () => ({
  getQueuedRunForDispatch: (...a: unknown[]) => mockGetQueuedRunForDispatch(...a),
  listQueuedWorkflowRunsForDispatch: (...a: unknown[]) =>
    mockListQueuedWorkflowRunsForDispatch(...a),
  failQueuedRunIfStillQueued: (...a: unknown[]) =>
    mockFailQueuedRunIfStillQueued(...a),
}));

const mockRunWorkflow = jest.fn();
jest.mock("@/services/execution/engine", () => ({
  WorkflowEngine: jest.fn(() => ({ runWorkflow: mockRunWorkflow })),
}));

jest.mock("@/workflow-engine/variables/resolveValue", () => ({
  resolveStrict: jest.fn(),
}));

jest.mock("@/core/errors/humanizeActionError", () => ({
  humanizeActionError: jest.fn(() => ({
    title: "h",
    description: "d",
    severity: "error",
  })),
}));

import {
  processQueuedRun,
  processQueuedRuns,
} from "@/services/execution/runQueueProcessor";
import type { QueuedRunDispatch } from "@/repositories/workflowRuns";

function dispatch(overrides: Partial<QueuedRunDispatch> = {}): QueuedRunDispatch {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    triggerNodeId: "t1",
    triggerEvent: {
      provider: "native",
      eventType: "manual.run",
      eventId: "ev",
      occurredAt: "2026-05-07T00:00:00Z",
      providerAccountId: "system",
      payload: { inputs: {} },
    },
    isTest: false,
    triggeredBy: "manual",
    triggeredByUserId: "user-1",
    triggeredByApiKeyId: null,
    triggeredByApiKeyPrefix: null,
    ...overrides,
  };
}

function okResult() {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    status: "succeeded",
    steps: [],
    startedAt: "a",
    finishedAt: "b",
    isTest: false,
    triggeredBy: "manual",
  };
}

beforeEach(() => {
  mockGetQueuedRunForDispatch.mockReset();
  mockListQueuedWorkflowRunsForDispatch.mockReset();
  mockFailQueuedRunIfStillQueued.mockReset();
  mockFailQueuedRunIfStillQueued.mockResolvedValue({ failed: false });
  mockRunWorkflow.mockReset();
  mockRunWorkflow.mockResolvedValue(okResult());
});

describe("processQueuedRun (run-now inline drain)", () => {
  it("runs the engine for the fetched queued run, threading its provenance", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValueOnce(
      dispatch({ runId: "run-9", isTest: false, triggeredBy: "manual" }),
    );
    await processQueuedRun("run-9");
    expect(mockRunWorkflow).toHaveBeenCalledTimes(1);
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-9",
        workflowId: "wf-1",
        triggerNodeId: "t1",
        testMode: false,
        triggeredBy: "manual",
        triggeredByUserId: "user-1",
      }),
    );
  });

  it("is a no-op when the row is already gone/claimed (returns null) — never runs the engine", async () => {
    mockGetQueuedRunForDispatch.mockResolvedValueOnce(null);
    await processQueuedRun("run-1");
    expect(mockRunWorkflow).not.toHaveBeenCalled();
  });

  it("never throws even if the repository read fails (safe to hand to after())", async () => {
    mockGetQueuedRunForDispatch.mockRejectedValueOnce(new Error("db down"));
    await expect(processQueuedRun("run-1")).resolves.toBeUndefined();
  });
});

describe("processQueuedRuns (cron batch)", () => {
  it("drains every queued run and returns counts", async () => {
    mockListQueuedWorkflowRunsForDispatch.mockResolvedValueOnce([
      dispatch({ runId: "run-1" }),
      dispatch({ runId: "run-2" }),
    ]);
    const out = await processQueuedRuns({ limit: 10 });
    expect(mockRunWorkflow).toHaveBeenCalledTimes(2);
    expect(out).toEqual({ fetched: 2, processed: 2, failed: 0 });
  });

  it("isolates a thrown engine run: the batch continues and the failure is counted", async () => {
    mockListQueuedWorkflowRunsForDispatch.mockResolvedValueOnce([
      dispatch({ runId: "run-1" }),
      dispatch({ runId: "run-2" }),
    ]);
    mockRunWorkflow
      .mockResolvedValueOnce(okResult())
      .mockRejectedValueOnce(new Error("engine exploded"));
    const out = await processQueuedRuns({ limit: 10 });
    expect(out).toEqual({ fetched: 2, processed: 1, failed: 1 });
  });

  it("finalizes a pre-claim fatal so it can never be re-selected forever (stuck-queued recovery)", async () => {
    // The engine returned a fatal BEFORE it could claim the row (workflow/trigger
    // missing): the row is still 'queued'. The processor must finalize it failed.
    mockListQueuedWorkflowRunsForDispatch.mockResolvedValueOnce([
      dispatch({ runId: "run-1" }),
    ]);
    mockRunWorkflow.mockResolvedValueOnce({
      ...okResult(),
      status: "failed",
      fatalError: { code: "WORKFLOW_NOT_FOUND", message: "gone" },
    });
    await processQueuedRuns({ limit: 10 });
    expect(mockFailQueuedRunIfStillQueued).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        fatalError: { code: "WORKFLOW_NOT_FOUND", message: "gone" },
      }),
    );
  });

  it("does NOT touch the row for a normal failed run (engine claimed + finalized it itself)", async () => {
    // A run the engine claimed and finalized as 'failed' is already terminal;
    // failQueuedRunIfStillQueued is a no-op (status no longer 'queued'). We still
    // call it (cheap, idempotent guard), but the row is NOT re-finalized here.
    mockListQueuedWorkflowRunsForDispatch.mockResolvedValueOnce([
      dispatch({ runId: "run-1" }),
    ]);
    mockRunWorkflow.mockResolvedValueOnce({
      ...okResult(),
      status: "failed",
      fatalError: { code: "HANDLER_FAILED", message: "boom" },
    });
    mockFailQueuedRunIfStillQueued.mockResolvedValueOnce({ failed: false });
    const out = await processQueuedRuns({ limit: 10 });
    // The guard ran but reported no-op; the run is still counted as processed.
    expect(out).toEqual({ fetched: 1, processed: 1, failed: 0 });
  });
});
