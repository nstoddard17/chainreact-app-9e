import { render, screen, fireEvent } from "@testing-library/react";
import type { CheckWorkflowSetupTarget } from "@/core/workflows/checkWorkflowReview";
import { GuidedConfigureSection } from "@/features/workflow-builder/panels/GuidedConfigureSection";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — Configure stage body: one node at a time with
 * visible progress, auto-advance when a node resolves (drops from targets),
 * and an honest unresolved-variable path when no field targets remain.
 */

function target(nodeId: string, label: string, fields: string[]): CheckWorkflowSetupTarget {
  return { nodeId, provider: "slack", type: "send_channel_message", label, missingFieldNames: fields };
}

const T1 = target("n1", "Charge succeeded", ["event"]);
const T2 = target("n2", "Send Channel Message", ["channel", "text"]);
const T3 = target("n3", "Create Row", ["spreadsheet"]);

// The section delegates rendering to the builder's existing wiring; a marker
// standing in for BuilderNodeSetupCard is enough to prove scoping.
function renderNodeSetup(targets: readonly CheckWorkflowSetupTarget[]) {
  return <div data-testid="node-setup-marker">{targets.map((t) => t.label).join("|")}</div>;
}

it("renders ONLY the current (first) node with a step progress line", () => {
  render(
    <GuidedConfigureSection
      targets={[T1, T2, T3]}
      renderNodeSetup={renderNodeSetup}
      configureBlockers={[]}
    />,
  );
  expect(screen.getByTestId("guided-configure-progress")).toHaveTextContent(
    "Step 1 of 3: set up Charge succeeded.",
  );
  expect(screen.getByTestId("node-setup-marker")).toHaveTextContent("Charge succeeded");
  expect(screen.getByTestId("node-setup-marker")).not.toHaveTextContent("Send Channel Message");
  expect(screen.getByText(/Next up:/)).toHaveTextContent("Send Channel Message, Create Row");
});

it("advances automatically when the current node resolves, keeping the done count", () => {
  const { rerender } = render(
    <GuidedConfigureSection
      targets={[T1, T2, T3]}
      renderNodeSetup={renderNodeSetup}
      configureBlockers={[]}
    />,
  );
  // n1 completed → dropped from targets.
  rerender(
    <GuidedConfigureSection
      targets={[T2, T3]}
      renderNodeSetup={renderNodeSetup}
      configureBlockers={[]}
    />,
  );
  expect(screen.getByTestId("guided-configure-progress")).toHaveTextContent(
    "Step 2 of 3: set up Send Channel Message. (1 of 3 configured)",
  );
  expect(screen.getByTestId("node-setup-marker")).toHaveTextContent("Send Channel Message");
});

it("a single remaining node reads as 'One step left'", () => {
  render(
    <GuidedConfigureSection
      targets={[T2]}
      renderNodeSetup={renderNodeSetup}
      configureBlockers={[]}
    />,
  );
  expect(screen.getByTestId("guided-configure-progress")).toHaveTextContent(
    "One step left: set up Send Channel Message.",
  );
});

it("no field targets + unresolved-variable blockers → honest note + issues rail", () => {
  const onOpenIssues = jest.fn();
  render(
    <GuidedConfigureSection
      targets={[]}
      renderNodeSetup={renderNodeSetup}
      configureBlockers={[
        {
          kind: "unresolved_variable",
          message: "“Send Channel Message” references a step that was removed.",
          nextStep: "Re-pick the value from an existing step, or clear it.",
          blocking: true,
        },
      ]}
      onOpenIssues={onOpenIssues}
    />,
  );
  expect(screen.getByTestId("guided-configure-variables")).toHaveTextContent(
    "references a step that was removed",
  );
  fireEvent.click(screen.getByTestId("guided-configure-variables-open-issues"));
  expect(onOpenIssues).toHaveBeenCalled();
  expect(screen.queryByTestId("node-setup-marker")).toBeNull();
});
