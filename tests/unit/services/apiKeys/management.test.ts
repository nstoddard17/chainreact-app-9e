/**
 * @jest-environment node
 *
 * Tests for services/apiKeys/management.ts (FK-2). Mocks the FK-1 service-role repo
 * + the freeze guard; uses the REAL core/apiKeys crypto + scope helpers. Proves
 * list status derivation, create validation + one-time raw-key reveal (hash/prefix
 * linkage, never stores raw, never exposes key_hash), frozen blocking, and the
 * account-scoped idempotent revoke (already-revoked vs not-found).
 */

const mockCreate = jest.fn();
const mockList = jest.fn();
const mockRevoke = jest.fn();
const mockGetById = jest.fn();
jest.mock("@/repositories/accountApiKeys", () => ({
  createApiKeyMetadataServiceRole: (...a: unknown[]) => mockCreate(...a),
  listApiKeyMetadataByAccountServiceRole: (...a: unknown[]) => mockList(...a),
  revokeApiKeyServiceRole: (...a: unknown[]) => mockRevoke(...a),
  getApiKeyMetadataByIdServiceRole: (...a: unknown[]) => mockGetById(...a),
}));

const mockFrozen = jest.fn();
jest.mock("@/services/accounts/accountFreeze", () => ({
  isAccountFrozen: (...a: unknown[]) => mockFrozen(...a),
}));

const mockCreatedNotif = jest.fn();
const mockRevokedNotif = jest.fn();
jest.mock("@/services/apiKeys/auditNotifications", () => ({
  recordApiKeyCreatedNotification: (...a: unknown[]) => mockCreatedNotif(...a),
  recordApiKeyRevokedNotification: (...a: unknown[]) => mockRevokedNotif(...a),
}));

import { listApiKeys, createApiKey, revokeApiKey } from "@/services/apiKeys/management";
import { hashApiKey, deriveApiKeyPrefix } from "@/core/apiKeys/keys";

const ACCOUNT = "acct-1";
const ACTOR = "user-1";

function meta(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "key-1",
    accountId: ACCOUNT,
    createdByUserId: ACTOR,
    name: "CI trigger",
    prefix: "crk_live_AbCd1234",
    scopes: ["workflows:trigger"],
    lastUsedAt: null,
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-06-07T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  mockCreate.mockReset().mockImplementation(async (input: Record<string, unknown>) =>
    meta({
      id: "new-key",
      name: input.name,
      prefix: input.prefix,
      scopes: input.scopes,
      expiresAt: input.expiresAt ?? null,
    }),
  );
  mockList.mockReset().mockResolvedValue([]);
  mockRevoke.mockReset().mockResolvedValue({ revoked: false });
  mockGetById.mockReset().mockResolvedValue(null);
  mockFrozen.mockReset().mockResolvedValue(false);
  mockCreatedNotif.mockReset().mockResolvedValue(undefined);
  mockRevokedNotif.mockReset().mockResolvedValue(undefined);
});

describe("listApiKeys — status derivation", () => {
  it("derives active / revoked / expired and never exposes key_hash", async () => {
    mockList.mockResolvedValue([
      meta({ id: "a" }), // active
      meta({ id: "r", revokedAt: "2026-06-01T00:00:00Z" }), // revoked
      meta({ id: "e", expiresAt: "2000-01-01T00:00:00Z" }), // expired (past)
    ]);
    const keys = await listApiKeys({ accountId: ACCOUNT });
    expect(keys.map((k) => [k.id, k.status])).toEqual([
      ["a", "active"],
      ["r", "revoked"],
      ["e", "expired"],
    ]);
    expect(keys[0]).not.toHaveProperty("keyHash");
  });
});

