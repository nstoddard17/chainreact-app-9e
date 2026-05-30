/**
 * Tests for components/app-shell/AppMobileNav (Slice 4.APP-SHELL-1).
 *
 * Pins:
 *   - Trigger toggles the popover; aria-expanded reflects state.
 *   - Items in the popover match the desktop nav exactly (single
 *     source of truth — same `APP_SHELL_NAV_ITEMS`).
 *   - Clicking an item closes the popover.
 *   - Active-state highlight mirrors desktop semantics.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

import { AppMobileNav } from "@/components/app-shell/AppMobileNav";

beforeEach(() => {
  mockPathname.mockReset();
  mockPathname.mockReturnValue("/workflows");
});

describe("AppMobileNav", () => {
  it("hamburger trigger opens the popover (aria-expanded flips)", async () => {
    const user = userEvent.setup();
    render(<AppMobileNav />);
    const trigger = screen.getByTestId("app-shell-mobile-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await user.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("app-shell-mobile-content")).toBeInTheDocument();
  });

  it("popover items mirror the desktop nav set (Workflows + Apps) — single source of truth. Notifications is NOT here; covered by the top-bar bell.", async () => {
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    expect(screen.getByTestId("app-shell-mobile-nav-workflows")).toHaveAttribute(
      "href",
      "/workflows",
    );
    expect(screen.getByTestId("app-shell-mobile-nav-apps")).toHaveAttribute(
      "href",
      "/apps",
    );
    expect(
      screen.queryByTestId("app-shell-mobile-nav-notifications"),
    ).toBeNull();
  });

  it("active item carries aria-current='page' inside the mobile popover", async () => {
    mockPathname.mockReturnValue("/apps");
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    expect(
      screen
        .getByTestId("app-shell-mobile-nav-apps")
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByTestId("app-shell-mobile-nav-workflows")
        .getAttribute("aria-current"),
    ).toBe(null);
  });

  it("clicking an item closes the popover", async () => {
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    await user.click(screen.getByTestId("app-shell-mobile-nav-apps"));
    // Radix Popover removes the content from the DOM on close.
    expect(screen.queryByTestId("app-shell-mobile-content")).toBeNull();
  });
});
