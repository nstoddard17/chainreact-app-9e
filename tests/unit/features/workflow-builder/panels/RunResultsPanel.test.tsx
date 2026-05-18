/**
 * Tests for features/workflow-builder/panels/RunResultsPanel.tsx.
 *
 * Reads directly from the slice (no mock) so the render-vs-state
 * mapping is exercised end-to-end.
 */
import { render, screen } from "@testing-library/react";
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
    accountId: "system",
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
