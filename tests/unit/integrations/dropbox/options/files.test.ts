/**
 * @jest-environment node
 *
 * Tests for `integrations/dropbox/options/files.ts` — Slice 3.DROPBOX-3.
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

import { dropboxFilesResolver } from "@/integrations/dropbox/options/files";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/dropbox/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  userId: "user-1",
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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { folderPath: "/Folder" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("dropboxFilesResolver — shape", () => {
  it("declares requiredDeps=['folderPath'] (parent folder path; distinct from leaf file field 'path'; no synthetic folderId)", () => {
    expect(dropboxFilesResolver.source).toBe("dropbox:files");
    expect(dropboxFilesResolver.provider).toBe("dropbox");
    expect(dropboxFilesResolver.requiresIntegration).toBe(true);
    expect(dropboxFilesResolver.requiredDeps).toEqual(["folderPath"]);
  });

  it("MISSING_DEPENDENCY when folderPath dep is absent", async () => {
    await expect(
      dropboxFilesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
  });

  it("INTEGRATION_DISCONNECTED when no integration", async () => {
    await expect(
      dropboxFilesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });
});

describe("dropboxFilesResolver — mapping", () => {
  it("lists files non-recursively under the dep path via refreshAndRetry(provider=dropbox, accountId)", async () => {
    mockList.mockResolvedValueOnce({ entries: [], cursor: "c", has_more: false });
    await dropboxFilesResolver.resolve(ctx());
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "dropbox",
      accountId: "dbid:1",
    });
    expect(mockList.mock.calls[0]![0]).toMatchObject({
      path: "/Folder",
      recursive: false,
    });
  });

  it("path-as-value: files → {value: path, label: name, description}, folders excluded, alpha-sorted", async () => {
    mockList.mockResolvedValueOnce({
      entries: [
        {
          ".tag": "file",
          id: "id:2",
          name: "b.txt",
          path_display: "/Folder/b.txt",
          size: 2048,
          server_modified: "2026-05-24T10:00:00Z",
        },
        {
          ".tag": "file",
          id: "id:1",
          name: "a.txt",
          path_display: "/Folder/a.txt",
          size: 1024,
          server_modified: "2026-05-20T10:00:00Z",
        },
        { ".tag": "folder", id: "id:f", name: "Sub", path_display: "/Folder/Sub" },
      ],
      cursor: "c",
      has_more: false,
    });
    const result = await dropboxFilesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "/Folder/a.txt", label: "a.txt", description: "1.0 KB — 2026-05-20" },
      { value: "/Folder/b.txt", label: "b.txt", description: "2.0 KB — 2026-05-24" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies the q filter client-side", async () => {
    mockList.mockResolvedValueOnce({
      entries: [
        { ".tag": "file", id: "id:1", name: "invoice.pdf", path_display: "/Folder/invoice.pdf" },
        { ".tag": "file", id: "id:2", name: "photo.png", path_display: "/Folder/photo.png" },
      ],
      cursor: "c",
      has_more: false,
    });
    const result = await dropboxFilesResolver.resolve(ctx({ q: "invo" }));
    expect(result.items.map((i) => i.value)).toEqual(["/Folder/invoice.pdf"]);
  });
});

describe("dropboxFilesResolver — cascade fallback", () => {
  it("NotFoundError (deleted / missing folder) → empty items", async () => {
    mockList.mockRejectedValueOnce(new NotFoundError("dropbox resource"));
    const result = await dropboxFilesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });
});

describe("dropboxFilesResolver — error sanitization", () => {
  it("INTEGRATION_DISCONNECTED on auth errors", async () => {
    mockList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "dropbox",
        accountId: "dbid:1",
        reason: "refresh_failed",
      }),
    );
    await expect(dropboxFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("INTEGRATION_DISCONNECTED on leaked Unauthorized401Error", async () => {
    mockList.mockRejectedValueOnce(new Unauthorized401Error());
    await expect(dropboxFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("PROVIDER_ERROR with a sanitized message (no leak)", async () => {
    const leak = "leaked-token-xyz";
    mockList.mockRejectedValueOnce(new Error(`dropbox failure ${leak}`));
    let caught: unknown;
    try {
      await dropboxFilesResolver.resolve(ctx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(leak);
  });
});
