/**
 * @jest-environment node
 *
 * OAUTH-ACCT-BIND regression suite — the account-scoping bug fix.
 *
 * Production bug: a connect started on a Team account wrote the integration to
 * the user's Personal account, because `dispatcher.connect` resolved the target
 * via `ensurePersonalAccount` (always personal) instead of the active account.
 *
 * These tests pin the fixed contract at the dispatcher layer:
 *   - connect() binds the PASSED accountId (the route's resolved ACTIVE account)
 *     into the signed state — never the personal account.
 *   - handleCallback() writes to the SIGNED-STATE accountId only; it never reads
 *     the "current active account", so an active-account switch during the OAuth
 *     round trip cannot redirect the write.
 *   - handleCallback() re-verifies the initiator is still a member of the
 *     state-bound account (fail-safe StateAccountAccessError, no upsert).
 *   - V2-READY-48: handleCallback() ALSO re-checks owner/admin at completion for
 *     account-shared providers (a downgrade between connect and callback fails
 *     safe, no upsert); personal providers skip the role check (own identity).
 *   - a frozen state-bound account fails safe (no upsert).
 *   - reconnect writes only to the state-bound row's account.
 *   - providerHint (per-tenant) still rides with the state-bound account.
 *   - Notion-specific regression.
 */
import { createHmac, randomBytes } from "node:crypto";

