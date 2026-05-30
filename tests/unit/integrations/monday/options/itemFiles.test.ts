/**
 * @jest-environment node
 *
 * Tests for `integrations/monday/options/itemFiles.ts` — Slice 3.MONDAY-5.
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

import { mondayItemFilesResolver } from "@/integrations/monday/options/itemFiles";
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
