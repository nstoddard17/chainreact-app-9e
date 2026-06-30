/**
 * @jest-environment node
 *
 * REACT-AGENT-TEST-FIX-LOOP — tests for the guided repair-loop store.
 *
 * Pure state transitions only (no React, no slices, no network). The store owns
 * the single active "test → fix → retest" thread; the root watcher
 * (`useAgentRepairLoop`) drives it and the panel reads it.
 */

import {
  useRepairLoopStore,
  type AgentRepairDiagnosis,
} from "@/features/workflow-builder/state/repairLoopStore";

const DIAGNOSIS: AgentRepairDiagnosis = {
  failingNodeId: "a1",
  failingNodeLabel: "Send Email",
  safeReason: "Gmail rejected the message.",
  nextStep: "Open the failing step, review its configuration, then retest.",
};

beforeEach(() => {
  useRepairLoopStore.getState().reset();
});

describe("repairLoopStore", () => {
  it("starts idle with no loop", () => {
    expect(useRepairLoopStore.getState().loop).toBeNull();
  });

  it("recordFailure starts a fresh thread (test_failed, attempt 1)", () => {
    useRepairLoopStore
      .getState()
      .recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    const loop = useRepairLoopStore.getState().loop;
    expect(loop).toMatchObject({
      workflowId: "wf-1",
      runId: "run-1",
      status: "test_failed",
      failingNodeId: "a1",
      failingNodeLabel: "Send Email",
      safeReason: "Gmail rejected the message.",
      attemptCount: 1,
    });
  });

  it("transitions test_failed → field_opened", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markFieldOpened({ workflowId: "wf-1" });
    expect(useRepairLoopStore.getState().loop?.status).toBe("field_opened");
  });

  it("markRetesting moves an active thread to retesting with the new runId", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markRetesting({ workflowId: "wf-1", runId: "run-2" });
    const loop = useRepairLoopStore.getState().loop;
    expect(loop?.status).toBe("retesting");
    expect(loop?.runId).toBe("run-2");
  });

  it("recordPass moves an active thread to test_passed", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markRetesting({ workflowId: "wf-1", runId: "run-2" });
    store.recordPass({ workflowId: "wf-1", runId: "run-2" });
    expect(useRepairLoopStore.getState().loop?.status).toBe("test_passed");
  });

  it("recordPass is ignored when no thread is active (no spurious 'ready')", () => {
    useRepairLoopStore.getState().recordPass({ workflowId: "wf-1", runId: "run-1" });
    expect(useRepairLoopStore.getState().loop).toBeNull();
  });

  it("a second failure CONTINUES the same thread as still_failing and increments attemptCount", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markRetesting({ workflowId: "wf-1", runId: "run-2" });
    store.recordFailure({
      workflowId: "wf-1",
      runId: "run-2",
      diagnosis: { ...DIAGNOSIS, failingFieldLabel: "Subject", safeReason: "Subject is missing." },
    });
    const loop = useRepairLoopStore.getState().loop;
    expect(loop?.status).toBe("still_failing");
    expect(loop?.attemptCount).toBe(2);
    expect(loop?.safeReason).toBe("Subject is missing.");
  });

  it("a failure for a DIFFERENT workflow starts a brand-new thread (attempt 1)", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.recordFailure({ workflowId: "wf-2", runId: "run-9", diagnosis: DIAGNOSIS });
    const loop = useRepairLoopStore.getState().loop;
    expect(loop?.workflowId).toBe("wf-2");
    expect(loop?.status).toBe("test_failed");
    expect(loop?.attemptCount).toBe(1);
  });

  it("markRetestFailedToStart flags the active thread", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markRetestFailedToStart({ workflowId: "wf-1" });
    expect(useRepairLoopStore.getState().loop?.status).toBe("retest_failed_to_start");
  });

  it("reset clears the workflow loop", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.reset();
    expect(useRepairLoopStore.getState().loop).toBeNull();
  });

  it("transitions targeting a different workflow id are ignored", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: "wf-1", runId: "run-1", diagnosis: DIAGNOSIS });
    store.markFieldOpened({ workflowId: "wf-other" });
    store.recordPass({ workflowId: "wf-other" });
    expect(useRepairLoopStore.getState().loop?.status).toBe("test_failed");
  });
});