const mockUpsertActive = jest.fn();
const mockOAuthStatesCreate = jest.fn();
const mockOAuthStatesConsume = jest.fn();
const mockGetByIdForAccount = jest.fn();
const mockAssertOperational = jest.fn();
const mockIsMember = jest.fn();
const mockNotionHandleCallback = jest.fn();
const mockSlackHandleCallback = jest.fn();
const mockGmailHandleCallback = jest.fn();
const mockGetRole = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  upsertActive: (...a: unknown[]) => mockUpsertActive(...a),
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetByIdForAccount(...a),
}));
jest.mock("@/repositories/oauthStates", () => ({
  create: (...a: unknown[]) => mockOAuthStatesCreate(...a),
  consumeByNonce: (...a: unknown[]) => mockOAuthStatesConsume(...a),
}));
jest.mock("@/services/accounts/accountFreeze", () => ({
  assertAccountOperational: (...a: unknown[]) => mockAssertOperational(...a),
  AccountFrozenError: class AccountFrozenError extends Error {},
}));
jest.mock("@/repositories/accountMemberships", () => ({
  isMemberServiceRole: (...a: unknown[]) => mockIsMember(...a),
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));
jest.mock("@/integrations/notion/oauth", () => ({
  notionOAuth: {
    // Echo the dispatcher-minted state into the URL so the test can read it back.
    buildAuthUrl: jest.fn(
      (state: string) =>
        `https://api.notion.com/v1/oauth/authorize?state=${encodeURIComponent(state)}`,
    ),
    handleCallback: (...a: unknown[]) => mockNotionHandleCallback(...a),
    refreshToken: jest.fn(),
    revoke: jest.fn(),
  },
}));
jest.mock("@/integrations/slack/oauth", () => ({
  slackOAuth: {
    buildAuthUrl: jest.fn(
      (state: string) =>
        `https://slack.com/oauth/v2/authorize?state=${encodeURIComponent(state)}`,
    ),
    handleCallback: (...a: unknown[]) => mockSlackHandleCallback(...a),
    refreshToken: jest.fn(),
    revoke: jest.fn(),
  },
}));
// gmail = a PERSONAL-credential provider — used to prove the completion role
// re-check is SKIPPED for personal providers (connects the member's own identity).
jest.mock("@/integrations/gmail/oauth", () => ({
  gmailOAuth: {
    buildAuthUrl: jest.fn(
      (state: string) =>
        `https://accounts.google.com/o/oauth2/v2/auth?state=${encodeURIComponent(state)}`,
    ),
    handleCallback: (...a: unknown[]) => mockGmailHandleCallback(...a),
    refreshToken: jest.fn(),
    revoke: jest.fn(),
  },
}));

// A spy proving the callback never resolves "active account" — if the dispatcher
// ever imported it, this mock would be in the module graph and we'd assert 0 calls.
const mockResolveActiveAccount = jest.fn();
jest.mock("@/services/accounts/activeAccount", () => ({
  resolveActiveAccount: (...a: unknown[]) => mockResolveActiveAccount(...a),
}));

import {
  connect,
  handleCallback,
  StateAccountAccessError,
} from "@/services/oauth/dispatcher";
import { createState, verifyState } from "@/services/oauth/state";

const TEAM = "team-acct-A";
const PERSONAL = "personal-acct-A";
const USER = "user-A";

beforeEach(() => {
  process.env.OAUTH_STATE_SIGNING_KEY = randomBytes(32).toString("base64");
  process.env.SLACK_CLIENT_ID = "test-slack";
  process.env.NOTION_CLIENT_ID = "test-notion";
  process.env.NOTION_CLIENT_SECRET = "test-notion-secret";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  jest.clearAllMocks();
  mockOAuthStatesCreate.mockResolvedValue(undefined);
  mockAssertOperational.mockResolvedValue(undefined);
  mockIsMember.mockResolvedValue(true);
  // V2-READY-48 — default the completion role check to owner so existing
  // account-shared (notion/slack) callback tests still complete. Personal-provider
  // tests assert this is never consulted.
  mockGetRole.mockResolvedValue("owner");
  mockUpsertActive.mockImplementation(async (args: { accountId: string }) => ({
    id: "int-1",
    accountId: args.accountId,
    provider: "notion",
  }));
});
afterEach(() => {
  delete process.env.OAUTH_STATE_SIGNING_KEY;
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.NOTION_CLIENT_ID;
  delete process.env.NOTION_CLIENT_SECRET;
  delete process.env.NEXT_PUBLIC_APP_URL;
});

/** Mint a real signed state for `accountId` and wire consume to return its row. */
async function stateFor(accountId: string, provider: string): Promise<string> {
  const { token, payload } = await createState({
    userId: USER,
    accountId,
    provider,
    requestedScopes: [],
  });
  mockOAuthStatesConsume.mockResolvedValueOnce({
    nonce: payload.nonce,
    userId: payload.userId,
    provider: payload.provider,
    pkceCodeVerifier: null,
    pkceCodeChallengeMethod: null,
  });
  return token;
}

describe("connect() binds the passed (active) account — never personal", () => {
  it("binds the TEAM account passed by the route into the signed state", async () => {
    const { redirectUrl } = await connect({
      userId: USER,
      accountId: TEAM,
      provider: "slack",
    });
    const state = new URL(redirectUrl).searchParams.get("state")!;
    const payload = verifyState(state);
    expect(payload.accountId).toBe(TEAM);
    // The state-row write carries the same user; account lives in the JWT only.
    expect(mockOAuthStatesCreate).toHaveBeenCalledTimes(1);
  });

  it("fails closed when no accountId is supplied (no personal default)", async () => {
    await expect(
      // @ts-expect-error — intentionally omit accountId to prove it's required.
      connect({ userId: USER, provider: "slack" }),
    ).rejects.toThrow(/accountId is required/);
    expect(mockOAuthStatesCreate).not.toHaveBeenCalled();
  });
});

describe("handleCallback() writes to the SIGNED-STATE account only", () => {
  beforeEach(() => {
    mockNotionHandleCallback.mockResolvedValue({
      tokens: { accessToken: "t", refreshToken: null, scopes: [], expiresAt: null },
      account: { providerAccountId: "ws-1", displayName: "Team WS", metadata: {} },
    });
  });

  it("writes the integration to the TEAM account from state, NOT personal", async () => {
    const token = await stateFor(TEAM, "notion");
    const { integration } = await handleCallback({ provider: "notion", code: "c", state: token });
    expect(mockUpsertActive).toHaveBeenCalledTimes(1);
    expect(mockUpsertActive.mock.calls[0]![0]).toMatchObject({
      accountId: TEAM,
      connectedByUserId: USER,
      provider: "notion",
    });
    expect(integration.accountId).toBe(TEAM);
  });

  it("active-account switch to PERSONAL before callback does NOT change the write target", async () => {
    // Simulate the bug scenario: the user flips active account to personal mid-flow.
    mockResolveActiveAccount.mockResolvedValue({ ok: true, accountId: PERSONAL, source: "active" });
    const token = await stateFor(TEAM, "notion");
    await handleCallback({ provider: "notion", code: "c", state: token });
    // The callback never consults the active account — it writes to state's TEAM.
    expect(mockResolveActiveAccount).not.toHaveBeenCalled();
    expect(mockUpsertActive.mock.calls[0]![0]).toMatchObject({ accountId: TEAM });
  });

  it("non-member of the state-bound account → StateAccountAccessError, NO upsert", async () => {
    mockIsMember.mockResolvedValueOnce(false);
    const token = await stateFor(TEAM, "notion");
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    // membership was checked against the SIGNED-STATE (accountId, userId).
    expect(mockIsMember).toHaveBeenCalledWith(TEAM, USER);
  });

  it("frozen state-bound account → fails safe, NO upsert", async () => {
    mockAssertOperational.mockRejectedValueOnce(new Error("account frozen"));
    const token = await stateFor(TEAM, "notion");
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toThrow(/frozen/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
  });

  it("membership check runs BEFORE the provider token exchange (no provider call on revoked access)", async () => {
    mockIsMember.mockResolvedValueOnce(false);
    const token = await stateFor(TEAM, "notion");
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(mockNotionHandleCallback).not.toHaveBeenCalled();
  });
});

describe("V2-READY-48 — owner/admin role re-check at completion (account-shared providers)", () => {
  beforeEach(() => {
    mockNotionHandleCallback.mockResolvedValue({
      tokens: { accessToken: "t", refreshToken: null, scopes: [], expiresAt: null },
      account: { providerAccountId: "ws-1", displayName: "Team WS", metadata: {} },
    });
    mockGmailHandleCallback.mockResolvedValue({
      tokens: { accessToken: "t", refreshToken: null, scopes: [], expiresAt: null },
      account: { providerAccountId: "user@x.test", displayName: "user@x.test", metadata: {} },
    });
    // gmail upsert mock returns the bound account so we can assert it.
    mockUpsertActive.mockImplementation(async (args: { accountId: string; provider: string }) => ({
      id: "int-1",
      accountId: args.accountId,
      provider: args.provider,
    }));
  });

  it("owner completing an account-shared (notion) connect → upsert proceeds (role checked)", async () => {
    mockGetRole.mockResolvedValue("owner");
    const token = await stateFor(TEAM, "notion");
    await handleCallback({ provider: "notion", code: "c", state: token });
    expect(mockUpsertActive).toHaveBeenCalledTimes(1);
    expect(mockGetRole).toHaveBeenCalledWith(TEAM, USER); // checked against signed state
  });

  it("admin completing an account-shared connect → upsert proceeds", async () => {
    mockGetRole.mockResolvedValue("admin");
    const token = await stateFor(TEAM, "notion");
    await handleCallback({ provider: "notion", code: "c", state: token });
    expect(mockUpsertActive).toHaveBeenCalledTimes(1);
  });

  it("role DOWNGRADED owner/admin→member before callback → StateAccountAccessError, NO upsert, NO provider call", async () => {
    mockIsMember.mockResolvedValue(true); // still a member…
    mockGetRole.mockResolvedValue("member"); // …but no longer owner/admin
    const token = await stateFor(TEAM, "notion");
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    expect(mockNotionHandleCallback).not.toHaveBeenCalled(); // fail-fast: no token exchange
    expect(mockGetRole).toHaveBeenCalledWith(TEAM, USER);
  });

  it("removed from account before callback → blocked by the membership check first (NO role lookup, NO upsert)", async () => {
    mockIsMember.mockResolvedValue(false); // membership check throws before the role check
    const token = await stateFor(TEAM, "notion");
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    expect(mockGetRole).not.toHaveBeenCalled();
  });

  it("PERSONAL provider (gmail): a non-owner member completes — role check SKIPPED, upsert proceeds", async () => {
    mockGetRole.mockResolvedValue("member"); // would block an account provider…
    const token = await stateFor(TEAM, "gmail");
    const { integration } = await handleCallback({ provider: "gmail", code: "c", state: token });
    expect(mockUpsertActive).toHaveBeenCalledTimes(1); // …but personal connects the member's OWN identity
    expect(integration.accountId).toBe(TEAM);
    expect(mockGetRole).not.toHaveBeenCalled(); // personal → no role lookup at all
  });

  it("personal-account owner flow unchanged: gmail on the personal account completes", async () => {
    mockGetRole.mockResolvedValue("owner");
    const token = await stateFor(PERSONAL, "gmail");
    await handleCallback({ provider: "gmail", code: "c", state: token });
    expect(mockUpsertActive.mock.calls[0]![0]).toMatchObject({ accountId: PERSONAL });
    expect(mockGetRole).not.toHaveBeenCalled(); // gmail is personal → role skipped even on a personal acct
  });

  it("reconnect of an account-shared connection by a downgraded user → blocked BEFORE the reconnect row lookup", async () => {
    mockGetRole.mockResolvedValue("member");
    const { token, payload } = await createState({
      userId: USER,
      accountId: TEAM,
      provider: "notion",
      requestedScopes: [],
      reconnect: { integrationId: "int-9" },
    });
    mockOAuthStatesConsume.mockResolvedValueOnce({
      nonce: payload.nonce,
      userId: payload.userId,
      provider: payload.provider,
      pkceCodeVerifier: null,
      pkceCodeChallengeMethod: null,
    });
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toBeInstanceOf(StateAccountAccessError);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    // the role gate runs before the provider call AND the reconnect identity lookup.
    expect(mockNotionHandleCallback).not.toHaveBeenCalled();
    expect(mockGetByIdForAccount).not.toHaveBeenCalled();
  });
});

describe("missing/invalid state account fails safe", () => {
  it("verifyState rejects a token whose payload has no accountId", () => {
    // Hand-forge a payload missing accountId, signed with the real key, to prove
    // the verifier refuses it (defense beyond createState's own required check).
    const payload = {
      userId: USER,
      provider: "slack",
      nonce: "n",
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      requestedScopes: [],
    };
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = createHmac("sha256", Buffer.from(process.env.OAUTH_STATE_SIGNING_KEY!, "base64"))
      .update(data)
      .digest("base64url");
    expect(() => verifyState(`${data}.${sig}`)).toThrow(/missing required fields/);
  });
});

describe("reconnect stays row/account-bound", () => {
  beforeEach(() => {
    mockNotionHandleCallback.mockResolvedValue({
      tokens: { accessToken: "t", refreshToken: null, scopes: [], expiresAt: null },
      account: { providerAccountId: "ws-1", displayName: "Team WS", metadata: {} },
    });
  });

  it("reconnect callback refuses to write outside the state row's account (identity mismatch)", async () => {
    // State carries reconnect intent for a row in TEAM; the row's stored identity
    // differs from the provider-returned identity → no upsert.
    const { token, payload } = await createState({
      userId: USER,
      accountId: TEAM,
      provider: "notion",
      requestedScopes: [],
      reconnect: { integrationId: "int-77" },
    });
    mockOAuthStatesConsume.mockResolvedValueOnce({
      nonce: payload.nonce,
      userId: payload.userId,
      provider: payload.provider,
      pkceCodeVerifier: null,
      pkceCodeChallengeMethod: null,
    });
    mockGetByIdForAccount.mockResolvedValueOnce({ id: "int-77", providerAccountId: "DIFFERENT-ws" });
    await expect(
      handleCallback({ provider: "notion", code: "c", state: token }),
    ).rejects.toThrow(/reconnect identity mismatch/);
    expect(mockUpsertActive).not.toHaveBeenCalled();
    // Lookup was scoped to the state's account, never a different one.
    expect(mockGetByIdForAccount).toHaveBeenCalledWith(TEAM, "int-77");
  });
});

describe("Notion-specific regression (the reported provider)", () => {
  it("Notion connect→callback lands the row on the team account it started from", async () => {
    mockNotionHandleCallback.mockResolvedValue({
      tokens: { accessToken: "t", refreshToken: null, scopes: [], expiresAt: null },
      account: { providerAccountId: "ws-team", displayName: "Marcus Team", metadata: {} },
    });
    // 1. Connect on the TEAM account → state binds TEAM.
    const { redirectUrl } = await connect({ userId: USER, accountId: TEAM, provider: "notion" });
    expect(verifyState(new URL(redirectUrl).searchParams.get("state")!).accountId).toBe(TEAM);
    // 2. Callback writes to TEAM (the bug wrote to PERSONAL here).
    const token = await stateFor(TEAM, "notion");
    await handleCallback({ provider: "notion", code: "c", state: token });
    expect(mockUpsertActive.mock.calls[0]![0]).toMatchObject({ accountId: TEAM });
    expect(mockUpsertActive.mock.calls[0]![0].accountId).not.toBe(PERSONAL);
  });
});
