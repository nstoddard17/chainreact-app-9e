/**
 * Tests for features/workflow-builder/canvas/RunsPanel — Slice 4.BUILDER-RUNS-TAB-1.
 *
 * The Runs tab is this workflow's execution-history + run-detail/debugging
 * surface. It reuses existing surfaces only (no new backend route):
 *   - listWorkflowRuns / getWorkflowRun (membership-gated + sanitized server-side)
 *   - runSlice (the latest-run poller) for the live "Running" row
 *   - configSlice.revealNode for "Open failed step"
 *   - useRunControls().handleTestWorkflow for a SAFE "Run again" (test mode)
 *
 * These tests prove the 13-point contract from the slice brief: workflow
 * scoping, empty state, default selection, selection → detail, failed-step +
 * humanized error, NO raw payload/secret rendering, Open-failed-step wiring +
 * safe fallback, Run-again reuse + no draft mutation, Running status, and
 * Refresh-without-graph-mutation.
 */

const mockListWorkflowRuns = jest.fn();
const mockGetWorkflowRun = jest.fn();
const mockRunNowWorkflow = jest.fn();
const mockUpdateWorkflow = jest.fn();
const mockActivateWorkflow = jest.fn();
const mockPublishWorkflow = jest.fn();

jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    listWorkflowRuns: (...args: unknown[]) => mockListWorkflowRuns(...args),
    getWorkflowRun: (...args: unknown[]) => mockGetWorkflowRun(...args),
    runNowWorkflow: (...args: unknown[]) => mockRunNowWorkflow(...args),
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    activateWorkflow: (...args: unknown[]) => mockActivateWorkflow(...args),
    publishWorkflow: (...args: unknown[]) => mockPublishWorkflow(...args),
  };
});

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunsPanel } from "@/features/workflow-builder/canvas/RunsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type {
  WorkflowNode,
  WorkflowRunDetail,
  WorkflowRunSummary,
} from "@/contracts/workflow";

const WF_ID = "11111111-1111-1111-1111-111111111111";

const manualTrigger: WorkflowNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 0, y: 0 },
};
const providerTrigger: WorkflowNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "slack",
  type: "message_received",
  config: {},
  position: { x: 0, y: 0 },
};
const nodeA: WorkflowNode = {
  id: "node-a",
  kind: "action",
  provider: "slack",
  type: "send_message",
  config: { channel: "general" },
  position: { x: 0, y: 160 },
  displayName: "Send Channel Message",
};

function bootGraph(trigger: WorkflowNode, extra: WorkflowNode[] = []): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
  useGraphSlice.setState({
    workflowId: WF_ID,
    pendingNodes: [trigger, ...extra],
  });
}

function summary(over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "run-1",
    workflowId: WF_ID,
    status: "succeeded",
    triggerNodeId: "trigger-1",
    startedAt: "2026-05-07T00:00:00Z",
    finishedAt: "2026-05-07T00:00:01Z",
    errorClassification: null,
    triggeredBy: "manual",
    isTest: false,
    ...over,
  };
}

function detail(over: Partial<WorkflowRunDetail> = {}): WorkflowRunDetail {
  return { ...summary(), steps: [], ...over };
}

beforeEach(() => {
  mockListWorkflowRuns.mockReset();
  mockGetWorkflowRun.mockReset();
  mockRunNowWorkflow.mockReset();
  mockUpdateWorkflow.mockReset();
  mockActivateWorkflow.mockReset();
  mockPublishWorkflow.mockReset();
  // Default detail resolver — keyed by runId so selection tests can vary it.
  mockGetWorkflowRun.mockImplementation((_wf: string, runId: string) =>
    Promise.resolve(detail({ id: runId })),
  );
});

afterEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("RunsPanel — workflow scoping + listing", () => {
  it("lists runs for the CURRENT workflow only (calls listWorkflowRuns with this workflowId)", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "run-a" }),
      summary({ id: "run-b", status: "failed" }),
    ]);
    render(<RunsPanel />);

    await waitFor(() =>
      expect(mockListWorkflowRuns).toHaveBeenCalledWith(WF_ID),
    );
    expect(await screen.findByTestId("run-row-run-a")).toBeInTheDocument();
    expect(screen.getByTestId("run-row-run-b")).toBeInTheDocument();
  });
});

describe("RunsPanel — empty state", () => {
  it("renders the empty-state hint when there are no runs", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([]);
    render(<RunsPanel />);

    expect(await screen.findByTestId("runs-empty-state")).toHaveTextContent(
      /run this workflow to see execution history here/i,
    );
  });
});

