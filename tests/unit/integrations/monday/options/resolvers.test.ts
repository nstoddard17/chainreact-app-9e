/**
 * @jest-environment node
 *
 * monday options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockItemFilesGet = jest.fn();
const mockAssetsGet = jest.fn();
jest.mock("@/integrations/_shared/monday/api/itemFilesGet", () => ({
  itemFilesGet: (...args: unknown[]) => mockItemFilesGet(...args),
}));

jest.mock("@/integrations/_shared/monday/api/assetsGet", () => ({
  assetsGet: (...args: unknown[]) => mockAssetsGet(...args),
}));

import { mondayBoardsResolver } from "@/integrations/monday/options/boards";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { mondayColumnsResolver } from "@/integrations/monday/options/columns";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import { mondayFileColumnsResolver } from "@/integrations/monday/options/fileColumns";
import { mondayGroupsResolver } from "@/integrations/monday/options/groups";
import { mondayItemFilesResolver } from "@/integrations/monday/options/itemFiles";
import { mondayItemsResolver } from "@/integrations/monday/options/items";
import { mondayUsersResolver } from "@/integrations/monday/options/users";

// ---------------------------------------------------------------------------
// Merged from the former boards.test.ts
// Tests for `integrations/monday/options/boards.ts` — Slice 3.MONDAY-3.
// ---------------------------------------------------------------------------
describe("boards (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Monday)",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["me:read", "boards:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayBoardsResolver — shape", () => {
  it("declares source / provider / no deps", () => {
    expect(mondayBoardsResolver.source).toBe("monday:boards");
    expect(mondayBoardsResolver.provider).toBe("monday");
    expect(mondayBoardsResolver.requiresIntegration).toBe(true);
    expect(mondayBoardsResolver.requiredDeps).toBeUndefined();
  });
});

describe("mondayBoardsResolver — wrapper invocation", () => {
  it("pins refreshAndRetry provider='monday' + accountId from integration", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ boards: [] });
    await mondayBoardsResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0];
    expect(args.provider).toBe("monday");
    expect(args.providerAccountId).toBe("alice@example.com");
  });

  it("returns empty items when no boards", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ boards: [] });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("mondayBoardsResolver — mapping", () => {
  it("maps id → value, name → label, board_kind+updated_at → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        {
          id: "b-1",
          name: "Marketing",
          description: null,
          board_kind: "public",
          state: "active",
          updated_at: "2026-05-24T12:00:00Z",
          creator: null,
        },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "b-1",
        label: "Marketing",
        description: "public — updated 2026-05-24",
      },
    ]);
  });

  it("falls back to id when name is empty/missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        {
          id: "b-2",
          name: null,
          description: null,
          board_kind: null,
          state: null,
          updated_at: null,
          creator: null,
        },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("b-2");
    expect((result.items[0] as { description?: string }).description).toBeUndefined();
  });

  it("drops boards with missing/empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "", name: "ignored" },
        { id: "b-keep", name: "kept" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.value).toBe("b-keep");
  });

  it("sorts items alphabetically by label (case-insensitive)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "1", name: "zebra" },
        { id: "2", name: "Apple" },
        { id: "3", name: "mango" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["Apple", "mango", "zebra"]);
  });
});

describe("mondayBoardsResolver — q filter", () => {
  it("applies case-insensitive substring filter on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      boards: [
        { id: "1", name: "Marketing" },
        { id: "2", name: "Sales" },
        { id: "3", name: "Marketing 2026" },
      ],
    });
    const result = await mondayBoardsResolver.resolve(ctx({ q: "mark" }));
    expect(result.items.map((i) => i.value)).toEqual(["1", "3"]);
  });
});

describe("mondayBoardsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on IntegrationActionRequiredError", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      name: "OptionsResolverError",
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on Unauthorized401Error (defense in depth)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayBoardsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message on generic provider error", async () => {
    const secretToken = "BEARER-secret-leak-1234";
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(`Monday returned 500 with token ${secretToken} in body`),
    );
    let caught: unknown;
    try {
      await mondayBoardsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(secretToken);
    expect((caught as OptionsResolverError).message).toBe(
      "Couldn't load Monday boards. Try again.",
    );
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null (defense in depth)", async () => {
    await expect(
      mondayBoardsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former columns.test.ts
// Tests for `integrations/monday/options/columns.ts` — Slice 3.MONDAY-3.
// ---------------------------------------------------------------------------
describe("columns (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["boards:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { boardId: "b-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayColumnsResolver — shape", () => {
  it("declares requiredDeps=['boardId']", () => {
    expect(mondayColumnsResolver.source).toBe("monday:columns");
    expect(mondayColumnsResolver.provider).toBe("monday");
    expect(mondayColumnsResolver.requiresIntegration).toBe(true);
    expect(mondayColumnsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayColumnsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing", async () => {
    await expect(
      mondayColumnsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayColumnsResolver — mapping", () => {
  it("maps id → value, title → label, type → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "status", title: "Status", type: "status" },
        { id: "text", title: "Notes", type: "text" },
        { id: "person", title: "Owner", type: "person" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "status", label: "Status", description: "status" },
      { value: "text", label: "Notes", description: "text" },
      { value: "person", label: "Owner", description: "person" },
    ]);
  });

  it("falls back to id when title empty; omits description when type missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [{ id: "name", title: null, type: null }],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items[0]).toEqual({ value: "name", label: "name" });
  });

  it("preserves API-returned column order (no alphabetical re-sort)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "name", title: "Name", type: "name" },
        { id: "z_status", title: "Status", type: "status" },
        { id: "a_due", title: "Due", type: "date" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "name",
      "z_status",
      "a_due",
    ]);
  });
});

describe("mondayColumnsResolver — cascade fallback", () => {
  it("boardFound=false → empty items", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [],
      boardFound: false,
    });
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("NotFoundError → empty items", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayColumnsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "status", title: "Status", type: "status" },
        { id: "owner", title: "Owner", type: "person" },
      ],
      boardFound: true,
    });
    const result = await mondayColumnsResolver.resolve(ctx({ q: "stat" }));
    expect(result.items.map((i) => i.value)).toEqual(["status"]);
  });
});

describe("mondayColumnsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayColumnsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message", async () => {
    const leak = "leaked-token-abc";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`gql failure ${leak}`));
    let caught: unknown;
    try {
      await mondayColumnsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former fileColumns.test.ts
// Tests for `integrations/monday/options/fileColumns.ts` — Slice 3.MONDAY-3.
// Special focus: the V1-preserved `__item_files__` virtual sentinel.
// Workflow authors who configured V1's `add_file` for it would break
// if V2 dropped or renamed the sentinel — tests pin the value
// verbatim.
// ---------------------------------------------------------------------------
describe("fileColumns (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["boards:read", "assets:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { boardId: "b-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayFileColumnsResolver — shape", () => {
  it("declares requiredDeps=['boardId']", () => {
    expect(mondayFileColumnsResolver.source).toBe("monday:file_columns");
    expect(mondayFileColumnsResolver.provider).toBe("monday");
    expect(mondayFileColumnsResolver.requiresIntegration).toBe(true);
    expect(mondayFileColumnsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayFileColumnsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing", async () => {
    await expect(
      mondayFileColumnsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayFileColumnsResolver — sentinel preservation (V1 compat)", () => {
  it("always includes the __item_files__ sentinel FIRST (V1-preserved exact value)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [],
      boardFound: true,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.value).toBe("__item_files__");
    expect(result.items[0]!.label).toBe("Item files (general)");
  });

  it("sentinel value MUST be exactly '__item_files__' (V1 contract)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [{ id: "files", title: "Attachments", type: "file" }],
      boardFound: true,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    const sentinel = result.items.find((i) => i.value === "__item_files__");
    expect(sentinel).toBeDefined();
    // Defense: never renamed/normalized.
    expect(sentinel!.value).not.toBe("item_files");
    expect(sentinel!.value).not.toBe("__itemFiles__");
  });

  it("sentinel returned even when board not found (V1 fallback)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [],
      boardFound: false,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "__item_files__",
        label: "Item files (general)",
        description: "The item's built-in files area",
      },
    ]);
  });

  it("sentinel returned on NotFoundError too", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayFileColumnsResolver.resolve(ctx());
    expect(result.items[0]!.value).toBe("__item_files__");
  });
});

describe("mondayFileColumnsResolver — file-type filter", () => {
  it("includes sentinel + only columns with type='file'", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "files-1", title: "Attachments", type: "file" },
        { id: "status", title: "Status", type: "status" },
        { id: "files-2", title: "Docs", type: "file" },
        { id: "owner", title: "Owner", type: "person" },
      ],
      boardFound: true,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    const values = result.items.map((i) => i.value);
    expect(values).toContain("__item_files__");
    expect(values).toContain("files-1");
    expect(values).toContain("files-2");
    expect(values).not.toContain("status");
    expect(values).not.toContain("owner");
  });

  it("sentinel is FIRST, then file columns in API order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "files-1", title: "First", type: "file" },
        { id: "files-2", title: "Second", type: "file" },
      ],
      boardFound: true,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "__item_files__",
      "files-1",
      "files-2",
    ]);
  });

  it("falls back to id when title null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [{ id: "files-x", title: null, type: "file" }],
      boardFound: true,
    });
    const result = await mondayFileColumnsResolver.resolve(ctx());
    expect(result.items[1]!.label).toBe("files-x");
  });
});

describe("mondayFileColumnsResolver — q filter", () => {
  it("filter applies to sentinel + file columns together", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "files-1", title: "Attachments", type: "file" },
        { id: "files-2", title: "Receipts", type: "file" },
      ],
      boardFound: true,
    });
    // Match the sentinel label "Item files (general)".
    const result1 = await mondayFileColumnsResolver.resolve(ctx({ q: "item" }));
    expect(result1.items.map((i) => i.value)).toEqual(["__item_files__"]);

    // Match a file column label.
    mockRefreshAndRetry.mockResolvedValueOnce({
      columns: [
        { id: "files-1", title: "Attachments", type: "file" },
        { id: "files-2", title: "Receipts", type: "file" },
      ],
      boardFound: true,
    });
    const result2 = await mondayFileColumnsResolver.resolve(
      ctx({ q: "attach" }),
    );
    expect(result2.items.map((i) => i.value)).toEqual(["files-1"]);
  });
});

describe("mondayFileColumnsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayFileColumnsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayFileColumnsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR sanitized", async () => {
    const leak = "secret-token-xyz";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`failure ${leak}`));
    let caught: unknown;
    try {
      await mondayFileColumnsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former groups.test.ts
// Tests for `integrations/monday/options/groups.ts` — Slice 3.MONDAY-3.
// ---------------------------------------------------------------------------
describe("groups (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["boards:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { boardId: "b-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayGroupsResolver — shape", () => {
  it("declares requiredDeps=['boardId'] (V1-preserved camelCase)", () => {
    expect(mondayGroupsResolver.source).toBe("monday:groups");
    expect(mondayGroupsResolver.provider).toBe("monday");
    expect(mondayGroupsResolver.requiresIntegration).toBe(true);
    expect(mondayGroupsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayGroupsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing (defense in depth)", async () => {
    await expect(
      mondayGroupsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });

  it("MISSING_DEPENDENCY when boardId empty string", async () => {
    await expect(
      mondayGroupsResolver.resolve(ctx({ deps: { boardId: "" } })),
    ).rejects.toMatchObject({
      code: "MISSING_DEPENDENCY",
    });
  });
});

describe("mondayGroupsResolver — wrapper invocation", () => {
  it("threads boardId into the groupsList call", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [],
      boardFound: true,
    });
    await mondayGroupsResolver.resolve(ctx({ deps: { boardId: "board-42" } }));
    // The wrapper apiCall receives boardId — assert via refreshAndRetry arg.
    expect(mockRefreshAndRetry.mock.calls[0]![0].provider).toBe("monday");
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@example.com",
    );
  });
});

describe("mondayGroupsResolver — mapping + sort", () => {
  it("maps id → value, title → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "g-1", title: "Backlog" },
        { id: "g-2", title: "Done" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "g-1", label: "Backlog" },
      { value: "g-2", label: "Done" },
    ]);
  });

  it("falls back to id when title null/empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [{ id: "g-x", title: null }],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("g-x");
  });

  it("drops groups with empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "", title: "ignored" },
        { id: "g-keep", title: "kept" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
  });

  it("sorts alphabetically by label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "1", title: "Zeta" },
        { id: "2", title: "alpha" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["alpha", "Zeta"]);
  });
});

describe("mondayGroupsResolver — cascade fallback", () => {
  it("boardFound=false → empty items (not throw)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [],
      boardFound: false,
    });
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it("NotFoundError → empty items (cascade safety)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayGroupsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayGroupsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [
        { id: "1", title: "Backlog" },
        { id: "2", title: "Done" },
        { id: "3", title: "In Backup" },
      ],
      boardFound: true,
    });
    const result = await mondayGroupsResolver.resolve(ctx({ q: "back" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["1", "3"]);
  });
});

describe("mondayGroupsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayGroupsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayGroupsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message on generic provider error", async () => {
    const leak = "secret-RT-12345";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`oops ${leak}`));
    let caught: unknown;
    try {
      await mondayGroupsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former itemFiles.test.ts
// Tests for `integrations/monday/options/itemFiles.ts` — Slice 3.MONDAY-5.
// ---------------------------------------------------------------------------
describe("itemFiles (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["assets:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { itemId: "i-1", columnId: "__item_files__" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockItemFilesGet.mockReset();
  mockAssetsGet.mockReset();
  // Default: refreshAndRetry invokes the apiCall with a token.
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("mondayItemFilesResolver — shape", () => {
  it("declares requiredDeps=['itemId','columnId'] (camelCase, V1-preserved)", () => {
    expect(mondayItemFilesResolver.source).toBe("monday:item_files");
    expect(mondayItemFilesResolver.provider).toBe("monday");
    expect(mondayItemFilesResolver.requiresIntegration).toBe(true);
    expect(mondayItemFilesResolver.requiredDeps).toEqual(["itemId", "columnId"]);
  });
});

describe("mondayItemFilesResolver — required deps", () => {
  it("MISSING_DEPENDENCY when itemId missing", async () => {
    await expect(
      mondayItemFilesResolver.resolve(ctx({ deps: { columnId: "x" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("MISSING_DEPENDENCY when columnId missing", async () => {
    await expect(
      mondayItemFilesResolver.resolve(ctx({ deps: { itemId: "i" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayItemFilesResolver — __item_files__ sentinel", () => {
  it("lists item assets + update assets; maps id→value, name→label, extension→description", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "doc.pdf",
          url: "https://auth-bound",
          public_url: "https://public",
          file_size: 100,
          file_extension: "pdf",
        },
      ],
      updateAssets: [
        {
          id: "a-2",
          name: "note.txt",
          url: null,
          public_url: "https://public2",
          file_size: 10,
          file_extension: "txt",
        },
      ],
      columnValues: [],
    });
    const result = await mondayItemFilesResolver.resolve(ctx());
    expect(mockAssetsGet).not.toHaveBeenCalled();
    expect(result.items).toEqual([
      { value: "a-1", label: "doc.pdf", description: "pdf" },
      { value: "a-2", label: "note.txt", description: "txt" },
    ]);
  });

  it("never surfaces asset URLs in the option items", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "doc.pdf",
          url: "https://secret-auth-url",
          public_url: "https://secret-public-url",
          file_size: 100,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [],
    });
    const result = await mondayItemFilesResolver.resolve(ctx());
    const json = JSON.stringify(result.items);
    expect(json).not.toContain("secret-auth-url");
    expect(json).not.toContain("secret-public-url");
  });
});

describe("mondayItemFilesResolver — specific file column", () => {
  it("parses the column file value + resolves assetIds via assetsGet", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [],
      updateAssets: [],
      columnValues: [
        {
          id: "files_col",
          type: "file",
          value: JSON.stringify({ files: [{ assetId: "a-9" }] }),
        },
      ],
    });
    mockAssetsGet.mockResolvedValueOnce([
      {
        id: "a-9",
        name: "fromcol.pdf",
        url: null,
        public_url: "https://x",
        file_size: 5,
        file_extension: "pdf",
      },
    ]);
    const result = await mondayItemFilesResolver.resolve(
      ctx({ deps: { itemId: "i-1", columnId: "files_col" } }),
    );
    expect(mockAssetsGet.mock.calls[0]![0].assetIds).toEqual(["a-9"]);
    expect(result.items[0]!.value).toBe("a-9");
  });

  it("falls back to item assets when the column has no parseable files", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        {
          id: "a-1",
          name: "fallback.pdf",
          url: null,
          public_url: "https://x",
          file_size: null,
          file_extension: "pdf",
        },
      ],
      updateAssets: [],
      columnValues: [{ id: "files_col", type: "file", value: null }],
    });
    const result = await mondayItemFilesResolver.resolve(
      ctx({ deps: { itemId: "i-1", columnId: "files_col" } }),
    );
    expect(mockAssetsGet).not.toHaveBeenCalled();
    expect(result.items[0]!.value).toBe("a-1");
  });
});

describe("mondayItemFilesResolver — cascade fallback + q filter", () => {
  it("itemFilesGet null → empty items (parent gone)", async () => {
    mockItemFilesGet.mockResolvedValueOnce(null);
    const result = await mondayItemFilesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("NotFoundError → empty items", async () => {
    mockRefreshAndRetry.mockImplementationOnce(async () => {
      throw new NotFoundError("item");
    });
    const result = await mondayItemFilesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("case-insensitive substring filter on label", async () => {
    mockItemFilesGet.mockResolvedValueOnce({
      itemId: "i-1",
      itemName: "Item",
      assets: [
        { id: "a-1", name: "report.pdf", url: null, public_url: "x", file_size: null, file_extension: "pdf" },
        { id: "a-2", name: "image.png", url: null, public_url: "x", file_size: null, file_extension: "png" },
      ],
      updateAssets: [],
      columnValues: [],
    });
    const result = await mondayItemFilesResolver.resolve(ctx({ q: "report" }));
    expect(result.items.map((i) => i.value)).toEqual(["a-1"]);
  });
});

describe("mondayItemFilesResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockRefreshAndRetry.mockImplementationOnce(async () => {
      throw new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      });
    });
    await expect(mondayItemFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockImplementationOnce(async () => {
      throw new Unauthorized401Error("401");
    });
    await expect(mondayItemFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with sanitized message", async () => {
    const leak = "secret-token-xyz";
    mockRefreshAndRetry.mockImplementationOnce(async () => {
      throw new Error(`gql failure ${leak}`);
    });
    let caught: unknown;
    try {
      await mondayItemFilesResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mondayItemFilesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former items.test.ts
// Tests for `integrations/monday/options/items.ts` — Slice 3.MONDAY-3.
// ---------------------------------------------------------------------------
describe("items (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["boards:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { boardId: "b-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayItemsResolver — shape", () => {
  it("declares requiredDeps=['boardId']", () => {
    expect(mondayItemsResolver.source).toBe("monday:items");
    expect(mondayItemsResolver.provider).toBe("monday");
    expect(mondayItemsResolver.requiresIntegration).toBe(true);
    expect(mondayItemsResolver.requiredDeps).toEqual(["boardId"]);
  });
});

describe("mondayItemsResolver — required deps", () => {
  it("MISSING_DEPENDENCY when boardId missing", async () => {
    await expect(
      mondayItemsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });
});

describe("mondayItemsResolver — mapping + pagination", () => {
  it("maps id → value, name → label; preserves API order", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "i-1", name: "Z task" },
        { id: "i-2", name: "A task" },
      ],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["i-1", "i-2"]);
  });

  it("hasMore=true when cursor present", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [{ id: "i-1", name: "x" }],
      cursor: "next-page",
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("hasMore=false when cursor null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when name null/empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [{ id: "i-x", name: null }],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items[0]!.label).toBe("i-x");
  });
});

describe("mondayItemsResolver — cascade fallback", () => {
  it("boardFound=false → empty items", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [],
      cursor: null,
      boardFound: false,
    });
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("NotFoundError → empty items", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("board"));
    const result = await mondayItemsResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("mondayItemsResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      items: [
        { id: "1", name: "Bug fix" },
        { id: "2", name: "Feature request" },
        { id: "3", name: "Bug investigation" },
      ],
      cursor: null,
      boardFound: true,
    });
    const result = await mondayItemsResolver.resolve(ctx({ q: "bug" }));
    expect(result.items.map((i) => i.value).sort()).toEqual(["1", "3"]);
  });
});

describe("mondayItemsResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayItemsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR sanitized", async () => {
    const leak = "secret-RT";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`err ${leak}`));
    let caught: unknown;
    try {
      await mondayItemsResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former users.test.ts
// Tests for `integrations/monday/options/users.ts` — Slice 3.MONDAY-3.
// ---------------------------------------------------------------------------
describe("users (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["users:read"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-24T00:00:00Z",
  updatedAt: "2026-05-24T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("mondayUsersResolver — shape", () => {
  it("declares no deps; account-scoped", () => {
    expect(mondayUsersResolver.source).toBe("monday:users");
    expect(mondayUsersResolver.provider).toBe("monday");
    expect(mondayUsersResolver.requiresIntegration).toBe(true);
    expect(mondayUsersResolver.requiredDeps).toBeUndefined();
  });
});

describe("mondayUsersResolver — wrapper invocation", () => {
  it("pins refreshAndRetry provider='monday' + accountId from integration", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ users: [] });
    await mondayUsersResolver.resolve(ctx());
    const args = mockRefreshAndRetry.mock.calls[0]![0];
    expect(args.provider).toBe("monday");
    expect(args.providerAccountId).toBe("alice@example.com");
  });

  it("returns empty items when no users", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ users: [] });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("mondayUsersResolver — mapping + sort", () => {
  it("maps id → value, name → label, email → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "u-1",
          name: "Alice",
          email: "alice@x.com",
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items[0]).toEqual({
      value: "u-1",
      label: "Alice",
      description: "alice@x.com",
    });
  });

  it("label falls back to email when name missing; description omitted when email missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "u-2",
          name: null,
          email: "bob@x.com",
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "u-3",
          name: null,
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    // Sorted alphabetically — bob@x.com comes before u-3.
    const byValue = Object.fromEntries(
      result.items.map((i) => [i.value, i]),
    );
    expect(byValue["u-2"]!.label).toBe("bob@x.com");
    expect(byValue["u-2"]!.description).toBe("bob@x.com");
    expect(byValue["u-3"]!.label).toBe("u-3");
    expect(
      (byValue["u-3"] as { description?: string }).description,
    ).toBeUndefined();
  });

  it("drops users with empty id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "",
          name: "ignored",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "u-keep",
          name: "Kept",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items).toHaveLength(1);
  });

  it("sorts items alphabetically by label (case-insensitive)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "1",
          name: "zebra",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "2",
          name: "Apple",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual(["Apple", "zebra"]);
  });
});

describe("mondayUsersResolver — q filter", () => {
  it("case-insensitive substring on label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      users: [
        {
          id: "1",
          name: "Alice Smith",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
        {
          id: "2",
          name: "Bob Jones",
          email: null,
          title: null,
          photo_original: null,
          enabled: true,
          created_at: null,
        },
      ],
    });
    const result = await mondayUsersResolver.resolve(ctx({ q: "alice" }));
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("mondayUsersResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "monday",
        providerAccountId: "alice@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(mondayUsersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(mondayUsersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR sanitized", async () => {
    const leak = "BEARER-xyz";
    mockRefreshAndRetry.mockRejectedValueOnce(new Error(`oops ${leak}`));
    let caught: unknown;
    try {
      await mondayUsersResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });

  it("INTEGRATION_DISCONNECTED when ctx.integration is null", async () => {
    await expect(
      mondayUsersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

});
