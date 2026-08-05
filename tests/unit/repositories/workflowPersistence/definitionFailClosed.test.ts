/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1D — the runtime half of typing the workflow
 * definition + lifecycle boundary.
 *
 * Three repositories persist a workflow graph, and two of them used to reach it
 * with `(row.definition ?? { nodes: [], edges: [] }) as SomeDefinition` — an
 * unchecked shape assertion wrapped around a silent empty-graph substitution.
 * That matters most in `workflow_checkpoints`, because restore writes the value
 * BACK over a live workflow: a corrupt snapshot could replace a user's work
 * with an empty canvas through the very feature meant to undo data loss.
 *
 * These tests pin what each boundary now does with corrupt persisted data, and
 * every "rejects" group carries a passing positive case so the rejections are
 * provably non-vacuous.
 *
 * (This suite lives in a subfolder because `tests/unit/repositories/` sits
 * exactly at the 50-file leaf cap — see
 * docs/rules/project-structure-and-module-boundaries.md.)
 */

interface Result {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/** A chainable PostgREST-shaped builder that records every call it received. */
function makeClient(result: Result) {
  const calls: Record<string, unknown[]> = {};
  const builder: Record<string, unknown> = {};
  const record = (name: string) =>
    jest.fn((...args: unknown[]) => {
      calls[name] = args;
      (calls[`${name}#all`] ??= []).push(args);
      return builder;
    });
  const terminal = (name: string) =>
    jest.fn(async (...args: unknown[]) => {
      calls[name] = args;
      return result;
    });
  Object.assign(builder, {
    select: record("select"),
    insert: record("insert"),
    update: record("update"),
    delete: record("delete"),
    eq: record("eq"),
    neq: record("neq"),
    in: record("in"),
    is: record("is"),
    not: record("not"),
    or: record("or"),
    gt: record("gt"),
    lte: record("lte"),
    order: record("order"),
    limit: record("limit"),
    range: record("range"),
    single: terminal("single"),
    maybeSingle: terminal("maybeSingle"),
    then: (resolve: (v: Result) => unknown) => resolve(result),
  });
  return {
    client: { from: jest.fn((t: string) => { calls.from = [t]; return builder; }) },
    calls,
  };
}

const mockClient: { current: unknown } = { current: null };
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockClient.current),
}));
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: jest.fn(() => mockClient.current),
}));

import * as workflowsRepo from "@/repositories/workflows";
import * as checkpointsRepo from "@/repositories/workflowCheckpoints";
import * as templatesRepo from "@/repositories/workflowTemplates";
import * as foldersRepo from "@/repositories/workflowFolders";

const VALID_GRAPH = {
  nodes: [
    {
      id: "n1",
      kind: "trigger",
      provider: "gmail",
      type: "new_email",
      config: {},
      position: { x: 0, y: 0 },
    },
  ],
  edges: [],
};

/**
 * Shapes that are NOT a workflow graph, whatever else they may be.
 *
 * NOTE what is deliberately absent: `null` and `{}`. Those are the LEGACY EMPTY
 * definition and parse as valid by contract (`normalizePersistedWorkflowDefinition`
 * documents it) — rows predating the schema stored them. Treating them as
 * corruption would flag real, restorable workflows; the `legacy empty` test
 * below pins that boundary so this list cannot quietly absorb them.
 */
const CORRUPT_GRAPHS: ReadonlyArray<[string, unknown]> = [
  ["a bare string", "definition"],
  ["a number", 7],
  ["an array instead of an object", [{ id: "n1" }]],
  ["nodes of the wrong type", { nodes: "nope", edges: [] }],
  ["a node missing its id", { nodes: [{ kind: "action", provider: "slack", type: "x" }], edges: [] }],
  ["a node with an unknown kind", { nodes: [{ id: "n1", kind: "sideways", provider: "slack", type: "x" }], edges: [] }],
  ["an edge missing its target", { nodes: [], edges: [{ id: "e1", from: "n1" }] }],
];

