import { randomBytes } from "node:crypto";

const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();

jest.mock("@/repositories/oauthStates", () => ({
  create: (...args: unknown[]) => mockOAuthStatesCreate(...args),
  consumeByNonce: (...args: unknown[]) => mockOAuthStatesConsume(...args),
}));

import { connect } from "@/services/oauth/dispatcher";
import { verifyState } from "@/services/oauth/state";

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.SLACK_CLIENT_ID = "test-slack-client-id";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  mockOAuthStatesCreate.mockReset();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
  mockOAuthStatesConsume.mockReset();
});

afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe("dispatcher.connect", () => {
  it("returns a Slack redirect URL with a verifiable state token AND writes the nonce row", async () => {
    const { redirectUrl } = await connect({ userId: "user-123", provider: "slack" });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe("https://slack.com/oauth/v2/authorize");
    const state = u.searchParams.get("state");
    expect(state).toBeTruthy();
    const payload = verifyState(state!);
    expect(payload.userId).toBe("user-123");
    expect(payload.provider).toBe("slack");
    expect(payload.requestedScopes).toEqual(
      expect.arrayContaining(["chat:write", "channels:read", "channels:history"]),
    );
    // Nonce row write is the new replay-protection contract
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
    expect(mockOAuthStatesCreate.mock.calls[0]![0]).toMatchObject({
      nonce: payload.nonce,
      userId: "user-123",
      provider: "slack",
    });
  });

  it("rejects an unknown provider", async () => {
    await expect(connect({ userId: "u", provider: "does-not-exist" })).rejects.toThrow(
      /Unknown provider/,
    );
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });

  it("rejects when userId is empty", async () => {
    await expect(connect({ userId: "", provider: "slack" })).rejects.toThrow(/userId/);
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });

  it("includes optional scopes alongside required scopes in the auth URL", async () => {
    const { redirectUrl } = await connect({ userId: "u", provider: "slack" });
    const scopes = new URL(redirectUrl).searchParams.get("scope")!.split(",");
    expect(scopes).toEqual(
      expect.arrayContaining([
        "channels:history",
        "channels:read",
        "chat:write",
        "users:read",
      ]),
    );
  });

  it("does NOT pass PKCE for non-PKCE providers (Slack default v2)", async () => {
    await connect({ userId: "u", provider: "slack" });
    // No PKCE columns persisted on the oauth_states row
    const created = mockOAuthStatesCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.pkceCodeVerifier).toBeUndefined();
    expect(created.pkceCodeChallengeMethod).toBeUndefined();
  });
});

describe("dispatcher.connect — PKCE flow (Slice 2c)", () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  });
  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it("calls provider.generatePkce, persists verifier+method on the state row, embeds challenge in URL", async () => {
    const { redirectUrl } = await connect({ userId: "user-pkce", provider: "gmail" });
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");

    // Verifier + method went to the oauth_states row.
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
    const created = mockOAuthStatesCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(created.pkceCodeChallengeMethod).toBe("S256");
    expect(typeof created.pkceCodeVerifier).toBe("string");
    expect((created.pkceCodeVerifier as string).length).toBeGreaterThanOrEqual(43);

    // Challenge ended up in the authorize URL (NOT the verifier — the
    // verifier is the secret half and never goes in the URL).
    const challenge = u.searchParams.get("code_challenge");
    expect(challenge).toBeTruthy();
    expect(challenge).not.toBe(created.pkceCodeVerifier);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");

    // Google-required offline-access params.
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
  });

  it("each connect produces a fresh PKCE pair (no verifier reuse)", async () => {
    const a = await connect({ userId: "u-1", provider: "gmail" });
    const b = await connect({ userId: "u-2", provider: "gmail" });
    const aChallenge = new URL(a.redirectUrl).searchParams.get("code_challenge");
    const bChallenge = new URL(b.redirectUrl).searchParams.get("code_challenge");
    expect(aChallenge).toBeTruthy();
    expect(bChallenge).toBeTruthy();
    expect(aChallenge).not.toBe(bChallenge);

    const aVerifier = (mockOAuthStatesCreate.mock.calls[0]![0] as Record<string, unknown>)
      .pkceCodeVerifier;
    const bVerifier = (mockOAuthStatesCreate.mock.calls[1]![0] as Record<string, unknown>)
      .pkceCodeVerifier;
    expect(aVerifier).not.toBe(bVerifier);
  });
});

