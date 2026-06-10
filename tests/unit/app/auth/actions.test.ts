/**
 * @jest-environment node
 *
 * Tests for app/auth/actions.ts.
 *
 * Covers input-validation, supabase-error surfacing, the sign-up email-
 * confirmation branch, and the password-reset flow (request + update). The
 * redirect-on-success path uses next/navigation's `redirect()` which throws an
 * internal symbol caught by the framework — asserted via the thrown digest.
 */

const mockSignUp = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockResetPasswordForEmail = jest.fn();
const mockUpdateUser = jest.fn();
const mockGetUser = jest.fn();

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: {
      signUp: mockSignUp,
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
      resetPasswordForEmail: mockResetPasswordForEmail,
      updateUser: mockUpdateUser,
      getUser: mockGetUser,
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

import {
  signIn,
  signUp,
  requestPasswordReset,
  updatePassword,
} from "@/app/auth/actions";

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignInWithPassword.mockReset();
  mockSignOut.mockReset();
  mockResetPasswordForEmail.mockReset();
  mockUpdateUser.mockReset();
  mockGetUser.mockReset();
});

function fd(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
}

/** Capture a redirect() thrown digest, or fail if no redirect happened. */
async function expectRedirect(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT;")) return digest.slice("NEXT_REDIRECT;".length);
    throw e;
  }
  throw new Error("expected a redirect but none occurred");
}

describe("auth actions — input validation", () => {
  it("signUp returns error when email is missing", async () => {
    const result = await signUp(null, fd({ password: "password123" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("signUp returns error when password is empty", async () => {
    const result = await signUp(null, fd({ email: "user@example.test", password: "" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it("signIn returns error when email is whitespace", async () => {
    const result = await signIn(null, fd({ email: "   ", password: "password123" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});

describe("auth actions — supabase error surfacing", () => {
  it("signUp surfaces the supabase error message verbatim", async () => {
    mockSignUp.mockResolvedValueOnce({ error: { message: "User already registered" } });
    const result = await signUp(null, fd({ email: "user@example.test", password: "password123" }));
    expect(result).toEqual({ ok: false, error: "User already registered" });
  });

  it("signIn surfaces the supabase error message verbatim", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    const result = await signIn(null, fd({ email: "user@example.test", password: "wrong-password" }));
    expect(result).toEqual({ ok: false, error: "Invalid login credentials" });
  });

  it("signUp passes trimmed email to supabase", async () => {
    mockSignUp.mockResolvedValueOnce({ error: { message: "any" } });
    await signUp(null, fd({ email: "  user@example.test  ", password: "password123" }));
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "user@example.test", password: "password123" }),
    );
  });

  it("signUp sets emailRedirectTo so the confirmation link lands on /auth/confirmed", async () => {
    mockSignUp.mockResolvedValueOnce({ error: { message: "any" } });
    await signUp(null, fd({ email: "user@example.test", password: "password123" }));
    expect(mockSignUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: "https://chainreact.app/auth/callback?next=/auth/confirmed",
        },
      }),
    );
  });
});

describe("auth actions — sign-up email confirmation branch", () => {
  it("returns confirmationRequired when signUp yields no session (email confirmation ON)", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const result = await signUp(null, fd({ email: "new@example.test", password: "password123" }));
    expect(result).toEqual({ ok: true, confirmationRequired: true });
  });

  it("redirects to /workflows when a session is established (confirmation OFF)", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { session: { access_token: "t" } }, error: null });
    const dest = await expectRedirect(() =>
      signUp(null, fd({ email: "new@example.test", password: "password123" })),
    );
    expect(dest).toBe("/workflows");
  });
});

describe("auth actions — requestPasswordReset (forgot password)", () => {
  it("returns error when email is missing", async () => {
    const result = await requestPasswordReset(null, fd({}));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/required/i) });
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends a recovery email with a callback redirect that forwards to reset-password", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const result = await requestPasswordReset(null, fd({ email: "  user@example.test  " }));
    expect(result).toEqual({ ok: true });
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith("user@example.test", {
      redirectTo: "https://chainreact.app/auth/callback?next=/auth/reset-password",
    });
  });

  it("NO user enumeration: returns the same ok result even when supabase errors", async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: { message: "User not found" } });
    const result = await requestPasswordReset(null, fd({ email: "ghost@example.test" }));
    expect(result).toEqual({ ok: true });
  });
});

describe("auth actions — updatePassword (reset password)", () => {
  it("rejects a password shorter than 8 chars (no session call)", async () => {
    const result = await updatePassword(null, fd({ password: "short", confirm: "short" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/8 characters/i) });
    expect(mockGetUser).not.toHaveBeenCalled();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects mismatched confirmation", async () => {
    const result = await updatePassword(null, fd({ password: "password123", confirm: "password124" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/do not match/i) });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("refuses when there is no recovery session (expired/invalid link)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const result = await updatePassword(null, fd({ password: "password123", confirm: "password123" }));
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/invalid or has expired/i) });
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("updates the password and redirects to /workflows on success", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    mockUpdateUser.mockResolvedValueOnce({ error: null });
    const dest = await expectRedirect(() =>
      updatePassword(null, fd({ password: "newpassword123", confirm: "newpassword123" })),
    );
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: "newpassword123" });
    expect(dest).toBe("/workflows");
  });

  it("surfaces a supabase updateUser error", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "u1" } } });
    mockUpdateUser.mockResolvedValueOnce({ error: { message: "New password is too weak" } });
    const result = await updatePassword(null, fd({ password: "password123", confirm: "password123" }));
    expect(result).toEqual({ ok: false, error: "New password is too weak" });
  });
});
