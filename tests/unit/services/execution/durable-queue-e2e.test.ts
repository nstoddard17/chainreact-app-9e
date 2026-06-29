/**
 * @jest-environment node
 *
 * End-to-end durable-queue pipeline: manual run -> durable 'queued' row -> worker
 * claims+drains -> engine reaches a terminal result (DURABLE-QUEUE-1).
 *
 * Stitches the two real services (enqueueRun + processQueuedRuns) with the DB and
 * the engine mocked at their boundaries. Proves: enqueue persists a durable queued
 * row (not in-process work) carrying the manual provenance, and the worker hands
 * THAT enqueued run to the engine — i.e. a queued run actually reaches execution.
 */
let queuedRow: Record<string, unknown> | null = null;

const mockCreateQueued = jest.fn(async (...args: unknown[]) => {
  queuedRow = args[0] as Record<string, unknown>;
  return { created: true };
});
const mockListQueued = jest.fn(async (..._args: unknown[]) =>
  queuedRow
    ? [
        {
          runId: queuedRow.runId,
          workflowId: queuedRow.workflowId,
          triggerNodeId: queuedRow.triggerNodeId,
          triggerEvent: queuedRow.triggerEvent,
          isTest: queuedRow.isTest,
          triggeredBy: queuedRow.triggeredBy,
          triggeredByUserId: queuedRow.triggeredByUserId,
          triggeredByApiKeyId: null,
          triggeredByApiKeyPrefix: null,
        },
      ]
    : [],
);
const mockFailQueued = jest.fn(async (..._args: unknown[]) => ({ failed: false }));

jest.mock("@/repositories/workflowRuns", () => ({
  createQueuedWorkflowRun: (...a: unknown[]) => mockCreateQueued(...a),
  listQueuedWorkflowRunsForDispatch: (...a: unknown[]) => mockListQueued(...a),
  failQueuedRunIfStillQueued: (...a: unknown[]) => mockFailQueued(...a),
  getQueuedRunForDispatch: jest.fn(),
}));
jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: jest.fn(async () => ({ accountId: "acct-1" })),
}));

const mockRunWorkflow = jest.fn(async () => ({ status: "succeeded", fatalError: null }));
jest.mock("@/services/execution/engine", () => ({
  WorkflowEngine: jest.fn(() => ({ runWorkflow: mockRunWorkflow })),
}));
jest.mock("@/workflow-engine/variables/resolveValue", () => ({ resolveStrict: jest.fn() }));
jest.mock("@/core/errors/humanizeActionError", () => ({
  humanizeActionError: jest.fn(() => ({ title: "h", description: "d", severity: "error" })),
}));

import { enqueueRun } from "@/services/execution/enqueue";
import { processQueuedRuns } from "@/services/execution/runQueueProcessor";

const MANUAL_EVENT = {
  provider: "native",
  eventType: "manual.run",
  eventId: "ev-1",
  occurredAt: "2026-06-29T00:00:00.000Z",
  providerAccountId: "system",
  payload: { inputs: {} },
} as const;

beforeEach(() => {
  queuedRow = null;
  mockCreateQueued.mockClear();
  mockRunWorkflow.mockClear();
  mockFailQueued.mockClear();
  jest.spyOn(console, "info").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("durable-queue end-to-end (manual run -> queued -> worker -> terminal)", () => {
  it("enqueues a durable queued row, then the worker drains it to the engine", async () => {
    // 1) manual run enqueues a DURABLE queued row (no inline engine execution).
    const { runId } = await enqueueRun({
      workflowId: "wf-1",
      triggerNodeId: "t1",
      event: MANUAL_EVENT,
      accountId: "acct-1",
      triggeredBy: "manual",
      triggeredByUserId: "user-1",
    });
    expect(mockCreateQueued).toHaveBeenCalledWith(
      expect.objectContaining({ runId, workflowId: "wf-1", accountId: "acct-1", triggeredBy: "manual", isTest: false }),
    );
    // enqueue does NOT run the engine inline — the row is durable, drained out of band.
    expect(mockRunWorkflow).not.toHaveBeenCalled();

    // 2) the worker (cron path) claims + executes the SAME enqueued run.
    const outcome = await processQueuedRuns({ limit: 10 });
    expect(outcome.fetched).toBe(1);
    expect(outcome.processed).toBe(1);
    expect(mockRunWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ runId, workflowId: "wf-1", triggeredBy: "manual", triggeredByUserId: "user-1" }),
    );
    // engine reached a terminal (succeeded) result → no pre-claim fatal finalize.
    expect(mockFailQueued).not.toHaveBeenCalled();
  });
});
