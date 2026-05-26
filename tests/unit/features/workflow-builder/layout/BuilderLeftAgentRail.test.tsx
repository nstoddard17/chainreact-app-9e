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
      <BuilderLeftAgentRail isCollapsed={false} onCollapse={() => undefined}>
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
      <BuilderLeftAgentRail isCollapsed={false} onCollapse={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    const payload = screen.getByTestId("payload");
    expect(payload).toBeInTheDocument();
    expect(screen.getByTestId("builder-left-agent-rail").contains(payload)).toBe(
      true,
    );
  });

  it("renders a collapse button labelled 'Collapse React Agent' that fires onCollapse on click", async () => {
    const user = userEvent.setup();
    const onCollapse = jest.fn();
    render(
      <BuilderLeftAgentRail isCollapsed={false} onCollapse={onCollapse}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const btn = screen.getByRole("button", { name: /collapse react agent/i });
    await user.click(btn);
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it("does not mention a general / app-level assistant (scope guardrail)", () => {
    render(
      <BuilderLeftAgentRail isCollapsed={false} onCollapse={() => undefined}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const rail = screen.getByTestId("builder-left-agent-rail");
    expect(rail.textContent ?? "").not.toMatch(/help assistant/i);
    expect(rail.textContent ?? "").not.toMatch(/chainreact assistant/i);
  });
});

describe("BuilderLeftAgentRail — collapsed state", () => {
  it("renders nothing when collapsed (rail vacates the layout column)", () => {
    const { container } = render(
      <BuilderLeftAgentRail isCollapsed onCollapse={() => undefined}>
        <div data-testid="payload">payload body</div>
      </BuilderLeftAgentRail>,
    );
    expect(container.firstChild).toBeNull();
    // Critical: collapsed rail must NOT render its children — the
    // BuilderAiPanel is not mounted in collapsed mode, so its
    // state / effects / network calls don't run.
    expect(screen.queryByTestId("payload")).toBeNull();
    expect(screen.queryByTestId("builder-left-agent-rail")).toBeNull();
  });
});
