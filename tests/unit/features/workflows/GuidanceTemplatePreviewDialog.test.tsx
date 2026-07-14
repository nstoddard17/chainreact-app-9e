import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidanceTemplatePreviewDialog } from "@/features/workflows/GuidanceTemplatePreviewDialog";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

const MATCH: GuidanceOfficialTemplateMatch = {
  templateId: "c0ffee00-0000-4000-8000-00000000004e",
  name: "Support escalation from email",
  description: "Open a HubSpot ticket, Trello card, Slack alert, and draft a reply.",
  score: 20,
  confidence: "high",
  reasons: ["Matches the Gmail new labeled email trigger"],
  isOfficial: true,
  providers: ["gmail", "hubspot", "trello", "slack"],
  providerLabels: ["Gmail", "HubSpot", "Trello", "Slack"],
  triggerKind: "app",
  category: "sales-crm",
  categoryLabel: "Sales & CRM",
  nodeCount: 5,
  stepCount: 4,
  steps: [
    { kind: "trigger", provider: "gmail", type: "new_labeled_email", label: "Gmail: New labeled email" },
    { kind: "action", provider: "hubspot", type: "create_ticket", label: "HubSpot: Create ticket" },
  ],
};

function renderDialog(over: Partial<ComponentProps<typeof GuidanceTemplatePreviewDialog>> = {}) {
  const onConfirmUse = jest.fn();
  const onClose = jest.fn();
  render(
    <GuidanceTemplatePreviewDialog
      match={MATCH}
      busy={false}
      error={null}
      onConfirmUse={onConfirmUse}
      onClose={onClose}
      {...over}
    />,
  );
  return { onConfirmUse, onClose };
}

describe("GuidanceTemplatePreviewDialog", () => {
  it("shows the safe summary: title, official badge, apps, step count, trigger kind, chain", () => {
    renderDialog();
    expect(screen.getByTestId("guidance-template-preview-dialog")).toBeInTheDocument();
    expect(screen.getByText("Support escalation from email")).toBeInTheDocument();
    expect(screen.getByTestId("official-badge")).toBeInTheDocument();
    expect(screen.getByTestId("summary-required-apps")).toBeInTheDocument();
    expect(screen.getByTestId("summary-step-count")).toHaveTextContent("4 steps");
    expect(screen.getByTestId("summary-chain")).toBeInTheDocument();
  });

  it("renders the reassurance copy", () => {
    renderDialog();
    expect(
      screen.getByText(/connect apps and fill in required fields after the workflow is created/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not copy credentials or account-specific settings/i),
    ).toBeInTheDocument();
  });

  it("never renders raw {{...}}, config, or definition JSON", () => {
    const { container } = render(
      <GuidanceTemplatePreviewDialog match={MATCH} busy={false} error={null} onConfirmUse={jest.fn()} onClose={jest.fn()} />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain("{{");
    expect(text).not.toMatch(/"config"|"definition"|"nodes"|"edges"/);
  });

  it("confirm calls onConfirmUse; cancel + close call onClose; opening called neither itself", async () => {
    const user = userEvent.setup();
    const { onConfirmUse, onClose } = renderDialog();
    expect(onConfirmUse).not.toHaveBeenCalled(); // opening creates nothing
    await user.click(screen.getByTestId("guidance-template-preview-use"));
    expect(onConfirmUse).toHaveBeenCalledTimes(1);
    await user.click(screen.getByTestId("guidance-template-preview-cancel"));
    await user.click(screen.getByTestId("guidance-template-preview-close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows a safe error and disables the confirm button while busy", () => {
    renderDialog({ busy: true, error: "Template no longer exists." });
    expect(screen.getByTestId("guidance-template-preview-error")).toHaveTextContent("Template no longer exists.");
    expect(screen.getByTestId("guidance-template-preview-use")).toBeDisabled();
  });

  // AI-TEMPLATE-APPLY-CURRENT — the two-option choice when editing inside a builder.
  describe("in-builder choice (canApplyToCurrent)", () => {
    it("offers Apply-to-current (primary) and Create-as-new (secondary) — not two identical Use buttons", () => {
      renderDialog({ canApplyToCurrent: true, onApplyToCurrent: jest.fn() });
      expect(screen.getByTestId("guidance-template-choice-intro")).toBeInTheDocument();
      expect(screen.getByTestId("guidance-template-apply-current")).toHaveTextContent(/apply to current workflow/i);
      expect(screen.getByTestId("guidance-template-create-new")).toHaveTextContent(/create as new workflow/i);
      // The single-action button is NOT rendered in choice mode.
      expect(screen.queryByTestId("guidance-template-preview-use")).not.toBeInTheDocument();
    });

    it("explains replacement semantics + that a checkpoint/History restore is available", () => {
      renderDialog({ canApplyToCurrent: true, onApplyToCurrent: jest.fn() });
      expect(screen.getByText(/replaces the current draft with this template/i)).toBeInTheDocument();
      expect(screen.getByText(/restored from History/i)).toBeInTheDocument();
      expect(screen.getByText(/leaves the current workflow unchanged/i)).toBeInTheDocument();
    });

    it("primary calls onApplyToCurrent; secondary calls onConfirmUse; cancel calls onClose", async () => {
      const user = userEvent.setup();
      const onApplyToCurrent = jest.fn();
      const { onConfirmUse, onClose } = renderDialog({ canApplyToCurrent: true, onApplyToCurrent });
      await user.click(screen.getByTestId("guidance-template-apply-current"));
      expect(onApplyToCurrent).toHaveBeenCalledTimes(1);
      expect(onConfirmUse).not.toHaveBeenCalled();
      await user.click(screen.getByTestId("guidance-template-create-new"));
      expect(onConfirmUse).toHaveBeenCalledTimes(1);
      await user.click(screen.getByTestId("guidance-template-preview-cancel"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("busy disables both choice actions (no double-submit)", () => {
      renderDialog({ canApplyToCurrent: true, onApplyToCurrent: jest.fn(), busy: true });
      expect(screen.getByTestId("guidance-template-apply-current")).toBeDisabled();
      expect(screen.getByTestId("guidance-template-create-new")).toBeDisabled();
    });

    it("without an onApplyToCurrent handler it stays single-action (dashboard-safe)", () => {
      renderDialog({ canApplyToCurrent: true });
      expect(screen.queryByTestId("guidance-template-apply-current")).not.toBeInTheDocument();
      expect(screen.getByTestId("guidance-template-preview-use")).toBeInTheDocument();
    });
  });
});
