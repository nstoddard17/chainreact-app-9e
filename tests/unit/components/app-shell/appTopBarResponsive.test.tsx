/**
 * RESPONSIVE-FOUNDATION-1 §9 — the shared app-shell top bar.
 *
 * This is the change with the widest blast radius in the batch: the top bar sits
 * on EVERY authenticated page, so the contract is pinned explicitly. The defect
 * being locked out: the identity group could shrink but had no `flex-1`, and the
 * controls group had neither `min-w-0` nor `shrink-0`, so when the row ran out of
 * width the unshrinkable controls won and pushed themselves past the viewport.
 */
import { render, screen } from "@testing-library/react";

jest.mock("next/navigation", () => ({
  usePathname: () => "/templates",
}));

// NotificationBell reaches a "use server" module whose transitive imports need
// Node web globals jsdom lacks. Stubbed the same way NotificationBell.test.tsx
// does — this is a layout test, not a notifications test.
jest.mock("@/app/notifications/actions", () => ({
  markNotificationReadAction: jest.fn(),
  markAllNotificationsReadAction: jest.fn(),
}));

// The bar's children self-fetch; keep this a layout test, not a network test.
global.fetch = jest.fn(() =>
  Promise.resolve({ ok: false, json: async () => ({}) }),
) as unknown as typeof fetch;

import { AppTopBar } from "@/components/app-shell/AppTopBar";
import { AppPageContext } from "@/components/app-shell/AppPageContext";

function renderBar() {
  return render(
    <AppTopBar userEmail="owner@example.com" unreadNotifications={3} recentNotifications={[]} />,
  );
}

describe("AppTopBar responsive contract", () => {
  it("makes the identity group the side that yields", () => {
    renderBar();
    const bar = screen.getByTestId("app-shell-top-bar");
    const identity = bar.firstElementChild as HTMLElement;
    // `flex-1` + `min-w-0` together: grow into spare room, and shrink below
    // content when there isn't any. `min-w-0` alone was not enough before.
    expect(identity.className).toContain("flex-1");
    expect(identity.className).toContain("min-w-0");
  });

  it("pins the control cluster so it can never be pushed past the viewport", () => {
    renderBar();
    const bar = screen.getByTestId("app-shell-top-bar");
    const controls = bar.lastElementChild as HTMLElement;
    expect(controls.className).toContain("shrink-0");
  });

  it("stays a single row — no wrapping into a taller header", () => {
    renderBar();
    const bar = screen.getByTestId("app-shell-top-bar");
    expect(bar.className).not.toContain("flex-wrap");
    expect(bar.className).toContain("h-14");
  });

  it("does not hide overflow to make itself look correct", () => {
    renderBar();
    expect(screen.getByTestId("app-shell-top-bar").className).not.toMatch(
      /overflow-x-(hidden|clip)/,
    );
  });
});

describe("AppPageContext truncation", () => {
  it("can actually truncate — `truncate` needs `min-w-0` on a flex item to engage", () => {
    render(<AppPageContext />);
    const label = screen.getByTestId("app-shell-page-context");
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("min-w-0");
  });
});
