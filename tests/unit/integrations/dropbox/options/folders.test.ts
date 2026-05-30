/**
 * @jest-environment node
 *
 * Tests for `integrations/dropbox/options/folders.ts` — Slice 3.DROPBOX-3.
 */
const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});
jest.mock("@/integrations/_shared/dropbox/api/filesListFolder", () => ({
  filesListFolder: (...args: unknown[]) => mockList(...args),
}));

import { dropboxFoldersResolver } from "@/integrations/dropbox/options/folders";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "dropbox",
  providerAccountId: "dbid:1",
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

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropboxFoldersResolver — shape", () => {
  it("is account-scoped with no required deps", () => {
    expect(dropboxFoldersResolver.source).toBe("dropbox:folders");
    expect(dropboxFoldersResolver.provider).toBe("dropbox");
    expect(dropboxFoldersResolver.requiresIntegration).toBe(true);
    expect(dropboxFoldersResolver.requiredDeps).toBeUndefined();
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      dropboxFoldersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("dropboxFoldersResolver — mapping", () => {
  it("lists folders recursively from root via refreshAndRetry(provider=dropbox, accountId)", async () => {
    mockList.mockResolvedValueOnce({ entries: [], cursor: "c", has_more: false });
    await dropboxFoldersResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      accountId: "dbid:1",
    });
    expect(mockList.mock.calls[0]![0]).toMatchObject({
      path: "",
      recursive: true,
    });
  });

  it("path-as-value: folders → {value: path, label: name}, Root pinned first, alpha-sorted, files excluded", async () => {
    mockList.mockResolvedValueOnce({
      entries: [
        { ".tag": "folder", id: "id:f2", name: "Beta", path_display: "/Beta" },
        { ".tag": "folder", id: "id:f1", name: "Alpha", path_display: "/Alpha" },
        { ".tag": "file", id: "id:1", name: "x.txt", path_display: "/x.txt", size: 1 },
      ],
      cursor: "c",
      has_more: false,
    });
    const result = await dropboxFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "", label: "Root" },
      { value: "/Alpha", label: "Alpha" },
      { value: "/Beta", label: "Beta" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("returns just Root when the account has no folders", async () => {
    mockList.mockResolvedValueOnce({ entries: [], cursor: "c", has_more: false });
    const result = await dropboxFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "", label: "Root" }]);
  });

  it("applies the q filter client-side (case-insensitive substring on label)", async () => {
    mockList.mockResolvedValueOnce({
      entries: [
        { ".tag": "folder", id: "id:1", name: "Reports", path_display: "/Reports" },
        { ".tag": "folder", id: "id:2", name: "Photos", path_display: "/Photos" },
      ],
      cursor: "c",
      has_more: false,
    });
    const result = await dropboxFoldersResolver.resolve(ctx({ q: "rep" }));
    expect(result.items).toEqual([{ value: "/Reports", label: "Reports" }]);
  });
});

describe("dropboxFoldersResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on IntegrationActionRequiredError", async () => {
    mockList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "dropbox",
        providerAccountId: "dbid:1",
        reason: "refresh_failed",
      }),
    );
    await expect(dropboxFoldersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on leaked Unauthorized401Error", async () => {
    mockList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(dropboxFoldersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with a sanitized message (no leak)", async () => {
    const leak = "leaked-token-xyz";
    mockList.mockRejectedValueOnce(new Error(`dropbox failure ${leak}`));
    let caught: unknown;
    try {
      await dropboxFoldersResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});
