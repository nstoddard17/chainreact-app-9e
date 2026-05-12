/**
 * @jest-environment node
 *
 * Tests for repositories/workflowFiles.ts.
 *
 * Every call path goes through the service-role client (engine inserts,
 * cleanup deletes, nightly reconciler). The mock builder records the
 * insert payload, every chained filter, and `.select("id")` results so
 * we can assert deterministic SQL shape without touching the network.
 *
 * Storage-object access is OUT OF SCOPE for the repository. The mock
 * intentionally exposes NO `supabase.storage.*` surface; if any test
 * fails because it tried to call storage, the repository regressed.
 */

interface ChainState {
  insertPayload?: unknown;
  filters: Array<{ op: string; args: unknown[] }>;
  orderArg?: unknown;
  limitArg?: number;
  selectArgs: unknown[][];
  resultData: unknown;
  resultError: { message: string } | null;
}

function makeMockClient(state: ChainState) {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    select: jest.fn((...args: unknown[]) => {
      state.selectArgs.push(args);
      return builder;
    }),
    insert: jest.fn((payload: unknown) => {
      state.insertPayload = payload;
      return builder;
    }),
    delete: jest.fn(() => builder),
    eq: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "eq", args: [col, val] });
      return builder;
    }),
    lt: jest.fn((col: string, val: unknown) => {
      state.filters.push({ op: "lt", args: [col, val] });
      return builder;
    }),
    order: jest.fn((col: string, opts: unknown) => {
      state.orderArg = { col, opts };
      return builder;
    }),
    limit: jest.fn((n: number) => {
      state.limitArg = n;
      return builder;
    }),
    single: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    maybeSingle: jest.fn(() =>
      Promise.resolve({ data: state.resultData, error: state.resultError }),
    ),
    then: (resolve: (v: unknown) => void) =>
      resolve({ data: state.resultData, error: state.resultError }),
  });
  return {
    from: jest.fn(() => builder),
    storage: undefined as never,
    state,
  };
}

const mockServiceRole: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};
const mockSSR: { current: ReturnType<typeof makeMockClient> | null } = {
  current: null,
};
const getServiceRoleClientMock = jest.fn((_reason: string) => {
  return mockServiceRole.current;
});

jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => mockSSR.current),
}));

jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: (reason: string) => getServiceRoleClientMock(reason),
}));

import {
  deleteExpiredWorkflowFiles,
  deleteWorkflowFileById,
  deleteWorkflowFilesByRun,
  getWorkflowFileById,
  getWorkflowFileByStoragePath,
  insertWorkflowFile,
  listExpiredWorkflowFiles,
  listWorkflowFilesForRun,
} from "@/repositories/workflowFiles";

const baseRow = {
  id: "wf-file-1",
  user_id: "user-1",
  workflow_id: "wf-1",
  run_id: "run-1",
  node_id: "node-1",
  storage_path: "user-1/wf-1/run-1/node-1/report.pdf",
  file_name: "report.pdf",
  mime_type: "application/pdf",
  size_bytes: 4096,
  expires_at: "2026-05-13T00:00:00Z",
  metadata: { permalink: "https://example.com/p" },
  created_at: "2026-05-12T00:00:00Z",
  updated_at: "2026-05-12T00:00:00Z",
};

function freshState(resultData: unknown = baseRow): ChainState {
  return {
    filters: [],
    selectArgs: [],
    resultData,
    resultError: null,
  };
}

beforeEach(() => {
  getServiceRoleClientMock.mockClear();
  mockServiceRole.current = null;
  mockSSR.current = null;
});

