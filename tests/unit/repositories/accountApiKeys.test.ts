/**
 * @jest-environment node
 *
 * Tests for repositories/accountApiKeys.ts (FK-1). Mocks the service-role client to
 * verify the insert/update payloads, the snake_case translation, and — load-bearing
 * — that the client-facing metadata projection NEVER selects or returns `key_hash`,
 * while the service-side verification lookups DO expose it for FK-4. No DB.
 */

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}
interface State {
  insertPayload?: unknown;
  updatePayload?: unknown;
  selectCols: string[];
  filters: Array<[string, ...unknown[]]>;
  result: Result;
}

function makeClient(state: State) {
  const b: Record<string, unknown> = {};
  Object.assign(b, {
    insert: (p: unknown) => ((state.insertPayload = p), b),
    update: (p: unknown) => ((state.updatePayload = p), b),
    select: (c?: string) => (state.selectCols.push(c ?? "*"), b),
    eq: (col: string, v: unknown) => (state.filters.push(["eq", col, v]), b),
    is: (col: string, v: unknown) => (state.filters.push(["is", col, v]), b),
    or: (s: string) => (state.filters.push(["or", s]), b),
    order: () => b,
    single: async () => state.result,
    maybeSingle: async () => state.result,
    then: (resolve: (v: Result) => void) => resolve(state.result),
  });
  return { from: () => b };
}

const mockClient: { current: ReturnType<typeof makeClient> | null } = { current: null };
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));

import {
  createApiKeyMetadataServiceRole,
  listApiKeyMetadataByAccountServiceRole,
  getApiKeyMetadataByIdServiceRole,
  findApiKeyByHashServiceRole,
  getApiKeyForVerificationByPrefixServiceRole,
  revokeApiKeyServiceRole,
  touchLastUsedServiceRole,
} from "@/repositories/accountApiKeys";

const META_ROW = {
  id: "key-1",
  account_id: "acct-1",
  created_by_user_id: "user-1",
  name: "CI trigger",
  prefix: "crk_live_AbCd1234",
  scopes: ["workflows:trigger"],
  last_used_at: null,
  expires_at: null,
  revoked_at: null,
  created_at: "2026-06-07T00:00:00Z",
};
const VERIFY_ROW = {
  id: "key-1",
  account_id: "acct-1",
  key_hash: "a".repeat(64),
  scopes: ["workflows:trigger"],
  expires_at: null,
  revoked_at: null,
};

function setup(result: Result): State {
  const state: State = { selectCols: [], filters: [], result };
  mockClient.current = makeClient(state);
  return state;
}

describe("createApiKeyMetadataServiceRole", () => {
  it("inserts hash+prefix and returns metadata WITHOUT key_hash", async () => {
    const state = setup({ data: META_ROW, error: null });
    const meta = await createApiKeyMetadataServiceRole({
      accountId: "acct-1",
      createdByUserId: "user-1",
      name: "CI trigger",
      prefix: "crk_live_AbCd1234",
      keyHash: "a".repeat(64),
      scopes: ["workflows:trigger"],
    });
    expect(state.insertPayload).toMatchObject({
      account_id: "acct-1",
      created_by_user_id: "user-1",
      name: "CI trigger",
      prefix: "crk_live_AbCd1234",
      key_hash: "a".repeat(64),
      scopes: ["workflows:trigger"],
      expires_at: null,
    });
    expect(meta).toMatchObject({ id: "key-1", prefix: "crk_live_AbCd1234" });
    expect(meta).not.toHaveProperty("keyHash");
    expect(meta).not.toHaveProperty("key_hash");
    // The projection never even SELECTs key_hash.
    expect(state.selectCols.join(" ")).not.toContain("key_hash");
  });

  it("throws on a Supabase error", async () => {
    setup({ data: null, error: { message: "boom" } });
    await expect(
      createApiKeyMetadataServiceRole({
        accountId: "a",
        createdByUserId: null,
        name: "x",
        prefix: "crk_live_x",
        keyHash: "h",
        scopes: ["workflows:trigger"],
      }),
    ).rejects.toThrow(/boom/);
  });
});

