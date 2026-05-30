/**
 * Tests for components/app-shell/AppPageContext
 * (Slice 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Single source of truth for the page-context label = the same
 * `isNavItemActive` predicate the rail uses. The label can never
 * drift out of sync with the rail's active highlight.
 */
import { render, screen } from "@testing-library/react";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

import { AppPageContext } from "@/components/app-shell/AppPageContext";

beforeEach(() => {
  mockPathname.mockReset();
});

describe("AppPageContext", () => {
  it("on /workflows: shows 'Workflows'", () => {
    mockPathname.mockReturnValue("/workflows");
    render(<AppPageContext />);
    expect(screen.getByTestId("app-shell-page-context")).toHaveTextContent(
      "Workflows",
    );
  });

  it("on /apps: shows 'Apps'", () => {
    mockPathname.mockReturnValue("/apps");
    render(<AppPageContext />);
    expect(screen.getByTestId("app-shell-page-context")).toHaveTextContent(
      "Apps",
    );
  });

  it("on /notifications: renders nothing — Notifications isn't in the rail nav (the bell is the entry point); the page renders its own h1", () => {
    mockPathname.mockReturnValue("/notifications");
    const { container } = render(<AppPageContext />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("app-shell-page-context")).toBeNull();
  });

  it("on a sub-route (/workflows/abc): inherits the parent label", () => {
    mockPathname.mockReturnValue("/workflows/abc");
    render(<AppPageContext />);
    expect(screen.getByTestId("app-shell-page-context")).toHaveTextContent(
      "Workflows",
    );
  });

  it("on an unknown route: renders nothing (better empty than fabricated)", () => {
    mockPathname.mockReturnValue("/unknown");
    const { container } = render(<AppPageContext />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("app-shell-page-context")).toBeNull();
  });
});