describe("insertWorkflowFile", () => {
  it("inserts the canonical fields and returns the new row", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await insertWorkflowFile({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      storagePath: "user-1/wf-1/run-1/node-1/report.pdf",
      fileName: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4096,
      metadata: { permalink: "https://example.com/p" },
    });
    expect(result.id).toBe("wf-file-1");
    expect(result.storagePath).toBe("user-1/wf-1/run-1/node-1/report.pdf");
    expect(result.metadata).toEqual({ permalink: "https://example.com/p" });
    expect(state.insertPayload).toEqual({
      user_id: "user-1",
      workflow_id: "wf-1",
      run_id: "run-1",
      node_id: "node-1",
      storage_path: "user-1/wf-1/run-1/node-1/report.pdf",
      file_name: "report.pdf",
      mime_type: "application/pdf",
      size_bytes: 4096,
      metadata: { permalink: "https://example.com/p" },
    });
  });

  it("defaults sizeBytes to null and metadata to {} when omitted", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    await insertWorkflowFile({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      storagePath: "user-1/wf-1/run-1/node-1/x.txt",
      fileName: "x.txt",
      mimeType: "text/plain",
    });
    expect(state.insertPayload).toMatchObject({
      size_bytes: null,
      metadata: {},
    });
  });

  it("only includes expires_at in the payload when explicitly supplied (DB default applies otherwise)", async () => {
    const stateA = freshState(baseRow);
    mockServiceRole.current = makeMockClient(stateA);
    await insertWorkflowFile({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      storagePath: "p/a",
      fileName: "a.txt",
      mimeType: "text/plain",
    });
    expect(stateA.insertPayload).not.toHaveProperty("expires_at");

    const stateB = freshState(baseRow);
    mockServiceRole.current = makeMockClient(stateB);
    await insertWorkflowFile({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      storagePath: "p/b",
      fileName: "b.txt",
      mimeType: "text/plain",
      expiresAt: "2026-05-14T12:00:00Z",
    });
    expect(stateB.insertPayload).toMatchObject({
      expires_at: "2026-05-14T12:00:00Z",
    });
  });

  it("throws on Supabase insert error (duplicate storage_path surfaces verbatim)", async () => {
    const state: ChainState = {
      filters: [],
      selectArgs: [],
      resultData: null,
      resultError: {
        message: "duplicate key value violates unique constraint",
      },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(
      insertWorkflowFile({
        userId: "user-1",
        workflowId: "wf-1",
        runId: "run-1",
        nodeId: "node-1",
        storagePath: "p/dup",
        fileName: "dup.txt",
        mimeType: "text/plain",
      }),
    ).rejects.toThrow(/duplicate key/);
  });

  it("uses the service-role client (engine path, no user session)", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    await insertWorkflowFile({
      userId: "user-1",
      workflowId: "wf-1",
      runId: "run-1",
      nodeId: "node-1",
      storagePath: "p/c",
      fileName: "c.txt",
      mimeType: "text/plain",
    });
    expect(getServiceRoleClientMock).toHaveBeenCalled();
  });
});

describe("getWorkflowFileById", () => {
  it("returns the row when found", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await getWorkflowFileById("wf-file-1");
    expect(result?.id).toBe("wf-file-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "wf-file-1"] });
  });

  it("returns null when no row matches", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const result = await getWorkflowFileById("missing");
    expect(result).toBeNull();
  });
});

describe("getWorkflowFileByStoragePath", () => {
  it("filters by storage_path and uses maybeSingle (unique lookup)", async () => {
    const state = freshState(baseRow);
    mockServiceRole.current = makeMockClient(state);
    const result = await getWorkflowFileByStoragePath(
      "user-1/wf-1/run-1/node-1/report.pdf",
    );
    expect(result?.id).toBe("wf-file-1");
    expect(state.filters).toContainEqual({
      op: "eq",
      args: ["storage_path", "user-1/wf-1/run-1/node-1/report.pdf"],
    });
  });

  it("returns null on no match (storage_path is unique so multi-row is impossible)", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const result = await getWorkflowFileByStoragePath("does/not/exist");
    expect(result).toBeNull();
  });
});

describe("listWorkflowFilesForRun", () => {
  it("filters by run_id and returns every row", async () => {
    const rows = [
      baseRow,
      { ...baseRow, id: "wf-file-2", node_id: "node-2", storage_path: "p2" },
    ];
    const state = freshState(rows);
    mockServiceRole.current = makeMockClient(state);
    const result = await listWorkflowFilesForRun("run-1");
    expect(result.map((r) => r.id)).toEqual(["wf-file-1", "wf-file-2"]);
    expect(state.filters).toContainEqual({ op: "eq", args: ["run_id", "run-1"] });
  });

  it("returns an empty array when no files exist for the run", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listWorkflowFilesForRun("run-empty");
    expect(result).toEqual([]);
  });
});

