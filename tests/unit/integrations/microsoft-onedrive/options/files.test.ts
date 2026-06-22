/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onedrive/options/files.ts`.
 *
 * The flat file picker that fixes get_file discovery: lists ROOT files first,
 * then descends a bounded one level into root folders to find files. Pins:
 *   - shape (requiresIntegration, no requiredDeps — flat, no parent),
 *   - root file found (no folder descent needed),
 *   - first folder empty but a later folder has a file (the old-cascade bug),
 *   - no files anywhere → empty items (no usable object, not an error),
 *   - folders excluded (files only); no download URL surfaced,
 *   - per-folder error skipped (no false failure); root auth/error sanitized,
 *   - folder-scan budget is bounded.
 */
const mockDriveItemsList = jest.fn();
jest.mock("@/integrations/microsoft-onedrive/api/driveItemsList", () => ({
  __esModule: true,
  driveItemsList: (...args: unknown[]) => mockDriveItemsList(...args),
}));

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args) };
});

import { microsoftOneDriveFilesResolver } from "@/integrations/microsoft-onedrive/options/files";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-1",
  connectedByUserId: "user-1",
  provider: "microsoft-onedrive",
  providerAccountId: "user@example.com",
  displayName: "User OneDrive",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: null,
  scopes: ["Files.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const ctx = (o: Partial<OptionsResolverContext> = {}): OptionsResolverContext => ({
  userId: "user-1",
  integration,
  q: "",
  deps: {},
  ...o,
});

const file = (id: string, name: string, mimeType = "text/plain") => ({ id, name, file: { mimeType } });
const folder = (id: string, name: string) => ({ id, name, folder: { childCount: 0 } });
const page = (items: unknown[], nextLink: string | null = null) => ({ items, nextLink });

beforeEach(() => {
  mockDriveItemsList.mockReset();
  mockRefreshAndRetry.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) => input.apiCall("tok"),
  );
});

describe("microsoftOneDriveFilesResolver — shape", () => {
  it("is a flat picker — requires an integration, declares NO requiredDeps", () => {
    expect(microsoftOneDriveFilesResolver.source).toBe("microsoft-onedrive:files");
    expect(microsoftOneDriveFilesResolver.provider).toBe("microsoft-onedrive");
    expect(microsoftOneDriveFilesResolver.requiresIntegration).toBe(true);
    expect(microsoftOneDriveFilesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftOneDriveFilesResolver — discovery", () => {
  it("returns ROOT files directly (no folder descent when root has files)", async () => {
    mockDriveItemsList.mockResolvedValueOnce(
      page([file("f1", "a.txt", "text/plain"), folder("d1", "Docs"), file("f2", "b.pdf", "application/pdf")]),
    );
    const result = await microsoftOneDriveFilesResolver.resolve(ctx());
    expect(mockDriveItemsList).toHaveBeenCalledTimes(1); // root only — no descent
    expect(result.items).toEqual([
      { value: "f1", label: "a.txt", description: "text/plain" },
      { value: "f2", label: "b.pdf", description: "application/pdf" },
    ]);
    // Folders are excluded.
    expect(result.items.some((i) => i.value === "d1")).toBe(false);
  });

  it("descends into folders when the FIRST folder is empty but a LATER folder has a file", async () => {
    // Root: no files, two folders. First folder empty, second has a file.
    mockDriveItemsList
      .mockResolvedValueOnce(page([folder("d1", "Empty"), folder("d2", "HasFiles")]))
      .mockResolvedValueOnce(page([])) // d1 children — empty (the old-cascade trap)
      .mockResolvedValueOnce(page([file("f9", "deep.txt")])); // d2 children — a file
    const result = await microsoftOneDriveFilesResolver.resolve(ctx());
    expect(mockDriveItemsList).toHaveBeenCalledTimes(3);
    expect(result.items).toEqual([{ value: "f9", label: "deep.txt", description: "text/plain" }]);
  });

  it("returns empty items (no usable object) when no file exists at root or one level down", async () => {
    mockDriveItemsList
      .mockResolvedValueOnce(page([folder("d1", "A"), folder("d2", "B")]))
      .mockResolvedValueOnce(page([])) // d1 empty
      .mockResolvedValueOnce(page([folder("d3", "nested-only")])); // d2 has only a subfolder
    const result = await microsoftOneDriveFilesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("skips a per-folder error without a false failure (keeps scanning)", async () => {
    mockDriveItemsList
      .mockResolvedValueOnce(page([folder("d1", "Denied"), folder("d2", "Ok")]))
      .mockRejectedValueOnce(new NotFoundError("driveItem children for d1", "404")) // d1 inaccessible
      .mockResolvedValueOnce(page([file("f1", "ok.txt")])); // d2 yields a file
    const result = await microsoftOneDriveFilesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "f1", label: "ok.txt", description: "text/plain" }]);
  });

  it("maps a ROOT auth failure to a sanitized INTEGRATION_DISCONNECTED (not a FAIL)", async () => {
    mockDriveItemsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(microsoftOneDriveFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("bounds the folder scan (does not list more than the budget of folders)", async () => {
    // Root = 50 empty folders, no files. The resolver must stop well before 50.
    const folders = Array.from({ length: 50 }, (_, i) => folder(`d${i}`, `F${i}`));
    mockDriveItemsList.mockResolvedValueOnce(page(folders));
    for (let i = 0; i < 50; i++) mockDriveItemsList.mockResolvedValueOnce(page([]));
    await microsoftOneDriveFilesResolver.resolve(ctx());
    // 1 root call + at most the folder budget (12) descents.
    expect(mockDriveItemsList.mock.calls.length).toBeLessThanOrEqual(1 + 12);
  });
});
