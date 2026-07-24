// NOTE: `expect` intentionally comes from the global (jest-dom-augmented) scope,
// not from @jest/globals — the latter's Matchers type lacks the jest-dom matchers
// (toHaveAttribute / toBeInTheDocument) this file uses. (Pre-existing type fix.)
import { describe, it, jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";
import { DocumentInsertMenu } from "@/features/workflow-builder/document/DocumentInsertMenu";

/**
 * 5.DUAL-BUILDER-1 CS-7 — the Document insertion menu keyboard interaction model:
 * ArrowDown opens; Arrow/Home/End move among menu items; Escape closes; every
 * item is a real focusable button with menu semantics.
 */
function renderMenu() {
  const handlers = {
    onStep: jest.fn(),
    onIfThen: jest.fn(),
    onRouter: jest.fn(),
    onSection: jest.fn(),
    onAskReact: jest.fn(),
  };
  render(
    <DocumentInsertMenu
      testId="ins"
      onStep={handlers.onStep}
      onIfThen={handlers.onIfThen}
      onRouter={handlers.onRouter}
      onSection={handlers.onSection}
      onAskReact={handlers.onAskReact}
    />,
  );
  return handlers;
}

describe("DocumentInsertMenu — keyboard model", () => {
  it("uses menu semantics (aria-haspopup + role=menu/menuitem)", () => {
    renderMenu();
    const trigger = screen.getByTestId("ins");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(trigger);
    expect(screen.getByTestId("ins-menu")).toHaveAttribute("role", "menu");
    expect(screen.getByTestId("ins-step")).toHaveAttribute("role", "menuitem");
  });

  it("ArrowDown on the closed trigger opens the menu", () => {
    renderMenu();
    const trigger = screen.getByTestId("ins");
    expect(screen.queryByTestId("ins-menu")).toBeNull();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByTestId("ins-menu")).toBeInTheDocument();
  });

  it("ArrowDown / ArrowUp move focus among items and wrap", () => {
    renderMenu();
    const trigger = screen.getByTestId("ins");
    fireEvent.click(trigger);
    // First ArrowDown → first item.
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-step"));
    // ArrowDown again → next item (Branch).
    fireEvent.keyDown(screen.getByTestId("ins-step"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-branch"));
    // ArrowUp back to the first.
    fireEvent.keyDown(screen.getByTestId("ins-branch"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-step"));
    // ArrowUp from the first wraps to the last (Ask React).
    fireEvent.keyDown(screen.getByTestId("ins-step"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-askreact"));
  });

  it("Home / End jump to the first / last item", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("ins"));
    fireEvent.keyDown(screen.getByTestId("ins"), { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-askreact"));
    fireEvent.keyDown(screen.getByTestId("ins-askreact"), { key: "Home" });
    expect(document.activeElement).toBe(screen.getByTestId("ins-step"));
  });

  it("Escape closes the open menu", () => {
    renderMenu();
    fireEvent.click(screen.getByTestId("ins"));
    expect(screen.getByTestId("ins-menu")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByTestId("ins-menu"), { key: "Escape" });
    expect(screen.queryByTestId("ins-menu")).toBeNull();
  });
});
