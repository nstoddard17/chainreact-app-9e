/**
 * Tests for features/workflow-builder/canvas/SettingsPanel — Slice 4.BUILDER-SETTINGS-2.
 *
 * The Settings tab is the workflow-LEVEL control panel. Supported actions reuse
 * existing client helpers (name PATCH via updateWorkflow; soft-delete via
 * deleteWorkflow → Trash); unsupported settings are shown honestly. Proves the
 * 13-point contract: metadata render, safe name edit (no graph mutation, no
 * activate/run/publish), dirty/save + lifecycle labels, manual-trigger copy, no
 * "Coming later" spam, honest folder copy, confirmed soft-delete, and no leaks.
 */

const mockUpdateWorkflow = jest.fn();
const mockActivateWorkflow = jest.fn();
const mockPublishWorkflow = jest.fn();
const mockRunNowWorkflow = jest.fn();
jest.mock("@/lib/api/workflows", () => {
  const actual = jest.requireActual("@/lib/api/workflows");
  return {
    ...actual,
    updateWorkflow: (...a: unknown[]) => mockUpdateWorkflow(...a),
    activateWorkflow: (...a: unknown[]) => mockActivateWorkflow(...a),
    publishWorkflow: (...a: unknown[]) => mockPublishWorkflow(...a),
    runNowWorkflow: (...a: unknown[]) => mockRunNowWorkflow(...a),
  };
});

const mockDeleteWorkflow = jest.fn();
jest.mock("@/lib/api/trash", () => ({
  deleteWorkflow: (...a: unknown[]) => mockDeleteWorkflow(...a),
}));

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SettingsPanel,
  type WorkflowSettingsMeta,
} from "@/features/workflow-builder/canvas/SettingsPanel";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useRunSlice } from "@/features/workflow-builder/state/runSlice";
import type { WorkflowNode } from "@/contracts/workflow";

const WF_ID = "11111111-1111-1111-1111-111111111111";

const manualTrigger: WorkflowNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "native",
  type: "manual.run",
  config: {},
  position: { x: 0, y: 0 },
};
const scheduledTrigger: WorkflowNode = {
  id: "trigger-1",
  kind: "trigger",
  provider: "native",
  type: "schedule.fired",
  config: { cronExpression: "0 9 * * *" },
  position: { x: 0, y: 0 },
};
const actionNode: WorkflowNode = {
  id: "node-a",
  kind: "action",
  provider: "github",
  type: "add_comment",
  // A configured field value — Settings must NEVER surface node config.
  config: { repository: "octocat/x" },
  position: { x: 0, y: 160 },
};

function bootGraph(trigger: WorkflowNode = manualTrigger): void {
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
  useGraphSlice.setState({
    workflowId: WF_ID,
    pendingNodes: [trigger, actionNode],
    pendingEdges: [{ id: "e1", from: trigger.id, to: actionNode.id }],
  });
}

function meta(over: Partial<WorkflowSettingsMeta> = {}): WorkflowSettingsMeta {
  return {
    name: "My Workflow",
    state: "draft",
    createdAt: "2026-06-01T09:00:00.000Z",
    updatedAt: "2026-06-02T09:00:00.000Z",
    activeRevisionId: null,
    unpublishedChanges: false,
    ...over,
  };
}

const mockAssign = jest.fn();

beforeEach(() => {
  mockUpdateWorkflow.mockReset();
  mockUpdateWorkflow.mockResolvedValue({ id: WF_ID, name: "x" });
  mockActivateWorkflow.mockReset();
  mockPublishWorkflow.mockReset();
  mockRunNowWorkflow.mockReset();
  mockDeleteWorkflow.mockReset();
  mockDeleteWorkflow.mockResolvedValue({ ok: true, deleteOperationId: "op", purgeAfter: "x" });
  mockAssign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { assign: mockAssign, href: "http://localhost/" },
  });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn() },
  });
  bootGraph();
});

afterEach(() => {
  useGraphSlice.getState().reset();
  useRunSlice.getState().reset();
});

