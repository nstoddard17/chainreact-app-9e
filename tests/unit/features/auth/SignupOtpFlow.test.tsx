import { useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Signup email-verification (6-digit OTP) — Slice AUTH-EMAIL-OTP-1.
 *
 * Mocks ONLY the server-action boundary (the Supabase edge). The OTP input
 * logic, the flow's screen swap, the cooldown timer and the pending-state rules
 * are the real implementations — those are the behaviours these tests claim to
 * verify, so mocking them would make the suite meaningless.
 */

const mockSignUp = jest.fn();
const mockVerify = jest.fn();
const mockResend = jest.fn();

jest.mock("@/app/auth/actions", () => ({
  signUp: (...a: unknown[]) => mockSignUp(...a),
  verifySignupOtp: (...a: unknown[]) => mockVerify(...a),
  resendSignupOtp: (...a: unknown[]) => mockResend(...a),
}));

jest.mock("@/core/security/turnstile", () => ({
  TURNSTILE_FIELD_NAME: "cf-turnstile-response",
  isTurnstileWidgetConfigured: () => false,
}));

jest.mock("@/utils/supabase/client", () => ({
  createClient: jest.fn(() => ({ auth: { signInWithOAuth: jest.fn() } })),
}));

import { SignUpFlow } from "@/features/auth/SignUpFlow";
import { VerifyEmailForm } from "@/features/auth/VerifyEmailForm";
import { AuthCodeInput, sanitizeCode } from "@/features/auth/AuthCodeInput";
import { signUp } from "@/app/auth/actions";

const CONFIRMATION = { ok: true as const, confirmationRequired: true };

beforeEach(() => {
  mockSignUp.mockReset();
  mockVerify.mockReset();
  mockResend.mockReset();
});

/** Fill the signup form and submit, landing on the verification screen. */
async function signUpTo(user: ReturnType<typeof userEvent.setup>, email = "new@example.test") {
  await user.type(screen.getByLabelText("Email"), email);
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: "Sign up" }));
  return screen.findByRole("heading", { name: /enter the code/i }, { timeout: 5000 });
}

describe("signup → verification screen", () => {
  it("1. a confirmation-required signup moves to the code screen for that address", async () => {
    mockSignUp.mockResolvedValueOnce(CONFIRMATION);
    const user = userEvent.setup();
    render(<SignUpFlow action={signUp} />);

    await signUpTo(user, "new@example.test");

    expect(screen.getByText(/we sent a 6-digit code to/i)).toHaveTextContent("new@example.test");
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    // The signup form is gone — no stale password field left mounted.
    expect(screen.queryByLabelText("Password")).toBeNull();
  });

  it("2. the signup password is never carried into verification state", async () => {
    mockSignUp.mockResolvedValueOnce(CONFIRMATION);
    const user = userEvent.setup();
    const { container } = render(<SignUpFlow action={signUp} />);

    await signUpTo(user);

    // No password input, and no hidden field smuggling it forward.
    expect(container.querySelector('input[type="password"]')).toBeNull();
    const hidden = Array.from(container.querySelectorAll('input[type="hidden"]'));
    for (const el of hidden) {
      expect((el as HTMLInputElement).value).not.toContain("password123");
    }
    expect(container.innerHTML).not.toContain("password123");
  });

  it("13. 'Use a different email' returns to signup with no password retained", async () => {
    mockSignUp.mockResolvedValueOnce(CONFIRMATION);
    const user = userEvent.setup();
    const { container } = render(<SignUpFlow action={signUp} />);
    await signUpTo(user);

    await user.click(screen.getByTestId("verify-different-email"));

    expect(screen.getByRole("button", { name: "Sign up" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(container.innerHTML).not.toContain("password123");
  });

  it("still redirects (no code screen) when confirmation is OFF and a session exists", async () => {
    // signUp redirects server-side in that case and never reports
    // confirmationRequired, so the flow must stay on the form.
    mockSignUp.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<SignUpFlow action={signUp} />);

    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    await waitFor(() => expect(mockSignUp).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("heading", { name: /enter the code/i })).toBeNull();
  });
});

describe("code input behaviour", () => {
  function Harness({ onValue }: { onValue?: (v: string) => void } = {}) {
    const [v, setV] = useState("");
    return (
      <AuthCodeInput
        value={v}
        onChange={(next: string) => {
          setV(next);
          onValue?.(next);
        }}
      />
    );
  }

  it("8. rejects non-numeric characters", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/verification code/i);
    await user.type(input, "1a2b3c");
    expect(input).toHaveValue("123");
  });

  it("8b. sanitizeCode strips non-digits and clamps to six", () => {
    expect(sanitizeCode("12-34 56")).toBe("123456");
    expect(sanitizeCode("1234567890")).toBe("123456");
    expect(sanitizeCode("abc")).toBe("");
  });

  it("7. pasting six digits populates the whole input", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/verification code/i);
    input.focus();
    await user.paste("482913");
    expect(input).toHaveValue("482913");
  });

  it("7b. a full-length paste replaces a partially-typed code rather than truncating", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/verification code/i);
    await user.type(input, "99");
    await user.paste("482913");
    expect(input).toHaveValue("482913");
  });

  it("9. backspace deletes and arrow keys move without altering the value", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const input = screen.getByLabelText(/verification code/i) as HTMLInputElement;
    await user.type(input, "123456");

    await user.keyboard("{Backspace}");
    expect(input).toHaveValue("12345");

    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(input).toHaveValue("12345");
    expect(input.selectionStart).toBe(3);

    await user.keyboard("{ArrowRight}");
    expect(input.selectionStart).toBe(4);
  });

  it("uses a numeric mobile keyboard and the one-time-code autofill hint", () => {
    render(<Harness />);
    const input = screen.getByLabelText(/verification code/i);
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("maxlength", "6");
  });

  it("exposes exactly one accessible control despite rendering six segments", () => {
    render(<Harness />);
    expect(screen.getAllByLabelText(/verification code/i)).toHaveLength(1);
  });
});

