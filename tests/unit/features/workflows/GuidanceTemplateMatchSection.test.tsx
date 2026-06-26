import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidanceTemplateMatchSection } from "@/features/workflows/GuidanceTemplateMatchSection";
import type { GuidanceOfficialTemplateMatch } from "@/contracts/aiGuidance";

const MATCH: GuidanceOfficialTemplateMatch = {
  templateId: "c0ffee00-0000-4000-8000-00000000004e",
  name: "Support escalation from email",
  description: "Open a HubSpot ticket, Trello card, Slack alert, and draft a reply.",
  score: 20,
  confidence: "high",
  reasons: ["Matches the Gmail new labeled email trigger", "Includes the HubSpot create ticket step"],
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

describe("GuidanceTemplateMatchSection", () => {
  it("renders the official template match card with name, apps, step count, confidence, reasons, preview chain", () => {
    render(<GuidanceTemplateMatchSection matches={[MATCH]} />);
    expect(screen.getByTestId("guidance-template-match")).toBeInTheDocument();
    expect(screen.getByText("Official template match")).toBeInTheDocument();
    expect(screen.getByText("Support escalation from email")).toBeInTheDocument();
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.getByTestId("guidance-template-match-apps")).toHaveTextContent("Gmail · HubSpot · Trello · Slack");
    expect(screen.getByText("4 steps")).toBeInTheDocument();
    expect(screen.getByText(/Gmail: New labeled email → HubSpot: Create ticket/)).toBeInTheDocument();
    expect(screen.getByText(/Matches the Gmail new labeled email trigger/)).toBeInTheDocument();
  });

  it("renders nothing for an empty match list", () => {
    const { container } = render(<GuidanceTemplateMatchSection matches={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("never renders a raw {{...}} variable expression or config", () => {
    const { container } = render(<GuidanceTemplateMatchSection matches={[MATCH]} />);
    expect(container.textContent ?? "").not.toContain("{{");
  });

  it("is recommendation-only — no create/use/apply control that could auto-create", () => {
    render(<GuidanceTemplateMatchSection matches={[MATCH]} />);
    // No button/link at all in this slice (CTA deferred); definitely nothing that creates.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByText(/use template|create workflow|apply/i)).not.toBeInTheDocument();
  });
});

describe("GuidanceTemplateMatchSection — Preview CTA (REACT-AGENT-TEMPLATE-MATCH-3)", () => {
  it("renders a 'Preview template' CTA when onPreview is provided and calls it with the match", async () => {
    const user = userEvent.setup();
    const onPreview = jest.fn();
    render(<GuidanceTemplateMatchSection matches={[MATCH]} onPreview={onPreview} />);
    const cta = screen.getByTestId("guidance-template-preview-cta");
    expect(cta).toHaveTextContent("Preview template");
    // Label must not say Create/Use/Apply before the user sees confirmation.
    expect(cta.textContent ?? "").not.toMatch(/create|use|apply/i);
    await user.click(cta);
    expect(onPreview).toHaveBeenCalledTimes(1);
    expect(onPreview).toHaveBeenCalledWith(MATCH);
  });

  it("stays recommendation-only (no CTA) when onPreview is omitted", () => {
    render(<GuidanceTemplateMatchSection matches={[MATCH]} />);
    expect(screen.queryByTestId("guidance-template-preview-cta")).not.toBeInTheDocument();
  });
});