describe("SettingsPanel — render", () => {
  it("renders name, status, save state, trigger, steps, and graph counts", () => {
    render(<SettingsPanel settings={meta()} />);
    expect(screen.getByDisplayValue("My Workflow")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    expect(screen.getByText(/manual\.run/)).toBeInTheDocument();
    expect(screen.getByText(/1 action/)).toBeInTheDocument();
    expect(screen.getByText(/2 nodes · 1 edge/)).toBeInTheDocument();
  });

  it("renders the manual-trigger run explanation for manual.run", () => {
    render(<SettingsPanel settings={meta()} />);
    expect(screen.getByTestId("settings-run-explanation")).toHaveTextContent(
      "Runs only when you click Run Manually or Run again.",
    );
  });

  it("renders the schedule read-only for a scheduled trigger", () => {
    bootGraph(scheduledTrigger);
    render(<SettingsPanel settings={meta()} />);
    expect(screen.getByTestId("settings-run-explanation")).toHaveTextContent(
      "Runs on a schedule: 0 9 * * * (read-only here).",
    );
  });

  it("renders correct user-facing lifecycle labels", () => {
    const { rerender } = render(<SettingsPanel settings={meta({ state: "eligible_to_resume" })} />);
    expect(screen.getByText("Ready to resume")).toBeInTheDocument();
    rerender(<SettingsPanel settings={meta({ state: "paused" })} />);
    expect(screen.getByText("Paused")).toBeInTheDocument();
    rerender(<SettingsPanel settings={meta({ state: "disabled" })} />);
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("reflects dirty + saving state", () => {
    useGraphSlice.setState({ isDirty: true });
    const { rerender } = render(<SettingsPanel settings={meta()} />);
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
    useGraphSlice.setState({ isDirty: false, isSaving: true });
    rerender(<SettingsPanel settings={meta()} />);
    expect(screen.getByText("Saving…")).toBeInTheDocument();
  });
});

describe("SettingsPanel — name editing", () => {
  it("saves the name via updateWorkflow (and notifies the parent)", async () => {
    const onNameSaved = jest.fn();
    render(<SettingsPanel settings={meta()} onNameSaved={onNameSaved} />);
    fireEvent.change(screen.getByTestId("settings-name-input"), {
      target: { value: "Renamed Workflow" },
    });
    fireEvent.click(screen.getByTestId("settings-name-save"));
    await waitFor(() =>
      expect(mockUpdateWorkflow).toHaveBeenCalledWith(WF_ID, { name: "Renamed Workflow" }),
    );
    await waitFor(() => expect(onNameSaved).toHaveBeenCalledWith("Renamed Workflow"));
    expect(await screen.findByTestId("settings-name-saved")).toBeInTheDocument();
  });

  it("does NOT mutate the draft graph when editing the name", () => {
    const nodesBefore = useGraphSlice.getState().pendingNodes;
    render(<SettingsPanel settings={meta()} />);
    fireEvent.change(screen.getByTestId("settings-name-input"), {
      target: { value: "Renamed" },
    });
    expect(useGraphSlice.getState().pendingNodes).toBe(nodesBefore);
    expect(useGraphSlice.getState().isDirty).toBe(false);
  });

  it("does NOT activate / publish / run when saving the name", async () => {
    render(<SettingsPanel settings={meta()} />);
    fireEvent.change(screen.getByTestId("settings-name-input"), {
      target: { value: "Renamed" },
    });
    fireEvent.click(screen.getByTestId("settings-name-save"));
    await waitFor(() => expect(mockUpdateWorkflow).toHaveBeenCalled());
    expect(mockActivateWorkflow).not.toHaveBeenCalled();
    expect(mockPublishWorkflow).not.toHaveBeenCalled();
    expect(mockRunNowWorkflow).not.toHaveBeenCalled();
  });

  it("disables Save for an empty name", () => {
    render(<SettingsPanel settings={meta()} />);
    fireEvent.change(screen.getByTestId("settings-name-input"), { target: { value: "  " } });
    expect(screen.getByTestId("settings-name-save")).toBeDisabled();
    expect(screen.getByText(/name can.t be empty/i)).toBeInTheDocument();
  });
});

describe("SettingsPanel — honest unsupported settings", () => {
  it("shows Description as a clearly disabled future field", () => {
    render(<SettingsPanel settings={meta()} />);
    const desc = screen.getByTestId("settings-description");
    expect(desc).toBeDisabled();
    expect(screen.getByText(/saving a description isn.t available yet/i)).toBeInTheDocument();
  });

  it("does not render misleading 'Coming later' action spam", () => {
    render(<SettingsPanel settings={meta()} />);
    expect(screen.queryByText(/coming later/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("settings-coming-later-row")).not.toBeInTheDocument();
  });

  it("keeps the Folder section honest (link to the workflows list, no builder folder management)", () => {
    render(<SettingsPanel settings={meta()} />);
    const link = screen.getByTestId("settings-folder-link");
    expect(link).toHaveAttribute("href", "/workflows");
    expect(screen.getByText(/manage folders from the/i)).toBeInTheDocument();
    // No folder picker/select implying the builder itself can move folders.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("SettingsPanel — danger zone", () => {
  it("requires confirmation, then soft-deletes via deleteWorkflow and navigates away", async () => {
    render(<SettingsPanel settings={meta()} />);
    // Step 1: reveal confirmation (no delete yet).
    fireEvent.click(screen.getByTestId("settings-delete"));
    expect(mockDeleteWorkflow).not.toHaveBeenCalled();
    expect(screen.getByTestId("settings-delete-confirm-box")).toBeInTheDocument();
    // Step 2: confirm → soft-delete + navigate to the workflows list.
    fireEvent.click(screen.getByTestId("settings-delete-confirm"));
    await waitFor(() => expect(mockDeleteWorkflow).toHaveBeenCalledWith(WF_ID));
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/workflows"));
  });

  it("can cancel the delete confirmation without deleting", () => {
    render(<SettingsPanel settings={meta()} />);
    fireEvent.click(screen.getByTestId("settings-delete"));
    fireEvent.click(screen.getByTestId("settings-delete-cancel"));
    expect(screen.queryByTestId("settings-delete-confirm-box")).not.toBeInTheDocument();
    expect(mockDeleteWorkflow).not.toHaveBeenCalled();
  });
});

describe("SettingsPanel — boundaries + safety", () => {
  it("never surfaces node config, credentials, secrets, tokens, or member data", () => {
    const { container } = render(<SettingsPanel settings={meta()} />);
    const text = container.textContent ?? "";
    // A node's configured field value must never appear in Settings.
    expect(text).not.toContain("octocat/x");
    expect(text).not.toMatch(/password|secret|credential|api key/i);
    expect(text).not.toMatch(/Bearer |xoxb-|sk_live|sk-/);
    // Access row is generic membership copy, not a member roster.
    expect(text).toMatch(/managed by your account membership/i);
  });

  it("points users to where connections and step config actually live", () => {
    render(<SettingsPanel settings={meta()} />);
    expect(screen.getByText(/connections live in Apps|App connections live in Apps/i)).toBeInTheDocument();
    expect(screen.getByText(/config panel/i)).toBeInTheDocument();
  });
});
