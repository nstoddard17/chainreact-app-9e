/**
 * @jest-environment node
 *
 * dropbox/triggers trigger lifecycle contract suite — one per-trigger suite
 * consolidating the former per-lifecycle files (PROVIDER-CONTRACT-CONSOLIDATION-1E).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
const mockGetLatestCursor = jest.fn();
const mockListForDispatch = jest.fn();
const mockUpdateConfig = jest.fn();
const mockGetActive = jest.fn();
const mockListFolder = jest.fn();
const mockMarkSeen = jest.fn();
const mockGetState = jest.fn();
const mockEnqueue = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

jest.mock(
  "@/integrations/_shared/dropbox/api/filesListFolderGetLatestCursor",
  () => ({
    filesListFolderGetLatestCursor: (...args: unknown[]) =>
      mockGetLatestCursor(...args),
  }),
);

jest.mock("@/repositories/triggerResources", () => ({
  listForDispatch: (...a: unknown[]) => mockListForDispatch(...a),
  updateConfig: (...a: unknown[]) => mockUpdateConfig(...a),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...a: unknown[]) => mockGetActive(...a),
}));

jest.mock("@/repositories/workflows", () => ({
  getStateForDispatch: (...a: unknown[]) => mockGetState(...a),
}));

jest.mock("@/repositories/webhookEventDedup", () => ({
  markSeen: (...a: unknown[]) => mockMarkSeen(...a),
}));

jest.mock("@/services/execution/enqueue", () => ({
  enqueueRun: (...a: unknown[]) => mockEnqueue(...a),
}));

jest.mock("@/integrations/_shared/dropbox/api/filesListFolder", () => ({
  filesListFolder: (...a: unknown[]) => mockListFolder(...a),
}));

import { activate } from "@/integrations/dropbox/triggers/newFile/activate";
import type { ActivationContext } from "@/services/triggers/activationRegistry";
import type { IntegrationRecord } from "@/repositories/integrations";
import { buildNewFileEventId, normalizeNewFile, type DropboxFileEntry } from "@/integrations/dropbox/triggers/newFile/normalize";
import { TriggerEventSchema } from "@/contracts/triggerEvent";
import { reconcileDropboxAccounts } from "@/integrations/dropbox/triggers/newFile/reconcile";
import { DropboxConflictError } from "@/integrations/_shared/dropbox/errors";
import type { TriggerResourceRecord } from "@/repositories/triggerResources";

// ---------------------------------------------------------------------------
// Merged from the former activate.test.ts
// Tests for `integrations/dropbox/triggers/newFile/activate.ts` —
// Slice 3.DROPBOX-5. Seeds a list_folder cursor (first-poll-miss
// protection), validates the configured path, stores accountId, and does
// NO remote webhook creation.
// ---------------------------------------------------------------------------
describe("activate (lifecycle)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "dropbox",
  providerAccountId: "dbid:abc",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["files.metadata.read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(config: Record<string, unknown>): ActivationContext {
  return {
    node: {
      id: "node-1",
      kind: "trigger",
      provider: "dropbox",
      type: "new_file",
      config,
    } as unknown as ActivationContext["node"],
    integration,
    workflowId: "wf-1",
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGetLatestCursor.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetLatestCursor.mockResolvedValue({ cursor: "CURSOR_SEED" });
});

describe("dropbox new_file activate", () => {
  it("seeds snapshot {cursor, providerAccountId, capturedAt} via get_latest_cursor", async () => {
    const patch = await activate(ctx({ path: "/Reports", recursive: false }));
    expect(patch).toMatchObject({
      snapshot: { cursor: "CURSOR_SEED", providerAccountId: "dbid:abc" },
    });
    expect(typeof (patch.snapshot as { capturedAt: string }).capturedAt).toBe(
      "string",
    );
  });

  it("calls get_latest_cursor with the configured path + recursive (NO remote webhook creation)", async () => {
    await activate(ctx({ path: "/Reports", recursive: true }));
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      providerAccountId: "dbid:abc",
    });
    expect(mockGetLatestCursor.mock.calls[0]![0]).toMatchObject({
      path: "/Reports",
      recursive: true,
    });
    // Exactly one Dropbox call — get_latest_cursor — and nothing else
    // (no create_webhook; Dropbox webhooks are app-level).
    expect(mockGetLatestCursor).toHaveBeenCalledTimes(1);
  });

  it("defaults path to root ('') + recursive false when unset", async () => {
    await activate(ctx({}));
    expect(mockGetLatestCursor.mock.calls[0]![0]).toMatchObject({
      path: "",
      recursive: false,
    });
  });

  it("validates the configured path — a non-root, non-slash path aborts activation", async () => {
    await expect(activate(ctx({ path: "Reports" }))).rejects.toThrow();
    // Aborted before any Dropbox call.
    expect(mockGetLatestCursor).not.toHaveBeenCalled();
  });

  it("propagates a get_latest_cursor failure (aborts the activate transition)", async () => {
    mockGetLatestCursor.mockRejectedValueOnce(new Error("dropbox down"));
    await expect(
      activate(ctx({ path: "/Reports" })),
    ).rejects.toThrow();
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former normalize.test.ts
// Tests for `integrations/dropbox/triggers/newFile/normalize.ts` —
// Slice 3.DROPBOX-5. Canonical TriggerEvent shape + stable eventId; no
// bytes / links / tokens in the payload.
// ---------------------------------------------------------------------------
describe("normalize (lifecycle)", () => {

const fileEntry: DropboxFileEntry = {
  ".tag": "file",
  id: "id:file1",
  name: "q1.pdf",
  path_display: "/Reports/q1.pdf",
  path_lower: "/reports/q1.pdf",
  size: 2048,
  rev: "0123abc",
  client_modified: "2026-05-20T10:00:00Z",
  server_modified: "2026-05-24T10:00:00Z",
  is_downloadable: true,
};

describe("dropbox new_file normalize", () => {
  it("produces a contract-valid TriggerEvent", () => {
    const event = normalizeNewFile({ entry: fileEntry, providerAccountId: "dbid:abc" });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.provider).toBe("dropbox");
    expect(event.eventType).toBe("new_file");
    expect(event.providerAccountId).toBe("dbid:abc");
    expect(event.occurredAt).toBe("2026-05-24T10:00:00Z");
  });

  it("eventId is the stable new_file:{accountId}:{id}:{rev} identity", () => {
    expect(buildNewFileEventId("dbid:abc", fileEntry)).toBe(
      "new_file:dbid:abc:id:file1:0123abc",
    );
    expect(
      normalizeNewFile({ entry: fileEntry, providerAccountId: "dbid:abc" }).eventId,
    ).toBe("new_file:dbid:abc:id:file1:0123abc");
  });

  it("emits the canonical payload (name/path/pathLower + metadata)", () => {
    const { payload } = normalizeNewFile({
      entry: fileEntry,
      providerAccountId: "dbid:abc",
    });
    expect(payload).toEqual({
      changeKind: "new_file",
      id: "id:file1",
      name: "q1.pdf",
      path: "/Reports/q1.pdf",
      pathLower: "/reports/q1.pdf",
      rev: "0123abc",
      sizeBytes: 2048,
      clientModified: "2026-05-20T10:00:00Z",
      serverModified: "2026-05-24T10:00:00Z",
      providerAccountId: "dbid:abc",
      isDownloadable: true,
    });
  });

  it("never includes bytes / content / download or shared links", () => {
    const { payload } = normalizeNewFile({
      entry: fileEntry,
      providerAccountId: "dbid:abc",
    });
    for (const banned of [
      "content",
      "bytes",
      "base64",
      "url",
      "sharedUrl",
      "temporaryLink",
      "downloadUrl",
      "link",
    ]) {
      expect(payload).not.toHaveProperty(banned);
    }
  });

  it("null-fills missing optional fields + falls back occurredAt when no server_modified", () => {
    const minimal: DropboxFileEntry = {
      ".tag": "file",
      id: "id:x",
      name: "x.txt",
      path_display: "/x.txt",
    };
    const event = normalizeNewFile({ entry: minimal, providerAccountId: "dbid:z" });
    expect(() => TriggerEventSchema.parse(event)).not.toThrow();
    expect(event.payload.sizeBytes).toBeNull();
    expect(event.payload.isDownloadable).toBeNull();
    expect(event.payload.rev).toBeNull();
    // occurredAt falls back to receipt time (non-empty ISO string).
    expect(typeof event.occurredAt).toBe("string");
    expect(event.occurredAt.length).toBeGreaterThan(0);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former reconcile.test.ts
// Tests for `integrations/dropbox/triggers/newFile/reconcile.ts` —
// Slice 3.DROPBOX-5. Account fan-out → per-row cursor reconciliation:
// list_folder/continue delta → file-only → path filter → state-gate →
// dedup (row-scoped, fail-closed) → enqueue → advance cursor. Plus
// cursor-reset reseed (no replay), empty delta, pagination, and
// batch-resilience.
// ---------------------------------------------------------------------------
describe("reconcile (lifecycle)", () => {

function row(overrides: Partial<TriggerResourceRecord> = {}): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "user-1",
    provider: "dropbox",
    eventType: "new_file",
    nodeId: "node-1",
    config: {
      path: "/Reports",
      recursive: false,
      snapshot: {
        cursor: "C0",
        accountId: "dbid:abc",
        capturedAt: "2026-05-24T00:00:00Z",
      },
    },
    providerAccountId: null,
    registeredAt: "2026-05-24T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-05-24T00:00:00Z",
    updatedAt: "2026-05-24T00:00:00Z",
    ...overrides,
  };
}

const integration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "dropbox",
  providerAccountId: "dbid:abc",
  displayName: "Alice",
  accessTokenEncrypted: "enc",
  refreshTokenEncrypted: "enc",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function fileEntry(path: string, id = "id:1", rev = "r1") {
  return {
    ".tag": "file",
    id,
    name: path.split("/").pop(),
    path_display: path,
    path_lower: path.toLowerCase(),
    size: 10,
    rev,
    server_modified: "2026-05-24T10:00:00Z",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListForDispatch.mockResolvedValue([row()]);
  mockGetActive.mockResolvedValue(integration);
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockListFolder.mockResolvedValue({
    entries: [fileEntry("/Reports/q1.pdf")],
    cursor: "C1",
    has_more: false,
  });
  mockGetLatestCursor.mockResolvedValue({ cursor: "CRESET" });
  mockMarkSeen.mockResolvedValue({ fresh: true });
  mockGetState.mockResolvedValue("active");
  mockEnqueue.mockResolvedValue(undefined);
});

describe("reconcileDropboxAccounts — fan-out + happy path", () => {
  it("empty account list is a no-op (no DB lookup)", async () => {
    const r = await reconcileDropboxAccounts([]);
    expect(r).toEqual({ reconciled: 0, dispatched: 0 });
    expect(mockListForDispatch).not.toHaveBeenCalled();
  });

  it("reconciles a row whose stored account is in the changed set + continues from the stored cursor", async () => {
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockListForDispatch).toHaveBeenCalledWith("dropbox", "new_file");
    // Integration lookup is ACCOUNT-scoped (workflowAccountId), never the
    // connecting user's id — integrations are account-owned post-cutover.
    expect(mockGetActive).toHaveBeenCalledWith("acct-1", "dropbox", null);
    expect(mockListFolder.mock.calls[0]![0]).toMatchObject({ cursor: "C0" });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue.mock.calls[0]![0]).toMatchObject({
      workflowId: "wf-1",
      triggerNodeId: "node-1",
    });
    expect(mockEnqueue.mock.calls[0]![0].event).toMatchObject({
      provider: "dropbox",
      eventType: "new_file",
    });
    expect(r).toEqual({ reconciled: 1, dispatched: 1 });
  });

  it("advances the cursor to the delta's final cursor", async () => {
    await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    const [id, config] = mockUpdateConfig.mock.calls[0]!;
    expect(id).toBe("tr-1");
    expect(config.snapshot.cursor).toBe("C1");
    expect(config.snapshot.providerAccountId).toBe("dbid:abc");
  });

  it("skips rows whose stored account is NOT in the changed set", async () => {
    const r = await reconcileDropboxAccounts(["dbid:SOMEONE_ELSE"]);
    expect(mockGetActive).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(r).toEqual({ reconciled: 0, dispatched: 0 });
  });

  it("paginates has_more, dispatching across pages + storing the last cursor", async () => {
    mockListFolder
      .mockResolvedValueOnce({
        entries: [fileEntry("/Reports/a.pdf", "id:a")],
        cursor: "C1",
        has_more: true,
      })
      .mockResolvedValueOnce({
        entries: [fileEntry("/Reports/b.pdf", "id:b")],
        cursor: "C2",
        has_more: false,
      });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockUpdateConfig.mock.calls[0]![1].snapshot.cursor).toBe("C2");
    expect(r.dispatched).toBe(2);
  });
});

describe("reconcileDropboxAccounts — delta filtering", () => {
  it("ignores folders and deleted entries", async () => {
    mockListFolder.mockResolvedValueOnce({
      entries: [
        { ".tag": "folder", id: "id:f", name: "Sub", path_display: "/Reports/Sub" },
        { ".tag": "deleted", name: "old.pdf", path_display: "/Reports/old.pdf", path_lower: "/reports/old.pdf" },
        fileEntry("/Reports/new.pdf"),
      ],
      cursor: "C1",
      has_more: false,
    });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(r.dispatched).toBe(1);
  });

  it("filters out files outside the configured path (defensive scope check)", async () => {
    mockListFolder.mockResolvedValueOnce({
      entries: [fileEntry("/Other/x.pdf")],
      cursor: "C1",
      has_more: false,
    });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    // Cursor still advances even when nothing matched.
    expect(mockUpdateConfig.mock.calls[0]![1].snapshot.cursor).toBe("C1");
    expect(r.dispatched).toBe(0);
  });

  it("root path ('') matches every file", async () => {
    mockListForDispatch.mockResolvedValue([
      row({ config: { path: "", recursive: true, snapshot: { cursor: "C0", accountId: "dbid:abc", capturedAt: "t" } } }),
    ]);
    mockListFolder.mockResolvedValueOnce({
      entries: [fileEntry("/anywhere/deep/x.pdf")],
      cursor: "C1",
      has_more: false,
    });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(r.dispatched).toBe(1);
  });

  it("empty delta dispatches nothing but still advances the cursor", async () => {
    mockListFolder.mockResolvedValueOnce({ entries: [], cursor: "C1", has_more: false });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig.mock.calls[0]![1].snapshot.cursor).toBe("C1");
    expect(r).toEqual({ reconciled: 1, dispatched: 0 });
  });
});

describe("reconcileDropboxAccounts — cursor reset (no replay)", () => {
  it("on a 'reset' conflict, re-seeds via get_latest_cursor and dispatches nothing", async () => {
    mockListFolder.mockRejectedValueOnce(new DropboxConflictError("reset/."));
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockGetLatestCursor.mock.calls[0]![0]).toMatchObject({
      path: "/Reports",
      recursive: false,
    });
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig.mock.calls[0]![1].snapshot.cursor).toBe("CRESET");
    expect(r).toEqual({ reconciled: 1, dispatched: 0 });
  });
});

describe("reconcileDropboxAccounts — dedup + state gate", () => {
  it("does not enqueue when the file was already seen (dedup not fresh)", async () => {
    mockMarkSeen.mockResolvedValue({ fresh: false });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(r.dispatched).toBe(0);
  });

  it("uses a ROW-scoped dedup key so two workflows on the same folder both fire", async () => {
    mockListForDispatch.mockResolvedValue([
      row({ id: "tr-1", workflowId: "wf-1", nodeId: "n-1" }),
      row({ id: "tr-2", workflowId: "wf-2", nodeId: "n-2" }),
    ]);
    await reconcileDropboxAccounts(["dbid:abc"]);
    // Two distinct dedup keys (one per row) — neither suppresses the other.
    const keys = mockMarkSeen.mock.calls.map((c) => c[1]);
    expect(keys[0]).toContain("tr-1:");
    expect(keys[1]).toContain("tr-2:");
    expect(keys[0]).not.toBe(keys[1]);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("fails CLOSED on a dedup outage (skips the file, no enqueue)", async () => {
    mockMarkSeen.mockRejectedValue(new Error("dedup down"));
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(r.dispatched).toBe(0);
  });

  it("drops events for non-active workflows", async () => {
    mockGetState.mockResolvedValue("paused");
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockMarkSeen).not.toHaveBeenCalled(); // state-gate runs first
    expect(r.dispatched).toBe(0);
  });
});

describe("reconcileDropboxAccounts — resilience", () => {
  it("a no-integration row is skipped without touching the cursor", async () => {
    mockGetActive.mockResolvedValue(null);
    await reconcileDropboxAccounts(["dbid:abc"]);
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(mockUpdateConfig).not.toHaveBeenCalled();
  });

  it("a failing row does not abort the batch", async () => {
    mockListForDispatch.mockResolvedValue([
      row({ id: "tr-1", workflowId: "wf-1" }),
      row({ id: "tr-2", workflowId: "wf-2" }),
    ]);
    // First row's list_folder throws a non-reset error; second succeeds.
    mockListFolder
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        entries: [fileEntry("/Reports/ok.pdf")],
        cursor: "C1",
        has_more: false,
      });
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(r.reconciled).toBe(1);
    expect(r.dispatched).toBe(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("skips rows with un-parseable config without throwing", async () => {
    mockListForDispatch.mockResolvedValue([
      row({ config: { path: 123 } as unknown as Record<string, unknown> }),
    ]);
    const r = await reconcileDropboxAccounts(["dbid:abc"]);
    expect(r).toEqual({ reconciled: 0, dispatched: 0 });
    expect(mockGetActive).not.toHaveBeenCalled();
  });
});

});