/**
 * Slice 12: dispatcher routes per-tenant `providerHint` to providers
 * that declare `validateProviderHint`. Existing providers (Slack here)
 * have no hook → passing a hint is a typed error AND the state row /
 * provider OAuth are never touched.
 */
describe("dispatcher.connect — providerHint plumbing (Slice 12)", () => {
  beforeEach(() => {
    process.env.SHOPIFY_CLIENT_ID = "test-shopify-client-id";
    process.env.SHOPIFY_CLIENT_SECRET = "test-shopify-client-secret";
  });
  afterEach(() => {
    delete process.env.SHOPIFY_CLIENT_ID;
    delete process.env.SHOPIFY_CLIENT_SECRET;
  });

  it("validates AND binds providerHint into the state JWT for per-tenant providers (Shopify)", async () => {
    const { redirectUrl } = await connect({
      userId: "user-shop",
      provider: "shopify",
      providerHint: { shop: "mystore.myshopify.com" },
    });
    const u = new URL(redirectUrl);
    // Shopify's per-shop authorize URL: the validated shop becomes the
    // hostname.
    expect(u.host).toBe("mystore.myshopify.com");
    expect(u.pathname).toBe("/admin/oauth/authorize");
    const state = u.searchParams.get("state");
    expect(state).toBeTruthy();
    const payload = verifyState(state!);
    // The validated shop is bound to the JWT payload — recovered at
    // callback time so the token-exchange URL doesn't depend on the
    // (untrusted) callback URL's `?shop=` param.
    expect(payload.providerHint).toEqual({ shop: "mystore.myshopify.com" });
  });

  it("normalizes a bare subdomain to .myshopify.com before binding (Shopify)", async () => {
    const { redirectUrl } = await connect({
      userId: "u",
      provider: "shopify",
      providerHint: { shop: "mystore" },
    });
    const u = new URL(redirectUrl);
    expect(u.host).toBe("mystore.myshopify.com");
    const state = u.searchParams.get("state")!;
    const payload = verifyState(state);
    // Slice 12 plan §"Open questions" decision — the dispatcher binds
    // the original-input value to the JWT. The provider's
    // buildAuthUrl re-normalizes to derive the hostname, so the
    // authorize URL is always strictly-formatted regardless of the
    // user's input shape. The JWT carries the user-input form because
    // the providerHint round-trip is symmetric: handleCallback
    // normalizes again to recover the same shop.
    expect(payload.providerHint).toEqual({ shop: "mystore" });
  });

  it("rejects malformed shop input BEFORE creating state (Shopify)", async () => {
    await expect(
      connect({
        userId: "u",
        provider: "shopify",
        providerHint: { shop: "evil.attacker.com" },
      }),
    ).rejects.toThrow(/Invalid Shopify shop domain/);
    // Bad input fails at the start of the flow — no state row written.
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });

  it("rejects providerHint passed to a provider WITHOUT validateProviderHint (Slack)", async () => {
    await expect(
      connect({
        userId: "u",
        provider: "slack",
        providerHint: { shop: "anything.myshopify.com" },
      }),
    ).rejects.toThrow(/does not accept providerHint/);
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });

  it("does NOT bind providerHint when none is supplied (Shopify connect with absent hint fails AT the provider level — buildAuthUrl requires shop)", async () => {
    // The dispatcher does NOT inject a providerHint default — Shopify's
    // buildAuthUrl throws because its readShopFromHint helper requires
    // providerHint.shop. This is the right place to fail: a connect
    // call that didn't supply a shop is a programming error in the
    // route, surfaced as the build-auth-url throw.
    await expect(
      connect({ userId: "u", provider: "shopify" }),
    ).rejects.toThrow(/providerHint\.shop is required/);
  });

  it("does NOT include providerHint on the oauth_states DB row even when set (JWT-only)", async () => {
    await connect({
      userId: "u",
      provider: "shopify",
      providerHint: { shop: "mystore.myshopify.com" },
    });
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
    const created = mockOAuthStatesCreate.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(created).not.toHaveProperty("providerHint");
  });

  it("preserves backward-compat: connect for non-tenant providers without providerHint works unchanged", async () => {
    const { redirectUrl } = await connect({ userId: "u", provider: "slack" });
    expect(new URL(redirectUrl).origin + new URL(redirectUrl).pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    const created = mockOAuthStatesCreate.mock.calls[0]![0] as Record<
      string,
      unknown
    >;
    expect(created).not.toHaveProperty("providerHint");
  });
});
