/**
 * Tests for features/workflow-builder/panels/RunResultsPanel.tsx.
 *
 * Reads directly from the slice (no mock) so the render-vs-state
 * mapping is exercised end-to-end.
 */
const mockRequestRepair = jest.fn();
const mockApplyPatch = jest.fn();
jest.mock("@/lib/api/ai", () => {
  const actual = jest.requireActual("@/lib/api/ai");
  return {
    ...actual,
    requestWorkflowRepair: (...a: unknown[]) => mockRequestRepair(...a),
    applyWorkflowPatch: (...a: unknown[]) => mockApplyPatch(...a),
  };
});

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunResultsPanel } from "@/features/workflow-builder/panels/RunResultsPanel";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type { WorkflowRunDetail } from "@/contracts/workflow";

const succeededDetail: WorkflowRunDetail = {
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
    providerAccountId: "system",
    payload: { inputs: {} },
  },
  steps: [
    { nodeId: "t1", status: "succeeded", output: { event: "fired" } },
    {
      nodeId: "a1",
      status: "succeeded",
      output: { channel: "C123", text: "hi" },
    },
  ],
  fatalError: null,
};

beforeEach(() => {
  useRunSlice.getState().reset();
  mockRequestRepair.mockReset();
  mockApplyPatch.mockReset();
});

describe("RunResultsPanel", () => {
  it("renders the idle state when no run is being tracked", () => {
    render(<RunResultsPanel />);
    expect(screen.getByTestId("latest-run-idle")).toBeInTheDocument();
  });

  it("renders the pending state after startTracking with no detail yet", () => {
    useRunSlice
      .getState()
      .startTracking({ workflowId: "wf-1", runId: "run-1" });
    render(<RunResultsPanel />);
    expect(screen.getByTestId("latest-run-pending")).toBeInTheDocument();
    expect(screen.getByTestId("run-id")).toHaveTextContent("run-1");
  });

  it("renders step pills + per-step View Output toggle on success", async () => {
    const user = userEvent.setup();
    useRunSlice
      .getState()
      .startTracking({ workflowId: succeededDetail.workflowId, runId: succeededDetail.id });
    useRunSlice.setState({ status: "succeeded", detail: succeededDetail });
    render(<RunResultsPanel />);
    // Both steps appear with success pills.
    const t1 = screen.getByTestId(`step-${"t1"}`);
    const a1 = screen.getByTestId(`step-${"a1"}`);
    expect(t1).toHaveAttribute("data-status", "succeeded");
    expect(a1).toHaveAttribute("data-status", "succeeded");
    // Output is initially hidden.
    expect(screen.queryByTestId(`step-a1-output`)).not.toBeInTheDocument();
    // Clicking the toggle reveals it.
    await user.click(screen.getByTestId(`step-a1-toggle`));
    const out = screen.getByTestId(`step-a1-output`);
    expect(out.textContent).toContain('"channel"');
    expect(out.textContent).toContain("C123");
  });

  it("surfaces fatalError + errorClassification on a failed run", () => {
    const failedDetail: WorkflowRunDetail = {
      ...succeededDetail,
      status: "failed",
      fatalError: { code: "HANDLER_FAILED", message: "Slack call timed out" },
      errorClassification: {
        title: "Slack call timed out",
        description: "Slack didn't respond in time.",
        hint: "Retry the run.",
        action: "open_node",
        severity: "error",
      },
      steps: [
        {
          nodeId: "a1",
          status: "failed",
          error: { code: "HANDLER_FAILED", message: "Slack call timed out" },
        },
      ],
    };
    useRunSlice
      .getState()
      .startTracking({ workflowId: failedDetail.workflowId, runId: failedDetail.id });
    useRunSlice.setState({ status: "failed", detail: failedDetail });
    render(<RunResultsPanel />);
    expect(screen.getByTestId("run-fatal-error")).toHaveTextContent("HANDLER_FAILED");
    expect(screen.getByTestId("run-error-classification")).toHaveTextContent(
      "Slack call timed out",
    );
    const a1 = screen.getByTestId(`step-a1`);
    expect(a1).toHaveAttribute("data-status", "failed");
    expect(a1).toHaveTextContent("HANDLER_FAILED");
  });

  it("renders the lost state after the poll-count ceiling", () => {
    useRunSlice
      .getState()
      .startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ status: "lost", pollCount: 60 });
    render(<RunResultsPanel />);
    expect(screen.getByTestId("latest-run-lost")).toBeInTheDocument();
  });

  it("renders a fetch error in the header when polling encounters a transient blip", () => {
    useRunSlice
      .getState()
      .startTracking({ workflowId: "wf-1", runId: "run-1" });
    useRunSlice.setState({ fetchError: "server down" });
    render(<RunResultsPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("server down");
    // Still in pending body, not crashed.
    expect(screen.getByTestId("latest-run-pending")).toBeInTheDocument();
  });
});

