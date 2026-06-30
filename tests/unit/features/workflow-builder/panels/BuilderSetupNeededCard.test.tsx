import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgentSetupIssue } from "@/core/workflows/agentSetupIssues";
import { BuilderSetupNeededCard } from "@/features/workflow-builder/panels/BuilderSetupNeededCard";

/**
 * CHECKLIST-ITEM-10 — the presentational "Setup needed" card. Renders node/field
 * labels + safe explanation + next step, marks blocking, and opens-and-focuses the
 * field on click. No store / fetch / model — navigation only.
 */

function issue(over: Partial<AgentSetupIssue> = {}): AgentSetupIssue {
  return {
    id: "missing_required_field:n1:to",
    kind: "missing_required_field",
    workflowId: "wf1",
    nodeId: "n1",
    nodeLabel: "Gmail",
    actionLabel: "Gmail",
    fieldPath: "to",
    fieldLabel: "To",
    message: "Gmail needs a To.",
    explanation: "React added this step but didn't have enough information to fill this in safely. Choose a value to continue.",
    nextStep: "Open the To field and fill it in.",
    blocking: true,
    focusTarget: { nodeId: "n1", fieldPath: "to" },
    ...over,
  };
}

describe("BuilderSetupNeededCard", () => {
  it("renders nothing when there are no issues", () => {
    const { container } = render(<BuilderSetupNeededCard issues={[]} onOpenIssue={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the message, explanation, next step, and a blocking count", () => {
    render(<BuilderSetupNeededCard issues={[issue()]} onOpenIssue={jest.fn()} />);
    expect(screen.getByText("Gmail needs a To.")).toBeInTheDocument();
    expect(screen.getByText(/Choose a value to continue/)).toBeInTheDocument();
    expect(screen.getByText("Open the To field and fill it in.")).toBeInTheDocument();
    expect(screen.getByTestId("builder-setup-needed-blocking")).toHaveTextContent("1 to fix before active");
  });

  it("clicking an issue with a focus target calls onOpenIssue with that issue", async () => {
    const user = userEvent.setup();
    const onOpenIssue = jest.fn();
    render(<BuilderSetupNeededCard issues={[issue()]} onOpenIssue={onOpenIssue} />);
    await user.click(screen.getByTestId("builder-setup-needed-issue"));
    expect(onOpenIssue).toHaveBeenCalledTimes(1);
    expect(onOpenIssue.mock.calls[0]![0]).toMatchObject({ nodeId: "n1", fieldPath: "to" });
  });

  it("carries the field-path + blocking flags on the clickable row for the parent to focus", () => {
    render(<BuilderSetupNeededCard issues={[issue()]} onOpenIssue={jest.fn()} />);
    const row = screen.getByTestId("builder-setup-needed-issue");
    expect(row.tagName).toBe("BUTTON");
    expect(row).toHaveAttribute("data-field-path", "to");
    expect(row).toHaveAttribute("data-blocking", "true");
  });

  it("omits the blocking count when no issue blocks (e.g. unknown / unresolved)", () => {
    const nonBlocking = issue({
      id: "unknown:n2",
      kind: "unknown",
      blocking: false,
      message: "Custom Step needs review.",
      focusTarget: { nodeId: "n2" },
      fieldPath: undefined,
      fieldLabel: undefined,
    });
    render(<BuilderSetupNeededCard issues={[nonBlocking]} onOpenIssue={jest.fn()} />);
    expect(screen.queryByTestId("builder-setup-needed-blocking")).not.toBeInTheDocument();
  });

  it("never renders a config value (the read-model is label-only)", () => {
    render(<BuilderSetupNeededCard issues={[issue()]} onOpenIssue={jest.fn()} />);
    expect(screen.getByTestId("builder-setup-needed").textContent ?? "").not.toMatch(
      /token|secret|xox|Bearer|password/i,
    );
  });
});
