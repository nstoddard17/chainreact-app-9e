/**
 * @jest-environment node
 *
 * repositories/workflowTemplates (CS-XT-4). Mocks the service-role client and proves the
 * create/list/get/count/delete helpers issue account-scoped queries, map rows → DTOs with
 * ONLY template fields, count user templates by account, and never touch credential
 * material. (Live RLS is the gated DB harness.)
 */

// ── configurable service-role client mock ───────────────────────────────────────
interface QueryResult {
  data?: unknown;
  error: { message: string } | null;
  count?: number | null;
}
const state: { result: QueryResult; insertPayload?: Record<string, unknown>; selectCols?: string; countOpts?: unknown; eqs: Array<[string, unknown]> } = {
  result: { data: null, error: null },
  eqs: [],
};

function qb(): Record<string, unknown> {
  const builder: Record<string, unknown> = {
    insert: (p: Record<string, unknown>) => {
      state.insertPayload = p;
      return builder;
    },
    select: (cols: string, opts?: unknown) => {
      state.selectCols = cols;
      if (opts) state.countOpts = opts;
      return builder;
    },
    delete: () => builder,
    update: () => builder,
    eq: (col: string, val: unknown) => {
      state.eqs.push([col, val]);
      return builder;
    },
    order: () => Promise.resolve(state.result),
    single: () => Promise.resolve(state.result),
    maybeSingle: () => Promise.resolve(state.result),
    then: (resolve: (v: QueryResult) => unknown) => resolve(state.result),
  };
  return builder;
}

const mockFrom = jest.fn((_table: string) => qb());
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => ({ from: (table: string) => mockFrom(table) }),
}));

import {
  createTemplateServiceRole,
  listTemplatesByAccountServiceRole,
  getTemplateByIdServiceRole,
  countTemplatesByAccountServiceRole,
  deleteTemplateServiceRole,
} from "@/repositories/workflowTemplates";

const DEF = { nodes: [{ id: "n1", kind: "action", provider: "slack", type: "post", position: { x: 0, y: 0 }, config: { channel: "C1" } }], edges: [] };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    account_id: "acct-1",
    created_by_user_id: "user-1",
    name: "Lead intake",
    description: null,
    source: "user",
    definition: DEF,
    schema_version: 1,
    created_at: "2026-06-07T00:00:00Z",
    updated_at: "2026-06-07T00:00:00Z",
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  state.result = { data: null, error: null };
  state.insertPayload = undefined;
  state.selectCols = undefined;
  state.countOpts = undefined;
  state.eqs = [];
});

describe("createTemplateServiceRole", () => {
  it("inserts source='user' with the sanitized definition and maps row → DTO", async () => {
    state.result = { data: row(), error: null };
    const rec = await createTemplateServiceRole({
      accountId: "acct-1",
      createdByUserId: "user-1",
      name: "Lead intake",
      definition: DEF,
      schemaVersion: 1,
    });
    expect(mockFrom).toHaveBeenCalledWith("workflow_templates");
    expect(state.insertPayload).toMatchObject({
      account_id: "acct-1",
      created_by_user_id: "user-1",
      name: "Lead intake",
      source: "user",
      definition: DEF,
      schema_version: 1,
    });
    expect(rec).toEqual({
      id: "tpl-1",
      accountId: "acct-1",
      createdByUserId: "user-1",
      name: "Lead intake",
      description: null,
      source: "user",
      definition: DEF,
      schemaVersion: 1,
      createdAt: "2026-06-07T00:00:00Z",
      updatedAt: "2026-06-07T00:00:00Z",
    });
  });

  it("throws on insert error", async () => {
    state.result = { data: null, error: { message: "boom" } };
    await expect(
      createTemplateServiceRole({ accountId: "a", createdByUserId: null, name: "x", definition: DEF, schemaVersion: 1 }),
    ).rejects.toThrow(/createTemplateServiceRole failed/);
  });
});

describe("listTemplatesByAccountServiceRole", () => {
  it("scopes to the account and maps each row", async () => {
    state.result = { data: [row(), row({ id: "tpl-2", name: "Beta" })], error: null };
    const recs = await listTemplatesByAccountServiceRole("acct-1");
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(recs.map((r) => r.id)).toEqual(["tpl-1", "tpl-2"]);
    // DTO carries ONLY template fields — no raw snake_case / extra keys leak through.
    expect(Object.keys(recs[0]!).sort()).toEqual(
      ["accountId", "createdAt", "createdByUserId", "definition", "description", "id", "name", "schemaVersion", "source", "updatedAt"],
    );
  });
});

describe("getTemplateByIdServiceRole", () => {
  it("scopes by id AND account (no cross-account leak) and returns null when absent", async () => {
    state.result = { data: null, error: null };
    const rec = await getTemplateByIdServiceRole("acct-1", "tpl-x");
    expect(state.eqs).toContainEqual(["id", "tpl-x"]);
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(rec).toBeNull();
  });
});

describe("countTemplatesByAccountServiceRole", () => {
  it("counts user templates scoped to the account (the tier-limit input)", async () => {
    state.result = { data: null, error: null, count: 7 };
    const n = await countTemplatesByAccountServiceRole("acct-1");
    expect(state.countOpts).toEqual({ count: "exact", head: true });
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(state.eqs).toContainEqual(["source", "user"]);
    expect(n).toBe(7);
  });

  it("returns 0 when count is null", async () => {
    state.result = { data: null, error: null, count: null };
    expect(await countTemplatesByAccountServiceRole("acct-1")).toBe(0);
  });
});

describe("deleteTemplateServiceRole", () => {
  it("hard-deletes scoped to id + account; reports whether a row was removed", async () => {
    state.result = { data: [{ id: "tpl-1" }], error: null };
    const res = await deleteTemplateServiceRole("acct-1", "tpl-1");
    expect(state.eqs).toContainEqual(["id", "tpl-1"]);
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(res).toEqual({ deleted: true });
  });

  it("reports deleted:false when nothing matched", async () => {
    state.result = { data: [], error: null };
    expect(await deleteTemplateServiceRole("acct-1", "nope")).toEqual({ deleted: false });
  });
});
