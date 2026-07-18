/**
 * Server-side signup OTP actions — Slice AUTH-EMAIL-OTP-1.
 *
 * Mocks only the Supabase client and Next's `redirect`. The action logic —
 * validation, error mapping, returnTo sanitising, no-leak logging — is real.
 */

const mockVerifyOtp = jest.fn();
const mockResend = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      verifyOtp: (...a: unknown[]) => mockVerifyOtp(...a),
      resend: (...a: unknown[]) => mockResend(...a),
    },
  })),
}));

class RedirectError extends Error {
  constructor(public to: string) {
    super("NEXT_REDIRECT");
  }
}
jest.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));

jest.mock("next/headers", () => ({
  headers: async () => new Map([["origin", "https://app.example.test"]]),
}));

import { resendSignupOtp, verifySignupOtp } from "@/app/auth/actions";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

/** Run an action that is expected to redirect; return the destination. */
async function captureRedirect(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof RedirectError) return e.to;
    throw e;
  }
  throw new Error("expected a redirect, but the action returned normally");
}

beforeEach(() => {
  mockVerifyOtp.mockReset();
  mockResend.mockReset();
});

describe("verifySignupOtp", () => {
  it("calls Supabase with type 'signup' and the trimmed address + code", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: { access_token: "x" } }, error: null });
    await captureRedirect(() =>
      verifySignupOtp(null, form({ email: "  new@example.test ", code: "482913" })),
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: "new@example.test",
      token: "482913",
      type: "signup",
    });
  });

  it("redirects to a safe returnTo on success", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: { access_token: "x" } }, error: null });
    const to = await captureRedirect(() =>
      verifySignupOtp(
        null,
        form({ email: "new@example.test", code: "482913", returnTo: "/start/continue" }),
      ),
    );
    expect(to).toBe("/start/continue");
  });

  it("collapses an off-origin returnTo to the default destination", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: { access_token: "x" } }, error: null });
    const to = await captureRedirect(() =>
      verifySignupOtp(
        null,
        form({ email: "new@example.test", code: "482913", returnTo: "https://evil.example/x" }),
      ),
    );
    expect(to).toBe("/workflows");
  });

  it("collapses a protocol-relative returnTo to the default destination", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: { access_token: "x" } }, error: null });
    const to = await captureRedirect(() =>
      verifySignupOtp(
        null,
        form({ email: "new@example.test", code: "482913", returnTo: "//evil.example/x" }),
      ),
    );
    expect(to).toBe("/workflows");
  });

  it("rejects a malformed code before calling Supabase", async () => {
    for (const code of ["12345", "1234567", "abcdef", "12 34 5", ""]) {
      const result = await verifySignupOtp(null, form({ email: "new@example.test", code }));
      expect(result).toEqual({ ok: false, error: "Enter the 6-digit code from your email." });
    }
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("accepts a code with incidental whitespace", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: { access_token: "x" } }, error: null });
    await captureRedirect(() =>
      verifySignupOtp(null, form({ email: "new@example.test", code: "482 913" })),
    );
    expect(mockVerifyOtp).toHaveBeenCalledWith(
      expect.objectContaining({ token: "482913" }),
    );
  });

  it("refuses when the pending address is missing", async () => {
    const result = await verifySignupOtp(null, form({ code: "482913" }));
    expect(result).toEqual({
      ok: false,
      error: "We lost track of that signup. Start again from the sign-up form.",
    });
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it("maps an expired token to the resend-able message", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: null,
      error: { code: "otp_expired", message: "Token has expired or is invalid" },
    });
    const result = await verifySignupOtp(null, form({ email: "a@b.test", code: "482913" }));
    expect(result).toEqual({
      ok: false,
      error: "That code has expired. Request a new code.",
      codeExpired: true,
    });
  });

  it("maps an invalid token to the retry message", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "Invalid token" },
    });
    const result = await verifySignupOtp(null, form({ email: "a@b.test", code: "000000" }));
    expect(result).toEqual({
      ok: false,
      error: "That code is incorrect. Check the code and try again.",
      codeExpired: false,
    });
  });

  it("maps an unrecognised provider failure to the generic message", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: null,
      error: { code: "service_unavailable", message: "upstream connect error" },
    });
    const result = await verifySignupOtp(null, form({ email: "a@b.test", code: "482913" }));
    expect(result).toEqual({
      ok: false,
      error: "We couldn't verify the code right now. Try again.",
      codeExpired: false,
    });
  });

  it("never surfaces the raw Supabase message, the address, or the code", async () => {
    mockVerifyOtp.mockResolvedValueOnce({
      data: null,
      error: { code: "invalid_credentials", message: "Token has expired or is invalid" },
    });
    const result = await verifySignupOtp(
      null,
      form({ email: "secret-user@example.test", code: "482913" }),
    );
    const text = JSON.stringify(result);
    expect(text).not.toContain("Token has expired or is invalid");
    expect(text).not.toContain("secret-user@example.test");
    expect(text).not.toContain("482913");
  });

  it("does not redirect when Supabase verifies but returns no session", async () => {
    mockVerifyOtp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const result = await verifySignupOtp(null, form({ email: "a@b.test", code: "482913" }));
    expect(result).toEqual({
      ok: false,
      error: "We couldn't verify the code right now. Try again.",
    });
  });
});

describe("resendSignupOtp", () => {
  it("calls Supabase resend with type 'signup' and forwards the captcha token", async () => {
    mockResend.mockResolvedValueOnce({ error: null });
    const result = await resendSignupOtp(
      null,
      form({ email: "new@example.test", "cf-turnstile-response": "tok_123" }),
    );
    expect(result).toEqual({ ok: true, resent: true });
    expect(mockResend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.test",
      options: {
        emailRedirectTo: "https://app.example.test/auth/callback?next=/auth/confirmed",
        captchaToken: "tok_123",
      },
    });
  });

  it("omits the captcha token when the widget isn't configured", async () => {
    mockResend.mockResolvedValueOnce({ error: null });
    await resendSignupOtp(null, form({ email: "new@example.test" }));
    expect(mockResend).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ captchaToken: undefined }),
      }),
    );
  });

  it("returns a safe failure and logs only the message — never the address", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      mockResend.mockResolvedValueOnce({ error: { message: "rate limit exceeded" } });
      const result = await resendSignupOtp(null, form({ email: "secret-user@example.test" }));
      expect(result).toEqual({
        ok: false,
        error: "We couldn't send a new code right now. Try again in a moment.",
      });
      const logged = warn.mock.calls.flat().join(" ");
      expect(logged).toContain("auth.signup_resend.error");
      expect(logged).not.toContain("secret-user@example.test");
    } finally {
      warn.mockRestore();
    }
  });

  it("refuses when the pending address is missing", async () => {
    const result = await resendSignupOtp(null, form({}));
    expect(result).toEqual({
      ok: false,
      error: "We lost track of that signup. Start again from the sign-up form.",
    });
    expect(mockResend).not.toHaveBeenCalled();
  });
});