describe("verification submit", () => {
  const props = {
    email: "new@example.test",
    onUseDifferentEmail: jest.fn(),
  };

  it("3. a correct code submits the code, email and returnTo to the server action", async () => {
    mockVerify.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} returnTo="/start/continue" />);

    await user.type(screen.getByLabelText(/verification code/i), "482913");
    await user.click(screen.getByTestId("verify-submit"));

    await waitFor(() => expect(mockVerify).toHaveBeenCalledTimes(1));
    const formData = mockVerify.mock.calls[0]![1] as FormData;
    expect(formData.get("code")).toBe("482913");
    expect(formData.get("email")).toBe("new@example.test");
    expect(formData.get("returnTo")).toBe("/start/continue");
  });

  it("submit stays disabled until all six digits are present", async () => {
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);
    const submit = screen.getByTestId("verify-submit");

    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/verification code/i), "48291");
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText(/verification code/i), "3");
    expect(submit).toBeEnabled();
  });

  it("10. blocks duplicate verification submissions while one is pending", async () => {
    let resolveVerify: (v: unknown) => void = () => {};
    mockVerify.mockImplementationOnce(() => new Promise((r) => (resolveVerify = r)));
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);

    await user.type(screen.getByLabelText(/verification code/i), "482913");
    await user.click(screen.getByTestId("verify-submit"));

    const pending = await screen.findByRole("button", { name: /verifying/i }, { timeout: 5000 });
    expect(pending).toBeDisabled();
    await user.click(pending);
    expect(mockVerify).toHaveBeenCalledTimes(1);

    resolveVerify({ ok: false, error: "That code is incorrect. Check the code and try again." });
    await screen.findByTestId("verify-error", {}, { timeout: 5000 });
  });

  it("5. an incorrect code shows a safe error and keeps the address on screen", async () => {
    mockVerify.mockResolvedValueOnce({
      ok: false,
      error: "That code is incorrect. Check the code and try again.",
    });
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);

    await user.type(screen.getByLabelText(/verification code/i), "000000");
    await user.click(screen.getByTestId("verify-submit"));

    const err = await screen.findByTestId("verify-error", {}, { timeout: 5000 });
    expect(err).toHaveTextContent(/that code is incorrect/i);
    // The pending address survives so the user isn't dumped back to signup.
    expect(screen.getByText(/we sent a 6-digit code to/i)).toHaveTextContent("new@example.test");
    // Field is marked invalid and refocused for an immediate retry.
    await waitFor(() =>
      expect(screen.getByLabelText(/verification code/i)).toHaveAttribute("aria-invalid", "true"),
    );
    expect(screen.getByLabelText(/verification code/i)).toHaveFocus();
  });

  it("6. an expired code surfaces the resend affordance", async () => {
    mockVerify.mockResolvedValueOnce({
      ok: false,
      error: "That code has expired. Request a new code.",
      codeExpired: true,
    });
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);

    await user.type(screen.getByLabelText(/verification code/i), "111111");
    await user.click(screen.getByTestId("verify-submit"));

    expect(await screen.findByTestId("verify-error", {}, { timeout: 5000 })).toHaveTextContent(
      /expired/i,
    );
    // The resend prompt swaps from "Didn't get a code?" to the expiry wording,
    // and resending is immediately available (no cooldown has been started).
    const resend = screen.getByTestId("verify-resend");
    expect(resend).toBeEnabled();
    expect(resend.closest("p")).toHaveTextContent(/that code has expired\./i);
    expect(screen.queryByText(/didn't get a code\?/i)).toBeNull();
  });

  it("14. no OTP, password or token leaks into rendered error output", async () => {
    mockVerify.mockResolvedValueOnce({
      ok: false,
      error: "That code is incorrect. Check the code and try again.",
    });
    const user = userEvent.setup();
    const { container } = render(<VerifyEmailForm {...props} />);

    await user.type(screen.getByLabelText(/verification code/i), "482913");
    await user.click(screen.getByTestId("verify-submit"));
    const err = await screen.findByTestId("verify-error", {}, { timeout: 5000 });

    // The error text must not echo the submitted code back at the user.
    expect(err.textContent).not.toContain("482913");
    // Nothing token-shaped is persisted anywhere the browser can read it.
    expect(container.querySelector('[name="password"]')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("resend + cooldown", () => {
  const props = { email: "new@example.test", onUseDifferentEmail: jest.fn() };

  it("11. resend calls the real resend action with the pending address", async () => {
    mockResend.mockResolvedValueOnce({ ok: true, resent: true });
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);

    await user.click(screen.getByTestId("verify-resend"));

    await waitFor(() => expect(mockResend).toHaveBeenCalledTimes(1));
    const formData = mockResend.mock.calls[0]![1] as FormData;
    expect(formData.get("email")).toBe("new@example.test");
    expect(await screen.findByRole("status", {}, { timeout: 5000 })).toHaveTextContent(
      /sent a new code/i,
    );
  });

  it("12. a successful resend starts a visible 60s countdown that blocks re-sending", async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockResend.mockResolvedValueOnce({ ok: true, resent: true });
      render(<VerifyEmailForm {...props} />);

      await user.click(screen.getByTestId("verify-resend"));
      await waitFor(() => expect(screen.getByText(/resend in 60s/i)).toBeInTheDocument());
      // The button is replaced by the countdown, so a second send is impossible.
      expect(screen.queryByTestId("verify-resend")).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(3000);
      });
      expect(screen.getByText(/resend in 57s/i)).toBeInTheDocument();

      await act(async () => {
        jest.advanceTimersByTime(57000);
      });
      await waitFor(() => expect(screen.getByTestId("verify-resend")).toBeInTheDocument());
      expect(mockResend).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("a failed resend does NOT start the cooldown, so the user can retry", async () => {
    mockResend.mockResolvedValueOnce({
      ok: false,
      error: "We couldn't send a new code right now. Try again in a moment.",
    });
    const user = userEvent.setup();
    render(<VerifyEmailForm {...props} />);

    await user.click(screen.getByTestId("verify-resend"));

    expect(await screen.findByRole("alert", {}, { timeout: 5000 })).toHaveTextContent(
      /couldn't send a new code/i,
    );
    expect(screen.getByTestId("verify-resend")).toBeEnabled();
    expect(screen.queryByText(/resend in/i)).toBeNull();
  });

  it("clears its countdown timer on unmount", async () => {
    jest.useFakeTimers();
    try {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      mockResend.mockResolvedValueOnce({ ok: true, resent: true });
      const { unmount } = render(<VerifyEmailForm {...props} />);
      await user.click(screen.getByTestId("verify-resend"));
      await waitFor(() => expect(screen.getByText(/resend in 60s/i)).toBeInTheDocument());

      const clearSpy = jest.spyOn(window, "clearInterval");
      unmount();
      // The countdown interval is released by the effect cleanup...
      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();

      // ...and draining the clock afterwards produces no "state update on an
      // unmounted component" warning, i.e. nothing is still ticking.
      const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
      await act(async () => {
        jest.advanceTimersByTime(120000);
      });
      expect(errorSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("accessibility of the verification screen", () => {
  it("labels the code field and links its instructions", () => {
    render(<VerifyEmailForm email="new@example.test" onUseDifferentEmail={jest.fn()} />);
    const input = screen.getByLabelText(/verification code/i);
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toMatch(/6-digit code/i);
  });

  it("gives the back and resend controls real accessible names", () => {
    render(<VerifyEmailForm email="new@example.test" onUseDifferentEmail={jest.fn()} />);
    expect(screen.getByRole("button", { name: /^back$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend code/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use a different email/i })).toBeInTheDocument();
  });
});

describe("returnTo safety", () => {
  it("4. an unsafe returnTo is rejected by safeReturnPath before it can be used", async () => {
    const { safeReturnPath } = await import("@/lib/safeReturnPath");
    // The verify action runs every returnTo through this, so an off-origin or
    // protocol-relative destination can never survive to the redirect.
    expect(safeReturnPath("https://evil.example/steal")).toBe("/workflows");
    expect(safeReturnPath("//evil.example/steal")).toBe("/workflows");
    expect(safeReturnPath("/start/continue")).toBe("/start/continue");
    expect(safeReturnPath(null)).toBe("/workflows");
  });

  it("omits the returnTo field entirely when none was supplied", () => {
    const { container } = render(
      <VerifyEmailForm email="new@example.test" onUseDifferentEmail={jest.fn()} />,
    );
    const form = container.querySelector("form")!;
    expect(within(form).queryByDisplayValue("/workflows")).toBeNull();
    expect(form.querySelector('input[name="returnTo"]')).toBeNull();
  });
});
