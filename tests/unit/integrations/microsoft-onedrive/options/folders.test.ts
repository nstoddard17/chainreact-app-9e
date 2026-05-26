/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onedrive/options/folders.ts` — Slice
 * 4.ONEDRIVE-META-2. Account-scoped ROOT folder picker (no deps).
 * Refreshable auth (refreshAndRetry). Reuses driveItemsList. value =
 * opaque DriveItem id; folders-only; alpha sorted.
 */

const mockDriveItemsList = jest.fn();
jest.mock("@/integrations/microsoft-onedrive/api/driveItemsList", () => ({
  __esModule: true,
  driveItemsList: (...args: unknown[]) => mockDriveItemsList(...args),
}));

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftOneDriveFoldersResolver } from "@/integrations/microsoft-onedrive/options/folders";
import { PAGE_SIZE } from "@/integrations/microsoft-onedrive/options/_shared";
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
  userId: "user-1",
  provider: "microsoft-onedrive",
  providerAccountId: "user@example.com",
  displayName: "User OneDrive",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-25T12:00:00Z",
  scopes: ["offline_access", "Files.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

const FOLDER = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  folder: { childCount: 0 },
  lastModifiedDateTime: "2026-05-20T10:00:00Z",
  ...extra,
});
const FILE = (id: string, name: string) => ({
  id,
  name,
  file: { mimeType: "text/plain" },
});

beforeEach(() => {
  mockDriveItemsList.mockReset();
  mockRefreshAndRetry.mockReset();
  // Pass-through: run the apiCall with a fixed token so we can assert the
  // driveItemsList invocation shape + drive results/errors via the helper.
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("test-access-token"),
  );
});

describe("microsoftOneDriveFoldersResolver — shape", () => {
  it("declares source / provider / requiresIntegration / no deps", () => {
    expect(microsoftOneDriveFoldersResolver.source).toBe("microsoft-onedrive:folders");
    expect(microsoftOneDriveFoldersResolver.provider).toBe("microsoft-onedrive");
    expect(microsoftOneDriveFoldersResolver.requiresIntegration).toBe(true);
    expect(microsoftOneDriveFoldersResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftOneDriveFoldersResolver — wrapper invocation", () => {
  it("calls driveItemsList (root, PAGE_SIZE) via refreshAndRetry pinned to providerAccountId", async () => {
    mockDriveItemsList.mockResolvedValueOnce({ items: [], nextLink: null });
    await microsoftOneDriveFoldersResolver.resolve(ctx());
    expect(mockDriveItemsList).toHaveBeenCalledWith({
      accessToken: "test-access-token",
      top: PAGE_SIZE,
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-onedrive");
    expect(args.accountId).toBe("user@example.com");
  });
});

describe("microsoftOneDriveFoldersResolver — mapping (folders only, value = id)", () => {
  it("filters to folders, maps id→value/name→label, alpha sorts, adds Modified description", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        FOLDER("f2", "Zebra"),
        FILE("file1", "ignored.txt"),
        FOLDER("f1", "Alpha"),
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f1", label: "Alpha", description: "Modified 2026-05-20" },
      { value: "f2", label: "Zebra", description: "Modified 2026-05-20" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("excludes files (only folder-faceted items survive)", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [FILE("file1", "a.txt"), FILE("file2", "b.txt")],
      nextLink: null,
    });
    const result = await microsoftOneDriveFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([]);
  });

  it("falls back to id as label when name missing; drops id-less folders", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        FOLDER("fX", "", { lastModifiedDateTime: undefined }),
        { folder: {}, name: "Ghost" },
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "fX", label: "fX" }]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [FOLDER("f1", "Reports"), FOLDER("f2", "Invoices")],
      nextLink: null,
    });
    const result = await microsoftOneDriveFoldersResolver.resolve(ctx({ q: "invoice" }));
    expect(result.items.map((i) => i.value)).toEqual(["f2"]);
  });

  it("propagates hasMore from the Graph nextLink", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [FOLDER("f1", "A")],
      nextLink: "https://graph/next",
    });
    const result = await microsoftOneDriveFoldersResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneDriveFoldersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftOneDriveFoldersResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockDriveItemsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockDriveItemsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(microsoftOneDriveFoldersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockDriveItemsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        userId: "user-1",
        provider: "microsoft-onedrive",
        accountId: "user@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(microsoftOneDriveFoldersResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockDriveItemsList.mockRejectedValueOnce(
      new Error('Graph failed: {"raw":"folder-secret-leak"} Bearer xyz'),
    );
    let thrown: unknown;
    try {
      await microsoftOneDriveFoldersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (thrown as Error).message;
    expect(msg).not.toContain("folder-secret-leak");
    expect(msg).not.toContain("Bearer");
  });
});
