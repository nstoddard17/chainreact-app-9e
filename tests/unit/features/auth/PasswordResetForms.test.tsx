import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRequestPasswordReset = jest.fn();
const mockUpdatePassword = jest.fn();

jest.mock("@/app/auth/actions", () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
  updatePassword: (...args: unknown[]) => mockUpdatePassword(...args),
}));

import { ForgotPasswordForm } from "@/features/auth/ForgotPasswordForm";
import { ResetPasswordForm } from "@/features/auth/ResetPasswordForm";

beforeEach(() => {
  mockRequestPasswordReset.mockReset();
  mockUpdatePassword.mockReset();
});

describe("ForgotPasswordForm", () => {
  it("renders an email field and a send button", () => {
    render(<ForgotPasswordForm />);
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
    expect(document.querySelector('input[type="email"][name="email"]')).not.toBeNull();
  });

  it("shows a NEUTRAL no-enumeration confirmation on success", async () => {
    mockRequestPasswordReset.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByRole("textbox"), "user@example.test");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /if an account exists for that email/i,
    );
    // The form (and email field) is replaced by the neutral message.
    expect(screen.queryByRole("button", { name: /send reset link/i })).toBeNull();
  });

  it("renders a validation error from the action", async () => {
    mockRequestPasswordReset.mockResolvedValueOnce({ ok: false, error: "Email is required." });
    const user = userEvent.setup();
    render(<ForgotPasswordForm />);
    await user.type(screen.getByRole("textbox"), "x@y.z");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/email is required/i);
  });
});

describe("ResetPasswordForm", () => {
  it("renders new + confirm password fields and a submit button", () => {
    render(<ResetPasswordForm />);
    expect(document.querySelector('input[name="password"][type="password"]')).not.toBeNull();
    expect(document.querySelector('input[name="confirm"][type="password"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /set new password/i })).toBeInTheDocument();
  });

  it("renders an error from the action (e.g. mismatch / expired link)", async () => {
    mockUpdatePassword.mockResolvedValueOnce({ ok: false, error: "Passwords do not match." });
    const user = userEvent.setup();
    render(<ResetPasswordForm />);
    const inputs = Array.from(
      document.querySelectorAll('input[type="password"]'),
    ) as HTMLInputElement[];
    const pw = inputs[0]!;
    const confirm = inputs[1]!;
    await user.type(pw, "password123");
    await user.type(confirm, "password124");
    await user.click(screen.getByRole("button", { name: /set new password/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
  });
});
