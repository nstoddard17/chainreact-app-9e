/**
 * Tests for features/workflow-builder/layout/BuilderLeftAgentRail.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — presentational left-rail wrapper for
 * the workflow-builder-scoped React Agent (BuilderAiPanel). The rail
 * has no AI behavior, no backend calls, and no provider logic — it
 * only renders chrome around its children.
 */
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
    // the column. The critical invariant — children must NOT mount in
    // collapsed mode so BuilderAiPanel doesn't fire its state effects
    // / network calls — is preserved.
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
