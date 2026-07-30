/**
 * Tests for features/workflow-builder/layout/BuilderLeftAgentRail.
 *
 * Slice 4.BUILDER-LEFT-AGENT-1 — presentational left-rail wrapper for
 * the workflow-builder-scoped React Agent (BuilderAiPanel). The rail
 * has no AI behavior, no backend calls, and no provider logic — it
 * only renders chrome around its children.
 */
import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("BuilderLeftAgentRail — responsive presentation (BUILDER-RESPONSIVE-LAYOUT-1)", () => {
  /** Stands in for the real composer + transcript: state that must not be lost. */
  function Composer() {
    const [text, setText] = useState("");
    return (
      <input
        data-testid="composer"
        aria-label="Message React Agent"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
    );
  }

  it("defaults to the pre-slice in-flow column so existing callers are unchanged", () => {
    render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const aside = screen.getByTestId("builder-left-agent-rail");
    expect(aside).toHaveAttribute("data-presentation", "panel");
    expect(aside.style.width).toBe("320px");
    // A column is a complementary region, not a dialog.
    expect(aside).toHaveAttribute("role", "complementary");
    expect(aside).not.toHaveAttribute("aria-modal");
  });

  it("honours a narrower panel width at the medium tier", () => {
    render(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        panelWidth={272}
      >
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("builder-left-agent-rail").style.width).toBe("272px");
  });

  it("as an overlay it is announced as a modal dialog and claims no layout width", () => {
    render(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    const aside = screen.getByTestId("builder-left-agent-rail");
    expect(aside).toHaveAttribute("role", "dialog");
    expect(aside).toHaveAttribute("aria-modal", "true");
    // No inline width at all: the sheet is absolutely positioned, so it cannot
    // take a single pixel from the canvas.
    expect(aside.style.width).toBe("");
    expect(aside.className).toMatch(/absolute/);
  });

  it("renders no spine when collapsed as an overlay — a phone has no width to spare", () => {
    render(
      <BuilderLeftAgentRail
        isCollapsed
        onToggle={() => undefined}
        presentation="overlay"
      >
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    expect(
      screen.queryByTestId("builder-left-agent-rail-expand"),
    ).toBeNull();
    expect(screen.getByTestId("builder-left-agent-rail")).toHaveAttribute("hidden");
  });

  it("names its own dismiss control for what it actually does in each presentation", () => {
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    expect(
      screen.getByRole("button", { name: /collapse react agent/i }),
    ).toBeInTheDocument();

    rerender(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    // There is no spine to collapse to as a sheet, so "Collapse" would describe
    // something the UI cannot do.
    expect(
      screen.getByRole("button", { name: /close react agent/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /collapse react agent/i }),
    ).toBeNull();
  });

  it("keeps composer text through a column → sheet → column round trip", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <Composer />
      </BuilderLeftAgentRail>,
    );
    await user.type(screen.getByTestId("composer"), "file the invoice");
    expect(screen.getByTestId("composer")).toHaveValue("file the invoice");

    // Desktop → phone sheet: the user rotated, or dragged the window narrow.
    rerender(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("composer")).toHaveValue("file the invoice");

    // Closed as a sheet, then reopened...
    rerender(
      <BuilderLeftAgentRail
        isCollapsed
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    rerender(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("composer")).toHaveValue("file the invoice");

    // ...and back to a desktop column.
    rerender(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={() => undefined}>
        <Composer />
      </BuilderLeftAgentRail>,
    );
    expect(screen.getByTestId("composer")).toHaveValue("file the invoice");
  });

  it("Escape closes an open sheet but never an in-flow column", () => {
    const onToggle = jest.fn();
    const { rerender } = render(
      <BuilderLeftAgentRail isCollapsed={false} onToggle={onToggle}>
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onToggle).not.toHaveBeenCalled();

    rerender(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={onToggle}
        presentation="overlay"
      >
        <span>x</span>
      </BuilderLeftAgentRail>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("moves focus into an opening sheet and hands it back on close", async () => {
    const outside = document.createElement("button");
    outside.textContent = "canvas";
    document.body.appendChild(outside);
    outside.focus();
    expect(outside).toHaveFocus();

    const { rerender } = render(
      <BuilderLeftAgentRail
        isCollapsed
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    // Opening the sheet takes focus off the canvas and into the sheet.
    rerender(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    const aside = screen.getByTestId("builder-left-agent-rail");
    await waitFor(() => expect(aside.contains(document.activeElement)).toBe(true));

    // Closing hands it back to where the user was.
    rerender(
      <BuilderLeftAgentRail
        isCollapsed
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    await waitFor(() => expect(outside).toHaveFocus());
    outside.remove();
  });

  it("keeps Tab inside an open sheet", async () => {
    const user = userEvent.setup();
    const outside = document.createElement("button");
    outside.textContent = "canvas";
    document.body.appendChild(outside);

    render(
      <BuilderLeftAgentRail
        isCollapsed={false}
        onToggle={() => undefined}
        presentation="overlay"
      >
        <Composer />
      </BuilderLeftAgentRail>,
    );
    const aside = screen.getByTestId("builder-left-agent-rail");
    await waitFor(() => expect(aside.contains(document.activeElement)).toBe(true));

    // Tab all the way round: focus must never land on the canvas button behind
    // the scrim.
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(outside).not.toHaveFocus();
      expect(aside.contains(document.activeElement)).toBe(true);
    }
    outside.remove();
  });
});
