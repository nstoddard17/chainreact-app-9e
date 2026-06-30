/**
 * REACT-AGENT-TEST-FIX-LOOP — useAgentRepairLoop (root watcher) + pure helpers.
 *
 * Business rules under test:
 *   - A terminal `failed` run opens ONE diagnosis thread (test_failed).
 *   - A retest success advances the SAME thread to test_passed.
 *   - A retest failure advances the SAME thread to still_failing (attempt++),
 *     never a brand-new loop.
 *   - The reveal target always carries the failing nodeId; it carries a fieldKey
 *     ONLY when a field path is proven.
 *   - A malformed run detail fails open (no throw, generic diagnosis).
 *
 * Drives the REAL run slice + graph slice + repair-loop store; mocks only the
 * typed client the run slice imports.
 */

jest.mock("@/lib/api/workflows", () => ({
  getWorkflowRun: jest.fn(),
  WorkflowApiError: class extends Error {},
}));

import { act, renderHook } from "@testing-library/react";
import type { WorkflowRunDetail } from "@/contracts/workflow";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import {
  useAgentRepairLoop,
  buildRepairReveal,
  computeRepairDiagnosis,
} from "@/features/workflow-builder/hooks/useAgentRepairLoop";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRepairLoopStore } from "@/features/workflow-builder/state/repairLoopStore";

const WF = "wf-1";
const NODE: WorkflowNode = {
  id: "a1",
  kind: "action",
  provider: "gmail",
  type: "send_email",
  config: { subject: "" },
  position: { x: 0, y: 0 },
};

function failedDetail(runId: string): WorkflowRunDetail {
  return {
    id: runId,
    workflowId: WF,
    status: "failed",
    triggerNodeId: "t1",
    startedAt: "2026-06-01T00:00:00Z",
    finishedAt: "2026-06-01T00:00:01Z",
    errorClassification: {
      title: "A field is missing",
      description: "Gmail needs a To address.",
      severity: "error",
    },
    steps: [{ nodeId: "a1", status: "failed", error: { code: "X", message: "raw" } }],
  };
}

function setRun(
  runId: string,
  status: "succeeded" | "failed" | "pending",
  detail: WorkflowRunDetail | null = null,
): void {
  useRunSlice.setState({ workflowId: WF, runId, status, detail, fetchError: null, pollCount: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  useRunSlice.getState().reset();
  useGraphSlice.setState({ pendingNodes: [NODE] });
  useRepairLoopStore.getState().reset();
});

describe("useAgentRepairLoop watcher", () => {
  it("opens ONE diagnosis thread when a test run fails", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    act(() => setRun("run-1", "failed", failedDetail("run-1")));
    const loop = useRepairLoopStore.getState().loop;
    expect(loop).toMatchObject({
      workflowId: WF,
      status: "test_failed",
      failingNodeId: "a1",
      failingNodeLabel: "Send Email",
      attemptCount: 1,
    });
    expect(loop?.safeReason).toBe("Gmail needs a To address.");
  });

  it("advances the SAME thread to test_passed when the retest succeeds", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    act(() => setRun("run-1", "failed", failedDetail("run-1")));
    act(() => setRun("run-2", "pending"));
    act(() => setRun("run-2", "succeeded", { ...failedDetail("run-2"), status: "succeeded", errorClassification: null, steps: [{ nodeId: "a1", status: "succeeded" }] }));
    expect(useRepairLoopStore.getState().loop?.status).toBe("test_passed");
  });

  it("advances the SAME thread to still_failing (attempt 2) when the retest fails again", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    act(() => setRun("run-1", "failed", failedDetail("run-1")));
    act(() => setRun("run-2", "pending"));
    act(() => setRun("run-2", "failed", failedDetail("run-2")));
    const loop = useRepairLoopStore.getState().loop;
    expect(loop?.status).toBe("still_failing");
    expect(loop?.attemptCount).toBe(2);
  });

  it("does NOT claim test_passed when a run succeeds with no prior failure thread", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    act(() => setRun("run-1", "succeeded", { ...failedDetail("run-1"), status: "succeeded", errorClassification: null, steps: [] }));
    expect(useRepairLoopStore.getState().loop).toBeNull();
  });

  it("fails open on a malformed run detail (no throw, generic diagnosis)", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    expect(() => act(() => setRun("run-1", "failed", null))).not.toThrow();
    const loop = useRepairLoopStore.getState().loop;
    expect(loop?.status).toBe("test_failed");
    expect(loop?.safeReason).toBe("This test run failed.");
    expect(loop?.failingNodeId).toBeUndefined();
  });

  it("ignores runs for a different workflow", () => {
    renderHook(() => useAgentRepairLoop(WF, { enabled: true }));
    act(() =>
      useRunSlice.setState({ workflowId: "wf-other", runId: "r", status: "failed", detail: null, fetchError: null, pollCount: 1 }),
    );
    expect(useRepairLoopStore.getState().loop).toBeNull();
  });
});

describe("computeRepairDiagnosis", () => {
  it("derives the failing node + safe reason from the classification (never raw step error)", () => {
    const d = computeRepairDiagnosis(failedDetail("run-1"), [NODE]);
    expect(d.failingNodeId).toBe("a1");
    expect(d.failingNodeLabel).toBe("Send Email");
    expect(d.safeReason).toBe("Gmail needs a To address.");
    // The raw step error message is never used as the reason.
    expect(d.safeReason).not.toContain("raw");
    expect(d.failingFieldPath).toBeUndefined();
  });

  it("falls back to a generic reason + graph-level next step when nothing is proven", () => {
    const d = computeRepairDiagnosis(null, []);
    expect(d.safeReason).toBe("This test run failed.");
    expect(d.failingNodeId).toBeUndefined();
  });
});

describe("buildRepairReveal", () => {
  it("returns the failing nodeId + its config, no fieldKey when none is proven", () => {
    const loop = { workflowId: WF, status: "test_failed" as const, failingNodeId: "a1", safeReason: "r", nextStep: "n", attemptCount: 1 };
    const reveal = buildRepairReveal(loop, [NODE]);
    expect(reveal).toEqual({ nodeId: "a1", initialValues: { subject: "" } });
    expect(reveal && "fieldKey" in reveal).toBe(false);
  });

  it("includes fieldKey ONLY when a field path is proven", () => {
    const loop = { workflowId: WF, status: "test_failed" as const, failingNodeId: "a1", failingFieldPath: "to", safeReason: "r", nextStep: "n", attemptCount: 1 };
    expect(buildRepairReveal(loop, [NODE])).toEqual({ nodeId: "a1", initialValues: { subject: "" }, fieldKey: "to" });
  });

  it("returns null when the failing node is no longer on the canvas", () => {
    const loop = { workflowId: WF, status: "test_failed" as const, failingNodeId: "gone", safeReason: "r", nextStep: "n", attemptCount: 1 };
    expect(buildRepairReveal(loop, [NODE])).toBeNull();
  });
});
