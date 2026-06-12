/**
 * @jest-environment node
 *
 * Tests for services/integrations/reconnect.resolveReconnectTarget — the
 * per-account reconnect authorization brain (Slice 4.APPS-RECONNECT).
 *
 * Mirrors the disconnect service's gate: frozen → exact account-scoped row →
 * role/connector. Every "can't touch it" case collapses to `not_found` (no
 * existence / ownership inference). The ONLY value returned on success is the
 * row's `providerAccountId` (used server-side to steer the provider sign-in) —
 * never tokens/scopes/metadata/connector id.
 */
const mockGetByIdForAccount = jest.fn();
const mockGetDeletionStatus = jest.fn();
const mockGetRole = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getByIdForAccountServiceRole: (...a: unknown[]) => mockGetByIdForAccount(...a),
}));
jest.mock("@/repositories/accounts", () => ({
  getDeletionStatusServiceRole: (...a: unknown[]) => mockGetDeletionStatus(...a),
}));
jest.mock("@/repositories/accountMemberships", () => ({
  getRoleServiceRole: (...a: unknown[]) => mockGetRole(...a),
}));

import { resolveReconnectTarget } from "@/services/integrations/reconnect";

const PERSONAL = "gmail"; // personal-credential provider
const SHARED = "slack"; // account-credential provider

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "int-1",
    accountId: "acc-1",
    provider: PERSONAL,
    providerAccountId: "marcus@example.com",
    connectedByUserId: "user-connector",
    displayName: "Personal",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: [],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockGetByIdForAccount.mockReset();
  mockGetDeletionStatus.mockReset().mockResolvedValue("active");
  mockGetRole.mockReset();
});

const base = {
  accountId: "acc-1",
  integrationId: "int-1",
  callerUserId: "user-connector",
  provider: PERSONAL,
};

it("frozen account → account_frozen (no row fetch)", async () => {
  mockGetDeletionStatus.mockResolvedValue("pending_deletion");
  const r = await resolveReconnectTarget(base);
  expect(r).toEqual({ ok: false, reason: "account_frozen" });
  expect(mockGetByIdForAccount).not.toHaveBeenCalled();
});

it("unknown / cross-account row → not_found (no existence leak)", async () => {
  mockGetByIdForAccount.mockResolvedValue(null);
  const r = await resolveReconnectTarget(base);
  expect(r).toEqual({ ok: false, reason: "not_found" });
  expect(mockGetRole).not.toHaveBeenCalled();
});

it("row exists but for a different provider than the URL → not_found", async () => {
  mockGetByIdForAccount.mockResolvedValue(row({ provider: "notion" }));
  const r = await resolveReconnectTarget(base);
  expect(r).toEqual({ ok: false, reason: "not_found" });
});

it("non-member caller → not_found (can't infer the row exists)", async () => {
  mockGetByIdForAccount.mockResolvedValue(row());
  mockGetRole.mockResolvedValue(null);
  const r = await resolveReconnectTarget(base);
  expect(r).toEqual({ ok: false, reason: "not_found" });
});

it("personal provider, member but NOT connector/owner → forbidden", async () => {
  mockGetByIdForAccount.mockResolvedValue(row({ connectedByUserId: "someone-else" }));
  mockGetRole.mockResolvedValue("member");
  const r = await resolveReconnectTarget({ ...base, callerUserId: "user-other" });
  expect(r).toEqual({ ok: false, reason: "forbidden" });
});

it("personal provider, the original connector → ok with the row's identity", async () => {
  mockGetByIdForAccount.mockResolvedValue(row({ connectedByUserId: "user-connector" }));
  mockGetRole.mockResolvedValue("member");
  const r = await resolveReconnectTarget(base);
  expect(r).toEqual({
    ok: true,
    accountId: "acc-1",
    integrationId: "int-1",
    expectedProviderAccountId: "marcus@example.com",
  });
});

it("account-shared provider, owner → ok; plain member → forbidden", async () => {
  mockGetByIdForAccount.mockResolvedValue(row({ provider: SHARED, providerAccountId: "T123" }));
  mockGetRole.mockResolvedValueOnce("owner");
  const ok = await resolveReconnectTarget({ ...base, provider: SHARED });
  expect(ok).toMatchObject({ ok: true, expectedProviderAccountId: "T123" });

  mockGetByIdForAccount.mockResolvedValue(row({ provider: SHARED }));
  mockGetRole.mockResolvedValueOnce("member");
  const denied = await resolveReconnectTarget({ ...base, provider: SHARED });
  expect(denied).toEqual({ ok: false, reason: "forbidden" });
});

it("never returns tokens / scopes / connector id — only the three safe fields", async () => {
  mockGetByIdForAccount.mockResolvedValue(row());
  mockGetRole.mockResolvedValue("owner");
  const r = await resolveReconnectTarget(base);
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(Object.keys(r).sort()).toEqual(
      ["accountId", "expectedProviderAccountId", "integrationId", "ok"].sort(),
    );
  }
});
