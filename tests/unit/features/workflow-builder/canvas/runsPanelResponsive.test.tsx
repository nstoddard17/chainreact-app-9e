/**
 * RESPONSIVE-BUILDER-RUNS-6 — Builder Runs tab responsive behaviour.
 *
 * Geometry belongs to the continuous browser sweep (14 states × 158 widths).
 * What this file protects is what the sweep cannot see: that the split view and
 * the narrow one-surface-at-a-time view are ONE mounted tree with ONE selection
 * state, that switching presentation never refetches or resets the run, and that
 * the run/step data and actions are unchanged.
 */
const mockListWorkflowRuns = jest.fn();
const mockGetWorkflowRun = jest.fn();

jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    listWorkflowRuns: (...a: unknown[]) => mockListWorkflowRuns(...a),
    getWorkflowRun: (...a: unknown[]) => mockGetWorkflowRun(...a),
    runNowWorkflow: jest.fn(),
    updateWorkflow: jest.fn(),
    activateWorkflow: jest.fn(),
    publishWorkflow: jest.fn(),
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

const WF_ID = "11111111-1111-4111-8111-111111111111";
const LONG_NODE_NAME =
  "Send the quarterly revenue reconciliation digest to the finance operations channel";

const manualTrigger: WorkflowNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 0, y: 0 },
};
const nodeA: WorkflowNode = {
  id: "node-a",
  kind: "action",
  provider: "slack",
  type: "send_message",
  config: {},
  position: { x: 0, y: 160 },
  displayName: LONG_NODE_NAME,
};

function boot(): void {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
  useGraphSlice.setState({ workflowId: WF_ID, pendingNodes: [manualTrigger, nodeA] });
}

function summary(over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary {
  return {
    id: "run-1",
    workflowId: WF_ID,
    status: "succeeded",
    triggerNodeId: "trigger-1",
    startedAt: "2026-07-30T09:00:00Z",
    finishedAt: "2026-07-30T09:00:12Z",
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
  mockGetWorkflowRun.mockImplementation((_w: string, runId: string) =>
    Promise.resolve(detail({ id: runId, steps: [{ nodeId: "node-a", status: "succeeded" }] })),
  );
});

afterEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
  useRunSlice.getState().reset();
});

// ── One tree, one selection state ────────────────────────────────────────────

describe("the split view and the narrow view are one mounted tree", () => {
  it("mounts BOTH surfaces and toggles visibility, never a second copy", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" }), summary({ id: "run-b" })]);
    render(<RunsPanel />);

    await screen.findByTestId("run-row-run-a");
    // Exactly one history nav and one detail pane exist at any time — a
    // desktop/mobile pair would double these and could then disagree.
    expect(screen.getAllByTestId("runs-nav")).toHaveLength(1);
    expect(screen.getAllByTestId("run-detail")).toHaveLength(1);
    expect(screen.getAllByTestId("run-row-run-a")).toHaveLength(1);
    // Both surfaces are present in the DOM in both presentations.
    expect(screen.getByTestId("runs-list-surface")).toBeInTheDocument();
    expect(screen.getByTestId("runs-detail-surface")).toBeInTheDocument();
  });

  it("keeps the split view visible from lg up regardless of the narrow state", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-a");

    // `lg:flex` is what makes both surfaces visible on a wide screen even while
    // the narrow presentation is showing only one of them.
    expect(screen.getByTestId("runs-list-surface").className).toContain("lg:flex");
    expect(screen.getByTestId("runs-detail-surface").className).toContain("lg:flex");
  });
});