describe("RepairBlock (AI-13)", () => {
  const failedDetail: WorkflowRunDetail = {
    id: "44444444-4444-4444-4444-444444444444",
    workflowId: "33333333-3333-3333-3333-333333333333",
    status: "failed",
    triggerNodeId: "t1",
    startedAt: "2026-05-25T00:00:00Z",
    finishedAt: "2026-05-25T00:00:01Z",
    errorClassification: {
      title: "A field is missing",
      description: "userId is required.",
      severity: "error",
    },
    triggerEvent: {
      provider: "native",
      eventType: "manual.run",
      eventId: "ev1",
      occurredAt: "2026-05-25T00:00:00Z",
      providerAccountId: "system",
      payload: { inputs: {} },
    },
    steps: [
      { nodeId: "n-slack", status: "failed", error: { code: "MISSING_REQUIRED_FIELD", message: "userId required" } },
    ],
    fatalError: null,
  };

  function mountFailed() {
    useRunSlice
      .getState()
      .startTracking({ workflowId: failedDetail.workflowId, runId: failedDetail.id });
    useRunSlice.setState({ status: "failed", detail: failedDetail });
    return render(<RunResultsPanel />);
  }

  it("is not rendered on a succeeded run", () => {
    useRunSlice
      .getState()
      .startTracking({ workflowId: succeededDetail.workflowId, runId: succeededDetail.id });
    useRunSlice.setState({ status: "succeeded", detail: succeededDetail });
    render(<RunResultsPanel />);
    expect(screen.queryByTestId("repair-block")).not.toBeInTheDocument();
    expect(screen.queryByTestId("repair-ask")).not.toBeInTheDocument();
  });

  it("renders the Ask button only when the run failed", () => {
    mountFailed();
    expect(screen.getByTestId("repair-block")).toBeInTheDocument();
    expect(screen.getByTestId("repair-ask")).toBeInTheDocument();
  });

  it("does not auto-call the repair route on mount — only after the user clicks Ask", () => {
    mountFailed();
    expect(mockRequestRepair).not.toHaveBeenCalled();
  });

  it("clicking Ask calls the repair route with the failed run's ids and shows the loading state", async () => {
    const user = userEvent.setup();
    let resolveRepair: (v: unknown) => void = () => {};
    mockRequestRepair.mockReturnValueOnce(
      new Promise((res) => {
        resolveRepair = res;
      }),
    );
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    expect(mockRequestRepair).toHaveBeenCalledWith(failedDetail.workflowId, failedDetail.id);
    expect(screen.getByTestId("repair-loading")).toBeInTheDocument();
    // Resolve so React can finalize state changes (avoids act warnings).
    resolveRepair({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      requiredUserInput: [],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    await waitFor(() => expect(screen.queryByTestId("repair-loading")).not.toBeInTheDocument());
  });

  it("renders requiredUserInput labels when the service asks for input (no proposedPatch)", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      requiredUserInput: [
        { nodeId: "n-slack", field: "userId", label: "Which Slack user should receive the DM?", kind: "config_value" },
      ],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-required-input")).toBeInTheDocument());
    expect(screen.getByTestId("repair-required-input")).toHaveTextContent("Which Slack user should receive the DM?");
    expect(screen.queryByTestId("repair-apply")).not.toBeInTheDocument();
  });

  it("renders unsupported / no-safe-repair as recommendations only (no Apply button)", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "noSafeRepair",
      reasonCode: "DISCONNECTED_INTEGRATION",
      requiredUserInput: [],
      recommendations: ["Reconnect your Slack integration."],
      confidence: "high",
      safetyNotes: [],
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-recommendations")).toBeInTheDocument());
    expect(screen.getByTestId("repair-recommendations")).toHaveTextContent("Reconnect your Slack integration.");
    expect(screen.queryByTestId("repair-apply")).not.toBeInTheDocument();
  });

  it("renders an Apply button when a previewed patch is available", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "repairable",
      reasonCode: "MISSING_REQUIRED_FIELD",
      proposedPatch: { patchId: "repair:1", workflowId: "wf", baseRevision: "rev", operations: [], summary: "s", rationale: "r" },
      preview: {
        ok: true,
        riskLevel: "low",
        requiresConfirmation: false,
        validation: { ok: true, errors: [], warnings: [] },
        changes: [{ op: "updateNodeConfig", description: "Set userId on n-slack" }],
      },
      requiredUserInput: [],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-apply")).toBeInTheDocument());
    expect(screen.getByTestId("repair-preview-changes")).toHaveTextContent("Set userId on n-slack");
  });

  it("does not auto-apply — Apply is a separate explicit click that calls the existing apply route", async () => {
    const user = userEvent.setup();
    const opaquePatch = { patchId: "repair:1", workflowId: "wf", baseRevision: "rev", operations: [], summary: "s", rationale: "r" };
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "repairable",
      reasonCode: "MISSING_REQUIRED_FIELD",
      proposedPatch: opaquePatch,
      preview: {
        ok: true,
        riskLevel: "low",
        requiresConfirmation: false,
        validation: { ok: true, errors: [], warnings: [] },
        changes: [],
      },
      requiredUserInput: [],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    mockApplyPatch.mockResolvedValueOnce({
      ok: true,
      workflowId: "wf",
      appliedPatchId: "repair:1",
      appliedOperationCount: 1,
      riskLevel: "low",
      requiresConfirmation: false,
      updatedAt: "t",
      summaryText: "Applied",
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-apply")).toBeInTheDocument());
    // Confirms no auto-apply during the ask flow.
    expect(mockApplyPatch).not.toHaveBeenCalled();
    // Explicit user click → existing apply route is called with the opaque patch.
    await user.click(screen.getByTestId("repair-apply"));
    expect(mockApplyPatch).toHaveBeenCalledWith(failedDetail.workflowId, expect.objectContaining({ patch: opaquePatch }));
    await waitFor(() => expect(screen.getByTestId("repair-applied")).toBeInTheDocument());
  });

  it("passes confirmation through the existing apply route when the preview marks the patch high-risk", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {},
      repairability: "repairable",
      reasonCode: "INVALID_EDGE",
      proposedPatch: { patchId: "repair:2", workflowId: "wf", baseRevision: "rev", operations: [], summary: "s", rationale: "r" },
      preview: {
        ok: true,
        riskLevel: "high",
        requiresConfirmation: true,
        validation: { ok: true, errors: [], warnings: [] },
        changes: [],
      },
      requiredUserInput: [],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    mockApplyPatch.mockResolvedValueOnce({
      ok: true,
      workflowId: "wf",
      appliedPatchId: "repair:2",
      appliedOperationCount: 1,
      riskLevel: "high",
      requiresConfirmation: true,
      updatedAt: "t",
      summaryText: "Applied",
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-apply")).toBeInTheDocument());
    expect(screen.getByTestId("repair-apply")).toHaveTextContent(/confirm high/);
    await user.click(screen.getByTestId("repair-apply"));
    expect(mockApplyPatch).toHaveBeenCalledWith(
      failedDetail.workflowId,
      expect.objectContaining({
        confirmation: expect.objectContaining({ confirmed: true, acceptedRiskLevel: "high" }),
      }),
    );
  });

  it("renders an error message when the repair fetch throws (transport failure)", async () => {
    const user = userEvent.setup();
    const { AiApiError } = jest.requireActual("@/lib/api/ai");
    mockRequestRepair.mockRejectedValueOnce(new AiApiError("Workflow run not found.", 404));
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() => expect(screen.getByTestId("repair-error")).toBeInTheDocument());
    expect(screen.getByTestId("repair-error")).toHaveTextContent("Workflow run not found.");
  });

  it("renders the value-free reason code, NOT the raw error details", async () => {
    const user = userEvent.setup();
    mockRequestRepair.mockResolvedValueOnce({
      ok: true,
      workflowId: failedDetail.workflowId,
      workflowRunId: failedDetail.id,
      failureSummary: {
        failed: true,
        status: "failed",
        isTest: false,
        failedNodeId: "n-slack",
        errorCode: "MISSING_REQUIRED_FIELD",
        classification: null,
      },
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      requiredUserInput: [],
      recommendations: [],
      confidence: "medium",
      safetyNotes: [],
    });
    mountFailed();
    await user.click(screen.getByTestId("repair-ask"));
    await waitFor(() =>
      expect(screen.getByTestId("repair-reason-code")).toHaveAttribute(
        "data-reason-code",
        "MISSING_REQUIRED_FIELD",
      ),
    );
    // No raw error_details / config values surfaced in the block.
    expect(screen.getByTestId("repair-block").textContent).not.toMatch(/connection-string|password|token/i);
  });
});
