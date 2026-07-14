/**
 * REGRESSION (AI-TEMPLATE-APPLY-CURRENT):
 *
 *   Applying a template suggested by the React Agent to an open workflow must UPDATE THAT WORKFLOW IN
 *   PLACE unless the user explicitly selects "Create as new workflow".
 *
 * Before this fix, accepting a React-Agent official-template match always called the create-new route
 * (`useTemplate`) and navigated (`router.push`) to a brand-new workflow — destroying the builder
 * session the user was editing. This test fails under that old behavior: it asserts the in-builder
 * dialog offers an "Apply to current workflow" choice that delegates to the in-place apply handler and
 * performs NO create + NO navigation, while "Create as new workflow" remains an explicit escape hatch.
 *
 * Driven through the public panel boundary (WorkflowGuidancePanel conversational/builder mode).
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

const mockRequest = jest.fn();
jest.mock("@/lib/api/ai/guidance", () => ({
  requestWorkflowGuidance: (...a: unknown[]) => mockRequest(...a),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));

const mockUseTemplate = jest.fn();
class TemplateApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
jest.mock("@/lib/api/workflowTemplates", () => ({
  useTemplate: (...a: unknown[]) => mockUseTemplate(...a),
  TemplateApiError,
}));

import { WorkflowGuidancePanel } from "@/features/workflows/WorkflowGuidancePanel";

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
  steps: [{ kind: "action", provider: "hubspot", type: "create_ticket", label: "HubSpot: Create ticket" }],
};

beforeEach(() => {
  mockRequest.mockReset();
  mockPush.mockReset();
  mockUseTemplate.mockReset();
  mockRequest.mockResolvedValue({
    ok: true,
    guidanceText: "I found an official template that already matches this workflow.",
    source: "official_template_match",
    workflowPlan: null,
    previewDraft: null,
    officialTemplateMatches: [MATCH],
  });
});

/** Render the BUILDER rail (conversational + workflowId + in-place apply handler), then open the match preview. */
async function openBuilderMatchPreview(onTemplateApplyToCurrent: jest.Mock) {
  const user = userEvent.setup();
  render(
    <WorkflowGuidancePanel
      accountId="acct-1"
      workflowId="wf-open-9"
      conversational
      onTemplateApplyToCurrent={onTemplateApplyToCurrent}
    />,
  );
  await user.type(screen.getByPlaceholderText(/Describe what to add or change/i), "support email to HubSpot ticket{Enter}");
  await waitFor(() => expect(screen.getByTestId("guidance-template-preview-cta")).toBeInTheDocument());
  await user.click(screen.getByTestId("guidance-template-preview-cta"));
  await waitFor(() => expect(screen.getByTestId("guidance-template-preview-dialog")).toBeInTheDocument());
  return user;
}

describe("AI template application keeps the current workflow (regression)", () => {
  it("inside a builder, the dialog offers the two-option choice (Apply to current is primary)", async () => {
    await openBuilderMatchPreview(jest.fn());
    expect(screen.getByTestId("guidance-template-apply-current")).toHaveTextContent(/apply to current workflow/i);
    expect(screen.getByTestId("guidance-template-create-new")).toHaveTextContent(/create as new workflow/i);
    // NOT the old single always-create "Use this template" button.
    expect(screen.queryByTestId("guidance-template-preview-use")).not.toBeInTheDocument();
  });

  it("clicking the match / opening the preview performs NO write until a target is chosen", async () => {
    await openBuilderMatchPreview(jest.fn());
    expect(mockUseTemplate).not.toHaveBeenCalled(); // no create-new
    expect(mockPush).not.toHaveBeenCalled(); // no navigation
  });

  it("Apply to current workflow → applies IN PLACE (same workflow) with NO create + NO navigation", async () => {
    const onApply = jest.fn().mockResolvedValue(undefined);
    const user = await openBuilderMatchPreview(onApply);

    await user.click(screen.getByTestId("guidance-template-apply-current"));

    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith({ templateId: MATCH.templateId, templateName: MATCH.name }),
    );
    // The core of the regression: NO new workflow was created and the builder did NOT navigate away.
    expect(mockUseTemplate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // Dialog dismissed after a successful in-place apply.
    await waitFor(() =>
      expect(screen.queryByTestId("guidance-template-preview-dialog")).not.toBeInTheDocument(),
    );
  });

  it("Create as new workflow → explicit escape hatch: creates ONE workflow and navigates", async () => {
    const onApply = jest.fn();
    const user = await openBuilderMatchPreview(onApply);
    mockUseTemplate.mockResolvedValue({ workflowId: "wf-new-1", name: MATCH.name });

    await user.click(screen.getByTestId("guidance-template-create-new"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/workflows/wf-new-1"));
    expect(mockUseTemplate).toHaveBeenCalledTimes(1);
    expect(mockUseTemplate).toHaveBeenCalledWith(MATCH.templateId, { targetAccountId: "acct-1" });
    // The in-place handler was NOT used for the explicit create-new choice.
    expect(onApply).not.toHaveBeenCalled();
  });

  it("Cancel performs no write and no navigation (choice abandoned)", async () => {
    const onApply = jest.fn();
    const user = await openBuilderMatchPreview(onApply);
    await user.click(screen.getByTestId("guidance-template-preview-cancel"));
    await waitFor(() =>
      expect(screen.queryByTestId("guidance-template-preview-dialog")).not.toBeInTheDocument(),
    );
    expect(onApply).not.toHaveBeenCalled();
    expect(mockUseTemplate).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a failed in-place apply stays in the builder (no navigation, no create-new fallback)", async () => {
    const onApply = jest.fn().mockRejectedValue(new TemplateApiError("Workflow not found.", "WORKFLOW_NOT_FOUND", 404));
    const user = await openBuilderMatchPreview(onApply);

    await user.click(screen.getByTestId("guidance-template-apply-current"));

    await waitFor(() =>
      expect(screen.getByTestId("guidance-template-preview-error")).toHaveTextContent("Workflow not found."),
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockUseTemplate).not.toHaveBeenCalled();
    // Dialog remains so the user can retry or cancel — nothing was destroyed.
    expect(screen.getByTestId("guidance-template-preview-dialog")).toBeInTheDocument();
  });

  it("dashboard (no open workflow) keeps single create-new behavior — no in-place choice", async () => {
    const user = userEvent.setup();
    render(<WorkflowGuidancePanel accountId="acct-1" />);
    await user.type(screen.getByPlaceholderText(/Example:/i), "support email to HubSpot ticket");
    await user.click(screen.getByTestId("workflow-guidance-submit"));
    await waitFor(() => expect(screen.getByTestId("guidance-template-preview-cta")).toBeInTheDocument());
    await user.click(screen.getByTestId("guidance-template-preview-cta"));
    expect(screen.getByTestId("guidance-template-preview-use")).toBeInTheDocument();
    expect(screen.queryByTestId("guidance-template-apply-current")).not.toBeInTheDocument();
  });
});
