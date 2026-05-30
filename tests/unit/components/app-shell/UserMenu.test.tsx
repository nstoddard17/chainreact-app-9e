/**
 * Tests for components/app-shell/UserMenu (Slice 4.APP-SHELL-1).
 *
 * The user menu MUST only expose menu items backed by real APIs. Only
 * "Sign out" is wired (existing `signOut` server action); no Settings,
 * Billing, or Account links are rendered because those routes don't
 * exist yet (page guide §4 — no fake actions).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The Next.js form-action `<form action={signOut}>` is a server action.
// We mock the import so the component renders without trying to invoke
// it; the action's runtime behavior is covered by app/auth tests.
jest.mock("@/app/auth/actions", () => ({
  signOut: jest.fn(),
}));

import { UserMenu } from "@/components/app-shell/UserMenu";

describe("UserMenu", () => {
  it("trigger shows the user's initials and has an accessible label naming the email", () => {
    render(<UserMenu userEmail="marcus.leonard@example.com" />);
    const trigger = screen.getByTestId("app-shell-user-menu-trigger");
    expect(trigger).toHaveAttribute(
      "aria-label",
      "Account menu for marcus.leonard@example.com",
    );
    expect(trigger).toHaveTextContent("ML");
  });

  it("falls back to first 2 chars of the local-part when no separator is present", () => {
    render(<UserMenu userEmail="marcus@example.com" />);
    expect(screen.getByTestId("app-shell-user-menu-trigger")).toHaveTextContent(
      "MA",
    );
  });

  it("opens the popover, shows the email + a Sign out form (and nothing else)", async () => {
    const user = userEvent.setup();
    render(<UserMenu userEmail="marcus@example.com" />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    const content = screen.getByTestId("app-shell-user-menu-content");
    expect(
      screen.getByTestId("app-shell-user-email"),
    ).toHaveTextContent("marcus@example.com");
    expect(screen.getByTestId("app-shell-sign-out")).toBeInTheDocument();
    // No fake account/settings/billing items.
    expect(
      content.querySelector("[data-testid='app-shell-settings']"),
    ).toBeNull();
    expect(
      content.querySelector("[data-testid='app-shell-billing']"),
    ).toBeNull();
    expect(
      content.querySelector("[data-testid='app-shell-account']"),
    ).toBeNull();
  });

  it("Sign out lives inside a <form> with type=submit (server-action invocation)", async () => {
    const user = userEvent.setup();
    render(<UserMenu userEmail="marcus@example.com" />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    const button = screen.getByTestId("app-shell-sign-out");
    expect(button.tagName.toLowerCase()).toBe("button");
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.closest("form")).not.toBeNull();
  });
});
