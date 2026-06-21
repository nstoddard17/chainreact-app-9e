import {
  generateMcpToken,
  hashMcpToken,
  deriveMcpTokenPrefix,
  isValidMcpTokenFormat,
  parseBearerMcpToken,
  MCP_TOKEN_PREFIX_LENGTH,
} from "@/core/mcp/token";

/**
 * Pure MCP-token crypto/format tests (Slice 4.PUBLIC-MCP-1).
 *
 * No DB, no I/O. Proves the one-way hash, the non-secret prefix, the `crmcp_`
 * format, and that an API key (`crk_…`) can never be parsed as an MCP token.
 */

describe("core/mcp/token", () => {
  it("generates a crmcp_ token with a derived prefix + sha256 hash", () => {
    const t = generateMcpToken();
    expect(t.raw).toMatch(/^crmcp_[A-Za-z0-9_-]{40,}$/);
    expect(t.prefix).toBe(t.raw.slice(0, MCP_TOKEN_PREFIX_LENGTH));
    expect(t.prefix.startsWith("crmcp_")).toBe(true);
    expect(t.tokenHash).toBe(hashMcpToken(t.raw));
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats a raw token (high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) seen.add(generateMcpToken().raw);
    expect(seen.size).toBe(50);
  });

  it("hash is deterministic and one-way (raw not recoverable from hash)", () => {
    const t = generateMcpToken();
    expect(hashMcpToken(t.raw)).toBe(t.tokenHash);
    expect(t.tokenHash).not.toContain(t.raw);
  });

  it("derives the prefix at a fixed length", () => {
    const t = generateMcpToken();
    expect(deriveMcpTokenPrefix(t.raw)).toHaveLength(MCP_TOKEN_PREFIX_LENGTH);
  });

  it("validates token format, rejecting API keys and junk", () => {
    expect(isValidMcpTokenFormat(generateMcpToken().raw)).toBe(true);
    expect(isValidMcpTokenFormat("crk_live_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd")).toBe(false);
    expect(isValidMcpTokenFormat("crmcp_short")).toBe(false);
    expect(isValidMcpTokenFormat("")).toBe(false);
    expect(isValidMcpTokenFormat("Bearer crmcp_abc")).toBe(false);
  });

  it("parses a Bearer crmcp_ header, rejecting crk_ API keys", () => {
    const t = generateMcpToken();
    expect(parseBearerMcpToken(`Bearer ${t.raw}`)).toBe(t.raw);
    expect(parseBearerMcpToken(`Bearer crk_live_${"a".repeat(48)}`)).toBeNull();
    expect(parseBearerMcpToken(t.raw)).toBeNull(); // no "Bearer " prefix
    expect(parseBearerMcpToken(null)).toBeNull();
    expect(parseBearerMcpToken(undefined)).toBeNull();
    expect(parseBearerMcpToken("Bearer")).toBeNull();
  });
});
