/**
 * Tests for features/workflow-builder/validation/ValidationSummary.
 *
 * Slice 4.BUILDER-VALIDATION-1 — drawer body for the right drawer's
 * `validation` mode. Reads from `useGraphSlice`, computes issues with
 * `collectBuilderValidationIssues`, renders a "Ready" or grouped-issue
 * UI, and dispatches `configSlice.openNode` when an issue with a
 * nodeId is clicked. No backend / AI / provider-specific logic.
 */
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ValidationSummary } from "@/features/workflow-builder/validation/ValidationSummary";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";
import { useConfigSlice } from "@/features/workflow-builder/state/configSlice";

beforeEach(() => {
  useGraphSlice.getState().reset();
  useConfigSlice.getState().reset();
});

describe("ValidationSummary — ready state", () => {
  it("renders the ready state when no issues are detected", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    // Patch in a configured trigger so the helper finds no issues.
    act(() => {
      useGraphSlice
        .getState()
        .addTriggerFromMeta({
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
    const summary = screen.getByTestId("validation-summary");
    expect(summary.getAttribute("data-state")).toBe("ready");
    expect(screen.getByText(/ready to run/i)).toBeInTheDocument();
  });
});

describe("ValidationSummary — has-issues state", () => {
  it("renders a no_trigger issue under the 'Workflow setup' category", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary />);
    const summary = screen.getByTestId("validation-summary");
    expect(summary.getAttribute("data-state")).toBe("has-issues");
    expect(screen.getByText(/add a trigger/i)).toBeInTheDocument();
    // Slice 4.BUILDER-VALIDATION-CATEGORIES — no_trigger is a structural problem.
    const group = screen.getByTestId("validation-summary-group");
    expect(group.getAttribute("data-category")).toBe("workflow_setup");
    expect(screen.getByText(/^Workflow setup · 1$/)).toBeInTheDocument();
  });

  it("groups blank/unconfigured nodes under 'Needs your input' with a count", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    // Two unconfigured nodes (trigger + action) → 2 'needs your input' issues.
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    render(<ValidationSummary />);
    const group = screen.getByTestId("validation-summary-group");
    expect(group.getAttribute("data-category")).toBe("needs_input");
    expect(group.getAttribute("data-severity")).toBe("error");
    expect(screen.getByText(/^Needs your input · 2$/)).toBeInTheDocument();
  });

  it("renders a friendly node label on each row (never the raw provider:type key)", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    render(<ValidationSummary />);
    // Slice 4.BUILDER-NODE-IDENTITY-1 — unconfigured nodes (no type yet) fall
    // back to the friendly kind label, NEVER the raw "slack · (unconfigured)".
    expect(screen.queryByText(/slack · \(unconfigured\)/i)).toBeNull();
    expect(screen.getAllByText(/^Trigger$/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/^Action$/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("ValidationSummary — issue → openNode round-trip", () => {
  it("clicks on a nodeId-bearing issue and dispatches configSlice.openNode for that node", async () => {
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    const actionId = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "action")!.id;

    render(<ValidationSummary />);
    expect(useConfigSlice.getState().activeNodeId).toBeNull();

    // The clickable issue is a <button> with data-node-id.
    const issueBtn = screen.getAllByTestId("validation-summary-issue").find(
      (el) => el.getAttribute("data-node-id") === actionId,
    );
    expect(issueBtn).toBeDefined();
    await user.click(issueBtn!);
    expect(useConfigSlice.getState().activeNodeId).toBe(actionId);
  });

  it("fires onOpenNode callback when an issue is clicked", async () => {
    const user = userEvent.setup();
    const onOpenNode = jest.fn();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    const actionId = useGraphSlice
      .getState()
      .pendingNodes.find((n) => n.kind === "action")!.id;

    render(<ValidationSummary onOpenNode={onOpenNode} />);
    const issueBtn = screen.getAllByTestId("validation-summary-issue").find(
      (el) => el.getAttribute("data-node-id") === actionId,
    );
    await user.click(issueBtn!);
    expect(onOpenNode).toHaveBeenCalledWith(actionId);
  });

  it("does NOT make graph-level issues (no nodeId) clickable buttons", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary />);
    // The no_trigger issue has no nodeId — its row should NOT render
    // as a <button> (so clicking it doesn't dispatch openNode against
    // a non-existent node).
    const issueRow = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "no_trigger");
    expect(issueRow?.tagName.toLowerCase()).not.toBe("button");
  });

  it("does NOT mutate graphSlice when an issue is clicked (read-only with respect to graph)", async () => {
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    const before = useGraphSlice.getState().pendingNodes;
    const dirtyBefore = useGraphSlice.getState().isDirty;
    const actionId = before.find((n) => n.kind === "action")!.id;

    render(<ValidationSummary />);
    const issueBtn = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-node-id") === actionId);
    await user.click(issueBtn!);

    expect(useGraphSlice.getState().pendingNodes).toBe(before);
    expect(useGraphSlice.getState().isDirty).toBe(dirtyBefore);
  });
});

describe("ValidationSummary — no_trigger 'Choose trigger' action (Slice 4.BUILDER-TRIGGER-RECOVERY-1)", () => {
  it("renders a 'Choose trigger' button on the no_trigger issue when onChooseTrigger is provided", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary onChooseTrigger={jest.fn()} />);
    expect(screen.getByTestId("validation-choose-trigger")).toBeInTheDocument();
  });

  it("does NOT render the 'Choose trigger' button when onChooseTrigger is omitted", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary />);
    expect(screen.queryByTestId("validation-choose-trigger")).toBeNull();
    // The no_trigger error itself is still surfaced.
    const issueRow = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "no_trigger");
    expect(issueRow).toBeDefined();
  });

  it("fires onChooseTrigger when the button is clicked (and does not mutate the graph)", async () => {
    const user = userEvent.setup();
    const onChooseTrigger = jest.fn();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    const before = useGraphSlice.getState().pendingNodes;
    render(<ValidationSummary onChooseTrigger={onChooseTrigger} />);
    await user.click(screen.getByTestId("validation-choose-trigger"));
    expect(onChooseTrigger).toHaveBeenCalledTimes(1);
    expect(useGraphSlice.getState().pendingNodes).toBe(before);
  });

  it("keeps the no_trigger issue row a non-button container even with the action present", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    render(<ValidationSummary onChooseTrigger={jest.fn()} />);
    const issueRow = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "no_trigger");
    // The row stays a <div> (the nested CTA is the only interactive element).
    expect(issueRow?.tagName.toLowerCase()).not.toBe("button");
  });
});