describe("RunsPanel — default selection + detail", () => {
  it("selects the NEWEST run by default and loads its detail", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "older", startedAt: "2026-05-07T00:00:00Z" }),
      summary({ id: "newest", startedAt: "2026-05-07T09:00:00Z" }),
    ]);
    render(<RunsPanel />);

    // Newest by startedAt is "newest" regardless of array order.
    await waitFor(() =>
      expect(mockGetWorkflowRun).toHaveBeenCalledWith(WF_ID, "newest"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("run-row-newest")).toHaveAttribute(
        "data-selected",
        "true",
      ),
    );
  });

  it("shows a run's detail when it is selected", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "newest", startedAt: "2026-05-07T09:00:00Z" }),
      summary({ id: "other", status: "failed", startedAt: "2026-05-07T00:00:00Z" }),
    ]);
    mockGetWorkflowRun.mockImplementation((_wf: string, runId: string) =>
      Promise.resolve(
        runId === "other"
          ? detail({
              id: "other",
              status: "failed",
              triggeredBy: "manual",
              steps: [{ nodeId: "node-a", status: "failed" }],
            })
          : detail({ id: runId }),
      ),
    );
    bootGraph(manualTrigger, [nodeA]);
    render(<RunsPanel />);

    await screen.findByTestId("run-row-other");
    await userEvent.click(screen.getByTestId("run-row-other"));

    await waitFor(() =>
      expect(mockGetWorkflowRun).toHaveBeenCalledWith(WF_ID, "other"),
    );
    expect(await screen.findByTestId("run-step-node-a")).toHaveAttribute(
      "data-status",
      "failed",
    );
  });
});

describe("RunsPanel — failed run detail", () => {
  it("highlights the failed step and shows the humanized error classification", async () => {
    bootGraph(manualTrigger, [nodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "failed-run", status: "failed" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "failed-run",
        status: "failed",
        errorClassification: {
          title: "Slack channel is missing or invalid",
          description: "Choose a valid channel, then run again.",
          hint: "Pick a channel in the step config.",
          action: "open_node",
          severity: "error",
        },
        steps: [
          { nodeId: "trigger-1", status: "succeeded" },
          {
            nodeId: "node-a",
            status: "failed",
            error: { code: "HANDLER_FAILED", message: "Slack channel not found." },
          },
        ],
      }),
    );
    render(<RunsPanel />);

    expect(await screen.findByTestId("run-error-classification")).toHaveTextContent(
      /slack channel is missing or invalid/i,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("run-step-node-a")).toHaveAttribute("data-status", "failed");
    expect(screen.getByTestId("run-step-trigger-1")).toHaveAttribute("data-status", "succeeded");
  });
});

describe("RunsPanel — no raw payloads / secrets in the UI", () => {
  it("never renders step output, trigger payloads, secrets, or credential ids", async () => {
    bootGraph(manualTrigger, [nodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "failed-run", status: "failed" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "failed-run",
        status: "failed",
        errorClassification: {
          title: "Workflow step failed",
          description: "Something went wrong.",
          severity: "error",
        },
        steps: [
          {
            nodeId: "node-a",
            status: "failed",
            // Even if a server bug leaked these, the panel must not render them.
            output: { token: ["xoxb", "SUPERSECRET", "9999"].join("-"), credentialId: "cred_abc123" },
            error: {
              code: "HANDLER_FAILED",
              message: "Slack rejected the request.",
              details: { rawBody: "Bearer LEAKED-TOKEN-zzz" },
            },
          } as WorkflowRunDetail["steps"][number],
        ],
      }),
    );
    render(<RunsPanel />);

    await screen.findByTestId("run-step-node-a");
    expect(screen.queryByText(/SUPERSECRET/)).not.toBeInTheDocument();
    expect(screen.queryByText(/cred_abc123/)).not.toBeInTheDocument();
    expect(screen.queryByText(/LEAKED-TOKEN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bearer/)).not.toBeInTheDocument();
  });
});

