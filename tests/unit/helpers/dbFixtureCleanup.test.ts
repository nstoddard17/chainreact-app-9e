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
// TEST-SUITE-GREEN-1 — a stateful workflow_folders table so the DEEPEST-FIRST
// delete loop can actually be exercised: the helper re-lists the surviving rows
// each pass, so the fake must shrink as leaves are deleted.
let folderRows: Array<{ id: string; parent_folder_id: string | null }> = [];

function fakeAdmin() {
  return {
    from: (table: string) => ({
      select: (_cols: string) => ({
        in: async (col: string, vals: string[]) => {
          ops.push({ table: `${table}:select`, col, vals });
          if (tableErrors[`${table}:select`]) {
            return { data: null, error: { message: tableErrors[`${table}:select`] } };
          }
          // The folder tree is re-listed once per deepest-first pass.
          if (table === "workflow_folders") {
            return { data: folderRows.map((r) => ({ ...r })), error: null };
          }
          const ids = vals.flatMap((v) => ownedAccountsByOwner[v] ?? []);
          return { data: ids.map((id) => ({ id })), error: null };
        },
      }),
      update: (_patch: unknown) => {
        const chain = {
          in: (_col: string, _vals: unknown) => chain,
          not: async (_col: string, _op: string, _v: unknown) => {
            ops.push({ table: `${table}:detach` });
            return {
              error: tableErrors[`${table}:detach`]
                ? { message: tableErrors[`${table}:detach`] }
                : null,
            };
          },
        };
        return chain;
      },
      delete: () => ({
        in: async (col: string, vals: unknown) => {
          // A leaf delete targets folder IDs; the blanket sweep targets
          // account_id. Record them distinctly so ordering can be asserted.
          const isLeafDelete = table === "workflow_folders" && col === "id";
          ops.push({ table: isLeafDelete ? "workflow_folders:leaves" : table, col, vals });
          const errKey = isLeafDelete ? "workflow_folders:leaves" : table;
          if (tableErrors[errKey]) return { error: { message: tableErrors[errKey] } };
          if (isLeafDelete) {
            const gone = new Set(vals as string[]);
            folderRows = folderRows.filter((r) => !gone.has(r.id));
          }
          return { error: null };
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
          if (deleteUserErrors[id]) {
            const message = deleteUserErrors[id] as string;
            return { error: { message, status: message === "User not found" ? 404 : 500 } };
          }
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
  folderRows = [];
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

  // TEST-SUITE-GREEN-1 — these two used to assert a DETACH-first strategy
  // (re-parent the whole tree to NULL, then bulk delete). That approach was
  // deliberately removed in c1288d0b5: detaching makes every folder a root
  // sibling at once, which violates `workflow_folders_unique_sibling_name_live`
  // for any suite that intentionally reuses a folder name at different depths
  // (exactly what workflow-folders-unique-name asserts). The detach then FAILED
  // and cleanup left synthetic rows behind — the very leak this file exists to
  // prevent. The helper now deletes DEEPEST-FIRST and never re-parents, so the
  // assertions are re-pointed at that contract rather than restored.
  it("deletes a nested workflow_folders tree deepest-first, and never re-parents a folder", async () => {
    // root → child → grandchild, all in the tracked account.
    folderRows = [
      { id: "root", parent_folder_id: null },
      { id: "child", parent_folder_id: "root" },
      { id: "grandchild", parent_folder_id: "child" },
    ];
    const t = createFixtureTracker();
    t.trackAccount("acct-1");
    await cleanupFixtures(fakeAdmin(), t);

    const leafDeletes = ops
      .filter((o) => o.table === "workflow_folders:leaves")
      .map((o) => o.vals as string[]);
    // One pass per depth, deepest first — a parent is never deleted while a
    // child still points at it (parent_folder_id is a self-referential RESTRICT FK).
    expect(leafDeletes).toEqual([["grandchild"], ["child"], ["root"]]);
    // The whole point of the rewrite: NO folder is ever re-parented, so the
    // unique-sibling-name index can never be tripped during teardown.
    expect(idx("workflow_folders:detach")).toBe(-1);
    // ...and the walk must happen AFTER `workflows` is cleared. folders have a
    // SECOND inbound RESTRICT FK — workflows.folder_id — so deleting the tree
    // first dies with "violates foreign key constraint workflows_folder_id_fkey"
    // for any suite that filed a workflow in a folder (this is exactly what broke
    // tests/integration/security/workflow-folders-rls in afterAll, with all six
    // of its assertions passing).
    expect(idx("workflows")).toBeLessThan(idx("workflow_folders:leaves"));
  });

  it("stops and reports a failed leaf delete rather than silently continuing", async () => {
    folderRows = [
      { id: "root", parent_folder_id: null },
      { id: "child", parent_folder_id: "root" },
    ];
    const t = createFixtureTracker();
    t.trackAccount("acct-1");
    tableErrors = { "workflow_folders:leaves": "leaf delete exploded" };

    // A teardown that cannot clear folders MUST throw — a warning here is how
    // synthetic rows accumulated in the shared project in the first place.
    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/leaf delete exploded/);
  });

  it("treats an already-deleted auth user as success, not failure", async () => {
    // accountPurge / ledgerAnonymization delete their own fixtures as the thing
    // under test; teardown must not then fail on 'User not found'.
    const t = createFixtureTracker();
    t.trackUser("u1");
    deleteUserErrors = { u1: "User not found" };

    await expect(cleanupFixtures(fakeAdmin(), t)).resolves.toBeUndefined();
  });

  it("still fails on a REAL delete error, not just any error", async () => {
    const t = createFixtureTracker();
    t.trackUser("u1");
    deleteUserErrors = { u1: "still referenced by something" };

    await expect(cleanupFixtures(fakeAdmin(), t)).rejects.toThrow(/still referenced/);
  });

  // TEST-SUITE-GREEN-1 — the detach-failure case was replaced by
  // "stops and reports a failed leaf delete rather than silently continuing"
  // above: the helper no longer detaches at all (c1288d0b5), so an error keyed
  // on a detach step could never fire and the test passed vacuously in reverse.
  // The failure-must-throw property it protected is preserved there.

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
