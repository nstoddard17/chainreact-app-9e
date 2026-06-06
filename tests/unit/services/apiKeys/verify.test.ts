/**
 * @jest-environment node
 *
 * Tests for services/apiKeys/verify (Slice 4.API-KEYS-FOUNDATION-5 / FK-4).
 *
 * Verifies the prefix-lookup → constant-time hash-compare auth primitive against a
 * mocked repository, using the REAL crypto helpers. Every failure mode is opaque
 * (a non-`ok` result the route maps to one 401); the raw key / `key_hash` never
 * leak. Revoked keys are excluded by the repo's prefix lookup, so they collapse to
 * "invalid" — same as unknown (no oracle).
 */

const mockGetByPrefix = jest.fn();
jest.mock("@/repositories/accountApiKeys", () => ({
  getApiKeyForVerificationByPrefixServiceRole: (...a: unknown[]) => mockGetByPrefix(...a),
}));

import { verifyApiKey } from "@/services/apiKeys/verify";
import { generateApiKey, deriveApiKeyPrefix } from "@/core/apiKeys/keys";

function record(over: Record<string, unknown> = {}) {
  return {
    id: "k1",
    accountId: "acct-1",
    keyHash: "deadbeef",
    scopes: ["workflows:trigger"],
    expiresAt: null,
    revokedAt: null,
    ...over,
  };
}

beforeEach(() => {
  mockGetByPrefix.mockReset();
});

describe("verifyApiKey — failure modes (all opaque to the caller)", () => {
  it("missing header → reason 'missing', no lookup", async () => {
    expect(await verifyApiKey(null)).toEqual({ ok: false, reason: "missing" });
    expect(await verifyApiKey(undefined)).toEqual({ ok: false, reason: "missing" });
    expect(mockGetByPrefix).not.toHaveBeenCalled();
  });

  it("malformed bearer → reason 'malformed', no lookup", async () => {
    expect(await verifyApiKey("Bearer not-a-key")).toEqual({ ok: false, reason: "malformed" });
    expect(await verifyApiKey("crk_live_abc")).toEqual({ ok: false, reason: "malformed" }); // no "Bearer"
    expect(await verifyApiKey("Basic crk_live_abc")).toEqual({ ok: false, reason: "malformed" });
    expect(mockGetByPrefix).not.toHaveBeenCalled();
  });

  it("unknown key (no prefix candidates) → reason 'invalid'", async () => {
    const { raw } = generateApiKey("live");
    mockGetByPrefix.mockResolvedValue([]);
    expect(await verifyApiKey(`Bearer ${raw}`)).toEqual({ ok: false, reason: "invalid" });
    expect(mockGetByPrefix).toHaveBeenCalledWith(deriveApiKeyPrefix(raw));
  });

  it("revoked key collapses to 'invalid' (repo excludes it from the prefix lookup)", async () => {
    const { raw } = generateApiKey("live");
    // The repo filters revoked rows → an empty candidate set, indistinguishable
    // from an unknown key.
    mockGetByPrefix.mockResolvedValue([]);
    expect(await verifyApiKey(`Bearer ${raw}`)).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("wrong key sharing a prefix → 'invalid' (hash compare fails)", async () => {
    const { raw } = generateApiKey("live");
    mockGetByPrefix.mockResolvedValue([record({ keyHash: "00".repeat(32) })]);
    expect(await verifyApiKey(`Bearer ${raw}`)).toEqual({ ok: false, reason: "invalid" });
  });

  it("expired key → reason 'expired'", async () => {
    const { raw, keyHash } = generateApiKey("live");
    mockGetByPrefix.mockResolvedValue([
      record({ keyHash, expiresAt: "2000-01-01T00:00:00Z" }),
    ]);
    expect(await verifyApiKey(`Bearer ${raw}`)).toEqual({ ok: false, reason: "expired" });
  });
});

describe("verifyApiKey — success", () => {
  it("matching hash → ok with keyId/accountId/scopes (no hash echoed)", async () => {
    const { raw, keyHash } = generateApiKey("live");
    mockGetByPrefix.mockResolvedValue([
      record({ id: "k9", accountId: "acct-9", keyHash, scopes: ["workflows:trigger"] }),
    ]);
    const r = await verifyApiKey(`Bearer ${raw}`);
    expect(r).toEqual({
      ok: true,
      keyId: "k9",
      accountId: "acct-9",
      scopes: ["workflows:trigger"],
    });
    expect(JSON.stringify(r)).not.toContain(keyHash);
    expect(JSON.stringify(r)).not.toContain(raw);
  });

  it("a future expiry is accepted", async () => {
    const { raw, keyHash } = generateApiKey("live");
    mockGetByPrefix.mockResolvedValue([
      record({ keyHash, expiresAt: "2999-01-01T00:00:00Z" }),
    ]);
    expect(await verifyApiKey(`Bearer ${raw}`)).toMatchObject({ ok: true });
  });
});
