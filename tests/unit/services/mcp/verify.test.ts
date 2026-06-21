import { generateMcpToken } from "@/core/mcp/token";

/**
 * MCP token verification tests (Slice 4.PUBLIC-MCP-4).
 *
 * Proves the full fail-closed chain with mocked repos: valid → ok; unknown/revoked
 * (no candidate) → invalid; wrong hash → invalid; expired → expired; and — the
 * token-revocation-by-offboarding property — when the minter is NO LONGER a member
 * of the token's account, verification fails (`membership_revoked`).
 */

const mockGetByPrefix = jest.fn();
const mockGetRole = jest.fn();

jest.mock("@/repositories/accountMcpTokens", () => ({
  getMcpTokenForVerificationByPrefixServiceRole: (...a: unknown[]) => mockGetByPrefix(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));

import { verifyMcpToken } from "@/services/mcp/verify";

const ACCOUNT = "acct-1";
const MINTER = "user-1";

function candidateFor(
  token: ReturnType<typeof generateMcpToken>,
  overrides: Partial<{ expiresAt: string | null; createdByUserId: string | null }> = {},
) {
  return {
    id: "tok-1",
    accountId: ACCOUNT,
    createdByUserId: "createdByUserId" in overrides ? overrides.createdByUserId : MINTER,
    prefix: token.prefix,
    tokenHash: token.tokenHash,
    scopes: ["workflows:read"],
    expiresAt: overrides.expiresAt ?? null,
    revokedAt: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRole.mockResolvedValue("owner"); // minter is a member by default
});

describe("services/mcp/verify", () => {
  it("verifies a valid token whose minter is still a member", async () => {
    const t = generateMcpToken();
    mockGetByPrefix.mockResolvedValue([candidateFor(t)]);
    const r = await verifyMcpToken(`Bearer ${t.raw}`);
    expect(r).toEqual({
      ok: true,
      tokenId: "tok-1",
      accountId: ACCOUNT,
      userId: MINTER,
      prefix: t.prefix,
      scopes: ["workflows:read"],
    });
    expect(mockGetRole).toHaveBeenCalledWith(ACCOUNT, MINTER);
  });

  it("rejects a missing header", async () => {
    expect(await verifyMcpToken(null)).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects a malformed / non-crmcp header", async () => {
    expect(await verifyMcpToken("Bearer not-a-token")).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyMcpToken(`Bearer crk_live_${"a".repeat(48)}`)).toEqual({
      ok: false,
      reason: "malformed",
    });
    expect(mockGetByPrefix).not.toHaveBeenCalled();
  });

  it("rejects an unknown/revoked token (no candidate) as invalid", async () => {
    const t = generateMcpToken();
    mockGetByPrefix.mockResolvedValue([]); // repo filters revoked_at IS NULL
    expect(await verifyMcpToken(`Bearer ${t.raw}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a token whose hash does not match the candidate (no forgery)", async () => {
    const real = generateMcpToken();
    const other = generateMcpToken();
    // Candidate carries a DIFFERENT hash than the presented token.
    mockGetByPrefix.mockResolvedValue([{ ...candidateFor(other), prefix: real.prefix }]);
    expect(await verifyMcpToken(`Bearer ${real.raw}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects an expired token", async () => {
    const t = generateMcpToken();
    mockGetByPrefix.mockResolvedValue([
      candidateFor(t, { expiresAt: new Date(Date.now() - 1000).toISOString() }),
    ]);
    expect(await verifyMcpToken(`Bearer ${t.raw}`)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects when the minter is no longer a member (offboarding revocation)", async () => {
    const t = generateMcpToken();
    mockGetByPrefix.mockResolvedValue([candidateFor(t)]);
    mockGetRole.mockResolvedValue(null); // minter was removed from the account
    expect(await verifyMcpToken(`Bearer ${t.raw}`)).toEqual({
      ok: false,
      reason: "membership_revoked",
    });
  });

  it("rejects a token with a null minter (deleted user) without a membership query", async () => {
    const t = generateMcpToken();
    mockGetByPrefix.mockResolvedValue([candidateFor(t, { createdByUserId: null })]);
    expect(await verifyMcpToken(`Bearer ${t.raw}`)).toEqual({
      ok: false,
      reason: "membership_revoked",
    });
    expect(mockGetRole).not.toHaveBeenCalled();
  });
});