describe("listExpiredWorkflowFiles", () => {
  it("filters by expires_at < now with default limit 500 and ascending order", async () => {
    const state = freshState([baseRow]);
    mockServiceRole.current = makeMockClient(state);
    const result = await listExpiredWorkflowFiles({
      now: "2026-05-12T01:00:00Z",
    });
    expect(result).toHaveLength(1);
    expect(state.filters).toContainEqual({
      op: "lt",
      args: ["expires_at", "2026-05-12T01:00:00Z"],
    });
    expect(state.orderArg).toEqual({
      col: "expires_at",
      opts: { ascending: true },
    });
    expect(state.limitArg).toBe(500);
  });

  it("caps the limit at 5000 even when the caller asks for more", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    await listExpiredWorkflowFiles({
      now: "2026-05-12T01:00:00Z",
      limit: 99_999,
    });
    expect(state.limitArg).toBe(5000);
  });

  it("uses wall-clock time when no `now` is supplied", async () => {
    const state = freshState([]);
    mockServiceRole.current = makeMockClient(state);
    await listExpiredWorkflowFiles();
    const ltFilter = state.filters.find((f) => f.op === "lt");
    expect(ltFilter).toBeDefined();
    const cutoff = ltFilter?.args[1] as string;
    expect(typeof cutoff).toBe("string");
    expect(Number.isNaN(Date.parse(cutoff))).toBe(false);
  });
});

describe("deleteWorkflowFileById", () => {
  it("deletes by id", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    await deleteWorkflowFileById("wf-file-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["id", "wf-file-1"] });
  });
});

describe("deleteWorkflowFilesByRun", () => {
  it("deletes every row tied to the run id", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    await deleteWorkflowFilesByRun("run-1");
    expect(state.filters).toContainEqual({ op: "eq", args: ["run_id", "run-1"] });
  });

  it("propagates Supabase delete errors", async () => {
    const state: ChainState = {
      filters: [],
      selectArgs: [],
      resultData: null,
      resultError: { message: "permission denied" },
    };
    mockServiceRole.current = makeMockClient(state);
    await expect(deleteWorkflowFilesByRun("run-1")).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("deleteExpiredWorkflowFiles", () => {
  it("deletes WHERE expires_at < now and returns the deleted count", async () => {
    const state = freshState([{ id: "a" }, { id: "b" }, { id: "c" }]);
    mockServiceRole.current = makeMockClient(state);
    const count = await deleteExpiredWorkflowFiles({
      now: "2026-05-12T01:00:00Z",
    });
    expect(count).toBe(3);
    expect(state.filters).toContainEqual({
      op: "lt",
      args: ["expires_at", "2026-05-12T01:00:00Z"],
    });
    // Asks for the row ids so we can count them. Without this select
    // Supabase returns null and the count would always be 0.
    expect(state.selectArgs).toContainEqual(["id"]);
  });

  it("returns 0 when no rows matched (defensive null guard on data)", async () => {
    const state = freshState(null);
    mockServiceRole.current = makeMockClient(state);
    const count = await deleteExpiredWorkflowFiles({
      now: "2026-05-12T01:00:00Z",
    });
    expect(count).toBe(0);
  });
});

describe("storage isolation invariant", () => {
  it("every repo path routes through `from(\"workflow_files\")` — never through supabase.storage.*", async () => {
    // Use empty-array result so list/delete return cleanly without
    // throwing; insert/get use maybeSingle so null is also safe.
    const state: ChainState = {
      filters: [],
      selectArgs: [],
      resultData: [],
      resultError: null,
    };
    mockServiceRole.current = makeMockClient(state);

    // Exercise every read + delete path. (Insert needs a row back, so
    // we cover it with its own dedicated tests above; the invariant
    // here is about *surface*: nothing reaches into supabase.storage.)
    await getWorkflowFileById("x");
    await getWorkflowFileByStoragePath("u/w/r/n/x.txt");
    await listWorkflowFilesForRun("r");
    await listExpiredWorkflowFiles({ now: "2026-05-12T00:00:00Z" });
    await deleteWorkflowFileById("x");
    await deleteWorkflowFilesByRun("r");
    await deleteExpiredWorkflowFiles({ now: "2026-05-12T00:00:00Z" });

    // Every call goes through the metadata table — storage access would
    // use the `supabase.storage` API instead of `supabase.from()`.
    const fromCalls = mockServiceRole.current?.from as unknown as jest.Mock;
    expect(fromCalls).toHaveBeenCalled();
    for (const call of fromCalls.mock.calls) {
      expect(call[0]).toBe("workflow_files");
    }
    // Defense-in-depth: the mock client has `storage: undefined as never`.
    // If the repo started reaching for storage it would TypeError on a
    // property of `undefined`. Verified by the absence of any `.storage`
    // surface on the mock builder.
    expect((mockServiceRole.current as unknown as Record<string, unknown>).storage)
      .toBeUndefined();
  });
});
