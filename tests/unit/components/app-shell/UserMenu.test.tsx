/**
 * Tests for components/app-shell/UserMenu (Slice 4.APP-SHELL-1; Account
 * settings link added in 4.ACCOUNT-SETTINGS-1).
 *
 * The user menu MUST only expose menu items backed by real routes/APIs:
 * an "Account settings" link to the real `/account` route + "Sign out"
 * (existing `signOut` server action). No Billing / Settings-hub links —
 * those routes don't exist yet (page guide §4 — no fake actions).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The Next.js form-action `<form action={signOut}>` is a server action.
// We mock the import so the component renders without trying to invoke
// it; the action's runtime behavior is covered by app/auth tests.
jest.mock("@/app/auth/actions", () => ({
  signOut: jest.fn(),
}));

// 5.ONBOARD-1 — "Getting started" posts a reopen then navigates; the client
// API is mocked so tests assert the call without a network.
const mockPostPresentation = jest.fn();
jest.mock("@/lib/api/onboarding", () => ({
  postOnboardingPresentation: (...a: unknown[]) => mockPostPresentation(...a),
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

  it("opens the popover, shows the email + an Account settings link + a Sign out form", async () => {
    const user = userEvent.setup();
    render(<UserMenu userEmail="marcus@example.com" />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    const content = screen.getByTestId("app-shell-user-menu-content");
    expect(
      screen.getByTestId("app-shell-user-email"),
    ).toHaveTextContent("marcus@example.com");
    expect(screen.getByTestId("app-shell-sign-out")).toBeInTheDocument();
    // Account settings links to the real /account route.
    const account = screen.getByTestId("app-shell-account");
    expect(account).toHaveAttribute("href", "/account");
    // Contact support is a real mailto to the staffed support mailbox.
    const support = screen.getByTestId("app-shell-contact-support");
    expect(support).toHaveAttribute("href", "mailto:support@chainreact.app");
    // Still no fake settings-hub / billing items (no backing route yet).
    expect(
      content.querySelector("[data-testid='app-shell-settings']"),
    ).toBeNull();
    expect(
      content.querySelector("[data-testid='app-shell-billing']"),
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

describe("UserMenu — Getting started (5.ONBOARD-1)", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    mockPostPresentation.mockReset();
    mockPostPresentation.mockResolvedValue({ ok: true });
    Object.defineProperty(window, "location", {
      writable: true,
      value: { ...originalLocation, assign: jest.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      writable: true,
      value: originalLocation,
    });
  });

  it("is hidden when the onboarding flag prop is off (default)", async () => {
    const user = userEvent.setup();
    render(<UserMenu userEmail="marcus@example.com" />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    expect(screen.queryByTestId("app-shell-getting-started")).toBeNull();
  });

  it("reopens the checklist then navigates to /workflows when enabled", async () => {
    const user = userEvent.setup();
    render(<UserMenu userEmail="marcus@example.com" gettingStartedEnabled />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    await user.click(screen.getByTestId("app-shell-getting-started"));
    expect(mockPostPresentation).toHaveBeenCalledWith({ action: "reopen" });
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.assign).toHaveBeenCalledWith("/workflows");
  });

  it("still navigates when the reopen POST fails (best-effort)", async () => {
    const user = userEvent.setup();
    mockPostPresentation.mockRejectedValueOnce(new Error("offline"));
    render(<UserMenu userEmail="marcus@example.com" gettingStartedEnabled />);
    await user.click(screen.getByTestId("app-shell-user-menu-trigger"));
    await user.click(screen.getByTestId("app-shell-getting-started"));
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.assign).toHaveBeenCalledWith("/workflows");
  });
});
