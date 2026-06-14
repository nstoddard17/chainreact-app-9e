/**
 * Tests for CHECK-ACTIONS-1 — the "Needs setup" group (DiagnosisSetupActions) on the
 * Check workflow card.
 *
 * Product rule: setup/auth/connection problems get a dedicated actionable group —
 * friendly guidance plus an `/apps` link when the user can act (DISCONNECTED /
 * RECONNECT_REQUIRED / TOKEN_EXPIRED / MISSING_SCOPES). Owner-must-reconnect / disabled
 * / unknown render guidance with NO button. This group offers NO open-field action and
 * arms NO chat-fill, and links only to the existing Apps page. Labels only — never a
 * raw code / node id / scope name. Pure presentational; the config/graph slices are
 * never touched (navigation is an outbound link, not `revealNode`).
 */
import { render, screen } from "@testing-library/react";

import { DiagnosisSetupActions } from "@/features/workflow-builder/panels/_BuilderAiPanelRepairGoTo";

const conn = (code: string, extra: Record<string, unknown> = {}) => ({
  source: "connection",
  code,
  severity: code === "TOKEN_EXPIRED" ? "warning" : "error",
  title: "x",
  provider: "slack",
  providerName: "Slack",
  nodeIds: ["s1"],
  ...extra,
});

const dx = (findings: unknown[]) => ({ workflowId: "w", access: "OK", findings } as never);

describe("DiagnosisSetupActions — rendering", () => {
  it("renders nothing when there are no connection findings", () => {
    const { container } = render(
      <DiagnosisSetupActions
        diagnosis={dx([{ source: "field", code: "MISSING_REQUIRED_FIELD", severity: "error", title: "x", nodeIds: ["s1"] }])}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("Slack reconnect finding → 'Needs setup' card with reconnect guidance + Apps link", () => {
    render(<DiagnosisSetupActions diagnosis={dx([conn("RECONNECT_REQUIRED")])} />);
    const card = screen.getByTestId("builder-ai-diagnosis-setup");
    expect(card.textContent).toContain("Needs setup");
    expect(card.textContent).toContain("Slack needs to be reconnected before this workflow can run.");
    const link = screen.getByTestId("builder-ai-diagnosis-setup-link");
    expect(link).toHaveAttribute("href", "/apps");
    expect(link.textContent).toBe("Reconnect Slack in Apps");
  });

  it("does NOT render any open-field action or arm chat-fill", () => {
    render(<DiagnosisSetupActions diagnosis={dx([conn("DISCONNECTED")])} />);
    expect(screen.queryByTestId("builder-ai-diagnosis-open-field")).toBeNull();
    expect(screen.queryByTestId("builder-ai-diagnosis-open-field-button")).toBeNull();
  });

  it("guidance-only finding (owner must reconnect) renders text with NO link", () => {
    render(<DiagnosisSetupActions diagnosis={dx([conn("NOT_WORKFLOW_OWNER")])} />);
    expect(screen.getByTestId("builder-ai-diagnosis-setup").textContent).toContain("creator");
    expect(screen.queryByTestId("builder-ai-diagnosis-setup-link")).toBeNull();
  });

  it("renders one item per connection finding, in order", () => {
    render(
      <DiagnosisSetupActions
        diagnosis={dx([
          conn("DISCONNECTED", { provider: "slack", providerName: "Slack" }),
          conn("NOT_WORKFLOW_OWNER", { provider: "gmail", providerName: "Gmail" }),
        ])}
      />,
    );
    const items = screen.getAllByTestId("builder-ai-diagnosis-setup-item");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("Slack");
    expect(items[1]!.textContent).toContain("Gmail");
    // Only the actionable (first) finding has a link.
    expect(screen.getAllByTestId("builder-ai-diagnosis-setup-link")).toHaveLength(1);
  });

  it("renders no raw code / node id / scope name anywhere", () => {
    render(
      <DiagnosisSetupActions
        diagnosis={dx([conn("MISSING_SCOPES", { missingScopes: ["channels:read"] })])}
      />,
    );
    const t = screen.getByTestId("builder-ai-diagnosis-setup").textContent ?? "";
    expect(t).not.toContain("MISSING_SCOPES");
    expect(t).not.toContain("channels:read");
    expect(t).not.toMatch(/\bs1\b/);
  });
});
