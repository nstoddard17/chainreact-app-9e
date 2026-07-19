/**
 * @jest-environment node
 *
 * Unit tests for the shared integration-suite teardown helper.
 *
 * These pin the properties whose absence let ~320 synthetic users accumulate in
 * the shared Supabase project: correct delete ORDER, account-before-membership,
 * auth-user LAST, cleanup of PARTIALLY created fixtures, and — most
 * importantly — that a failed teardown THROWS instead of warning.
 */
import {
  cleanupFixtures,
  createFixtureTracker,
  createTrackedUser,
} from "@/tests/helpers/dbFixtureCleanup";

interface Op {
  table: string;
  col?: string;
  vals?: unknown;
}

let ops: Op[] = [];
let ownedAccountsByOwner: Record<string, string[]> = {};
let tableErrors: Record<string, string> = {};
let createUserBehaviour: "ok" | "error-with-user" | "error-no-user" = "ok";
let deleteUserErrors: Record<string, string> = {};
let deletedAuthUsers: string[] = [];
let createdUserSeq = 0;

function fakeAdmin() {
  return {
    from: (table: string) => ({
      select: (_cols: string) => ({
        in: async (col: string, vals: string[]) => {
          ops.push({ table: `${table}:select`, col, vals });
          if (tableErrors[`${table}:select`]) {
            return { data: null, error: { message: tableErrors[`${table}:select`] } };
          }
          const ids = vals.flatMap((v) => ownedAccountsByOwner[v] ?? []);
          return { data: ids.map((id) => ({ id })), error: null };
        },
      }),
      delete: () => ({
        in: async (col: string, vals: unknown) => {
          ops.push({ table, col, vals });
          return { error: tableErrors[table] ? { message: tableErrors[table] } : null };
        },
      }),
    }),
    auth: {
      admin: {
        createUser: async () => {
          createdUserSeq += 1;
          const id = `user-${createdUserSeq}`;
          if (createUserBehaviour === "error-no-user") {
            return { data: { user: null }, error: { message: "boom" } };
          }
          if (createUserBehaviour === "error-with-user") {
            return { data: { user: { id } }, error: { message: "partial failure" } };
          }
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id: string) => {
          ops.push({ table: "auth.users", col: "id", vals: id });
          if (deleteUserErrors[id]) return { error: { message: deleteUserErrors[id] } };
          deletedAuthUsers.push(id);
          return { error: null };
        },
      },
    },
  } as never;
}

beforeEach(() => {
  ops = [];
  ownedAccountsByOwner = {};
  tableErrors = {};
  createUserBehaviour = "ok";
  deleteUserErrors = {};
  deletedAuthUsers = [];
  createdUserSeq = 0;
});

const idx = (table: string) => ops.findIndex((o) => o.table === table);

