/**
 * @jest-environment node
 *
 * repositories/workflowTemplates (CS-XT-4 + marketplace/ledger CS-XT-4B). Mocks the
 * service-role client and proves the create/list/get/count/delete helpers + the
 * marketplace projection (no account_id / user id) + the usage ledger issue account-scoped
 * queries, map rows → DTOs, and never expose unsafe fields.
 */

interface QueryResult {
  data?: unknown;
  error: { message: string } | null;
  count?: number | null;
}
const state: {
  result: QueryResult;
  insertPayload?: Record<string, unknown>;
  selectCols?: string;
  countOpts?: unknown;
  orArg?: string;
  eqs: Array<[string, unknown]>;
} = { result: { data: null, error: null }, eqs: [] };

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
    or: (expr: string) => {
      state.orArg = expr;
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
  listMarketplaceTemplatesServiceRole,
  getMarketplaceTemplateByIdServiceRole,
  countTemplatesByAccountServiceRole,
  deleteTemplateServiceRole,
  recordTemplateUsageEventServiceRole,
  countUsageEventsByTemplateServiceRole,
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
    visibility: "private",
    definition: DEF,
    schema_version: 1,
    published_at: null,
    unpublished_at: null,
    forked_from_template_id: null,
    creator_display_name_snapshot: null,
    usage_count: 0,
    fork_count: 0,
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
  state.orArg = undefined;
  state.eqs = [];
});

describe("createTemplateServiceRole", () => {
  it("defaults source='user' / visibility='private' and maps the full record", async () => {
    state.result = { data: row(), error: null };
    const rec = await createTemplateServiceRole({
      accountId: "acct-1",
      createdByUserId: "user-1",
      name: "Lead intake",
      definition: DEF,
      schemaVersion: 1,
    });
    expect(state.insertPayload).toMatchObject({
      account_id: "acct-1",
      source: "user",
      visibility: "private",
      definition: DEF,
      schema_version: 1,
    });
    expect(rec).toMatchObject({
      id: "tpl-1",
      accountId: "acct-1",
      source: "user",
      visibility: "private",
      usageCount: 0,
      forkCount: 0,
      forkedFromTemplateId: null,
      creatorDisplayNameSnapshot: null,
    });
  });

  it("supports an OFFICIAL template (account_id null, source official, public)", async () => {
    state.result = { data: row({ account_id: null, source: "official", visibility: "public" }), error: null };
    await createTemplateServiceRole({
      accountId: null,
      createdByUserId: null,
      name: "Official: intake",
      definition: DEF,
      schemaVersion: 1,
      source: "official",
      visibility: "public",
    });
    expect(state.insertPayload).toMatchObject({ account_id: null, source: "official", visibility: "public" });
  });
});

describe("listTemplatesByAccountServiceRole", () => {
  it("scopes to the account and maps each row", async () => {
    state.result = { data: [row(), row({ id: "tpl-2" })], error: null };
    const recs = await listTemplatesByAccountServiceRole("acct-1");
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(recs.map((r) => r.id)).toEqual(["tpl-1", "tpl-2"]);
  });
});

describe("listMarketplaceTemplatesServiceRole", () => {
  it("filters to official OR public and returns the PUBLIC-safe summary (no account/user id)", async () => {
    state.result = {
      data: [row({ source: "official", account_id: null, visibility: "public", creator_display_name_snapshot: "ChainReact" })],
      error: null,
    };
    const recs = await listMarketplaceTemplatesServiceRole();
    expect(state.orArg).toBe("source.eq.official,visibility.eq.public");
    // selected columns must NOT request account_id / created_by_user_id
    expect(state.selectCols).not.toMatch(/account_id/);
    expect(state.selectCols).not.toMatch(/created_by_user_id/);
    const summary = recs[0]!;
    expect(summary).toEqual({
      id: "tpl-1",
      name: "Lead intake",
      description: null,
      source: "official",
      isOfficial: true,
      visibility: "public",
      creatorDisplayName: "ChainReact",
      usageCount: 0,
      forkCount: 0,
      forkedFromTemplateId: null,
      publishedAt: null,
      schemaVersion: 1,
      createdAt: "2026-06-07T00:00:00Z",
      // DERIVED, credential-free browse metadata (no raw definition / config / ids reach client).
      card: {
        nodeCount: 1,
        stepCount: 1,
        triggerKind: "app",
        providers: ["slack"],
        category: "team-ops",
        steps: [{ kind: "action", provider: "slack", type: "post" }],
      },
    });
    // the DTO has NO accountId / createdByUserId keys
    expect(Object.keys(summary)).not.toContain("accountId");
    expect(Object.keys(summary)).not.toContain("createdByUserId");
    // no-leak: the derived card never carries the node's config (e.g. the "C1" channel value).
    expect(JSON.stringify(summary.card)).not.toMatch(/C1/);
  });
});

