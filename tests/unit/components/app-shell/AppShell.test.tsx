/**
 * Tests for components/app-shell/AppShell (Slice 4.APP-SHELL-1).
 *
 * Composition-level checks: the shell wraps children in the sticky
 * header (brand + nav + mobile trigger + user menu) and renders the
 * page content underneath.
 */
import { render, screen } from "@testing-library/react";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));
jest.mock("@/app/auth/actions", () => ({
  signOut: jest.fn(),
}));

import { AppShell } from "@/components/app-shell/AppShell";

beforeEach(() => {
  mockPathname.mockReturnValue("/workflows");
});

describe("AppShell", () => {
  it("renders the header, the brand link (→ /workflows), and the children content", () => {
    render(
      <AppShell userEmail="marcus@example.com">
        <main data-testid="page-content">Hello</main>
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-root")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-header")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-brand")).toHaveAttribute(
      "href",
      "/workflows",
    );
    expect(screen.getByTestId("page-content")).toHaveTextContent("Hello");
  });

  it("renders the primary nav landmark + the user menu trigger", () => {
    render(
      <AppShell userEmail="marcus@example.com">
        <div />
      </AppShell>,
    );
    expect(
      screen.getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-user-menu-trigger")).toBeInTheDocument();
  });

  it("renders the mobile hamburger trigger (so the same items are reachable on small viewports)", () => {
    render(
      <AppShell userEmail="marcus@example.com">
        <div />
      </AppShell>,
    );
    expect(screen.getByTestId("app-shell-mobile-trigger")).toBeInTheDocument();
  });
});
