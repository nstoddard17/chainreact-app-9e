/**
 * Tests for CHECK-ACTIONS-2 — the "Needs attention" group (DiagnosisAttentionActions)
 * on the Check workflow card.
 *
 * Product rule: non-targetable issues (structural / failed last run) get a dedicated
 * group with friendly manual guidance and NO button (never a broken affordance). Pure
 * presentational; renders only guidance text — never a raw code / node id / field key.
 */
import { render, screen } from "@testing-library/react";

import { DiagnosisAttentionActions } from "@/features/workflow-builder/panels/_BuilderAiPanelRepairGoTo";

const f = (source: string, code: string, extra: Record<string, unknown> = {}) => ({
  source,
  code,
  severity: "error",
  title: "x",
  ...extra,
});
const dx = (findings: unknown[]) => ({ workflowId: "w", access: "OK", findings } as never);

describe("DiagnosisAttentionActions", () => {
  it("renders nothing when there are no graph/run findings", () => {
    const { container } = render(
      <DiagnosisAttentionActions diagnosis={dx([f("connection", "DISCONNECTED")])} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("structural finding → 'Needs attention' heading + guidance, no button", () => {
    render(<DiagnosisAttentionActions diagnosis={dx([f("graph", "no_trigger", { nodeIds: ["t1"] })])} />);
    const card = screen.getByTestId("builder-ai-diagnosis-attention");
    expect(card.textContent).toContain("Needs attention");
    expect(card.textContent).toContain("Review these issues manually.");
    expect(card.textContent).toContain("Add a trigger");
    // No button / link anywhere in the group.
    expect(card.querySelector("button")).toBeNull();
    expect(card.querySelector("a")).toBeNull();
  });

  it("renders one item per graph/run finding", () => {
    render(
      <DiagnosisAttentionActions
        diagnosis={dx([f("graph", "no_trigger"), f("run", "RECENT_RUN_FAILED", { severity: "warning" })])}
      />,
    );
    expect(screen.getAllByTestId("builder-ai-diagnosis-attention-item")).toHaveLength(2);
  });

  it("renders no raw code or node id", () => {
    render(<DiagnosisAttentionActions diagnosis={dx([f("graph", "no_trigger", { nodeIds: ["t1"] })])} />);
    const t = screen.getByTestId("builder-ai-diagnosis-attention").textContent ?? "";
    expect(t).not.toContain("no_trigger");
    expect(t).not.toMatch(/\bt1\b/);
  });

  // AI-GUIDANCE-UNREACHABLE-NODE-1 — guidance-only orphan-node card.
  describe("unreachable-node guidance card", () => {
    const orphan = (label: string, nodeId: string) =>
      f("graph", "unreachable_node", { nodeIds: [nodeId], nodeLabels: [label] });

    it("renders a guidance card with safe labels + 'what you can do', and NO Preview/Apply button", () => {
      render(<DiagnosisAttentionActions diagnosis={dx([orphan("Send Email", "node-secret-1")])} />);
      const card = screen.getByTestId("builder-ai-diagnosis-unreachable-node");
      expect(card.textContent).toContain("isn’t connected to the trigger");
      expect(card.textContent).toContain("Send Email");
      expect(card.textContent).toContain("What you can do");
      expect(card.textContent).toContain("Delete it if you don’t need it.");
      // Guidance-only: NO button or link of any kind (no Preview fix, no Apply).
      expect(card.querySelector("button")).toBeNull();
      expect(card.querySelector("a")).toBeNull();
      // No-leak: the raw node id never reaches the DOM.
      expect(card.textContent ?? "").not.toContain("node-secret-1");
    });

    it("uses count-aware copy for multiple unreachable steps", () => {
      render(
        <DiagnosisAttentionActions diagnosis={dx([orphan("Step A", "n-a"), orphan("Step B", "n-b")])} />,
      );
      const card = screen.getByTestId("builder-ai-diagnosis-unreachable-node");
      expect(card.textContent).toContain("2 steps in this workflow aren’t connected");
      // Not rendered as a generic one-line attention item anymore.
      expect(screen.queryAllByTestId("builder-ai-diagnosis-attention-item")).toHaveLength(0);
    });
  });
});
