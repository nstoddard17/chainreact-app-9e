/**
 * Tests for features/workflow-builder/layout/BuilderLeftAgentRail.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — presentational left-rail wrapper for
 * the workflow-builder-scoped React Agent (BuilderAiPanel). The rail
 * has no AI behavior, no backend calls, and no provider logic — it
 * only renders chrome around its children.
 */
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderLeftAgentRail } from "@/features/workflow-builder/layout/BuilderLeftAgentRail";

describe("BuilderLeftAgentRail — expanded state", () => {
  it("renders the rail landmark with the 'React Agent' label", () => {
    render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <div>panel body</div>
      </BuilderLeftAgentRail>,
    );
    expect(
      screen.getByRole("complementary", { name: /react agent/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("React Agent")).toBeInTheDocument();
  });

  it("renders the children inside the rail", () => {
    render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    const payload = screen.getByTestId("payload");
    expect(payload).toBeInTheDocument();
    expect(screen.getByTestId("builder-left-agent-rail").contains(payload)).toBe(
      true,
    );
  });

  it("renders a collapse button labelled 'Collapse React Agent' that fires onToggle on click", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={onToggle}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const btn = screen.getByRole("button", { name: /collapse react agent/i });
    await user.click(btn);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not mention a general / app-level assistant (scope guardrail)", () => {
    render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const rail = screen.getByTestId("builder-left-agent-rail");
    expect(rail.textContent ?? "").not.toMatch(/help assistant/i);
    expect(rail.textContent ?? "").not.toMatch(/chainreact assistant/i);
  });
});

describe("BuilderLeftAgentRail — collapsed state", () => {
  it("renders a slim 40px spine and does not mount its children", async () => {
    // Slice 4.BUILDER-DESIGN-PARITY-1 — the Anthropic ChainV2 design
    // keeps a vertical 40px spine in the collapsed state (rotated
    // "REACT AGENT" label + expand button) rather than fully vacating
    // the column. The mount invariant applies to a rail that has NEVER
    // been expanded: children must not mount so the guidance panel fires
    // no state effects / network calls. (After a first expansion the
    // payload is kept alive but hidden — see the DOC-RAIL-LAYOUT-1
    // describe block below.)
    render(
      <BuilderLeftAgentRail isCollapsed onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    const rail = screen.getByTestId("builder-left-agent-rail");
    expect(rail).toBeInTheDocument();
    expect(rail.getAttribute("data-collapsed")).toBe("true");
    // Children must NOT mount in collapsed mode.
    expect(screen.queryByTestId("payload")).toBeNull();
    // Expand affordance is reachable.
    expect(
      screen.getByRole("button", { name: /expand react agent/i }),
    ).toBeInTheDocument();
  });

  it("clicking the spine expand button fires onToggle exactly once", async () => {
    const user = userEvent.setup();
    const onToggle = jest.fn();
    render(
      <BuilderLeftAgentRail isCollapsed onToggle={onToggle}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    await user.click(
      screen.getByRole("button", { name: /expand react agent/i }),
    );
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe("BuilderLeftAgentRail — keep-alive after first expansion (DOC-RAIL-LAYOUT-1)", () => {
  function Stateful() {
    const [count, setCount] = useState(0);
    return (
      <button
        type="button"
        data-testid="stateful-child"
        onClick={() => setCount((c) => c + 1)}
      >
        count:{count}
      </button>
    );
  }

  it("collapsing AFTER an expansion hides the payload instead of unmounting it", () => {
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("payload")).toBeVisible();

    rerender(
      <BuilderLeftAgentRail isCollapsed onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    // Still mounted (ONE panel instance) but hidden from view + a11y tree.
    const payload = screen.getByTestId("payload");
    expect(payload).toBeInTheDocument();
    expect(payload).not.toBeVisible();
    expect(screen.getByTestId("builder-left-agent-rail-payload")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("children state (composer text / conversation analog) survives collapse → reopen", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <Stateful />
      </BuilderLeftAgentRail>,
    );
    await user.click(screen.getByTestId("stateful-child"));
    await user.click(screen.getByTestId("stateful-child"));
    expect(screen.getByTestId("stateful-child")).toHaveTextContent("count:2");

    rerender(
      <BuilderLeftAgentRail isCollapsed onToggle={() => undefined}>
        <Stateful />
      </BuilderLeftAgentRail>,
    );
    rerender(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <Stateful />
      </BuilderLeftAgentRail>,
    );
    // Same instance, same state — nothing was remounted by the round-trip.
    expect(screen.getByTestId("stateful-child")).toHaveTextContent("count:2");
  });

  it("a rail that STARTS collapsed still never mounts children until first expansion", () => {
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    expect(screen.queryByTestId("payload")).toBeNull();

    rerender(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("payload")).toBeVisible();
  });
});
