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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Internal-admin nav gate — controllable per test; default false.
const mockIsInternalAdmin = jest.fn<boolean, []>();
jest.mock("@/components/app-shell/useIsInternalAdmin", () => ({
  useIsInternalAdmin: () => mockIsInternalAdmin(),
}));

// The drawer now mounts the mobile workspace switcher (4.ACCOUNT-SWITCHER-MOBILE-1),
// which self-fetches accounts. Mock the API so the drawer renders deterministically.
const mockList = jest.fn();
const mockSetActive = jest.fn();
jest.mock("@/lib/api/accounts", () => {
  const actual = jest.requireActual("@/lib/api/accounts");
  return {
    ...actual,
    listAccounts: (...a: unknown[]) => mockList(...a),
    setActiveAccount: (...a: unknown[]) => mockSetActive(...a),
  };
});

import { AppMobileNav } from "@/components/app-shell/AppMobileNav";

beforeEach(() => {
  mockPathname.mockReset();
  mockPathname.mockReturnValue("/workflows");
  mockIsInternalAdmin.mockReset().mockReturnValue(false);
  mockList.mockReset();
  mockList.mockResolvedValue({
    activeAccountId: "personal-1",
    accounts: [
      {
        id: "personal-1",
        name: "Personal",
        type: "personal",
        role: "owner",
        isActive: true,
        deletionStatus: "active",
      },
    ],
  });
  mockSetActive.mockReset();
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
    // 4.WORKFLOW-TEMPLATES-MARKETPLACE-5 — Templates joined the rail (route always resolves).
    expect(screen.getByTestId("app-shell-mobile-nav-templates")).toHaveAttribute(
      "href",
      "/templates",
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

  it("the drawer exposes the workspace switcher with the member accounts (mobile access path)", async () => {
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    const content = screen.getByTestId("app-shell-mobile-content");
    const switcher = within(content).getByTestId(
      "app-shell-mobile-account-switcher",
    );
    expect(
      await within(switcher).findByTestId(
        "app-shell-mobile-account-item-personal-1",
      ),
    ).toHaveTextContent("Personal");
  });

  it("shows the internal React Agent Feedback link ONLY for an internal admin (→ /admin/react-agent)", async () => {
    mockIsInternalAdmin.mockReturnValue(true);
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    expect(
      screen.getByTestId("app-shell-mobile-nav-react-agent-feedback"),
    ).toHaveAttribute("href", "/admin/react-agent");
  });

  it("hides the internal link for a non-internal user (incl. customer account owner/admin)", async () => {
    mockIsInternalAdmin.mockReturnValue(false);
    const user = userEvent.setup();
    render(<AppMobileNav />);
    await user.click(screen.getByTestId("app-shell-mobile-trigger"));
    expect(
      screen.queryByTestId("app-shell-mobile-nav-react-agent-feedback"),
    ).toBeNull();
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
