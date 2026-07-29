import { fireEvent, render, screen } from "@testing-library/react";
import type { GuidedBuildSnapshot } from "@/core/workflows/guidedBuildStage";
import type { GuidedConnectController } from "@/features/workflow-builder/hooks/useGuidedConnect";
import { GuidedBuildCard } from "@/features/workflow-builder/panels/GuidedBuildCard";

/**
 * REACT-AGENT-GUIDED-BUILD-1 — the guided card. Locks: consolidated connection
 * cards with per-provider Connect buttons, server-truth Connected chips,
 * retry-on-cancel, the owner-gated honest copy (no dead button, no /apps link
 * in the normal flow), and the stage stepper.
 */

function snapshot(overrides: Partial<GuidedBuildSnapshot> = {}): GuidedBuildSnapshot {
  return {
    stage: "connecting",
    connectionProviders: [
      { provider: "stripe", name: "Stripe", nodeIds: ["n1"], state: "missing", canReconnect: true },
      { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "missing", canReconnect: true },
    ],
    connectionUnresolved: false,
    connectionBlockers: [],
    configureBlockers: [],
    otherBlockers: [],
    ...overrides,
  };
}

function controller(
  overrides: Partial<GuidedConnectController> = {},
): GuidedConnectController {
  return { attempt: null, connect: jest.fn(), ...overrides };
}

it("renders one connection card per required app with Connect buttons", () => {
  const c = controller();
  render(<GuidedBuildCard snapshot={snapshot()} connect={c} onExit={jest.fn()} />);
  expect(screen.getByTestId("guided-connect-stripe")).toBeInTheDocument();
  expect(screen.getByTestId("guided-connect-slack")).toBeInTheDocument();
  fireEvent.click(screen.getByTestId("guided-connect-stripe-button"));
  expect(c.connect).toHaveBeenCalledWith("stripe");
  // Progress line: 0 of 2 connected.
  expect(screen.getByText(/0 of 2 connected/)).toBeInTheDocument();
});

it("shows Connected from the server-resolved signal and progress updates", () => {
  const snap = snapshot({
    connectionProviders: [
      { provider: "stripe", name: "Stripe", nodeIds: ["n1"], state: "connected", canReconnect: true },
      { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "missing", canReconnect: true },
    ],
  });
  render(<GuidedBuildCard snapshot={snap} connect={controller()} onExit={jest.fn()} />);
  expect(screen.getByTestId("guided-connect-stripe-connected")).toBeInTheDocument();
  expect(screen.queryByTestId("guided-connect-stripe-button")).toBeNull();
  expect(screen.getByText(/1 of 2 connected/)).toBeInTheDocument();
});

it("an invalid connection offers Reconnect", () => {
  const snap = snapshot({
    connectionProviders: [
      {
        provider: "slack",
        name: "Slack",
        nodeIds: ["n2"],
        state: "invalid",
        canReconnect: true,
        reasonCode: "token_expired",
      },
    ],
  });
  render(<GuidedBuildCard snapshot={snap} connect={controller()} onExit={jest.fn()} />);
  expect(screen.getByTestId("guided-connect-slack-button")).toHaveTextContent("Reconnect");
});

it("a canceled attempt shows the note and a Try again button", () => {
  const c = controller({ attempt: { provider: "slack", status: "canceled" } });
  const snap = snapshot({
    connectionProviders: [
      { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "missing", canReconnect: true },
    ],
  });
  render(<GuidedBuildCard snapshot={snap} connect={c} onExit={jest.fn()} />);
  expect(screen.getByTestId("guided-connect-slack-button")).toHaveTextContent("Try again");
  expect(screen.getByTestId("guided-connect-slack-note")).toHaveTextContent(/closed before finishing/);
});

it("a waiting attempt disables the button and explains the popup", () => {
  const c = controller({ attempt: { provider: "slack", status: "waiting" } });
  const snap = snapshot({
    connectionProviders: [
      { provider: "slack", name: "Slack", nodeIds: ["n2"], state: "missing", canReconnect: true },
    ],
  });
  render(<GuidedBuildCard snapshot={snap} connect={c} onExit={jest.fn()} />);
  expect(screen.getByTestId("guided-connect-slack-button")).toBeDisabled();
  expect(screen.getByTestId("guided-connect-slack-note")).toHaveTextContent(/popup window/);
});

it("owner-gated providers get honest copy, no dead button, and NO /apps link", () => {
  const snap = snapshot({
    connectionProviders: [
      { provider: "stripe", name: "Stripe", nodeIds: ["n1"], state: "missing", canReconnect: false },
    ],
  });
  const { container } = render(
    <GuidedBuildCard snapshot={snap} connect={controller()} onExit={jest.fn()} />,
  );
  expect(screen.getByTestId("guided-connect-stripe-owner-gated")).toHaveTextContent(
    /workspace owner or admin/,
  );
  expect(screen.queryByTestId("guided-connect-stripe-button")).toBeNull();
  expect(container.querySelector('a[href*="/apps"]')).toBeNull();
});

it("the stepper marks the active stage and Exit fires the session exit", () => {
  const onExit = jest.fn();
  render(<GuidedBuildCard snapshot={snapshot()} connect={controller()} onExit={onExit} />);
  expect(screen.getByTestId("guided-step-connect")).toHaveAttribute("data-active", "true");
  expect(screen.getByTestId("guided-step-configure")).not.toHaveAttribute("data-active");
  fireEvent.click(screen.getByTestId("guided-build-exit"));
  expect(onExit).toHaveBeenCalled();
});

it("blocked stage lists blockers and offers the issues rail", () => {
  const onOpenIssues = jest.fn();
  const snap = snapshot({
    stage: "blocked",
    otherBlockers: [
      {
        kind: "invalid_graph",
        message: "A step is unreachable.",
        nextStep: "Fix the workflow structure (trigger and step connections).",
        blocking: true,
      },
    ],
  });
  render(
    <GuidedBuildCard
      snapshot={snap}
      connect={controller()}
      onExit={jest.fn()}
      onOpenIssues={onOpenIssues}
    />,
  );
  expect(screen.getByTestId("guided-blocked-section")).toHaveTextContent("A step is unreachable.");
  fireEvent.click(screen.getByTestId("guided-blocked-open-issues"));
  expect(onOpenIssues).toHaveBeenCalled();
});

it("complete stage shows the live confirmation", () => {
  render(
    <GuidedBuildCard
      snapshot={snapshot({ stage: "complete" })}
      connect={controller()}
      onExit={jest.fn()}
    />,
  );
  expect(screen.getByTestId("guided-complete-note")).toHaveTextContent(/live/);
});

it("renders nothing for creating / preview_ready stages", () => {
  const { container } = render(
    <GuidedBuildCard
      snapshot={snapshot({ stage: "creating" })}
      connect={controller()}
      onExit={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
});
