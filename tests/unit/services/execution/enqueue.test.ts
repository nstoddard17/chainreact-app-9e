/**
 * @jest-environment node
 *
 * Tests for services/execution/enqueue.ts — the durable-queue boundary
 * (Slice 6.DURABLE-QUEUE-1).
 *
 * Business rule (docs/rules/webhook-receipt-routes.md §"Async dispatch only" +
 * the durable-queue design): enqueueRun PERSISTS a 'queued' workflow_runs row
 * and returns; it does NOT execute the engine inline. The run survives a
 * serverless/request termination because it is a committed row, not an in-flight
 * promise. The processor (cron + run-now inline drain) executes it out of band.
 */

const mockCreateQueuedWorkflowRun = jest.fn();
const mockGetByIdServiceRole = jest.fn();

jest.mock("@/repositories/workflowRuns", () => ({
  createQueuedWorkflowRun: (...args: unknown[]) =>
    mockCreateQueuedWorkflowRun(...args),
}));

jest.mock("@/repositories/workflows", () => ({
  getByIdServiceRole: (...args: unknown[]) => mockGetByIdServiceRole(...args),
}));

// The engine must NEVER be constructed/called by enqueueRun. We spy on the
// constructor so the test fails loudly if enqueue regresses to inline execution.
const mockEngineCtor = jest.fn();
jest.mock("@/services/execution/engine", () => ({
  WorkflowEngine: jest.fn(() => {
    mockEngineCtor();
    return { runWorkflow: jest.fn() };
  }),
}));

import { enqueueRun } from "@/services/execution/enqueue";
import type { TriggerEvent } from "@/contracts/triggerEvent";

const triggerEvent: TriggerEvent = {
  provider: "slack",
  eventType: "message",
  eventId: "Ev1",
  occurredAt: "2026-05-07T00:00:00Z",
  providerAccountId: "T0001",
  payload: { text: "hi" },
};

beforeEach(() => {
  mockCreateQueuedWorkflowRun.mockReset();
  mockGetByIdServiceRole.mockReset();
  mockEngineCtor.mockReset();
  mockCreateQueuedWorkflowRun.mockResolvedValue({ created: true });
});

describe("enqueueRun — durable queue persistence", () => {
  it("persists a durable 'queued' run row and returns { runId, enqueuedAt }", async () => {
    const result = await enqueueRun({
      workflowId: "wf-1",
      accountId: "acct-1",
      triggerNodeId: "t1",
      event: triggerEvent,
      testMode: false,
      triggeredBy: "manual",
      triggeredByUserId: "user-1",
    });

    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(typeof result.enqueuedAt).toBe("string");
    expect(mockCreateQueuedWorkflowRun).toHaveBeenCalledTimes(1);
    expect(mockCreateQueuedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: result.runId,
        workflowId: "wf-1",
        accountId: "acct-1",
        triggerNodeId: "t1",
        triggerEvent,
        isTest: false,
        triggeredBy: "manual",
        triggeredByUserId: "user-1",
      }),
    );
  });

  it("does NOT execute the engine inline (durability: no in-flight promise to lose)", async () => {
    await enqueueRun({
      workflowId: "wf-1",
      accountId: "acct-1",
      triggerNodeId: "t1",
      event: triggerEvent,
    });
    // Let any stray microtask flush.
    await new Promise((r) => setImmediate(r));
    expect(mockEngineCtor).not.toHaveBeenCalled();
  });

  it("resolves the owning account from the workflow when the caller omits accountId", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce({ accountId: "acct-resolved" });

    await enqueueRun({
      workflowId: "wf-2",
      triggerNodeId: "t1",
      event: triggerEvent,
    });

    expect(mockGetByIdServiceRole).toHaveBeenCalledWith("wf-2");
    expect(mockCreateQueuedWorkflowRun).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct-resolved" }),
    );
  });

  it("does NOT re-load the workflow when the caller supplies accountId", async () => {
    await enqueueRun({
      workflowId: "wf-1",
      accountId: "acct-1",
      triggerNodeId: "t1",
      event: triggerEvent,
    });
    expect(mockGetByIdServiceRole).not.toHaveBeenCalled();
  });

  it("fail-open: a persist error never throws into the caller's 200/202 path", async () => {
    mockCreateQueuedWorkflowRun.mockRejectedValueOnce(new Error("db down"));
    const result = await enqueueRun({
      workflowId: "wf-1",
      accountId: "acct-1",
      triggerNodeId: "t1",
      event: triggerEvent,
    });
    expect(result.runId).toBeTruthy();
  });

  it("does not enqueue when the workflow cannot be resolved (no account) — no crash", async () => {
    mockGetByIdServiceRole.mockResolvedValueOnce(null);
    const result = await enqueueRun({
      workflowId: "missing",
      triggerNodeId: "t1",
      event: triggerEvent,
    });
    expect(result.runId).toBeTruthy();
    expect(mockCreateQueuedWorkflowRun).not.toHaveBeenCalled();
  });
});
