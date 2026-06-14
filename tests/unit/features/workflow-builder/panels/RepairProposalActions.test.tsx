/**
 * Tests for AI-CONFIG-ASSIST CS-4 repair-proposal actions (RepairProposalActions).
 *
 * Product rule: a KNOWN, user-input-required missing field shows a direct "Open
 * <field> field" PRIMARY action (no Preview step required), reusing the SAME
 * `revealNode` navigation the blocked-preview "Go to field" button uses. Preview
 * is demoted to secondary but stays available. When there is NO targetable field,
 * the original Preview-fix-only block renders unchanged.
 *
 * `useRepairFieldTarget` is mocked so the action layout is isolated from metadata
 * resolution (covered by its own test). The configSlice/graphSlice are the REAL
 * stores so we can assert navigation-only behavior + zero graph mutation.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockUseRepairFieldTarget = jest.fn();
jest.mock("@/features/workflow-builder/ai/useRepairFieldTarget", () => ({
  useRepairFieldTarget: (...a: unknown[]) => mockUseRepairFieldTarget(...a),
}));

import { RepairProposalActions } from "@/features/workflow-builder/panels/_BuilderAiPanelRepairGoTo";
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

describe("RepairProposalActions — targetable missing field", () => {
  beforeEach(() => mockUseRepairFieldTarget.mockReturnValue(TARGET));

  it("shows 'Open Message field' as the primary action WITHOUT requiring Preview", () => {
    render(<RepairProposalActions goToNodeId="slack1" canPreview previewing={false} alreadyPreviewed={false} />);
    const open = screen.getByTestId("builder-ai-repair-open-field-button");
    expect(open.textContent).toBe("Open Message field");
    // Never renders the raw node id or field key.
    expect(screen.getByTestId("builder-ai-repair-open-field").textContent).not.toContain("slack1");
    expect(screen.getByTestId("builder-ai-repair-open-field").textContent).not.toContain("text");
  });

  it("clicking it reveals the node + highlights the field (navigation only, no graph mutation)", async () => {
    const user = userEvent.setup();
    render(<RepairProposalActions goToNodeId="slack1" canPreview previewing={false} alreadyPreviewed={false} />);
    await user.click(screen.getByTestId("builder-ai-repair-open-field-button"));

    const cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("slack1");
    expect(cs.focusFieldKey).toBe("text"); // highlight → chat-fill can now activate
    expect(cs.canvasFocusNodeId).toBe("slack1");
    expect(cs.canvasFocusSeq).toBe(1); // canvas focus/zoom requested
    // No config VALUE written — the draft mirrors initialValues (not dirty).
    expect(cs.drafts.slack1?.isDirty).toBe(false);
    expect(cs.drafts.slack1?.values).toEqual({ channel: "C1", text: "" });

    // Graph store untouched (no save / structural mutation).
    const gs = useGraphSlice.getState();
    expect(gs.pendingNodes).toHaveLength(1);
    expect(gs.pendingNodes[0]!.config).toEqual({ channel: "C1", text: "" });
  });

  it("keeps 'Preview fix' available as a secondary control when canPreview", () => {
    render(<RepairProposalActions goToNodeId="slack1" canPreview previewing={false} alreadyPreviewed={false} />);
    const preview = screen.getByTestId("builder-ai-preview-fix-button");
    expect(preview.textContent).toContain("Preview fix");
    // Both actions live in the open-field area; open-field is primary.
    expect(screen.getByTestId("builder-ai-repair-open-field")).toContainElement(preview);
  });

  it("omits the Preview control when canPreview is false (open-field still shown)", () => {
    render(<RepairProposalActions goToNodeId="slack1" canPreview={false} previewing={false} alreadyPreviewed={false} />);
    expect(screen.getByTestId("builder-ai-repair-open-field-button")).toBeInTheDocument();
    expect(screen.queryByTestId("builder-ai-preview-fix-button")).toBeNull();
  });
});

describe("RepairProposalActions — no targetable field (Preview-fix only)", () => {
  beforeEach(() => mockUseRepairFieldTarget.mockReturnValue(null));

  it("renders the original Preview-fix block unchanged when canPreview", () => {
    render(<RepairProposalActions goToNodeId={null} canPreview previewing={false} alreadyPreviewed={false} />);
    expect(screen.getByTestId("builder-ai-repair-preview-fix")).toBeInTheDocument();
    expect(screen.getByTestId("builder-ai-preview-fix-button").textContent).toContain("Preview fix");
    // No Open-field affordance for a non-targetable suggestion.
    expect(screen.queryByTestId("builder-ai-repair-open-field-button")).toBeNull();
  });

  it("renders nothing when there is no target and no preview", () => {
    const { container } = render(
      <RepairProposalActions goToNodeId={null} canPreview={false} previewing={false} alreadyPreviewed={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Preview while previewing / already previewed", () => {
    const { rerender } = render(
      <RepairProposalActions goToNodeId={null} canPreview previewing alreadyPreviewed={false} />,
    );
    expect(screen.getByTestId("builder-ai-preview-fix-button")).toBeDisabled();
    rerender(<RepairProposalActions goToNodeId={null} canPreview previewing={false} alreadyPreviewed />);
    expect(screen.getByTestId("builder-ai-preview-fix-button")).toBeDisabled();
    expect(screen.getByTestId("builder-ai-preview-fix-button").textContent).toContain("Previewed");
  });
});
