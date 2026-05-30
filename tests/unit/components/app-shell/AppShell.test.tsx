/**
 * Tests for components/app-shell/AppShell (Slice 4.APP-SHELL-1; layout
 * rewrite in 4.APP-SHELL-DARK-DESIGN-PARITY-1).
 *
 * Composition-level checks for the rail + top-bar + mobile-bar shell:
 *   - Root carries `data-app-surface="dark"` so the dark dashboard
 *     palette re-themes the app HSL tokens for everything nested.
 *   - Desktop rail renders with brand + nav (no user menu — that
 *     moved to the top bar).
 *   - Desktop top bar renders with page context + notification bell
 *     (badge reflects `unreadNotifications`) + user menu.
 *   - Mobile bar renders (Tailwind responsive — both desktop and
 *     mobile layers live in the DOM, the unused one is display:none
 *     via `md:flex` / `md:hidden`). Mobile bar carries the hamburger
 *     trigger + brand + page context + bell + user menu.
 *   - Children render in the content column.
 */
import { render, screen, within } from "@testing-library/react";

const mockPathname = jest.fn<string, []>();
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));
jest.mock("@/app/auth/actions", () => ({
  signOut: jest.fn(),
}));
jest.mock("@/app/notifications/actions", () => ({
  markAllNotificationsRead: jest.fn(),
}));

import { AppShell } from "@/components/app-shell/AppShell";

beforeEach(() => {
  mockPathname.mockReturnValue("/workflows");
});

describe("AppShell — composition", () => {
  it("renders the root with the dark-app-surface attribute + the rail + the top bar + the mobile bar + the children content", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={0}
        recentNotifications={[]}
      >
        <main data-testid="page-content">Hello</main>
      </AppShell>,
    );
    const root = screen.getByTestId("app-shell-root");
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute("data-app-surface", "dark");

    expect(screen.getByTestId("app-shell-rail")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-top-bar")).toBeInTheDocument();
    expect(screen.getByTestId("app-shell-mobile-bar")).toBeInTheDocument();
    expect(screen.getByTestId("page-content")).toHaveTextContent("Hello");
  });

  it("rail renders brand + nav landmark, but NOT the user menu (moved to top bar)", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={0}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    const rail = screen.getByTestId("app-shell-rail");
    expect(within(rail).getByTestId("app-shell-brand")).toBeInTheDocument();
    expect(
      within(rail).getByRole("navigation", { name: /primary/i }),
    ).toBeInTheDocument();
    expect(
      within(rail).queryByTestId("app-shell-user-menu-trigger"),
    ).toBeNull();
  });

  it("rail brand links to /workflows", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={0}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    const rail = screen.getByTestId("app-shell-rail");
    const brand = within(rail).getByTestId("app-shell-brand");
    expect(brand).toHaveAttribute("href", "/workflows");
  });

  it("top bar (desktop) renders page context + notification bell + user menu — and renders the unread badge when count > 0", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={3}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    const topBar = screen.getByTestId("app-shell-top-bar");
    expect(
      within(topBar).getByTestId("app-shell-page-context"),
    ).toBeInTheDocument();
    const bell = within(topBar).getByTestId("app-shell-notification-bell");
    // Bell is now a popover trigger, not a link — popover behavior is
    // exercised in `NotificationBell.test.tsx`. Here we just pin that
    // the bell renders inside the top bar with the right unread count.
    expect(bell.tagName.toLowerCase()).toBe("button");
    expect(bell).toHaveAttribute("data-unread-count", "3");
    expect(
      within(topBar).getByTestId("app-shell-notification-bell-badge"),
    ).toHaveTextContent("3");
    expect(
      within(topBar).getByTestId("app-shell-user-menu-trigger"),
    ).toBeInTheDocument();
  });

  it("top bar bell hides the badge when unreadNotifications is 0", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={0}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    const topBar = screen.getByTestId("app-shell-top-bar");
    const bell = within(topBar).getByTestId("app-shell-notification-bell");
    expect(bell.tagName.toLowerCase()).toBe("button");
    expect(bell).toHaveAttribute("data-unread-count", "0");
    expect(
      within(topBar).queryByTestId("app-shell-notification-bell-badge"),
    ).toBeNull();
  });

  it("mobile bar carries hamburger + brand + page context + bell + user menu (same affordances reachable on small viewports)", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={5}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    const mobileBar = screen.getByTestId("app-shell-mobile-bar");
    expect(within(mobileBar).getByTestId("app-shell-brand")).toBeInTheDocument();
    expect(
      within(mobileBar).getByTestId("app-shell-mobile-trigger"),
    ).toBeInTheDocument();
    expect(
      within(mobileBar).getByTestId("app-shell-page-context"),
    ).toBeInTheDocument();
    expect(
      within(mobileBar).getByTestId("app-shell-notification-bell"),
    ).toBeInTheDocument();
    expect(
      within(mobileBar).getByTestId("app-shell-user-menu-trigger"),
    ).toBeInTheDocument();
  });

  it("rail Sidebar landmark is labeled (a11y)", () => {
    render(
      <AppShell
        userEmail="marcus@example.com"
        unreadNotifications={0}
        recentNotifications={[]}
      >
        <div />
      </AppShell>,
    );
    // <aside aria-label="Sidebar"> is the rail container.
    const rail = screen.getByRole("complementary", { name: /sidebar/i });
    expect(rail).toHaveAttribute("data-testid", "app-shell-rail");
  });
});