describe("createApiKey", () => {
  it("mints a live key, stores hash+prefix, returns the raw key once + metadata (no key_hash)", async () => {
    const res = await createApiKey({
      accountId: ACCOUNT,
      createdByUserId: ACTOR,
      name: "  CI trigger  ",
      scopes: ["workflows:trigger"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Raw key is a well-formed live key, revealed once.
    expect(res.rawKey).toMatch(/^crk_live_[A-Za-z0-9_-]{40,}$/);
    // The repo received the hash + prefix DERIVED from that raw key — never the raw.
    const insert = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(insert.key_hash).toBeUndefined(); // service passes camelCase keyHash to the repo
    expect(insert.keyHash).toBe(hashApiKey(res.rawKey));
    expect(insert.prefix).toBe(deriveApiKeyPrefix(res.rawKey));
    expect(insert.name).toBe("CI trigger"); // trimmed
    expect(insert.scopes).toEqual(["workflows:trigger"]);
    expect(insert.createdByUserId).toBe(ACTOR);
    // Returned metadata carries no secret material.
    expect(res.key).not.toHaveProperty("keyHash");
    expect(JSON.stringify(res.key)).not.toContain(res.rawKey);
    expect(res.key.status).toBe("active");
  });

  it("normalizes a future expiry to ISO", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const res = await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:trigger"], expiresAt: future });
    expect(res.ok).toBe(true);
    const insert = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(insert.expiresAt).toBe(new Date(future).toISOString());
  });

  it("rejects an empty / whitespace / over-long name", async () => {
    for (const name of ["", "   ", "x".repeat(81)]) {
      const res = await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name, scopes: ["workflows:trigger"] });
      expect(res).toEqual({ ok: false, reason: "invalid_name" });
    }
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects an unknown scope (invalid_scopes) and a known-but-disabled scope (scope_not_enabled)", async () => {
    expect(await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:delete"] })).toEqual({
      ok: false,
      reason: "invalid_scopes",
    });
    expect(await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:read"] })).toEqual({
      ok: false,
      reason: "scope_not_enabled",
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects a past / unparseable expiry", async () => {
    expect(await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:trigger"], expiresAt: "2000-01-01T00:00:00Z" })).toEqual({
      ok: false,
      reason: "invalid_expiry",
    });
    expect(await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:trigger"], expiresAt: "not-a-date" })).toEqual({
      ok: false,
      reason: "invalid_expiry",
    });
  });

  it("refuses on a frozen account WITHOUT minting a key", async () => {
    mockFrozen.mockResolvedValue(true);
    const res = await createApiKey({ accountId: ACCOUNT, createdByUserId: ACTOR, name: "k", scopes: ["workflows:trigger"] });
    expect(res).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("revokeApiKey — account-scoped + idempotent", () => {
  it("newly revokes a live key", async () => {
    mockRevoke.mockResolvedValue({ revoked: true });
    expect(await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1" })).toEqual({ ok: true, alreadyRevoked: false });
    expect(mockRevoke).toHaveBeenCalledWith({ accountId: ACCOUNT, keyId: "key-1" });
  });

  it("returns idempotent success when the key exists but was already revoked", async () => {
    mockRevoke.mockResolvedValue({ revoked: false });
    mockGetById.mockResolvedValue(meta({ revokedAt: "2026-06-01T00:00:00Z" }));
    expect(await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1" })).toEqual({ ok: true, alreadyRevoked: true });
  });

  it("returns not_found (no leak) when the key is not in the account", async () => {
    mockRevoke.mockResolvedValue({ revoked: false });
    mockGetById.mockResolvedValue(null);
    expect(await revokeApiKey({ accountId: ACCOUNT, keyId: "cross-account" })).toEqual({ ok: false, reason: "not_found" });
  });

  it("refuses on a frozen account WITHOUT revoking", async () => {
    mockFrozen.mockResolvedValue(true);
    expect(await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1" })).toEqual({ ok: false, reason: "account_frozen" });
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("audit notifications (API-KEYS-AUDIT-1)", () => {
  it("create writes a safe created-notification (name + prefix + ids; no raw key)", async () => {
    const res = await createApiKey({
      accountId: ACCOUNT,
      createdByUserId: ACTOR,
      name: "CI trigger",
      scopes: ["workflows:trigger"],
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(mockCreatedNotif).toHaveBeenCalledTimes(1);
    const arg = mockCreatedNotif.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg).toMatchObject({
      recipientUserId: ACTOR,
      accountId: ACCOUNT,
      keyId: "new-key",
      name: "CI trigger",
      prefix: deriveApiKeyPrefix(res.rawKey),
      actorUserId: ACTOR,
    });
    // No-leak: the audit call never carries the raw key or a hash.
    const serialized = JSON.stringify(arg);
    expect(serialized).not.toContain(res.rawKey);
    expect(serialized).not.toMatch(/key_?hash/i);
  });

  it("revoke (first transition, with actor) writes a safe revoked-notification", async () => {
    mockRevoke.mockResolvedValue({ revoked: true });
    mockGetById.mockResolvedValue(meta({ id: "key-1", name: "CI trigger", prefix: "crk_live_AbCd1234" }));
    const res = await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1", actorUserId: ACTOR });
    expect(res).toEqual({ ok: true, alreadyRevoked: false });
    expect(mockRevokedNotif).toHaveBeenCalledTimes(1);
    expect(mockRevokedNotif.mock.calls[0]![0]).toMatchObject({
      recipientUserId: ACTOR,
      accountId: ACCOUNT,
      keyId: "key-1",
      name: "CI trigger",
      prefix: "crk_live_AbCd1234",
      actorUserId: ACTOR,
    });
    expect(JSON.stringify(mockRevokedNotif.mock.calls[0]![0])).not.toMatch(/key_?hash/i);
  });

  it("does NOT notify when re-revoking an already-revoked key (no duplicate)", async () => {
    mockRevoke.mockResolvedValue({ revoked: false });
    mockGetById.mockResolvedValue(meta({ revokedAt: "2026-06-01T00:00:00Z" }));
    const res = await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1", actorUserId: ACTOR });
    expect(res).toEqual({ ok: true, alreadyRevoked: true });
    expect(mockRevokedNotif).not.toHaveBeenCalled();
  });

  it("does NOT notify on revoke when no actor is supplied", async () => {
    mockRevoke.mockResolvedValue({ revoked: true });
    mockGetById.mockResolvedValue(meta());
    await revokeApiKey({ accountId: ACCOUNT, keyId: "key-1" });
    expect(mockRevokedNotif).not.toHaveBeenCalled();
  });
});