describe("selection survives the presentation change", () => {
  it("selecting a run moves the narrow view to the detail surface", async () => {
    const user = userEvent.setup();
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" }), summary({ id: "run-b" })]);
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-b");

    await user.click(screen.getByTestId("run-row-run-b"));
    // The detail surface is the one on screen in the narrow presentation…
    expect(screen.getByTestId("runs-detail-surface").className).not.toContain("hidden");
    expect(screen.getByTestId("runs-list-surface").className).toContain("hidden");
    // …and the SELECTION is the run that was clicked, in both presentations.
    expect(screen.getByTestId("run-row-run-b")).toHaveAttribute("data-selected", "true");
    expect(screen.getByTestId("run-row-run-a")).toHaveAttribute("data-selected", "false");
  });

  it("Back returns to the list WITHOUT clearing the selected run", async () => {
    const user = userEvent.setup();
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" }), summary({ id: "run-b" })]);
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-b");

    await user.click(screen.getByTestId("run-row-run-b"));
    await user.click(screen.getByTestId("run-detail-back"));

    expect(screen.getByTestId("runs-list-surface").className).not.toContain("hidden");
    // The brief is explicit: closing the responsive surface must not clear data.
    expect(screen.getByTestId("run-row-run-b")).toHaveAttribute("data-selected", "true");
  });

  it("does NOT refetch the run when moving between list and detail", async () => {
    const user = userEvent.setup();
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);
    await waitFor(() => expect(mockGetWorkflowRun).toHaveBeenCalledTimes(1));

    await user.click(screen.getByTestId("run-row-run-a"));
    await user.click(screen.getByTestId("run-detail-back"));
    await user.click(screen.getByTestId("run-row-run-a"));

    // The detail pane stays MOUNTED across the presentation change — toggling
    // visibility must not re-issue the fetch or drop the loaded detail.
    expect(mockGetWorkflowRun).toHaveBeenCalledTimes(1);
  });

  it("offers Back only as narrow-only navigation, not a duplicated control", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-a");

    const back = screen.getByTestId("run-detail-back");
    // Exactly one, and hidden from `lg` up where both surfaces are on screen and
    // there is nothing to go back to.
    expect(screen.getAllByTestId("run-detail-back")).toHaveLength(1);
    expect(back.className).toContain("lg:hidden");
  });
});

// ── Content behaviour ────────────────────────────────────────────────────────

describe("run and step content stays readable", () => {
  it("wraps a long step name and declares a legibility floor on its cell", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);

    const step = await screen.findByTestId("run-step-node-a");
    const name = within(step).getByText(LONG_NODE_NAME);
    expect(name.className).toContain("break-words");
    expect(name.className).not.toMatch(/(^|\s)truncate(\s|$)/);
    expect(Number(name.getAttribute("data-legible-min"))).toBeGreaterThanOrEqual(140);
  });

  it("keeps the step order number and status badge at their intrinsic size", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);

    const step = await screen.findByTestId("run-step-node-a");
    // Order and status are what make a step column scannable — they hold.
    expect(within(step).getByText("1.").className).toContain("shrink-0");
    expect(step).toHaveAttribute("data-status", "succeeded");
  });

  it("declares that the panel, its nav and the detail must never pan sideways", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);
    await screen.findByTestId("run-row-run-a");

    for (const id of ["builder-runs-tab", "runs-nav", "run-detail"]) {
      expect(screen.getByTestId(id)).toHaveAttribute("data-no-pan-below");
    }
  });

  it("keeps the humanized error readable and wrapping", async () => {
    boot();
    const classification = {
      title: "Slack rejected the request because the workspace hit its rate limit",
      description: "The connected app returned 429 Too Many Requests for this workspace.",
      hint: "Re-run once the provider's limit window has passed.",
      severity: "error" as const,
      action: "retry_later" as const,
    };
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "run-f", status: "failed", errorClassification: classification }),
    ]);
    mockGetWorkflowRun.mockResolvedValue(
      detail({ id: "run-f", status: "failed", errorClassification: classification, steps: [] }),
    );
    render(<RunsPanel />);

    const block = await screen.findByTestId("run-error-classification");
    expect(block).toHaveAttribute("role", "alert");
    expect(block).toHaveTextContent(/hit its rate limit/);
    expect(within(block).getByText(classification.title).className).toContain("break-words");
  });
});

// ── Nothing else moved ───────────────────────────────────────────────────────

describe("run behaviour is unchanged by the layout work", () => {
  it("still scopes the list to this workflow and defaults to the newest run", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([
      summary({ id: "older", startedAt: "2026-07-01T00:00:00Z" }),
      summary({ id: "newest", startedAt: "2026-07-30T00:00:00Z" }),
    ]);
    render(<RunsPanel />);

    await waitFor(() => expect(mockListWorkflowRuns).toHaveBeenCalledWith(WF_ID));
    await waitFor(() =>
      expect(screen.getByTestId("run-row-newest")).toHaveAttribute("data-selected", "true"),
    );
  });

  it("keeps Run again hidden when the viewer may not run the workflow", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel runEditBlocked />);
    await screen.findByTestId("run-detail-actions");
    expect(screen.queryByTestId("run-again")).toBeNull();
  });

  it("still offers Run again for a manual trigger when not blocked", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([summary({ id: "run-a" })]);
    render(<RunsPanel />);
    expect(await screen.findByTestId("run-again")).toBeVisible();
  });

  it("keeps the empty state", async () => {
    boot();
    mockListWorkflowRuns.mockResolvedValue([]);
    render(<RunsPanel />);
    expect(await screen.findByTestId("runs-empty-state")).toBeVisible();
  });
});
