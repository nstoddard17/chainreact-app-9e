/**
 * Tests for AI-CONFIG-ASSIST CS-8 multi-issue "Needs your input" group
 * (DiagnosisFieldActions on the Check workflow card).
 *
 * Product rule: Check produces actionable issue cards. For missing user-input
 * fields it renders one "Open <field> field" action per (node, empty required
 * field) across ALL affected nodes — no Suggest / Preview required. Setup/auth,
 * structural, and run findings produce NO open-field action (they stay in the
 * deterministic next-steps guidance). Navigation only — no graph mutation / save /
 * run / Apply; labels only, never raw ids / keys.
 *
 * `useRepairFieldTargets` is mocked (per-node) to isolate the grouping/rendering
 * from metadata resolution; `missingFieldNodeIds` runs for real over the diagnosis.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockTargets = jest.fn();
jest.mock("@/features/workflow-builder/ai/useRepairFieldTarget", () => ({
  useRepairFieldTargets: (nodeId: string) => mockTargets(nodeId),
  useRepairFieldTarget: () => null,
}));

import { DiagnosisFieldActions } from "@/features/workflow-builder/panels/_BuilderAiPanelRepairGoTo";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

const target = (nodeId: string, fieldKey: string, fieldLabel: string, nodeLabel: string) => ({
  nodeId,
  fieldKey,
  fieldLabel,
  nodeLabel,
  initialValues: {},
});

const finding = (nodeId: string) => ({
  source: "field",
  code: "MISSING_REQUIRED_FIELD",
  severity: "error",
  title: "Required fields are missing.",
  nodeIds: [nodeId],
});

const dx = (findings: unknown[]) => ({ workflowId: "w", access: "OK", findings } as never);

beforeEach(() => {
  mockTargets.mockReset();
  mockTargets.mockReturnValue([]);
  useConfigSlice.getState().reset();
  useGraphSlice.getState().reset();
});

describe("DiagnosisFieldActions — rendering", () => {
  it("renders nothing when there are no missing-required-field findings", () => {
    const { container } = render(
      <DiagnosisFieldActions diagnosis={dx([{ source: "connection", code: "DISCONNECTED", severity: "error", title: "x", nodeIds: ["s1"] }])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("single missing field → ONE 'Open Message field' action under 'Needs your input'", () => {
    mockTargets.mockImplementation((id) => (id === "slack1" ? [target("slack1", "text", "Message", "Send Channel Message")] : []));
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1")])} />);
    expect(screen.getByTestId("builder-ai-diagnosis-open-field").textContent).toContain("Needs your input");
    const btns = screen.getAllByTestId("builder-ai-diagnosis-open-field-button");
    expect(btns).toHaveLength(1);
    expect(btns[0]!.textContent).toBe("Open Message field");
  });

  it("two missing fields on TWO nodes → two distinct open-field actions", () => {
    mockTargets.mockImplementation((id) => {
      if (id === "slack1") return [target("slack1", "text", "Message", "Send Channel Message")];
      if (id === "gmail1") return [target("gmail1", "subject", "Subject", "Create Draft")];
      return [];
    });
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1"), finding("gmail1")])} />);
    const labels = screen.getAllByTestId("builder-ai-diagnosis-open-field-button").map((b) => b.textContent);
    expect(labels).toEqual(["Open Message field", "Open Subject field"]);
    // Node context shown via labels, not ids.
    const card = screen.getByTestId("builder-ai-diagnosis-open-field");
    expect(card.textContent).toContain("Send Channel Message");
    expect(card.textContent).toContain("Create Draft");
    expect(card.textContent).not.toMatch(/\bslack1\b|\bgmail1\b/);
  });

  it("multiple missing fields on the SAME node → distinct field actions", () => {
    mockTargets.mockImplementation((id) => (id === "slack1"
      ? [target("slack1", "channel", "Channel", "Send Channel Message"), target("slack1", "text", "Message", "Send Channel Message")]
      : []));
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1")])} />);
    const labels = screen.getAllByTestId("builder-ai-diagnosis-open-field-button").map((b) => b.textContent);
    expect(labels).toEqual(["Open Channel field", "Open Message field"]);
  });

  it("de-duplicates repeated node ids (one finding set per node, no duplicate actions)", () => {
    mockTargets.mockImplementation((id) => (id === "slack1" ? [target("slack1", "text", "Message", "Send Channel Message")] : []));
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1"), finding("slack1")])} />);
    // useRepairFieldTargets called once per DISTINCT node, not per finding.
    expect(mockTargets).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId("builder-ai-diagnosis-open-field-button")).toHaveLength(1);
  });

  it("a node whose targets don't resolve renders no button (no broken button)", () => {
    // finding present, but the node yields no targets (stale / metadata not loaded).
    mockTargets.mockReturnValue([]);
    render(<DiagnosisFieldActions diagnosis={dx([finding("ghost")])} />);
    expect(screen.queryByTestId("builder-ai-diagnosis-open-field-button")).toBeNull();
  });

  it("renders no raw node id / field key anywhere", () => {
    mockTargets.mockImplementation((id) => (id === "slack1" ? [target("slack1", "text", "Message", "Send Channel Message")] : []));
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1")])} />);
    const t = screen.getByTestId("builder-ai-diagnosis-open-field").textContent ?? "";
    expect(t).not.toContain("slack1");
    expect(t).not.toMatch(/\btext\b/);
  });
});

describe("DiagnosisFieldActions — navigation only", () => {
  it("clicking an action reveals + highlights the correct node/field; no graph mutation", async () => {
    useGraphSlice.getState().hydrate("wf1", {
      nodes: [
        { id: "slack1", kind: "action", provider: "slack", type: "send_channel_message", config: { channel: "C1", text: "" }, position: { x: 0, y: 0 } },
        { id: "gmail1", kind: "action", provider: "gmail", type: "create_draft", config: { subject: "" }, position: { x: 0, y: 1 } },
      ],
      edges: [],
    }, "rev-1");
    mockTargets.mockImplementation((id) => {
      if (id === "slack1") return [target("slack1", "text", "Message", "Send Channel Message")];
      if (id === "gmail1") return [target("gmail1", "subject", "Subject", "Create Draft")];
      return [];
    });
    const user = userEvent.setup();
    render(<DiagnosisFieldActions diagnosis={dx([finding("slack1"), finding("gmail1")])} />);

    // Click the SECOND action (Subject on Create Draft) — must target gmail1/subject.
    await user.click(screen.getByText("Open Subject field"));
    let cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("gmail1");
    expect(cs.focusFieldKey).toBe("subject");

    // Click the FIRST action (Message on Send Channel Message) — re-targets slack1/text.
    await user.click(screen.getByText("Open Message field"));
    cs = useConfigSlice.getState();
    expect(cs.activeNodeId).toBe("slack1");
    expect(cs.focusFieldKey).toBe("text");

    // Graph untouched (navigation only).
    const gs = useGraphSlice.getState();
    expect(gs.pendingNodes.find((n) => n.id === "slack1")!.config).toEqual({ channel: "C1", text: "" });
    expect(gs.pendingNodes.find((n) => n.id === "gmail1")!.config).toEqual({ subject: "" });
  });
});
