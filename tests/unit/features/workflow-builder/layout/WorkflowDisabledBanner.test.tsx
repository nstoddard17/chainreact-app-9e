/**
 * @jest-environment jsdom
 *
 * features/workflow-builder/layout/WorkflowDisabledBanner. Surfaces WHY a workflow is
 * disabled (the persisted disabledContext, e.g. the template-replace message) so the user
 * isn't left with an unexplained inactive workflow. Renders only for the `disabled` state.
 */
import { render, screen } from "@testing-library/react";
import { WorkflowDisabledBanner } from "@/features/workflow-builder/layout/WorkflowDisabledBanner";

describe("WorkflowDisabledBanner", () => {
  it("renders nothing for non-disabled states", () => {
    for (const state of ["draft", "active", "paused", "eligible_to_resume"] as const) {
      const { container } = render(
        <WorkflowDisabledBanner state={state} disabledReason={null} disabledContext="x" />,
      );
      expect(container).toBeEmptyDOMElement();
    }
  });

  it("shows the persisted disabledContext verbatim (template-replace case) + a Reactivate hint", () => {
    render(
      <WorkflowDisabledBanner
        state="disabled"
        disabledReason="manual_admin"
        disabledContext="Definition replaced from a template — reconnect and reactivate."
      />,
    );
    const banner = screen.getByTestId("workflow-disabled-banner");
    expect(banner).toHaveTextContent(/Definition replaced from a template/i);
    expect(banner).toHaveTextContent(/Workflow deactivated/i);
    expect(banner).toHaveTextContent(/Reactivate/i);
  });

  it("falls back to a per-reason explanation when no context is set", () => {
    render(
      <WorkflowDisabledBanner
        state="disabled"
        disabledReason="integration_revoked"
        disabledContext={null}
      />,
    );
    expect(screen.getByTestId("workflow-disabled-banner")).toHaveTextContent(
      /a connected account was disconnected/i,
    );
  });

  it("falls back to a generic message when neither context nor reason is present", () => {
    render(<WorkflowDisabledBanner state="disabled" disabledReason={null} disabledContext={null} />);
    expect(screen.getByTestId("workflow-disabled-banner")).toHaveTextContent(/turned off/i);
  });
});
