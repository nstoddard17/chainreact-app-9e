/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/fileColumns.ts` — Slice 3.MONDAY-3.
 *
 * Special focus: the V1-preserved `__item_files__` virtual sentinel.
 * Workflow authors who configured V1's `add_file` for it would break
 * if V2 dropped or renamed the sentinel — tests pin the value
 * verbatim.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { mondayFileColumnsResolver } from "@/integrations/monday/options/fileColumns";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/monday/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
  provider: "monday",
  providerAccountId: "alice@example.com",
  displayName: "Alice",
  accessTokenEncrypted: "enc:at",
  refreshTokenEncrypted: "enc:rt",
  accessTokenExpiresAt: null,
  scopes: ["boards:read", "assets:write"],
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
        userId: "user-1",
        provider: "monday",
        accountId: "alice@example.com",
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
