/**
 * Tests for AI-CONFIG-ASSIST CS-5 diagnosis-card field action (DiagnosisFieldAction).
 *
 * Product rule: a missing user-input field surfaces a direct "Open <field> field"
 * PRIMARY action ON THE CHECK RESULT — no Suggest / Preview required. It reuses the
 * SAME `revealNode` navigation (select node, open rail, pan/zoom, highlight field);
 * highlighting is what then activates chat-fill. Navigation only — no graph mutation,
 * no save, no run, no Apply.
 *
 * `useRepairFieldTarget` is mocked to isolate the card; the real config/graph stores
 * verify navigation-only behavior + zero graph mutation.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseRepairFieldTarget = jest.fn();
jest.mock("@/features/workflow-builder/ai/useRepairFieldTarget", () => ({
  useRepairFieldTarget: (...a: unknown[]) => mockUseRepairFieldTarget(...a),
}));

import { DiagnosisFieldAction } from "@/features/workflow-builder/panels/_BuilderAiPanelRepairGoTo";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const TARGET = {
  nodeId: "slack1",
  fieldKey: "text",
  fieldLabel: "Message",
  nodeLabel: "Send Channel Message",
  initialValues: { channel: "C1", text: "" },
};

beforeEach(() => {
  mockUseRepairFieldTarget.mockReset();
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
  useGraphSlice.getState().hydrate(
    "wf1",
    { nodes: [{ id: "slack1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "" }, position: { x: 0, y: 0 } }], edges: [] },
    "rev-1",
  );
});

describe("DiagnosisFieldAction", () => {
  it("renders nothing when there is no targetable field", () => {
    mockUseRepairFieldTarget.mockReturnValue(null);
    const { container } = render(<DiagnosisFieldAction nodeId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows 'Open Message field' as a primary action under a 'Needs your input' heading", () => {
    mockUseRepairFieldTarget.mockReturnValue(TARGET);
    render(<DiagnosisFieldAction nodeId="slack1" />);
    const card = screen.getByTestId("builder-ai-diagnosis-open-field");
    expect(card.textContent).toContain("Needs your input");
    expect(screen.getByTestId("builder-ai-diagnosis-open-field-button").textContent).toBe("Open Message field");
    // Display labels only — never the raw node id / field key.
    expect(card.textContent).not.toContain("slack1");
    expect(card.textContent).not.toContain("text");
  });

  it("clicking reveals + highlights the field (navigation only; no graph mutation)", async () => {
    mockUseRepairFieldTarget.mockReturnValue(TARGET);
    const user = userEvent.setup();
    render(<DiagnosisFieldAction nodeId="slack1" />);
    await user.click(screen.getByTestId("builder-ai-diagnosis-open-field-button"));

    const cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("slack1");
    expect(cs.focusFieldKey).toBe("text"); // highlight → chat-fill activation precondition
    expect(cs.canvasFocusNodeId).toBe("slack1");
    expect(cs.canvasFocusSeq).toBe(1); // canvas focus/zoom requested
    // No value written — draft mirrors initialValues, not dirty.
    expect(cs.drafts.slack1?.isDirty).toBe(false);

    // Graph store untouched.
    const gs = useGraphSlice.getState();
    expect(gs.pendingNodes[0]!.config).toEqual({ channel: "C1", text: "" });
  });
});