describe("ValidationSummary — missing-field click focuses the field (CHECKLIST-ITEM-10)", () => {
  const REQUIRED = {
    "slack:send_channel_message": {
      displayName: "Send Channel Message",
      requiredFields: [{ name: "channel", label: "Channel" }],
    },
  } as const;

  function hydrateChain(actionConfig: Record<string, unknown>): void {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "message", config: {}, position: { x: 0, y: 0 } },
        { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: actionConfig, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    });
  }

  it("clicking a missing_required_field row opens the node AND highlights the field", async () => {
    const user = userEvent.setup();
    hydrateChain({}); // channel blank → missing_required_field with fieldName "channel"
    render(<ValidationSummary requiredFieldsByType={REQUIRED} />);
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();

    const issueBtn = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "missing_required_field");
    await user.click(issueBtn!);

    expect(useConfigSlice.getState().activeNodeId).toBe("a1");
    // The field highlight is the new behavior — revealNode, not bare openNode.
    expect(useConfigSlice.getState().focusFieldKey).toBe("channel");
  });

  it("a node-level issue without a field still opens the node without a field highlight", async () => {
    const user = userEvent.setup();
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "slack" });
      useGraphSlice.getState().addAction({ provider: "slack" });
    });
    const actionId = useGraphSlice.getState().pendingNodes.find((n) => n.kind === "action")!.id;
    render(<ValidationSummary />);
    const issueBtn = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-node-id") === actionId);
    await user.click(issueBtn!);
    expect(useConfigSlice.getState().activeNodeId).toBe(actionId);
    expect(useConfigSlice.getState().focusFieldKey).toBeNull();
  });
});