describe("RunsPanel — Open failed step", () => {
  it("opens/selects the matching node config panel when the nodeId exists", async () => {
    const onOpenFailedStep = jest.fn();
    bootGraph(manualTrigger, [nodeA]);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "failed-run", status: "failed" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "failed-run",
        status: "failed",
        steps: [{ nodeId: "node-a", status: "failed", error: { code: "X", message: "boom" } }],
      }),
    );
    render(<RunsPanel onOpenFailedStep={onOpenFailedStep} />);

    const btn = await screen.findByTestId("open-failed-step");
    await userEvent.click(btn);

    expect(useConfigSlice.getState().activeNodeId).toBe("node-a");
    expect(onOpenFailedStep).toHaveBeenCalledTimes(1);
  });

  it("shows a safe fallback (no crash, no button) when the failed node no longer exists", async () => {
    // node-a is NOT in the graph this time.
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "failed-run", status: "failed" })]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({
        id: "failed-run",
        status: "failed",
        steps: [{ nodeId: "node-gone", status: "failed", error: { code: "X", message: "boom" } }],
      }),
    );
    render(<RunsPanel />);

    expect(await screen.findByTestId("open-failed-step-missing")).toBeInTheDocument();
    expect(screen.queryByTestId("open-failed-step")).not.toBeInTheDocument();
    // The step still renders with a friendly stand-in, never the raw id as the label.
    const step = screen.getByTestId("run-step-node-gone");
    expect(within(step).getByText(/no longer in this workflow/i)).toBeInTheDocument();
  });
});

describe("RunsPanel — Run again", () => {
  it("reuses the existing run path (runNowWorkflow, test mode) and creates no new backend route", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    mockGetWorkflowRun.mockResolvedValue(detail({ id: "run-a" }));
    mockRunNowWorkflow.mockResolvedValue({ runId: "new-run", enqueuedAt: "2026-05-07T10:00:00Z" });
    render(<RunsPanel />);

    const btn = await screen.findByTestId("run-again");
    await userEvent.click(btn);

    await waitFor(() =>
      expect(mockRunNowWorkflow).toHaveBeenCalledWith(WF_ID, { inputs: {} }, { testMode: true }),
    );
  });

  it("does NOT save / activate / publish / mutate the draft", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    mockGetWorkflowRun.mockResolvedValue(detail({ id: "run-a" }));
    mockRunNowWorkflow.mockResolvedValue({ runId: "new-run", enqueuedAt: "2026-05-07T10:00:00Z" });
    render(<RunsPanel />);

    const beforeNodes = useGraphSlice.getState().pendingNodes;
    await userEvent.click(await screen.findByTestId("run-again"));
    await waitFor(() => expect(mockRunNowWorkflow).toHaveBeenCalled());

    expect(mockUpdateWorkflow).not.toHaveBeenCalled();
    expect(mockActivateWorkflow).not.toHaveBeenCalled();
    expect(mockPublishWorkflow).not.toHaveBeenCalled();
    expect(useGraphSlice.getState().pendingNodes).toBe(beforeNodes);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("hides Run again for automated (non-manual) workflows", async () => {
    bootGraph(providerTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a", triggeredBy: "webhook" })]);
    mockGetWorkflowRun.mockResolvedValue(detail({ id: "run-a", triggeredBy: "webhook" }));
    render(<RunsPanel />);

    await screen.findByTestId("run-detail-actions");
    expect(screen.queryByTestId("run-again")).not.toBeInTheDocument();
  });

  it("hides Run again when the viewer can't run/edit (runEditBlocked)", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    mockGetWorkflowRun.mockResolvedValue(detail({ id: "run-a" }));
    render(<RunsPanel runEditBlocked />);

    await screen.findByTestId("run-detail-actions");
    expect(screen.queryByTestId("run-again")).not.toBeInTheDocument();
  });
});

describe("RunsPanel — Running status", () => {
  it("shows a Running row for the live in-flight run (reusing runSlice)", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([]);
    render(<RunsPanel />);
    await screen.findByTestId("builder-runs-tab");

    // Start tracking a live run (what useRunControls does on dispatch).
    useRunSlice.getState().startTracking({ workflowId: WF_ID, runId: "live-1" });

    const row = await screen.findByTestId("run-row-live-1");
    expect(row).toHaveAttribute("data-status", "running");
    expect(within(row).getByText(/running/i)).toBeInTheDocument();
  });
});

describe("RunsPanel — Refresh", () => {
  it("reloads runs without changing graph or config state", async () => {
    bootGraph(manualTrigger);
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    mockGetWorkflowRun.mockResolvedValue(detail({ id: "run-a" }));
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-a");

    const nodesBefore = useGraphSlice.getState().pendingNodes;
    const activeBefore = useConfigSlice.getState().activeNodeId;
    expect(mockListWorkflowRuns).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByTestId("runs-refresh"));

    await waitFor(() => expect(mockListWorkflowRuns).toHaveBeenCalledTimes(2));
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useConfigSlice.getState().activeNodeId).toBe(activeBefore);
  });
});
