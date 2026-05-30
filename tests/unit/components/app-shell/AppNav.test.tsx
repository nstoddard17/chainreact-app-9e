/**
 * Tests for components/app-shell/AppNav (Slice 4.APP-SHELL-1).
 *
 * Active state derives from `usePathname()` via the shared
 * `isNavItemActive()` helper. Asserts:
 *   - Each registered item renders as a real `<Link>` (real route).
 *   - The active item carries `aria-current="page"`.
 *   - Builder route (`/workflows/[id]`) keeps Workflows highlighted
 *     even though that route doesn't render the shell — the predicate
 *     stays correct regardless.
 */
import { render, screen } from "@testing-library/react";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

import { AppNav } from "@/components/app-shell/AppNav";

beforeEach(() => {
  mockPathname.mockReset();
});

describe("AppNav — registered items + real routes", () => {
  it("renders Workflows / Apps / Notifications, all as real <Link> hrefs", () => {
    mockPathname.mockReturnValue("/workflows");
    render(<AppNav />);
    expect(screen.getByTestId("app-shell-nav-workflows")).toHaveAttribute(
      "href",
      "/workflows",
    );
    expect(screen.getByTestId("app-shell-nav-apps")).toHaveAttribute(
      "href",
      "/apps",
    );
    expect(screen.getByTestId("app-shell-nav-notifications")).toHaveAttribute(
      "href",
      "/notifications",
    );
  });

  it("never renders a fake or '#' anchor", () => {
    mockPathname.mockReturnValue("/workflows");
    render(<AppNav />);
    const links = screen.getAllByRole("link");
    for (const link of links) {
      const href = link.getAttribute("href");
      expect(href).not.toBeNull();
      expect(href).not.toEqual("#");
      expect(href!.startsWith("/")).toBe(true);
    }
  });
});

describe("AppNav — active state", () => {
  it("on /workflows: Workflows is active, others are not", () => {
    mockPathname.mockReturnValue("/workflows");
    render(<AppNav />);
    expect(
      screen.getByTestId("app-shell-nav-workflows").getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByTestId("app-shell-nav-apps").getAttribute("aria-current"),
    ).toBe(null);
    expect(
      screen
        .getByTestId("app-shell-nav-notifications")
        .getAttribute("aria-current"),
    ).toBe(null);
  });

  it("on /apps: Apps is active, others are not", () => {
    mockPathname.mockReturnValue("/apps");
    render(<AppNav />);
    expect(
      screen.getByTestId("app-shell-nav-apps").getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByTestId("app-shell-nav-workflows")
        .getAttribute("aria-current"),
    ).toBe(null);
  });

  it("on /notifications: Notifications is active", () => {
    mockPathname.mockReturnValue("/notifications");
    render(<AppNav />);
    expect(
      screen
        .getByTestId("app-shell-nav-notifications")
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("on /workflows/abc: Workflows stays highlighted (sub-route)", () => {
    mockPathname.mockReturnValue("/workflows/abc");
    render(<AppNav />);
    expect(
      screen.getByTestId("app-shell-nav-workflows").getAttribute("aria-current"),
    ).toBe("page");
  });

  it("on /unknown: NO item is active", () => {
    mockPathname.mockReturnValue("/unknown");
    render(<AppNav />);
    expect(
      screen.queryByRole("link", { current: "page" }),
    ).toBeNull();
  });
});

describe("AppNav — a11y", () => {
  it("exposes a labeled navigation landmark", () => {
    mockPathname.mockReturnValue("/workflows");
    render(<AppNav />);
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).toBeInTheDocument();
  });
});
