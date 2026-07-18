import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockSignIn = jest.fn();
jest.mock("@/app/auth/actions", () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

// Keep the captcha out of these cases; its own gating is covered by the
// actions-captcha suite. Rendering it here would just add an async script load.
jest.mock("@/services/security/turnstile", () => ({
  TURNSTILE_FIELD_NAME: "cf-turnstile-response",
  isTurnstileWidgetConfigured: () => false,
}));

import { AuthField } from "@/features/auth/AuthField";
import { AuthForm } from "@/features/auth/AuthForm";
import { signIn } from "@/app/auth/actions";

beforeEach(() => {
  mockSignIn.mockReset();
});

describe("AuthField", () => {
  it("associates the visible label with the input (never a placeholder-only label)", () => {
    render(<AuthField label="Email" type="email" name="email" placeholder="you@company.com" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("type", "email");
  });

  it("links hint and error text to the input via aria-describedby, and marks it invalid", () => {
    render(
      <AuthField
        label="Password"
        type="password"
        name="password"
        hint="Use 8 or more characters."
        error="That password is too short."
      />,
    );
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("aria-invalid", "true");

    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const described = describedBy
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    expect(described).toContain("Use 8 or more characters.");
    expect(described).toContain("That password is too short.");
  });

  it("is not marked invalid when there is no error", () => {
    render(<AuthField label="Email" type="email" name="email" />);
    expect(screen.getByLabelText("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("reveal toggle flips the input between password and text, and is keyboard reachable", async () => {
    const user = userEvent.setup();
    render(<AuthField label="Password" type="password" name="password" reveal />);
    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    const toggle = screen.getByRole("button", { name: /show typed characters/i });
    await user.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide typed characters/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Operable from the keyboard alone (it is a real <button>, so Enter fires it).
    screen.getByRole("button", { name: /hide typed characters/i }).focus();
    await user.keyboard("{Enter}");
    expect(input).toHaveAttribute("type", "password");
  });

  /**
   * Guards the Playwright suites: `tests/smoke/auth.setup.ts` and every
   * `tests/e2e/slice-*.spec.ts` sign-in helper resolve the credential fields
   * with `getByLabel(/email|password/i)`. Playwright runs those in strict mode,
   * so a SECOND element whose accessible name matches (e.g. a reveal toggle
   * named "Show password") would break every one of them. Keep this passing.
   */
  it("password reveal toggle does not collide with the /password/i label locator", () => {
    render(<AuthField label="Password" type="password" name="password" reveal />);
    const matches = screen.getAllByLabelText(/password/i);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.tagName).toBe("INPUT");
  });
});

describe("AuthForm", () => {
  it("uses the sign-in password autocomplete by default and new-password for signup", () => {
    const { unmount } = render(
      <AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />,
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    unmount();

    render(
      <AuthForm
        action={signIn}
        submitLabel="Sign up"
        pendingLabel="Creating account…"
        passwordAutoComplete="new-password"
      />,
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("renders the forgot-password link only when a href is supplied", () => {
    const { unmount } = render(
      <AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />,
    );
    expect(screen.queryByRole("link", { name: /forgot password/i })).toBeNull();
    unmount();

    render(
      <AuthForm
        action={signIn}
        submitLabel="Sign in"
        pendingLabel="Signing in…"
        forgotPasswordHref="/auth/forgot-password"
      />,
    );
    expect(screen.getByRole("link", { name: /forgot password/i })).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("disables the submit while in flight so it cannot be fired twice", async () => {
    let resolveAction: (v: { ok: false; error: string }) => void = () => {};
    mockSignIn.mockImplementationOnce(
      () => new Promise((resolve) => (resolveAction = resolve)),
    );
    const user = userEvent.setup();
    render(<AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />);

    await user.type(screen.getByLabelText("Email"), "user@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const pendingBtn = await screen.findByRole(
      "button",
      { name: /signing in/i },
      { timeout: 5000 },
    );
    expect(pendingBtn).toBeDisabled();
    // A second click while pending must not start another request.
    await user.click(pendingBtn);
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    resolveAction({ ok: false, error: "Invalid login credentials." });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), {
      timeout: 5000,
    });
  });

  it("surfaces the server error and keeps the form usable for a retry", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: "Invalid login credentials." });
    const user = userEvent.setup();
    render(<AuthForm action={signIn} submitLabel="Sign in" pendingLabel="Signing in…" />);

    await user.type(screen.getByLabelText("Email"), "user@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(
      /invalid login credentials/i,
    );
    // Generic credential error — must not hint at whether the address is known.
    expect(screen.getByRole("alert").textContent).not.toMatch(
      /\b(no such user|unknown email|not registered)\b/i,
    );
    expect(screen.getByRole("button", { name: "Sign in" })).not.toBeDisabled();
    // The email is preserved so the retry only needs the password re-entered.
    expect(screen.getByLabelText("Email")).toHaveValue("user@example.test");
  });

  it("replaces the form with a polite status when signup needs email confirmation", async () => {
    mockSignIn.mockResolvedValueOnce({ ok: true, confirmationRequired: true });
    const user = userEvent.setup();
    render(
      <AuthForm
        action={signIn}
        submitLabel="Sign up"
        pendingLabel="Creating account…"
        successMessage="Check your email to confirm your account, then sign in."
      />,
    );

    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(await screen.findByRole("status", {}, { timeout: 5000 })).toHaveTextContent(
      /check your email to confirm/i,
    );
    expect(screen.queryByLabelText("Password")).toBeNull();
  });
});
