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

  it("BUILDER-VALIDATION-PANEL-CLOSE-UX — close control is an always-visible, reachable button (not aria-hidden, has a border affordance, never opacity-0)", () => {
    render(
      <BuilderRightDrawer title="Validation" onClose={() => {}}>
        <span />
      </BuilderRightDrawer>,
    );
    const close = screen.getByRole("button", { name: /close drawer/i });
    // A bare muted glyph reads as "no close control"; assert it carries a
    // standing border so it's discoverable at rest, not just on hover.
    // (jsdom drops `var()` inline styles, so the always-on chrome is carried
    // by the `border` utility class, which is what we assert.)
    expect(close.className).toMatch(/\bborder\b/);
    expect(close.getAttribute("aria-hidden")).not.toBe("true");
    expect(close.className).not.toMatch(/opacity-0/);
    // Hover-only reveal is not allowed: the button is visible at rest.
    expect(close.className).not.toMatch(/\bhidden\b/);
  });

  it("BUILDER-VALIDATION-PANEL-CLOSE-UX — drawer header establishes a stacking context so a header floating callout can't paint over the close control", () => {
    render(
      <BuilderRightDrawer title="Validation" onClose={() => {}}>
        <span />
      </BuilderRightDrawer>,
    );
    const header = screen.getByTestId("builder-right-drawer-header");
    // `relative` + positive z-index wins the paint order against the header's
    // `z-10` private-credential callout that hangs over this drawer's corner.
    expect(header.className).toMatch(/\brelative\b/);
    expect(header.className).toMatch(/\bz-30\b/);
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
