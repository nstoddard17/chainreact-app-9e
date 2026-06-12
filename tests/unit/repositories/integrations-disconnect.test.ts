/**
 * @jest-environment node
 *
 * Tests for the CD-1 service-role disconnect repository functions
 * (Slice 4.APPS-DISCONNECT): getByIdForAccountServiceRole,
 * countActiveByAccountProviderServiceRole, disconnectByIdServiceRole.
 *
 * Proves: exact (id, account_id) scoping (cross-account ⇒ null); the soft-
 * disconnect patch sets disconnected_at + NULLS the nullable token columns but
 * does NOT touch access_token_encrypted (NOT NULL in schema); idempotency via
 * the `disconnected_at IS NULL` guard + returned `disconnected` flag.
 */
interface BuilderCapture {
  mode: "select" | "update" | null;
  patch: unknown;
  ops: Array<[string, unknown, unknown]>;
  selectArgs: unknown[] | null;
}

function makeClient(opts: {
  // For select/maybeSingle paths:
  single?: { data: unknown; error?: { message: string } | null };
  // For count head paths:
  count?: { count: number | null; error?: { message: string } | null };
  // For update().select() paths:
  updateRows?: { data: unknown[]; error?: { message: string } | null };
}) {
  const builders: BuilderCapture[] = [];
  const from = jest.fn(() => {
    const cap: BuilderCapture = { mode: null, patch: undefined, ops: [], selectArgs: null };
    builders.push(cap);
    const builder: Record<string, unknown> = {};
    Object.assign(builder, {
      select: jest.fn((...args: unknown[]) => {
        cap.selectArgs = args;
        // After update(...).eq(...).is(...), `.select("id")` is the TERMINAL.
        if (cap.mode === "update") return Promise.resolve(opts.updateRows);
        cap.mode = "select";
        return builder;
      }),
      update: jest.fn((patch: unknown) => {
        cap.mode = "update";
        cap.patch = patch;
        return builder;
      }),
      eq: jest.fn((c: string, v: unknown) => {
        cap.ops.push(["eq", c, v]);
        return builder;
      }),
      is: jest.fn((c: string, v: unknown) => {
        cap.ops.push(["is", c, v]);
        // Count query terminal: select("id",{count,head}).eq().eq().is() resolves here.
        if (opts.count && cap.mode === "select") return Promise.resolve(opts.count);
        return builder;
      }),
      maybeSingle: jest.fn(() => Promise.resolve(opts.single ?? { data: null, error: null })),
    });
    return builder;
  });
  return { client: { from }, builders };
}

const mockClientRef: { current: ReturnType<typeof makeClient>["client"] | null } = {
  current: null,
};
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClientRef.current),
}));
// listActiveByAccount uses the session client; not exercised here, but the module
// imports it — provide a stub so the import resolves.
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(),
}));

import {
  getByIdForAccountServiceRole,
  countActiveByAccountProviderServiceRole,
  disconnectByIdServiceRole,
} from "@/repositories/integrations";

const ROW = {
  id: "int-1",
  account_id: "acc-1",
  connected_by_user_id: "user-A",
  provider: "gmail",
  provider_account_id: "pa-1",
  display_name: "Personal",
  access_token_encrypted: "enc-access",
  refresh_token_encrypted: "enc-refresh",
  access_token_expires_at: "2026-01-01T00:00:00Z",
  scopes: ["a"],
  account_metadata: {},
  disconnected_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("getByIdForAccountServiceRole", () => {
  it("scopes by BOTH id and account_id and maps the row", async () => {
    const { client, builders } = makeClient({ single: { data: ROW, error: null } });
    mockClientRef.current = client;
    const rec = await getByIdForAccountServiceRole("acc-1", "int-1");
    expect(rec?.id).toBe("int-1");
    expect(rec?.provider).toBe("gmail");
    expect(builders[0]!.ops).toContainEqual(["eq", "id", "int-1"]);
    expect(builders[0]!.ops).toContainEqual(["eq", "account_id", "acc-1"]);
  });

  it("returns null for a cross-account / unknown id (no leak)", async () => {
    const { client } = makeClient({ single: { data: null, error: null } });
    mockClientRef.current = client;
    expect(await getByIdForAccountServiceRole("acc-OTHER", "int-1")).toBeNull();
  });
});

describe("countActiveByAccountProviderServiceRole", () => {
  it("counts active rows scoped to (account, provider) with disconnected_at IS NULL", async () => {
    const { client, builders } = makeClient({ count: { count: 2, error: null } });
    mockClientRef.current = client;
    const n = await countActiveByAccountProviderServiceRole("acc-1", "gmail");
    expect(n).toBe(2);
    expect(builders[0]!.ops).toContainEqual(["eq", "account_id", "acc-1"]);
    expect(builders[0]!.ops).toContainEqual(["eq", "provider", "gmail"]);
    expect(builders[0]!.ops).toContainEqual(["is", "disconnected_at", null]);
  });

  it("treats null count as 0", async () => {
    const { client } = makeClient({ count: { count: null, error: null } });
    mockClientRef.current = client;
    expect(await countActiveByAccountProviderServiceRole("acc-1", "gmail")).toBe(0);
  });
});

describe("disconnectByIdServiceRole", () => {
  it("sets disconnected_at + nulls ONLY the nullable token columns (never access_token_encrypted)", async () => {
    const { client, builders } = makeClient({ updateRows: { data: [{ id: "int-1" }], error: null } });
    mockClientRef.current = client;
    const res = await disconnectByIdServiceRole({ integrationId: "int-1", now: "2026-06-11T00:00:00Z" });
    expect(res).toEqual({ disconnected: true });
    const patch = builders[0]!.patch as Record<string, unknown>;
    expect(patch).toEqual({
      disconnected_at: "2026-06-11T00:00:00Z",
      refresh_token_encrypted: null,
      access_token_expires_at: null,
    });
    // access_token_encrypted is NOT NULL in schema — must NOT be in the patch.
    expect(patch).not.toHaveProperty("access_token_encrypted");
    expect(builders[0]!.ops).toContainEqual(["eq", "id", "int-1"]);
    expect(builders[0]!.ops).toContainEqual(["is", "disconnected_at", null]);
  });

  it("is idempotent: a replay (guard matches no row) returns disconnected:false", async () => {
    const { client } = makeClient({ updateRows: { data: [], error: null } });
    mockClientRef.current = client;
    expect(await disconnectByIdServiceRole({ integrationId: "int-1" })).toEqual({
      disconnected: false,
    });
  });

  it("propagates an update error", async () => {
    const { client } = makeClient({ updateRows: { data: [], error: { message: "boom" } } });
    mockClientRef.current = client;
    await expect(disconnectByIdServiceRole({ integrationId: "int-1" })).rejects.toThrow(/boom/);
  });
});
