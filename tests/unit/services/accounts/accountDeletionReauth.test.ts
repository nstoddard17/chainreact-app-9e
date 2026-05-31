/**
 * @jest-environment node
 *
 * Unit tests for the self-serve deletion re-auth guard (4.ACCOUNT-MODEL-10e).
 * Mocks @supabase/supabase-js so no network/DB is touched. Proves a correct
 * password passes, a wrong password fails (without throwing), and the throwaway
 * client is constructed with NO session persistence (never disturbs the caller).
 */

const mockSignInWithPassword = jest.fn();
const mockSignOut = jest.fn();
const mockCreateClient = jest.fn(() => ({
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
}));

jest.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

import { verifyPasswordReauth } from "@/services/accounts/accountDeletionReauth";

const ENV = { ...process.env };

beforeEach(() => {
  mockSignInWithPassword.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockCreateClient.mockClear();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
});

afterEach(() => {
  process.env = { ...ENV };
});

describe("verifyPasswordReauth", () => {
  it("returns ok when the password is correct", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: {}, error: null });
    const result = await verifyPasswordReauth("user@example.com", "correct-horse");
    expect(result.ok).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "correct-horse",
    });
  });

  it("constructs a throwaway client with NO session persistence and signs out after", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: {}, error: null });
    await verifyPasswordReauth("user@example.com", "pw");
    expect(mockCreateClient).toHaveBeenCalledWith(
      "https://x.supabase.co",
      "anon-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          persistSession: false,
          autoRefreshToken: false,
        }),
      }),
    );
    // Tokens minted by the throwaway client are discarded.
    expect(mockSignOut).toHaveBeenCalled();
  });

  it("returns not-ok (no throw) on a wrong password", async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: {},
      error: { message: "Invalid login credentials" },
    });
    const result = await verifyPasswordReauth("user@example.com", "wrong");
    expect(result).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it("returns not-ok with no_email when the session has no email", async () => {
    const result = await verifyPasswordReauth(null, "pw");
    expect(result).toEqual({ ok: false, reason: "no_email" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });

  it("returns not-ok with misconfigured when env is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const result = await verifyPasswordReauth("user@example.com", "pw");
    expect(result).toEqual({ ok: false, reason: "misconfigured" });
    expect(mockCreateClient).not.toHaveBeenCalled();
  });
});
