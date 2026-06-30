/**
 * REACT-AGENT-TEST-FIX-LOOP — AgentRepairLoopPanel.
 *
 * Reads the REAL repair-loop store + config slice + graph slice (so the
 * render-vs-state mapping and the reveal wiring are exercised end-to-end). Mocks
 * only `useRunControls` so the "Retest after fix" CTA can be asserted to call the
 * EXISTING test-run path without a real dispatch.
 */

const mockHandleTest = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useRunControls", () => ({
  useRunControls: () => ({ handleTestWorkflow: mockHandleTest, anyRunning: false }),
}));
jest.mock("@/lib/api/workflows", () => ({
  getWorkflowRun: jest.fn(),
  WorkflowApiError: class extends Error {},
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkflowNode } from "@/contracts/workflowDefinition";
import { AgentRepairLoopPanel } from "@/features/workflow-builder/panels/AgentRepairLoopPanel";
import { useRepairLoopStore, type AgentRepairDiagnosis } from "@/features/workflow-builder/state/repairLoopStore";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const WF = "wf-1";
const NODE: WorkflowNode = {
  id: "a1",
  kind: "action",
  provider: "gmail",
  type: "send_email",
  config: { token: "xoxb-SECRET-should-not-render" },
  position: { x: 0, y: 0 },
};
const DIAGNOSIS: AgentRepairDiagnosis = {
  failingNodeId: "a1",
  failingNodeLabel: "Send Email",
  safeReason: "Gmail needs a To address.",
  nextStep: "Open the failing step, review its configuration, then retest.",
};

beforeEach(() => {
  jest.clearAllMocks();
  useRepairLoopStore.getState().reset();
  useConfigSlice.getState().reset();
  useGraphSlice.setState({ pendingNodes: [NODE] });
});

describe("AgentRepairLoopPanel", () => {
  it("renders nothing when there is no thread for this workflow", () => {
    const { container } = render(<AgentRepairLoopPanel workflowId={WF} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the guided failure summary on a failed thread", () => {
    useRepairLoopStore.getState().recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    const panel = screen.getByTestId("agent-repair-loop");
    expect(panel).toHaveAttribute("data-status", "test_failed");
    expect(panel).toHaveTextContent("Failed test detected");
    expect(screen.getByTestId("agent-repair-steps")).toHaveTextContent("The Send Email step failed.");
    expect(screen.getByTestId("agent-repair-steps")).toHaveTextContent("Gmail needs a To address.");
  });

  it("'Retest after fix' calls the existing handleTestWorkflow path", async () => {
    const user = userEvent.setup();
    useRepairLoopStore.getState().recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    await user.click(screen.getByTestId("agent-repair-retest"));
    expect(mockHandleTest).toHaveBeenCalledTimes(1);
  });

  it("'Open the failing step' reveals the node and advances to field_opened", async () => {
    const user = userEvent.setup();
    useRepairLoopStore.getState().recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    await user.click(screen.getByTestId("agent-repair-open-field"));
    // Reuses the existing open/highlight path (configSlice.revealNode).
    expect(useConfigSlice.getState().activeNodeId).toBe("a1");
    // The thread records that the step was opened.
    expect(useRepairLoopStore.getState().loop?.status).toBe("field_opened");
  });

  it("renders the pass state with next-step guidance", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    store.recordPass({ workflowId: WF, runId: "run-2" });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    expect(screen.getByTestId("agent-repair-loop")).toHaveAttribute("data-status", "test_passed");
    expect(screen.getByText("Test passed")).toBeInTheDocument();
    expect(screen.getByTestId("agent-repair-message")).toHaveTextContent(/save, activate, or continue editing/i);
  });

  it("shows the still_failing thread with an attempt count", () => {
    const store = useRepairLoopStore.getState();
    store.recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    store.markRetesting({ workflowId: WF, runId: "run-2" });
    store.recordFailure({ workflowId: WF, runId: "run-2", diagnosis: { ...DIAGNOSIS, safeReason: "Subject is missing." } });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    expect(screen.getByTestId("agent-repair-loop")).toHaveAttribute("data-status", "still_failing");
    expect(screen.getByText("Still needs attention")).toBeInTheDocument();
    expect(screen.getByTestId("agent-repair-attempt")).toHaveTextContent("Attempt 2");
  });

  it("no-leak: never renders raw node config values / secrets", async () => {
    const user = userEvent.setup();
    useRepairLoopStore.getState().recordFailure({ workflowId: WF, runId: "run-1", diagnosis: DIAGNOSIS });
    render(<AgentRepairLoopPanel workflowId={WF} />);
    // Opening the step routes the secret to the config rail, never to this panel.
    await user.click(screen.getByTestId("agent-repair-open-field"));
    expect(screen.getByTestId("agent-repair-loop").textContent ?? "").not.toMatch(/xoxb-SECRET/);
  });
});