describe("ValidationSummary — provider-agnostic", () => {
  it("renders the same UI shape for a fictional provider as for a known one", () => {
    useGraphSlice.getState().hydrate("wf-1", { nodes: [], edges: [] });
    act(() => {
      useGraphSlice.getState().addTrigger({ provider: "fictional-x" });
      useGraphSlice.getState().addAction({ provider: "fictional-x" });
    });
    render(<ValidationSummary />);
    // The unconfigured-node rows should still render normally for an unknown
    // provider — no per-provider branch dropping it. (The friendly label uses
    // the kind fallback, so the provider id itself isn't in the label.)
    expect(
      screen.getAllByTestId("validation-summary-issue").length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/^Trigger$/).length).toBeGreaterThanOrEqual(1);
  });
});

describe("ValidationSummary — post-template setup readiness (categories)", () => {
  // Mirrors what a complex official template lands as: a connected trigger →
  // action chain where a required field is either prewired with a variable
  // ({{trigger.x}}) or still blank (an account-resource the user must choose).
  const REQUIRED = {
    "slack:send_channel_message": {
      displayName: "Send Channel Message",
      requiredFields: [{ name: "channel", label: "Channel" }],
    },
  } as const;

  function hydrateChain(actionConfig: Record<string, unknown>): void {
    useGraphSlice.getState().hydrate("wf-1", {
      nodes: [
        { id: "t1", kind: "trigger", provider: "slack", type: "message", config: {}, position: { x: 0, y: 0 } },
        { id: "a1", kind: "action", provider: "slack", type: "send_channel_message", config: actionConfig, position: { x: 0, y: 120 } },
      ],
      edges: [{ id: "e1", from: "t1", to: "a1" }],
    });
  }

  it("treats a variable-prewired required field ({{trigger.x}}) as complete — Ready to run", () => {
    hydrateChain({ channel: "{{trigger.channel}}" });
    render(<ValidationSummary requiredFieldsByType={REQUIRED} />);
    // A variable-derived value is non-empty → NOT a missing required field, so the
    // workflow reads as ready (no "Needs your input" group, no setup blocker).
    expect(screen.getByTestId("validation-summary").getAttribute("data-state")).toBe("ready");
    expect(screen.queryByTestId("validation-summary-group")).toBeNull();
  });

  it("keeps a blank account-resource field a setup blocker under 'Needs your input'", () => {
    hydrateChain({}); // channel left blank — the post-template gap
    render(<ValidationSummary requiredFieldsByType={REQUIRED} />);
    const group = screen.getByTestId("validation-summary-group");
    expect(group.getAttribute("data-category")).toBe("needs_input");
    const issue = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "missing_required_field");
    expect(issue).toBeDefined();
    expect(issue!.getAttribute("data-node-id")).toBe("a1");
  });

  it("does NOT show a 'ready to run' message while a required field is blank", () => {
    hydrateChain({});
    render(<ValidationSummary requiredFieldsByType={REQUIRED} />);
    expect(screen.getByTestId("validation-summary").getAttribute("data-state")).toBe("has-issues");
    expect(screen.queryByText(/ready to run/i)).toBeNull();
  });

  it("surfaces a broken variable reference as a warning under 'Check your data'", () => {
    // Required field is filled (with a {{...}}), so it is NOT a missing-field error;
    // but it points at a step that does not exist → a non-blocking data warning.
    hydrateChain({ channel: "{{ghost.value}}" });
    render(<ValidationSummary requiredFieldsByType={REQUIRED} />);
    const group = screen.getByTestId("validation-summary-group");
    expect(group.getAttribute("data-category")).toBe("data_reference");
    expect(group.getAttribute("data-severity")).toBe("warning");
    const issue = screen
      .getAllByTestId("validation-summary-issue")
      .find((el) => el.getAttribute("data-code") === "broken_variable_reference");
    expect(issue).toBeDefined();
  });
});
