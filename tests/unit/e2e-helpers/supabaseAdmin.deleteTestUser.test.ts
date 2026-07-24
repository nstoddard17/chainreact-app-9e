/**
 * @jest-environment node
 *
 * Unit tests for the e2e teardown helper `deleteTestUser`.
 *
 * WHY THESE EXIST: the previous implementation failed silently against the real
 * schema and let synthetic users accumulate in the shared Supabase project
 * (320 of them, cleaned up manually). The failure was invisible because no
 * `error` was checked and the final failure was only `console.warn`ed. These
 * tests pin the three properties that prevent a recurrence:
 *
 *   1. ORDER — RESTRICT children are cleared before the `accounts` row, and the
 *      `accounts` row before `auth.users`. Wrong order = FK violation.
 *   2. MEMBERSHIPS AFTER ACCOUNTS — deleting the owner's membership while the
 *      account still exists trips the DB's "must keep at least one owner"
 *      trigger.
 *   3. LOUD FINAL FAILURE — if the auth user is not removed, the helper throws.
 *
 * The Supabase client is faked; these assert the helper's call sequence, not
 * Postgres behaviour.
 */

interface Op {
  table: string;
  verb: "select" | "delete";
  col?: string;
  vals?: unknown;
}

let ops: Op[] = [];
let ownedAccounts: { id: string }[] = [];
let tableErrors: Record<string, string> = {};
let deleteUserError: string | null = null;
let deletedAuthUsers: string[] = [];

const mockCreateClient = jest.fn(() => {
  const result = (table: string) => ({
    error: tableErrors[table] ? { message: tableErrors[table] } : null,
  });
  return {
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: async (col: string, vals: unknown) => {
          ops.push({ table, verb: "select", col, vals });
          return {
            data: tableErrors[table] ? null : ownedAccounts,
            error: tableErrors[table] ? { message: tableErrors[table] } : null,
          };
        },
      }),
      delete: () => ({
        in: async (col: string, vals: unknown) => {
          ops.push({ table, verb: "delete", col, vals });
          return result(table);
        },
        eq: async (col: string, vals: unknown) => {
          ops.push({ table, verb: "delete", col, vals });
          return result(table);
        },
      }),
    }),
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          ops.push({ table: "auth.users", verb: "delete", col: "id", vals: id });
          if (deleteUserError) return { error: { message: deleteUserError } };
          deletedAuthUsers.push(id);
          return { error: null };
        },
      },
    },
  };
});

jest.mock("@supabase/supabase-js", () => ({
  createClient: (...a: unknown[]) => mockCreateClient(...(a as [])),
}));

const USER_ID = "user-under-test";
const ACCOUNT_ID = "acct-1";

/** Fresh module instance per test — the helper caches its client at module scope. */
async function loadHelper() {
  let mod!: typeof import("@/tests/e2e/helpers/supabaseAdmin");
  await jest.isolateModulesAsync(async () => {
    mod = await import("@/tests/e2e/helpers/supabaseAdmin");
  });
  return mod;
}

beforeEach(() => {
  ops = [];
  ownedAccounts = [{ id: ACCOUNT_ID }];
  tableErrors = {};
  deleteUserError = null;
  deletedAuthUsers = [];
  // CS-7C guard: adminClient() calls assertSafeTestEnvironment(), which refuses a
  // cloud host. This unit test fakes the Supabase client, so the URL only needs to
  // be a SAFE (loopback) target for the guard to pass — mirroring the real local
  // Supabase test env. (A cloud host here would fail the guard, as it should.)
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test-key";
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const idx = (table: string, verb: Op["verb"] = "delete") =>
  ops.findIndex((o) => o.table === table && o.verb === verb);

/** Indexed access that fails loudly instead of tripping strict-null checks. */
function opAt(i: number): Op {
  const op = ops[i];
  if (!op) throw new Error(`no recorded op at index ${i}`);
  return op;
}

describe("deleteTestUser", () => {
  it("clears every RESTRICT child before deleting the accounts row", async () => {
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);

    const accountsDelete = idx("accounts");
    expect(accountsDelete).toBeGreaterThan(-1);

    for (const table of [
      "workflow_runs",
      "workflows",
      "workflow_folders",
      "integrations",
      "account_billing",
    ]) {
      const at = idx(table);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(accountsDelete);
      // Scoped to the owned account, never a blanket delete.
      expect(opAt(at).col).toBe("account_id");
      expect(opAt(at).vals).toEqual([ACCOUNT_ID]);
    }
  });

  it("deletes workflow_runs before workflows", async () => {
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);
    expect(idx("workflow_runs")).toBeLessThan(idx("workflows"));
  });

  it("deletes account_memberships AFTER accounts (owner-invariant trigger)", async () => {
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);
    expect(idx("account_memberships")).toBeGreaterThan(idx("accounts"));
  });

  it("deletes the auth user LAST (owner_user_id is RESTRICT)", async () => {
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);
    expect(idx("auth.users")).toBe(ops.length - 1);
    expect(deletedAuthUsers).toEqual([USER_ID]);
  });

  it("removes memberships in accounts owned by someone else", async () => {
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);
    const at = idx("account_memberships");
    expect(opAt(at).col).toBe("user_id");
    expect(opAt(at).vals).toBe(USER_ID);
  });

  it("skips account-scoped deletes when the user owns no account", async () => {
    ownedAccounts = [];
    const { deleteTestUser } = await loadHelper();
    await deleteTestUser(USER_ID);

    expect(idx("workflows")).toBe(-1);
    expect(idx("accounts")).toBe(-1);
    // Still clears memberships and the auth user.
    expect(idx("account_memberships")).toBeGreaterThan(-1);
    expect(deletedAuthUsers).toEqual([USER_ID]);
  });

  it("THROWS when the auth user cannot be deleted (no silent accumulation)", async () => {
    deleteUserError = "update or delete on table \"users\" violates foreign key constraint";
    const { deleteTestUser } = await loadHelper();

    await expect(deleteTestUser(USER_ID)).rejects.toThrow(/deleteTestUser/);
    await expect(deleteTestUser(USER_ID)).rejects.toThrow(/accumulate/);
    expect(deletedAuthUsers).toEqual([]);
  });

  it("continues teardown when an intermediate table delete fails", async () => {
    tableErrors = { workflows: "boom" };
    const { deleteTestUser } = await loadHelper();

    await expect(deleteTestUser(USER_ID)).resolves.toBeUndefined();
    // A failing child delete must not abort the auth-user removal.
    expect(deletedAuthUsers).toEqual([USER_ID]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("workflows delete failed"));
  });

  it("still attempts teardown when the owned-account lookup fails", async () => {
    tableErrors = { accounts: "lookup exploded" };
    const { deleteTestUser } = await loadHelper();

    await expect(deleteTestUser(USER_ID)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("owned-account lookup failed"),
    );
    expect(deletedAuthUsers).toEqual([USER_ID]);
  });
});
