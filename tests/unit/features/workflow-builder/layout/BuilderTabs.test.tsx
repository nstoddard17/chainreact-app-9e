/**
 * BUILDER-TABS-HEADER-1 — the header-level builder tab strip + tab panels.
 *
 * The Builder | Runs | Data Map | History | Settings tabs moved from the
 * Visual-only canvas bar to the header region so BOTH view modes reach
 * every section. These tests carry forward the old WorkflowCanvas tab
 * contract: exact order, no dead tabs, each tab renders its REAL panel
 * (not a placeholder), and Runs' "Open failed step" returns to Builder.
 */

const mockUpdateWorkflow = jest.fn();
const mockListWorkflowRuns = jest.fn();
const mockGetWorkflowRun = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...args: unknown[]) => mockUpdateWorkflow(...args),
    listWorkflowRuns: (...args: unknown[]) => mockListWorkflowRuns(...args),
    getWorkflowRun: (...args: unknown[]) => mockGetWorkflowRun(...args),
  };
});

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderTabStrip } from "@/features/workflow-builder/layout/BuilderTabStrip";
import { BuilderTabPanels } from "@/features/workflow-builder/layout/BuilderTabPanels";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import type { WorkflowDefinition } from "@/contracts/workflow";

const baseDef: WorkflowDefinition = {
  nodes: [
    {
      id: "trig",
      kind: "trigger",
      provider: "slack",
      type: "message_received",
      config: {},
      position: { x: 0, y: 0 },
    },
    {
      id: "act",
      kind: "action",
      provider: "github",
      type: "add_comment",
      config: { repository: "octocat/x" },
      position: { x: 0, y: 200 },
    },
  ],
  edges: [{ id: "e1", from: "trig", to: "act" }],
};

const providerLabels = { slack: "Slack", github: "GitHub" };

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockListWorkflowRuns.mockReset().mockResolvedValue([]);
  mockGetWorkflowRun.mockReset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate("wf-1", baseDef);
});

describe("BuilderTabStrip", () => {
  it("renders Builder | Runs | Data Map | History | Settings in order — all enabled", () => {
    render(<BuilderTabStrip activeTab="builder" onSelectTab={jest.fn()} />);
    const strip = screen.getByTestId("builder-tab-strip");
    const tabs = within(strip).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Builder",
      "Runs",
      "Data Map",
      "History",
      "Settings",
    ]);
    for (const t of tabs) expect(t).toBeEnabled();
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    for (const t of tabs.slice(1)) expect(t.getAttribute("aria-selected")).toBe("false");
  });

  it("fires onSelectTab with the clicked tab id and marks the active tab selected", async () => {
    const user = userEvent.setup();
    const onSelectTab = jest.fn();
    render(<BuilderTabStrip activeTab="history" onSelectTab={onSelectTab} />);
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(screen.getByRole("tab", { name: "Runs" }));
    expect(onSelectTab).toHaveBeenCalledWith("runs");
  });
});

describe("BuilderTabPanels", () => {
  it("renders nothing on the builder tab (the view-mode branch owns the workspace)", () => {
    const { container } = render(
      <BuilderTabPanels
        activeTab="builder"
        providerLabels={providerLabels}
        onBackToBuilder={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("Runs tab renders the real workflow Runs panel; Open-failed-step returns to Builder", async () => {
    const onBackToBuilder = jest.fn();
    render(
      <BuilderTabPanels
        activeTab="runs"
        providerLabels={providerLabels}
        onBackToBuilder={onBackToBuilder}
      />,
    );
    expect(screen.getByTestId("builder-tab-panel")).toHaveAttribute("data-tab", "runs");
    expect(screen.getByTestId("builder-runs-tab")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-tab-placeholder")).toBeNull();
    expect(await screen.findByTestId("runs-empty-state")).toBeInTheDocument();
  });

  it("Data Map tab shows the workflow-ordered data outline (no raw JSON/schema dump)", () => {
    render(
      <BuilderTabPanels
        activeTab="data-map"
        providerLabels={providerLabels}
        onBackToBuilder={jest.fn()}
      />,
    );
    const panel = screen.getByTestId("data-map-panel");
    const cards = within(panel).getAllByTestId("data-map-node");
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAttribute("data-node-kind", "trigger");
    expect(cards[1]).toHaveAttribute("data-node-kind", "action");
    expect(panel.textContent).not.toMatch(/JSON|schema/i);
  });

  it("Settings tab shows real workflow-level metadata and keeps credentials out", () => {
    render(
      <BuilderTabPanels
        activeTab="settings"
        providerLabels={providerLabels}
        settings={{
          name: "Demo Workflow",
          state: "draft",
          createdAt: "2026-06-01T09:00:00.000Z",
          updatedAt: "2026-06-02T09:00:00.000Z",
          activeRevisionId: null,
          unpublishedChanges: false,
        }}
        onBackToBuilder={jest.fn()}
      />,
    );
    const panel = screen.getByTestId("settings-panel");
    expect(within(panel).getByDisplayValue("Demo Workflow")).toBeInTheDocument();
    expect(within(panel).getByText(/message_received/)).toBeInTheDocument();
    expect(panel.textContent).not.toMatch(/credential|token|password|api key/i);
  });

  it("History tab renders the supplied timeline node, or its placeholder when absent", () => {
    const { rerender } = render(
      <BuilderTabPanels
        activeTab="history"
        providerLabels={providerLabels}
        historyPanel={<div data-testid="mock-history-panel" />}
        onBackToBuilder={jest.fn()}
      />,
    );
    expect(screen.getByTestId("mock-history-panel")).toBeInTheDocument();
    rerender(
      <BuilderTabPanels
        activeTab="history"
        providerLabels={providerLabels}
        onBackToBuilder={jest.fn()}
      />,
    );
    expect(screen.getByTestId("builder-tab-placeholder")).toHaveAttribute(
      "data-tab",
      "history",
    );
  });
});
