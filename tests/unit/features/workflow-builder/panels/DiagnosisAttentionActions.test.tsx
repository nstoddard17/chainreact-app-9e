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
});
