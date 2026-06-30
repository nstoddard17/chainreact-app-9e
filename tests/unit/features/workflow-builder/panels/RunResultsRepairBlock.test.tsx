/**
 * AGENT-CHANGE-HISTORY-1 (test-fix) — RunResultsRepairBlock records the repair as an applied change.
 *
 * Business rule under test: applying a failed-run repair (the deterministic AI-9B apply path) records a
 * `preview_applied` item in the Agent-changes timeline — with the value-free apply summary, the failed
 * run it addresses, and the eval-event link from the apply response — and ARMS verification so the next
 * run transitions it to tested / test_failed. Recording is fail-open and never blocks the apply UI.
 *
 * The repair-request + apply clients are mocked at the typed-client boundary; the real
 * repair-verification store is asserted.
 */

const mockRequestRepair = jest.fn();
jest.mock("@/lib/api/ai/workflowRepair", () => ({
  requestAccountWorkflowRepair: (...a: unknown[]) => mockRequestRepair(...a),
}));

const mockApply = jest.fn();
jest.mock("@/lib/api/ai", () => ({
  applyWorkflowPatch: (...a: unknown[]) => mockApply(...a),
  AiApiError: class AiApiError extends Error {},
}));

const mockRecord = jest.fn();
jest.mock("@/lib/api/agentChangeHistory", () => ({
  recordAgentChange: (...a: unknown[]) => mockRecord(...a),
  listAgentChangeHistory: jest.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunResultsRepairBlock } from "@/features/workflow-builder/panels/RunResultsRepairBlock";
import { useRepairVerificationStore } from "@/features/workflow-builder/state/repairVerificationStore";

const REPAIRABLE = {
  ok: true,
  repairability: "repairable",
  reasonCode: "MISSING_FIELD",
  recommendations: [],
  requiredUserInput: [],
  safetyNotes: [],
  proposedPatch: { __opaque: "patch" },
  preview: { validation: { ok: true }, requiresConfirmation: false, riskLevel: "low", changes: [] },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.mockResolvedValue({ id: "row-1", status: "preview_applied" });
  useRepairVerificationStore.setState({ pending: null, version: 0 });
});

describe("RunResultsRepairBlock — records the repair in the Agent-changes timeline", () => {
  it("records preview_applied with the summary + failed run + eval link, and arms verification", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValue(REPAIRABLE);
    mockApply.mockResolvedValue({
      ok: true,
      workflowId: "wf-1",
      appliedPatchId: "p1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
      updatedAt: "2026-07-16T05:00:00Z",
      summaryText: "Set the Slack channel.",
      aiCostEventId: "ce-1",
    });

    render(<RunResultsRepairBlock workflowId="wf-1" runId="run-failed" accountId="acct-1" />);

    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-apply")).toBeInTheDocument());
    await user.click(screen.getByTestId("repair-apply"));

    await waitFor(() => expect(mockRecord).toHaveBeenCalled());
    const [wf, body] = mockRecord.mock.calls[0];
    expect(wf).toBe("wf-1");
    expect(body).toMatchObject({
      status: "preview_applied",
      prompt: "Fix the failed run",
      title: "Repair applied",
      summary: "Set the Slack channel.",
      runId: "run-failed",
      aiCostEventId: "ce-1",
    });
    // Verification is armed for the NEXT run, tied to the same change id.
    await waitFor(() => {
      const pending = useRepairVerificationStore.getState().pending;
      expect(pending).toMatchObject({ workflowId: "wf-1", agentChangeId: body.agentChangeId, repairedRunId: "run-failed" });
    });
  });

  it("does not record when the apply fails (nothing applied → nothing to verify)", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValue(REPAIRABLE);
    mockApply.mockResolvedValue({ ok: false, code: "STALE_PATCH", message: "Re-preview and try again." });

    render(<RunResultsRepairBlock workflowId="wf-1" runId="run-failed" accountId="acct-1" />);
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-apply")).toBeInTheDocument());
    await user.click(screen.getByTestId("repair-apply"));

    await waitFor(() => expect(screen.getByTestId("repair-apply-error")).toBeInTheDocument());
    expect(mockRecord).not.toHaveBeenCalled();
    expect(useRepairVerificationStore.getState().pending).toBeNull();
  });
});