describe("cleanupFixtures", () => {
  it("is a no-op when nothing was created", async () => {
    await expect(cleanupFixtures(fakeAdmin(), createFixtureTracker())).resolves.toBeUndefined();
    expect(ops).toEqual([]);
  });

  it("clears every RESTRICT child before deleting accounts", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    ownedAccountsByOwner = { u1: ["acct-1"] };

    await cleanupFixtures(fakeAdmin(), t);

    const accounts = idx("accounts");
    expect(accounts).toBeGreaterThan(-1);
    for (const table of [
      "workflow_runs",
      "workflows",
      "workflow_folders",
      "integrations",
      "account_billing",
    ]) {
      expect(idx(table)).toBeGreaterThan(-1);
      expect(idx(table)).toBeLessThan(accounts);
    }
  });

  it("deletes workflow_runs before workflows", async () => {
    const t = createFixtureTracker();
    t.trackAccount("acct-1");
    await cleanupFixtures(fakeAdmin(), t);
    expect(idx("workflow_runs")).toBeLessThan(idx("workflows"));
  });

  it("deletes accounts BEFORE memberships (owner-invariant trigger)", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    ownedAccountsByOwner = { u1: ["acct-1"] };
    await cleanupFixtures(fakeAdmin(), t);
    expect(idx("accounts")).toBeLessThan(idx("account_memberships"));
  });

  it("deletes auth users LAST", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    ownedAccountsByOwner = { u1: ["acct-1"] };
    await cleanupFixtures(fakeAdmin(), t);
    expect(idx("auth.users")).toBe(ops.length - 1);
    expect(deletedAuthUsers).toEqual(["u1"]);
  });

  it("resolves trigger-created personal accounts the suite never tracked", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    // Suite tracked no account; the DB trigger made one.
    ownedAccountsByOwner = { u1: ["personal-acct"] };

    await cleanupFixtures(fakeAdmin(), t);

    const wf = ops.find((o) => o.table === "workflows");
    expect(wf?.vals).toEqual(["personal-acct"]);
  });

  it("merges explicitly tracked accounts with resolved ones", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    t.trackAccount("team-acct");
    ownedAccountsByOwner = { u1: ["personal-acct"] };

    await cleanupFixtures(fakeAdmin(), t);

    const accounts = ops.find((o) => o.table === "accounts");
    expect(new Set(accounts?.vals as string[])).toEqual(new Set(["team-acct", "personal-acct"]));
  });

  it("THROWS when the auth user cannot be deleted", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    deleteUserErrors = { u1: "still referenced" };

    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/cleanupFixtures failed/);
    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/still referenced/);
  });

  it("THROWS when an intermediate delete fails — never only warns", async () => {
    const t = createFixtureTracker();
    t.trackAccount("acct-1");
    tableErrors = { account_billing: "restrict violation" };

    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/restrict violation/);
  });

  it("attempts EVERY step even after an early failure, then throws once", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    ownedAccountsByOwner = { u1: ["acct-1"] };
    tableErrors = { workflows: "boom-1", integrations: "boom-2" };

    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/2 step\(s\)/);
    // The auth user is still removed despite the earlier failures.
    expect(deletedAuthUsers).toEqual(["u1"]);
  });

  it("cleans a PARTIALLY created fixture when beforeAll dies mid-setup", async () => {
    // Simulates: user A created, then user B's creation throws — the suite's
    // beforeAll aborts. Teardown must still remove A.
    const t = createFixtureTracker();
    const admin = fakeAdmin();
    await createTrackedUser(admin, t, "a");
    createUserBehaviour = "error-no-user";
    await expect(createTrackedUser(admin, t, "b")).rejects.toThrow();

    ownedAccountsByOwner = { "user-1": ["acct-1"] };
    await cleanupFixtures(admin, t);

    expect(deletedAuthUsers).toEqual(["user-1"]);
  });

  it("tracks a user whose creation returned BOTH a user and an error", async () => {
    const t = createFixtureTracker();
    const admin = fakeAdmin();
    createUserBehaviour = "error-with-user";

    await expect(createTrackedUser(admin, t, "a")).rejects.toThrow(/partial failure/);
    // The half-created user must still be tracked, or it leaks forever.
    expect(t.userIds).toEqual(["user-1"]);

    await cleanupFixtures(admin, t);
    expect(deletedAuthUsers).toEqual(["user-1"]);
  });

  it("does nothing when admin is null (unconfigured env / skipped suite)", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    await expect(cleanupFixtures(null, t)).resolves.toBeUndefined();
    expect(ops).toEqual([]);
  });
});

describe("createTrackedUser", () => {
  it("mints an @chainreact.test email and tracks the id", async () => {
    const t = createFixtureTracker();
    const user = await createTrackedUser(fakeAdmin(), t, "mcp-rls-a");
    expect(user.email).toMatch(/^mcp-rls-a-.*@chainreact\.test$/);
    expect(t.userIds).toEqual([user.userId]);
  });

  it("produces unique emails across calls", async () => {
    const t = createFixtureTracker();
    const admin = fakeAdmin();
    const a = await createTrackedUser(admin, t, "x");
    const b = await createTrackedUser(admin, t, "x");
    expect(a.email).not.toBe(b.email);
    expect(t.userIds).toHaveLength(2);
  });
});