function workflowRow(over: Record<string, unknown> = {}) {
  return {
    id: "wf-1",
    account_id: "acct-1",
    created_by_user_id: "user-1",
    name: "My workflow",
    state: "draft",
    disabled_reason: null,
    disabled_context: null,
    active_revision_id: null,
    draft_definition: VALID_GRAPH,
    deleted_at: null,
    folder_id: null,
    deleted_by_user_id: null,
    purge_after: null,
    deleted_from_folder_id: null,
    delete_operation_id: null,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function checkpointRow(over: Record<string, unknown> = {}) {
  return {
    id: "cp-1",
    workflow_id: "wf-1",
    account_id: "acct-1",
    created_by_user_id: "user-1",
    source: "react_agent",
    name: "Before AI change",
    prompt: null,
    summary: null,
    definition: VALID_GRAPH,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

function templateRow(over: Record<string, unknown> = {}) {
  return {
    id: "tpl-1",
    account_id: "acct-1",
    created_by_user_id: "user-1",
    name: "Lead follow-up",
    description: null,
    source: "user",
    visibility: "private",
    definition: { nodes: [], edges: [] },
    schema_version: 1,
    published_at: null,
    unpublished_at: null,
    forked_from_template_id: null,
    creator_display_name_snapshot: null,
    usage_count: 0,
    fork_count: 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

// ── workflows.draft_definition ───────────────────────────────────────────────

describe("workflows — persisted draft definition", () => {
  it("returns a valid graph unchanged and flags it valid", async () => {
    mockClient.current = makeClient({ data: workflowRow(), error: null }).client;
    const record = await workflowsRepo.getById("wf-1");
    expect(record!.draftDefinition.nodes).toHaveLength(1);
    expect(record!.draftDefinitionInvalid).toBe(false);
  });

  it.each(CORRUPT_GRAPHS)(
    "degrades %s to the safe empty definition WITH the invalid flag",
    async (_name, blob) => {
      mockClient.current = makeClient({
        data: workflowRow({ draft_definition: blob }),
        error: null,
      }).client;
      const record = await workflowsRepo.getById("wf-1");
      // The established HOSTED-DEV-WORKFLOW-DEFINITION-CRASH-1 rule: one corrupt
      // row must not crash every dashboard consumer — but it is never presented
      // as a valid empty workflow either.
      expect(record!.draftDefinition).toEqual({ nodes: [], edges: [] });
      expect(record!.draftDefinitionInvalid).toBe(true);
    },
  );

  it.each([
    ["null", null],
    ["a legacy empty object", {}],
  ])("treats %s as the LEGACY EMPTY definition, not corruption", async (_name, blob) => {
    // The boundary that matters: rows predating the schema stored these, and
    // flagging them invalid would mark real, editable workflows as damaged.
    mockClient.current = makeClient({
      data: workflowRow({ draft_definition: blob }),
      error: null,
    }).client;
    const record = await workflowsRepo.getById("wf-1");
    expect(record!.draftDefinition).toEqual({ nodes: [], edges: [] });
    expect(record!.draftDefinitionInvalid).toBe(false);
  });

  it("never puts the persisted graph into the corruption warning", async () => {
    mockClient.current = makeClient({
      data: workflowRow({
        draft_definition: { nodes: [{ id: "n1", config: { apiKey: "leaky-secret-value" } }] },
      }),
      error: null,
    }).client;
    await workflowsRepo.getById("wf-1");
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("leaky-secret-value");
  });

  it("FAILS CLOSED when the billing-owner column is null", async () => {
    // ON DELETE SET NULL makes this reachable; it used to be declared `string`
    // and flowed into billing attribution as `undefined`.
    mockClient.current = makeClient({
      data: workflowRow({ created_by_user_id: null }),
      error: null,
    }).client;
    await expect(workflowsRepo.getById("wf-1")).rejects.toThrow(
      /workflows\.created_by_user_id: expected a value, received null/,
    );
  });
});

describe("workflows — the compare-and-swap contract is unchanged", () => {
  it("guards the draft write on id AND account AND revision token", async () => {
    const { client, calls } = makeClient({ data: workflowRow(), error: null });
    mockClient.current = client;
    await workflowsRepo.updateDraftDefinitionIfRevisionMatches({
      accountId: "acct-1",
      workflowId: "wf-1",
      draftDefinition: VALID_GRAPH as never,
      expectedUpdatedAt: "2026-08-01T00:00:00Z",
    });
    expect(calls["eq#all"]).toEqual([
      ["id", "wf-1"],
      ["account_id", "acct-1"],
      ["updated_at", "2026-08-01T00:00:00Z"],
    ]);
  });

  it("returns null (stale / cross-account / deleted) without throwing", async () => {
    mockClient.current = makeClient({ data: null, error: null }).client;
    const result = await workflowsRepo.updateDraftDefinitionIfRevisionMatches({
      accountId: "acct-1",
      workflowId: "wf-1",
      draftDefinition: VALID_GRAPH as never,
      expectedUpdatedAt: "stale-token",
    });
    expect(result).toBeNull();
  });

  it("keeps the lifecycle transition guarded on the expected from-state", async () => {
    const { client, calls } = makeClient({ data: workflowRow({ state: "active" }), error: null });
    mockClient.current = client;
    await workflowsRepo.applyTransition({
      workflowId: "wf-1",
      expectedFromState: "draft",
      toState: "active",
    });
    expect(calls["eq#all"]).toEqual([["id", "wf-1"], ["state", "draft"]]);
    expect(calls.update![0]).toEqual({ state: "active" });
  });

  it("writes ONLY the trash columns the caller supplied (undefined = untouched)", async () => {
    const { client, calls } = makeClient({ data: workflowRow(), error: null });
    mockClient.current = client;
    await workflowsRepo.applyTransition({
      workflowId: "wf-1",
      expectedFromState: "active",
      toState: "deleted",
      deletedAt: "2026-08-02T00:00:00Z",
      purgeAfter: "2026-08-09T00:00:00Z",
    });
    expect(calls.update![0]).toEqual({
      state: "deleted",
      deleted_at: "2026-08-02T00:00:00Z",
      purge_after: "2026-08-09T00:00:00Z",
    });
  });
});

// ── workflow_checkpoints.definition ──────────────────────────────────────────

describe("workflow_checkpoints — the snapshot restore reads back", () => {
  it("returns a valid snapshot unchanged and flags it valid", async () => {
    mockClient.current = makeClient({ data: checkpointRow(), error: null }).client;
    const record = await checkpointsRepo.getByIdForWorkflow("cp-1", "wf-1");
    expect(record!.definition.nodes).toHaveLength(1);
    expect(record!.definitionInvalid).toBe(false);
  });

  it.each(CORRUPT_GRAPHS)("flags %s as invalid instead of asserting a graph", async (_name, blob) => {
    mockClient.current = makeClient({
      data: checkpointRow({ definition: blob }),
      error: null,
    }).client;
    const record = await checkpointsRepo.getByIdForWorkflow("cp-1", "wf-1");
    expect(record!.definitionInvalid).toBe(true);
    expect(record!.definition).toEqual({ nodes: [], edges: [] });
  });

  it("distinguishes a genuinely EMPTY checkpoint from a corrupt one", async () => {
    // This is the distinction the old `?? {nodes:[],edges:[]}` destroyed.
    mockClient.current = makeClient({
      data: checkpointRow({ definition: { nodes: [], edges: [] } }),
      error: null,
    }).client;
    const record = await checkpointsRepo.getByIdForWorkflow("cp-1", "wf-1");
    expect(record!.definition).toEqual({ nodes: [], edges: [] });
    expect(record!.definitionInvalid).toBe(false);
  });

  it("scopes the read to the workflow, so a foreign checkpoint id is unreadable", async () => {
    const { client, calls } = makeClient({ data: null, error: null });
    mockClient.current = client;
    await checkpointsRepo.getByIdForWorkflow("cp-other", "wf-1");
    expect(calls["eq#all"]).toEqual([["id", "cp-other"], ["workflow_id", "wf-1"]]);
  });

  it("fails closed on a source outside the CHECK constraint", async () => {
    mockClient.current = makeClient({
      data: checkpointRow({ source: "smuggled" }),
      error: null,
    }).client;
    await expect(checkpointsRepo.getByIdForWorkflow("cp-1", "wf-1")).rejects.toThrow(
      /workflow_checkpoints\.source\(cp-1\): unexpected value "smuggled"/,
    );
  });

  it("does not leak the snapshot into the corruption warning", async () => {
    mockClient.current = makeClient({
      data: checkpointRow({ definition: { nodes: [{ config: { token: "leaky-secret-value" } }] } }),
      error: null,
    }).client;
    await checkpointsRepo.getByIdForWorkflow("cp-1", "wf-1");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("leaky-secret-value");
  });
});

// ── workflow_templates.definition ────────────────────────────────────────────

describe("workflow_templates — the graph a template turns into a workflow", () => {
  it("returns a valid template graph and flags it valid", async () => {
    mockClient.current = makeClient({
      data: templateRow({ definition: { nodes: [], edges: [] } }),
      error: null,
    }).client;
    const record = await templatesRepo.getTemplateByIdServiceRole("acct-1", "tpl-1");
    expect(record!.definitionInvalid).toBe(false);
  });

  it.each([
    ["a bare string", "definition"],
    ["nodes of the wrong type", { nodes: "nope", edges: [] }],
    ["an unknown top-level key (strict schema)", { nodes: [], edges: [], sneaky: true }],
  ])("flags %s invalid rather than applying it", async (_name, blob) => {
    mockClient.current = makeClient({
      data: templateRow({ definition: blob }),
      error: null,
    }).client;
    const record = await templatesRepo.getTemplateByIdServiceRole("acct-1", "tpl-1");
    expect(record!.definitionInvalid).toBe(true);
    expect(record!.definition).toEqual({ nodes: [], edges: [] });
  });

  it.each([
    ["source", { source: "smuggled" }, /workflow_templates\.source\(tpl-1\)/],
    ["visibility", { visibility: "world-readable" }, /workflow_templates\.visibility\(tpl-1\)/],
  ])("fails closed on an out-of-constraint %s", async (_name, over, pattern) => {
    mockClient.current = makeClient({ data: templateRow(over), error: null }).client;
    await expect(
      templatesRepo.getTemplateByIdServiceRole("acct-1", "tpl-1"),
    ).rejects.toThrow(pattern);
  });

  it("keeps the marketplace projection free of tenant identity", async () => {
    // MARKETPLACE_COLUMNS omits account_id / created_by_user_id; the summary
    // must not carry them even if a row somehow did.
    const { client, calls } = makeClient({ data: [templateRow()], error: null });
    mockClient.current = client;
    const [summary] = await templatesRepo.listMarketplaceTemplatesServiceRole();
    const projection = String(calls.select![0]);
    expect(projection).not.toContain("account_id");
    expect(projection).not.toContain("created_by_user_id");
    expect(Object.keys(summary!)).not.toContain("accountId");
    expect(Object.keys(summary!)).not.toContain("createdByUserId");
  });
});

// ── workflow_folders ─────────────────────────────────────────────────────────

describe("workflow_folders — a null parent is ROOT, not a fallback", () => {
  function folderRow(over: Record<string, unknown> = {}) {
    return {
      id: "f-1",
      account_id: "acct-1",
      parent_folder_id: null,
      name: "Marketing",
      position: 0,
      created_by_user_id: "user-1",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
      deleted_at: null,
      deleted_by_user_id: null,
      purge_after: null,
      deleted_from_parent_folder_id: null,
      delete_operation_id: null,
      ...over,
    };
  }

  it("preserves a null parent rather than substituting one", async () => {
    mockClient.current = makeClient({ data: folderRow(), error: null }).client;
    const record = await foldersRepo.getById("f-1");
    expect(record!.parentFolderId).toBeNull();
  });

  it("preserves a real parent id", async () => {
    mockClient.current = makeClient({
      data: folderRow({ parent_folder_id: "f-parent" }),
      error: null,
    }).client;
    expect((await foldersRepo.getById("f-1"))!.parentFolderId).toBe("f-parent");
  });

  it("moves a folder to root by writing an explicit null", async () => {
    const { client, calls } = makeClient({ data: folderRow(), error: null });
    mockClient.current = client;
    await foldersRepo.updateParentAndPosition("f-1", null, 3);
    expect(calls.update![0]).toEqual({ parent_folder_id: null, position: 3 });
  });

  it("restore clears every trash column and sets the resolved parent", async () => {
    const { client, calls } = makeClient({ data: folderRow(), error: null });
    mockClient.current = client;
    await foldersRepo.restore("f-1", null);
    expect(calls.update![0]).toEqual({
      deleted_at: null,
      deleted_by_user_id: null,
      purge_after: null,
      deleted_from_parent_folder_id: null,
      delete_operation_id: null,
      parent_folder_id: null,
    });
  });
});
