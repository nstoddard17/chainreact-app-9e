/**
 * @jest-environment node
 *
 * Captcha-wiring tests for app/auth/actions.ts (SEC-3). Verification is
 * Supabase-native: the app forwards the Turnstile token from the form to the
 * Supabase SDK via `options.captchaToken`. These tests prove the token is read
 * from the `cf-turnstile-response` field and passed to signUp / signIn /
 * resetPasswordForEmail — and that when no token was submitted (the central
 * policy disabled captcha: local loopback dev / hosted v2-dev) the
 * `captchaToken` option is OMITTED ENTIRELY — never sent as `""` and never as
 * an explicit `undefined` property (LOCAL-AUTH-CAPTCHA-BYPASS-1).
 */

const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockResetPasswordForEmail = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  })),
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => ({
    get: (k: string) => (k === "origin" ? "https://chainreact.app" : null),
  })),
}));

jest.mock("next/navigation", () => ({
  redirect: jest.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${path}` });
  }),
}));

import { signIn, signUp, requestPasswordReset } from "@/app/auth/actions";

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignInWithPassword.mockReset();
  mockResetPasswordForEmail.mockReset();
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

async function swallowRedirect(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (!String((e as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT;")) throw e;
  }
}

describe("captcha token forwarded to Supabase", () => {
  it("signUp passes the form token as options.captchaToken", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await signUp(
      null,
      fd({ email: "u@example.test", password: "password123", "cf-turnstile-response": "tok-abc" }),
    );
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "u@example.test",
        options: expect.objectContaining({ captchaToken: "tok-abc" }),
      }),
    );
  });

  it("signIn passes the form token as options.captchaToken", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });
    await swallowRedirect(() =>
      signIn(null, fd({ email: "u@example.test", password: "password123", "cf-turnstile-response": "tok-xyz" })),
    );
    expect(mockSignInWithPassword).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "u@example.test",
        password: "password123",
        options: { captchaToken: "tok-xyz" },
      }),
    );
  });

  it("requestPasswordReset passes the form token as captchaToken", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const result = await requestPasswordReset(
      null,
      fd({ email: "u@example.test", "cf-turnstile-response": "tok-reset" }),
    );
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      "u@example.test",
      expect.objectContaining({ captchaToken: "tok-reset" }),
    );
  });

  it("signIn OMITS the captcha option entirely when the field is absent (disabled mode)", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });
    await swallowRedirect(() =>
      signIn(null, fd({ email: "u@example.test", password: "password123" })),
    );
    const arg = mockSignInWithPassword.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("options");
    expect(JSON.stringify(arg)).not.toContain("captchaToken");
  });

  it("signIn never forwards an empty-string token as a captcha option", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });
    await swallowRedirect(() =>
      signIn(
        null,
        fd({ email: "u@example.test", password: "password123", "cf-turnstile-response": "" }),
      ),
    );
    const arg = mockSignInWithPassword.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("options");
  });

  it("signUp omits captchaToken from options when no token was submitted", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    await signUp(null, fd({ email: "u@example.test", password: "password123" }));
    const arg = mockSignUp.mock.calls[0]![0] as { options: Record<string, unknown> };
    expect(arg.options).not.toHaveProperty("captchaToken");
    expect(arg.options.emailRedirectTo).toBeDefined();
  });

  it("requestPasswordReset omits captchaToken when no token was submitted", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    await requestPasswordReset(null, fd({ email: "u@example.test" }));
    const opts = mockResetPasswordForEmail.mock.calls[0]![1] as Record<string, unknown>;
    expect(opts).not.toHaveProperty("captchaToken");
    expect(opts.redirectTo).toBeDefined();
  });

  it("credential failures surface unchanged when no captcha is involved", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });
    const result = await signIn(null, fd({ email: "u@example.test", password: "nope-nope" }));
    expect(result).toEqual({ ok: false, error: "Invalid login credentials" });
  });

  it("network failures surface as thrown errors, not silent successes", async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new Error("fetch failed"));
    await expect(
      signIn(null, fd({ email: "u@example.test", password: "password123" })),
    ).rejects.toThrow("fetch failed");
  });
});