describe("getMarketplaceTemplateByIdServiceRole", () => {
  it("only resolves marketplace-reachable rows (official/public/unlisted)", async () => {
    state.result = { data: null, error: null };
    const rec = await getMarketplaceTemplateByIdServiceRole("tpl-x");
    expect(state.eqs).toContainEqual(["id", "tpl-x"]);
    expect(state.orArg).toBe("source.eq.official,visibility.eq.public,visibility.eq.unlisted");
    expect(rec).toBeNull(); // a private id resolves to null — no leak
  });
});

describe("countTemplatesByAccountServiceRole", () => {
  it("counts user templates scoped to the account", async () => {
    state.result = { data: null, error: null, count: 12 };
    const n = await countTemplatesByAccountServiceRole("acct-1");
    expect(state.countOpts).toEqual({ count: "exact", head: true });
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
    expect(state.eqs).toContainEqual(["source", "user"]);
    expect(n).toBe(12);
  });
});

describe("deleteTemplateServiceRole", () => {
  it("hard-deletes scoped to id + account", async () => {
    state.result = { data: [{ id: "tpl-1" }], error: null };
    expect(await deleteTemplateServiceRole("acct-1", "tpl-1")).toEqual({ deleted: true });
    expect(state.eqs).toContainEqual(["id", "tpl-1"]);
    expect(state.eqs).toContainEqual(["account_id", "acct-1"]);
  });
});

describe("recordTemplateUsageEventServiceRole", () => {
  it("inserts a ledger row and maps it (counters maintained by the DB trigger)", async () => {
    state.result = {
      data: {
        id: "ev-1",
        template_id: "tpl-1",
        actor_user_id: "user-2",
        target_account_id: "acct-2",
        event_type: "used_to_create_workflow",
        created_workflow_id: "wf-9",
        created_template_id: null,
        created_at: "2026-06-07T01:00:00Z",
      },
      error: null,
    };
    const ev = await recordTemplateUsageEventServiceRole({
      templateId: "tpl-1",
      actorUserId: "user-2",
      targetAccountId: "acct-2",
      eventType: "used_to_create_workflow",
      createdWorkflowId: "wf-9",
    });
    expect(mockFrom).toHaveBeenCalledWith("workflow_template_usage_events");
    expect(state.insertPayload).toMatchObject({
      template_id: "tpl-1",
      actor_user_id: "user-2",
      target_account_id: "acct-2",
      event_type: "used_to_create_workflow",
      created_workflow_id: "wf-9",
    });
    expect(ev).toMatchObject({ id: "ev-1", templateId: "tpl-1", eventType: "used_to_create_workflow", createdWorkflowId: "wf-9" });
  });
});

describe("countUsageEventsByTemplateServiceRole", () => {
  it("counts all events for a template, and by type when given", async () => {
    state.result = { data: null, error: null, count: 5 };
    expect(await countUsageEventsByTemplateServiceRole("tpl-1")).toBe(5);
    expect(state.eqs).toContainEqual(["template_id", "tpl-1"]);

    state.eqs = [];
    state.result = { data: null, error: null, count: 2 };
    expect(await countUsageEventsByTemplateServiceRole("tpl-1", "forked")).toBe(2);
    expect(state.eqs).toContainEqual(["event_type", "forked"]);
  });
});
