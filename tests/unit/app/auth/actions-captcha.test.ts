/**
 * @jest-environment node
 *
 * Captcha-gate tests for app/auth/actions.ts (SEC-3). Mocks the Turnstile service
 * to force a verification failure and proves the public auth actions (sign-up,
 * sign-in, forgot-password) refuse BEFORE touching Supabase — and that a passing
 * verification lets them through.
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

const mockVerify = jest.fn();
jest.mock("@/services/security/turnstile", () => ({
  verifyTurnstileToken: (...a: unknown[]) => mockVerify(...a),
  TURNSTILE_FIELD_NAME: "cf-turnstile-response",
}));

import { signIn, signUp, requestPasswordReset } from "@/app/auth/actions";

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignInWithPassword.mockReset();
  mockResetPasswordForEmail.mockReset();
  mockVerify.mockReset();
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

describe("captcha gate — failing verification blocks the action", () => {
  beforeEach(() => mockVerify.mockResolvedValue({ ok: false }));

  it("signUp refuses and never calls supabase", async () => {
    const result = await signUp(null, fd({ email: "u@example.test", password: "password123" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/verify you're human/i) });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("signIn refuses and never calls supabase", async () => {
    const result = await signIn(null, fd({ email: "u@example.test", password: "password123" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/verify you're human/i) });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });

  it("requestPasswordReset refuses and never calls supabase", async () => {
    const result = await requestPasswordReset(null, fd({ email: "u@example.test" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/verify you're human/i) });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });
});

describe("captcha gate — passing verification lets the action through", () => {
  beforeEach(() => mockVerify.mockResolvedValue({ ok: true, enforced: true }));

  it("signUp reads the token from the form and proceeds to supabase", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const result = await signUp(
      null,
      fd({ email: "u@example.test", password: "password123", "cf-turnstile-response": "tok" }),
    );
    expect(mockVerify).toHaveBeenCalledWith("tok", null);
    expect(result).toEqual({ ok: true, confirmationRequired: true });
    expect(mockSignUp).toHaveBeenCalled();
  });

  it("requestPasswordReset proceeds (still neutral success)", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const result = await requestPasswordReset(null, fd({ email: "u@example.test", "cf-turnstile-response": "tok" }));
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).toHaveBeenCalled();
  });
});
