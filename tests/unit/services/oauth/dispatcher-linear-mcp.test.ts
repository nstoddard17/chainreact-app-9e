/**
 * @jest-environment node
 *
 * CS-1 MCP-AUTH — dispatcher compatibility for the first MCP-catalog
 * provider (Linear via the shared MCP OAuth helper).
 *
 * Proves through the REAL dispatcher (only the oauth_states repo mocked,
 * mirroring dispatcher.test.ts):
 *   - `connect()` awaits `buildAuthUrl` (contract widened to
 *     `string | Promise<string>` in this slice) and produces a valid Linear
 *     authorize redirect with a verifiable signed state;
 *   - PKCE verifier + S256 method are persisted on the oauth_states row
 *     (the helper always generates PKCE);
 *   - Linear's comma-joined scope format survives the round trip;
 *   - an explicitly-Promise-returning buildAuthUrl resolves through connect
 *     (regression lock for the async widening).
 */
import { randomBytes } from "node:crypto";

const mockOAuthStatesCreate = jest.fn();

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockOAuthStatesCreate(...args),
  consumeByNonce: jest.fn(),
}));

import { connect } from "@/services/oauth/dispatcher";
import { verifyState } from "@/services/oauth/state";
import { linearOAuth } from "@/integrations/linear/oauth";

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.LINEAR_CLIENT_ID = "test-linear-client-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockOAuthStatesCreate.mockReset();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.LINEAR_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("dispatcher.connect — linear (shared MCP OAuth helper, static mode)", () => {
  it("returns a Linear authorize URL with verifiable state + comma-joined scopes", async () => {
    const { redirectUrl } = await connect({
      userId: "user-lin",
      accountId: "acct-lin",
      provider: "linear",
    });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe("https://linear.app/oauth/authorize");
    expect(u.searchParams.get("scope")).toBe("read,write");
    expect(u.searchParams.get("client_id")).toBe("test-linear-client-id");
    expect(u.searchParams.get("redirect_uri")).toBe(
      "https://app.example.test/api/integrations/oauth/linear/callback",
    );

    const state = u.searchParams.get("state");
    expect(state).toBeTruthy();
    const payload = verifyState(state!);
    expect(payload.userId).toBe("user-lin");
    expect(payload.accountId).toBe("acct-lin");
    expect(payload.provider).toBe("linear");
    expect(payload.requestedScopes).toEqual(["read", "write"]);
  });

  it("persists the PKCE verifier + S256 method on the oauth_states row", async () => {
    const { redirectUrl } = await connect({
      userId: "user-lin",
      accountId: "acct-lin",
      provider: "linear",
    });
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
    const created = mockOAuthStatesCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.pkceCodeChallengeMethod).toBe("S256");
    expect(typeof created.pkceCodeVerifier).toBe("string");
    expect((created.pkceCodeVerifier as string).length).toBeGreaterThanOrEqual(43);
    // Challenge (not the verifier) rides in the URL.
    const u = new URL(redirectUrl);
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("code_challenge")).not.toBe(created.pkceCodeVerifier);
  });

  it("awaits a Promise-returning buildAuthUrl (async contract widening lock)", async () => {
    const spy = jest
      .spyOn(linearOAuth, "buildAuthUrl")
      .mockImplementation(async () => "https://linear.app/oauth/authorize?async=1");
    try {
      const { redirectUrl } = await connect({
        userId: "u",
        accountId: "acct-u",
        provider: "linear",
      });
      expect(redirectUrl).toBe("https://linear.app/oauth/authorize?async=1");
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
