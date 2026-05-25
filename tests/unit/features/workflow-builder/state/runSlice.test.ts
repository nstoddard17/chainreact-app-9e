/**
 * @jest-environment node
 *
 * Tests for features/workflow-builder/state/runSlice.ts.
 *
 * The slice owns latest-run state + the `pollOnce()` action. The
 * interval timer itself lives in `useLatestRunPolling`; this test
 * file only exercises pure state transitions plus the typed-client
 * call surface.
 */

const mockGetWorkflowRun = jest.fn();
const mockApiError = jest.fn();
class FakeWorkflowApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "WorkflowApiError";
    this.code = code;
    this.status = status;
  }
}
jest.mock("@/lib/api/workflows", () => ({
  getWorkflowRun: (...args: unknown[]) => mockGetWorkflowRun(...args),
  WorkflowApiError: FakeWorkflowApiError,
}));

import {
  POLL_COUNT_CEILING,
  useRunSlice,
} from "@/features/workflow-builder/state/runSlice";
import type { WorkflowRunDetail } from "@/contracts/workflow";

const SAMPLE: WorkflowRunDetail = {
  id: "44444444-4444-4444-4444-444444444444",
  workflowId: "33333333-3333-3333-3333-333333333333",
  status: "succeeded",
  triggerNodeId: "t1",
  startedAt: "2026-05-17T00:00:00Z",
  finishedAt: "2026-05-17T00:00:01Z",
  errorClassification: null,
  triggerEvent: {
    provider: "native",
    eventType: "manual.run",
    eventId: "ev1",
    occurredAt: "2026-05-17T00:00:00Z",
    accountId: "system",
    payload: { inputs: {} },
  },
  steps: [{ nodeId: "t1", status: "succeeded", output: {} }],
  fatalError: null,
};

beforeEach(() => {
  mockGetWorkflowRun.mockReset();
  mockApiError.mockReset();
  useRunSlice.getState().reset();
});

describe("runSlice.startTracking", () => {
  it("sets pending status with fresh state", () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    const s = useRunSlice.getState();
    expect(s.workflowId).toBe("wf-1");
    expect(s.runId).toBe("run-1");
    expect(s.status).toBe("pending");
    expect(s.pollCount).toBe(0);
    expect(s.detail).toBeNull();
    expect(s.fetchError).toBeNull();
  });

  it("is a no-op when called twice for the same (workflowId, runId)", () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ pollCount: 5 });
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    expect(useRunSlice.getState().pollCount).toBe(5);
  });

  it("resets state when starting a different run", () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ pollCount: 5, detail: SAMPLE, status: "succeeded" });
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-2" });
    const s = useRunSlice.getState();
    expect(s.runId).toBe("run-2");
    expect(s.pollCount).toBe(0);
    expect(s.detail).toBeNull();
    expect(s.status).toBe("pending");
  });
});

describe("runSlice.reset", () => {
  it("clears all latest-run state", () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ detail: SAMPLE, pollCount: 7, status: "succeeded" });
    useRunSlice.getState().reset();
    const s = useRunSlice.getState();
    expect(s.workflowId).toBeNull();
    expect(s.runId).toBeNull();
    expect(s.status).toBe("idle");
    expect(s.pollCount).toBe(0);
    expect(s.detail).toBeNull();
  });
});

describe("runSlice.pollOnce", () => {
  it("no-ops when no run is being tracked", async () => {
    await useRunSlice.getState().pollOnce();
    expect(mockGetWorkflowRun).not.toHaveBeenCalled();
  });

  it("no-ops on terminal status", async () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ status: "succeeded" });
    await useRunSlice.getState().pollOnce();
    expect(mockGetWorkflowRun).not.toHaveBeenCalled();
  });

  it("writes detail + flips to succeeded on a 200", async () => {
    mockGetWorkflowRun.mockResolvedValueOnce(SAMPLE);
    useRunSlice.getState().startTracking({ workflowId: SAMPLE.workflowId, runId: SAMPLE.id });
    await useRunSlice.getState().pollOnce();
    const s = useRunSlice.getState();
    expect(s.status).toBe("succeeded");
    expect(s.detail).toEqual(SAMPLE);
    expect(s.pollCount).toBe(1);
  });

  it("flips to failed when detail.status === failed", async () => {
    mockGetWorkflowRun.mockResolvedValueOnce({ ...SAMPLE, status: "failed" });
    useRunSlice.getState().startTracking({ workflowId: SAMPLE.workflowId, runId: SAMPLE.id });
    await useRunSlice.getState().pollOnce();
    expect(useRunSlice.getState().status).toBe("failed");
  });

  it("bumps pollCount + stays pending on a 404 (engine hasn't written the row yet)", async () => {
    mockGetWorkflowRun.mockRejectedValueOnce(
      new FakeWorkflowApiError("Run not found.", "WORKFLOW_NOT_FOUND", 404),
    );
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    await useRunSlice.getState().pollOnce();
    const s = useRunSlice.getState();
    expect(s.status).toBe("pending");
    expect(s.pollCount).toBe(1);
    expect(s.fetchError).toBeNull();
  });

  it("records fetchError on non-404 errors but stays pending", async () => {
    mockGetWorkflowRun.mockRejectedValueOnce(
      new FakeWorkflowApiError("server down", "SERVER_ERROR", 500),
    );
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    await useRunSlice.getState().pollOnce();
    const s = useRunSlice.getState();
    expect(s.status).toBe("pending");
    expect(s.fetchError).toBe("server down");
    expect(s.pollCount).toBe(1);
  });

  it("does not overwrite state when the runId changes mid-fetch", async () => {
    let resolveFetch: (v: WorkflowRunDetail) => void = () => undefined;
    mockGetWorkflowRun.mockReturnValueOnce(
      new Promise<WorkflowRunDetail>((res) => {
        resolveFetch = res;
      }),
    );
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    const pollPromise = useRunSlice.getState().pollOnce();
    // Mid-flight: user starts a new run.
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-2" });
    resolveFetch({ ...SAMPLE, id: "old-id" });
    await pollPromise;
    const s = useRunSlice.getState();
    expect(s.runId).toBe("run-2");
    expect(s.detail).toBeNull(); // stale fetch did not overwrite.
    expect(s.status).toBe("pending");
  });

  it("flips to lost after the poll-count ceiling on persistent 404s", async () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    // Pretend we've already polled ceiling-1 times.
    useRunSlice.setState({ pollCount: POLL_COUNT_CEILING - 1 });
    mockGetWorkflowRun.mockRejectedValueOnce(
      new FakeWorkflowApiError("Run not found.", "WORKFLOW_NOT_FOUND", 404),
    );
    await useRunSlice.getState().pollOnce();
    const s = useRunSlice.getState();
    expect(s.status).toBe("lost");
    expect(s.pollCount).toBe(POLL_COUNT_CEILING);
  });

  it("refuses to poll past the ceiling", async () => {
    useRunSlice.getState().startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ pollCount: POLL_COUNT_CEILING });
    await useRunSlice.getState().pollOnce();
    expect(mockGetWorkflowRun).not.toHaveBeenCalled();
    expect(useRunSlice.getState().status).toBe("lost");
  });
});
