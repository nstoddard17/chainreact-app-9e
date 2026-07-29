import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  GuidedActivateSection,
  GuidedTestSection,
} from "@/features/workflow-builder/panels/GuidedTestActivateSections";
import { WorkflowConfirmationRequiredError } from "@/lib/api/workflows";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — guided Test / Activate bodies. Locks: explicit
 * user action for both, the running/passed states, safe error rendering, and
 * the destructive-confirmation modal path on activate (server 409).
 */

describe("GuidedTestSection", () => {
  it("dispatches the test on click and disables while running", async () => {
    const onTest = jest.fn().mockResolvedValue(undefined);
    render(<GuidedTestSection onTest={onTest} testStatus="not_tested" />);
    fireEvent.click(screen.getByTestId("guided-test-button"));
    expect(onTest).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId("guided-test-button")).not.toBeDisabled(),
    );
  });

  it("shows the running state and blocks a second dispatch", () => {
    const onTest = jest.fn();
    render(<GuidedTestSection onTest={onTest} testStatus="running" />);
    const button = screen.getByTestId("guided-test-button");
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Testing…");
    fireEvent.click(button);
    expect(onTest).not.toHaveBeenCalled();
  });

  it("mentions the draft save when dirty and renders the safe run error", () => {
    render(
      <GuidedTestSection
        onTest={jest.fn()}
        testStatus="not_tested"
        isDirty
        runError="Test Workflow failed."
      />,
    );
    expect(screen.getByTestId("guided-test-body")).toHaveTextContent(
      "Your draft is saved first.",
    );
    expect(screen.getByTestId("guided-test-error")).toHaveTextContent(
      "Test Workflow failed.",
    );
  });
});

describe("GuidedActivateSection", () => {
  it("activates ONLY on the explicit click and shows the summary", async () => {
    const onActivate = jest.fn().mockResolvedValue(undefined);
    render(
      <GuidedActivateSection
        onActivate={onActivate}
        testPassed
        warnings={[]}
        connectedCount={2}
      />,
    );
    expect(onActivate).not.toHaveBeenCalled(); // never automatic
    expect(screen.getByTestId("guided-activate-body")).toHaveTextContent("✓ Test passed.");
    expect(screen.getByTestId("guided-activate-body")).toHaveTextContent("2 apps connected");
    fireEvent.click(screen.getByTestId("guided-activate-button"));
    await waitFor(() => expect(onActivate).toHaveBeenCalledWith(undefined));
  });

  it("renders verdict warnings", () => {
    render(
      <GuidedActivateSection
        onActivate={jest.fn()}
        testPassed={false}
        warnings={[
          {
            kind: "setup_warning",
            message: "Couldn't verify app connections.",
            nextStep: "Connections will be re-checked when you test or activate.",
            blocking: false,
          },
        ]}
        connectedCount={0}
      />,
    );
    expect(screen.getByTestId("guided-activate-warnings")).toHaveTextContent(
      "Couldn't verify app connections.",
    );
  });

  it("routes a 409 CONFIRMATION_REQUIRED through the shared modal and retries with the phrase", async () => {
    const detail = {
      requiresConfirmation: true as const,
      confirmationText: "CONFIRM",
      actions: [
        {
          nodeId: "n2",
          provider: "google-sheets",
          type: "delete_row",
          displayName: "Delete Row",
        },
      ],
    };
    const onActivate = jest
      .fn()
      .mockRejectedValueOnce(
        new WorkflowConfirmationRequiredError("confirmation required", 409, detail),
      )
      .mockResolvedValueOnce(undefined);
    render(
      <GuidedActivateSection
        onActivate={onActivate}
        testPassed
        warnings={[]}
        connectedCount={1}
      />,
    );
    fireEvent.click(screen.getByTestId("guided-activate-button"));
    // Modal opens; type the phrase and confirm.
    const input = await screen.findByTestId("destructive-action-confirmation-input");
    fireEvent.change(input, { target: { value: "CONFIRM" } });
    fireEvent.click(screen.getByTestId("destructive-action-confirmation-confirm"));
    await waitFor(() => expect(onActivate).toHaveBeenCalledTimes(2));
    expect(onActivate).toHaveBeenLastCalledWith("CONFIRM");
  });

  it("renders a safe error when activation fails", async () => {
    const onActivate = jest
      .fn()
      .mockRejectedValue(new Error("Workflow isn't ready to activate."));
    render(
      <GuidedActivateSection
        onActivate={onActivate}
        testPassed
        warnings={[]}
        connectedCount={1}
      />,
    );
    fireEvent.click(screen.getByTestId("guided-activate-button"));
    await waitFor(() =>
      expect(screen.getByTestId("guided-activate-error")).toHaveTextContent(
        "Workflow isn't ready to activate.",
      ),
    );
  });
});
