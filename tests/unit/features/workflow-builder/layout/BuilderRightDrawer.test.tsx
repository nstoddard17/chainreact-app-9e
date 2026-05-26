/**
 * Tests for features/workflow-builder/layout/BuilderRightDrawer.
 *
 * Presentational drawer chrome (Slice 4.BUILDER-INSPECTOR-1). Verified:
 *   - testid + role + dynamic aria-label.
 *   - title display.
 *   - close button calls onClose.
 *   - Esc closes the drawer.
 *   - Esc with defaultPrevented (e.g. a nested popover already handled
 *     it) does NOT close the drawer.
 *   - Listener is cleaned up on unmount.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuilderRightDrawer } from "@/features/workflow-builder/layout/BuilderRightDrawer";

describe("BuilderRightDrawer", () => {
  it("renders the testid + region role + dynamic aria-label + title text + children", () => {
    render(
      <BuilderRightDrawer title="Node configuration" onClose={() => {}}>
        <div>Payload</div>
      </BuilderRightDrawer>,
    );
    const drawer = screen.getByTestId("builder-right-drawer");
    expect(drawer).toBeInTheDocument();
    expect(drawer.getAttribute("role")).toBe("region");
    expect(drawer.getAttribute("aria-label")).toBe(
      "Workflow builder drawer: Node configuration",
    );
    expect(
      screen.getByRole("heading", { name: /node configuration/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Payload")).toBeInTheDocument();
  });

  it("close button has accessible name 'Close drawer' and calls onClose", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <BuilderRightDrawer title="Node configuration" onClose={onClose}>
        <span />
      </BuilderRightDrawer>,
    );
    await user.click(screen.getByRole("button", { name: /close drawer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc closes the drawer", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(
      <BuilderRightDrawer title="Inspector" onClose={onClose}>
        <span />
      </BuilderRightDrawer>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc with defaultPrevented does NOT close the drawer (nested popovers / autocompletes can swallow Esc first)", () => {
    const onClose = jest.fn();
    render(
      <BuilderRightDrawer title="Inspector" onClose={onClose}>
        <span />
      </BuilderRightDrawer>,
    );
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();
    document.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("removes the Esc listener on unmount (no spurious onClose after the drawer is gone)", async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    const { unmount } = render(
      <BuilderRightDrawer title="x" onClose={onClose}>
        <span />
      </BuilderRightDrawer>,
    );
    unmount();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("title text and aria-label both update when the title prop changes", () => {
    const { rerender } = render(
      <BuilderRightDrawer title="Inspector" onClose={() => {}}>
        <span />
      </BuilderRightDrawer>,
    );
    expect(screen.getByTestId("builder-right-drawer").getAttribute("aria-label")).toBe(
      "Workflow builder drawer: Inspector",
    );
    rerender(
      <BuilderRightDrawer title="Workflow AI" onClose={() => {}}>
        <span />
      </BuilderRightDrawer>,
    );
    expect(screen.getByTestId("builder-right-drawer").getAttribute("aria-label")).toBe(
      "Workflow builder drawer: Workflow AI",
    );
    expect(
      screen.getByRole("heading", { name: /workflow ai/i }),
    ).toBeInTheDocument();
  });
});