describe("listApiKeyMetadataByAccountServiceRole", () => {
  it("maps rows to metadata, omitting key_hash, scoped + ordered by account", async () => {
    const state = setup({ data: [META_ROW, { ...META_ROW, id: "key-2" }], error: null });
    const rows = await listApiKeyMetadataByAccountServiceRole("acct-1");
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty("keyHash");
    expect(state.selectCols.join(" ")).not.toContain("key_hash");
    expect(state.filters).toContainEqual(["eq", "account_id", "acct-1"]);
  });
});

describe("getApiKeyMetadataByIdServiceRole", () => {
  it("returns account-scoped metadata (no key_hash) or null", async () => {
    const state = setup({ data: META_ROW, error: null });
    const meta = await getApiKeyMetadataByIdServiceRole("acct-1", "key-1");
    expect(meta).toMatchObject({ id: "key-1", accountId: "acct-1" });
    expect(meta).not.toHaveProperty("keyHash");
    expect(state.selectCols.join(" ")).not.toContain("key_hash");
    expect(state.filters).toContainEqual(["eq", "id", "key-1"]);
    expect(state.filters).toContainEqual(["eq", "account_id", "acct-1"]); // account-scoped
  });

  it("returns null when the key is not in the account", async () => {
    setup({ data: null, error: null });
    expect(await getApiKeyMetadataByIdServiceRole("acct-1", "other")).toBeNull();
  });
});

describe("verification lookups (service-side, include key_hash)", () => {
  it("findApiKeyByHashServiceRole returns a record WITH keyHash by exact hash", async () => {
    const state = setup({ data: VERIFY_ROW, error: null });
    const rec = await findApiKeyByHashServiceRole("a".repeat(64));
    expect(rec).toMatchObject({ id: "key-1", accountId: "acct-1", keyHash: "a".repeat(64) });
    expect(state.filters).toContainEqual(["eq", "key_hash", "a".repeat(64)]);
  });

  it("findApiKeyByHashServiceRole returns null when no row matches", async () => {
    setup({ data: null, error: null });
    expect(await findApiKeyByHashServiceRole("nope")).toBeNull();
  });

  it("getApiKeyForVerificationByPrefixServiceRole returns non-revoked candidates with keyHash", async () => {
    const state = setup({ data: [VERIFY_ROW], error: null });
    const recs = await getApiKeyForVerificationByPrefixServiceRole("crk_live_AbCd1234");
    expect(recs).toHaveLength(1);
    expect(recs[0]!.keyHash).toBe("a".repeat(64));
    expect(state.filters).toContainEqual(["eq", "prefix", "crk_live_AbCd1234"]);
    expect(state.filters).toContainEqual(["is", "revoked_at", null]);
  });
});

describe("revokeApiKeyServiceRole", () => {
  it("soft-revokes within the account and reports a newly-revoked row", async () => {
    const state = setup({ data: [{ id: "key-1" }], error: null });
    const r = await revokeApiKeyServiceRole({ accountId: "acct-1", keyId: "key-1", now: "2026-06-07T01:00:00Z" });
    expect(r).toEqual({ revoked: true });
    expect((state.updatePayload as Record<string, unknown>).revoked_at).toBe("2026-06-07T01:00:00Z");
    expect(state.filters).toContainEqual(["eq", "id", "key-1"]);
    expect(state.filters).toContainEqual(["eq", "account_id", "acct-1"]); // account-scoped
    expect(state.filters).toContainEqual(["is", "revoked_at", null]); // idempotency guard
  });

  it("reports revoked=false when nothing matched (already revoked / cross-account)", async () => {
    setup({ data: [], error: null });
    expect(await revokeApiKeyServiceRole({ accountId: "acct-1", keyId: "key-x" })).toEqual({
      revoked: false,
    });
  });
});

describe("touchLastUsedServiceRole", () => {
  it("sets last_used_at with a 60s throttle filter", async () => {
    const state = setup({ data: null, error: null });
    await touchLastUsedServiceRole({ keyId: "key-1", now: "2026-06-07T00:00:00Z" });
    expect((state.updatePayload as Record<string, unknown>).last_used_at).toBe(
      "2026-06-07T00:00:00Z",
    );
    expect(state.filters).toContainEqual(["eq", "id", "key-1"]);
    // Throttle: only write when null or older than the cutoff.
    const orFilter = state.filters.find((f) => f[0] === "or");
    expect(orFilter?.[1]).toMatch(/last_used_at\.is\.null,last_used_at\.lt\./);
  });
});
