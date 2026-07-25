/**
 * HELP-CENTER-CONTEXTUAL-1 — builder validation-drawer Help Center link.
 *
 * Pins: the has-issues state renders one footer link to the setup-issues
 * article (keyboard-reachable real <a>), the ready state renders no
 * troubleshooting help, and existing issue rows/actions are unchanged.
 */
import { act, render, screen } from "@testing-library/react";

import { ValidationSummary } from "@/features/workflow-builder/validation/ValidationSummary";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("ValidationSummary — Help Center link", () => {
  it("has-issues state renders the setup-issues article link as a footer affordance", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary />);
    expect(screen.getByTestId("validation-summary").getAttribute("data-state")).toBe(
      "has-issues",
    );
    const help = screen.getByTestId("validation-summary-help-link");
    expect(help.tagName.toLowerCase()).toBe("a");
    expect(help).toHaveAttribute("href", "/help/fix-workflow-setup-issues");
    expect(help).toHaveTextContent("Learn how to fix setup issues");
    // The existing issue content is intact alongside it.
    expect(screen.getByText(/add a trigger/i)).toBeInTheDocument();
  });

  it("ready state renders NO troubleshooting help link", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTriggerFromMeta({
        key: "slack:slack.message.channel",
        provider: "slack",
        type: "slack.message.channel",
        displayName: "Slack Message",
        description: "x",
        category: "messaging",
        activation: "webhook",
        requiresIntegration: true,
        fields: [],
        payloadShape: [],
        displayOrder: 10,
      });
    });
    render(<ValidationSummary />);
    expect(screen.getByTestId("validation-summary").getAttribute("data-state")).toBe(
      "ready",
    );
    expect(
      screen.queryByTestId("validation-summary-help-link"),
    ).not.toBeInTheDocument();
  });
});
