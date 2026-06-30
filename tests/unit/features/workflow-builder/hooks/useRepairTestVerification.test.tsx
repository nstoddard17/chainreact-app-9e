/**
 * AGENT-CHANGE-HISTORY-1 (test-fix) — useRepairTestVerification.
 *
 * Business rules under test:
 *   - After a repair is armed, the NEXT run that reaches a terminal outcome records a `tested`
 *     (succeeded) / `test_failed` (failed) transition on the repair's history item, via the typed
 *     client — then disarms.
 *   - The ORIGINAL failed run (still terminal in the slice right after the repair) is ignored — only a
 *     genuinely new run verifies the fix.
 *   - With nothing armed (or armed for another workflow), a terminal run records nothing.
 *
 * Mocks the typed client (the UI/hook contract); drives the REAL run slice + repair-verification store.
 */

const mockRecord = jest.fn();
jest.mock("@/lib/api/agentChangeHistory", () => ({
  recordAgentChange: (...a: unknown[]) => mockRecord(...a),
  listAgentChangeHistory: jest.fn(),
}));

import { act, renderHook } from "@testing-library/react";
import { useRepairTestVerification } from "@/features/workflow-builder/hooks/useRepairTestVerification";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import { useRepairVerificationStore } from "@/features/workflow-builder/state/repairVerificationStore";

function setRun(runId: string, status: "succeeded" | "failed" | "pending"): void {
  useRunSlice.setState({ workflowId: "wf-1", runId, status, detail: null, fetchError: null, pollCount: 1 });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.mockResolvedValue({ id: "row", status: "tested" });
  useRunSlice.getState().reset();
  useRepairVerificationStore.setState({ pending: null, version: 0 });
});

describe("useRepairTestVerification", () => {
  it("records `tested` when a new run succeeds after a repair was armed, then disarms", () => {
    renderHook(() => useRepairTestVerification("wf-1", { enabled: true }));
    act(() => useRepairVerificationStore.getState().arm({ workflowId: "wf-1", agentChangeId: "ch-1", repairedRunId: "run-failed" }));
    act(() => setRun("run-verify", "succeeded"));
    expect(mockRecord).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ agentChangeId: "ch-1", status: "tested", runId: "run-verify" }),
    );
    expect(useRepairVerificationStore.getState().pending).toBeNull();
  });

  it("records `test_failed` when the verifying run fails", () => {
    renderHook(() => useRepairTestVerification("wf-1", { enabled: true }));
    act(() => useRepairVerificationStore.getState().arm({ workflowId: "wf-1", agentChangeId: "ch-2", repairedRunId: "run-failed" }));
    act(() => setRun("run-verify", "failed"));
    expect(mockRecord).toHaveBeenCalledWith(
      "wf-1",
      expect.objectContaining({ agentChangeId: "ch-2", status: "test_failed", runId: "run-verify" }),
    );
  });

  it("ignores the ORIGINAL repaired run still showing as failed (waits for the next run)", () => {
    renderHook(() => useRepairTestVerification("wf-1", { enabled: true }));
    act(() => useRepairVerificationStore.getState().arm({ workflowId: "wf-1", agentChangeId: "ch-3", repairedRunId: "run-failed" }));
    // The slice re-emits the SAME failed run that was just repaired — not a verification.
    act(() => setRun("run-failed", "failed"));
    expect(mockRecord).not.toHaveBeenCalled();
    expect(useRepairVerificationStore.getState().pending).not.toBeNull();
  });

  it("records nothing when no repair is armed", () => {
    renderHook(() => useRepairTestVerification("wf-1", { enabled: true }));
    act(() => setRun("run-verify", "succeeded"));
    expect(mockRecord).not.toHaveBeenCalled();
  });
});
