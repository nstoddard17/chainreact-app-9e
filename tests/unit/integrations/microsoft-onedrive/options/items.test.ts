/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-onedrive/options/items.ts` — Slice
 * 4.ONEDRIVE-META-2. Depends on `parentItemId`; lists files + folders of a
 * chosen folder; value = opaque DriveItem id; deleted/no-access parent →
 * empty items; NO download URL / file content surfaced.
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

import { microsoftOneDriveItemsResolver } from "@/integrations/microsoft-onedrive/options/items";
import { PAGE_SIZE } from "@/integrations/microsoft-onedrive/options/_shared";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { parentItemId: "parent-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockDriveItemsList.mockReset();
  mockRefreshAndRetry.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (input: { apiCall: (t: string) => Promise<unknown> }) =>
      input.apiCall("test-access-token"),
  );
});

describe("microsoftOneDriveItemsResolver — shape", () => {
  it("declares requiredDeps=['parentItemId'] (schema-verbatim) and requires an integration", () => {
    expect(microsoftOneDriveItemsResolver.source).toBe("microsoft-onedrive:items");
    expect(microsoftOneDriveItemsResolver.provider).toBe("microsoft-onedrive");
    expect(microsoftOneDriveItemsResolver.requiresIntegration).toBe(true);
    expect(microsoftOneDriveItemsResolver.requiredDeps).toEqual(["parentItemId"]);
  });
});

describe("microsoftOneDriveItemsResolver — wrapper invocation", () => {
  it("calls driveItemsList with the parentItemId + PAGE_SIZE via refreshAndRetry", async () => {
    mockDriveItemsList.mockResolvedValueOnce({ items: [], nextLink: null });
    await microsoftOneDriveItemsResolver.resolve(ctx());
    expect(mockDriveItemsList).toHaveBeenCalledWith({
      accessToken: "test-access-token",
      parentItemId: "parent-1",
      top: PAGE_SIZE,
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBe("user@example.com");
  });
});

describe("microsoftOneDriveItemsResolver — mapping (files + folders, value = id)", () => {
  it("maps folders ('Folder') and files (mimeType) preserving Graph order", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        { id: "f1", name: "Docs", folder: { childCount: 3 } },
        { id: "i1", name: "report.pdf", file: { mimeType: "application/pdf" } },
        { id: "i2", name: "blob", file: {} },
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveItemsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f1", label: "Docs", description: "Folder" },
      { value: "i1", label: "report.pdf", description: "application/pdf" },
      { value: "i2", label: "blob", description: "File" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("never surfaces @microsoft.graph.downloadUrl or file content", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        {
          id: "i1",
          name: "secret.txt",
          file: { mimeType: "text/plain" },
          "@microsoft.graph.downloadUrl":
            "https://graph.example/download?token=SECRET-DL-TOKEN",
        },
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveItemsResolver.resolve(ctx());
    expect(JSON.stringify(result.items)).not.toContain("SECRET-DL-TOKEN");
    expect(result.items).toEqual([
      { value: "i1", label: "secret.txt", description: "text/plain" },
    ]);
  });

  it("falls back to id as label when name missing; drops id-less items", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        { id: "iX", name: "", file: { mimeType: "text/plain" } },
        { name: "Ghost", file: {} },
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveItemsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "iX", label: "iX", description: "text/plain" },
    ]);
  });

  it("applies case-insensitive q filter on label", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [
        { id: "i1", name: "Budget.xlsx", file: {} },
        { id: "i2", name: "Notes.txt", file: {} },
      ],
      nextLink: null,
    });
    const result = await microsoftOneDriveItemsResolver.resolve(ctx({ q: "budget" }));
    expect(result.items.map((i) => i.value)).toEqual(["i1"]);
  });

  it("propagates hasMore from the Graph nextLink", async () => {
    mockDriveItemsList.mockResolvedValueOnce({
      items: [{ id: "i1", name: "a", file: {} }],
      nextLink: "https://graph/next",
    });
    const result = await microsoftOneDriveItemsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftOneDriveItemsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when parentItemId empty, no API call", async () => {
    await expect(
      microsoftOneDriveItemsResolver.resolve(ctx({ deps: { parentItemId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockDriveItemsList).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when parentItemId missing, no API call", async () => {
    await expect(
      microsoftOneDriveItemsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockDriveItemsList).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when the parent folder is gone (NotFoundError)", async () => {
    mockDriveItemsList.mockRejectedValueOnce(
      new NotFoundError("driveItem children for gone", "no folder"),
    );
    const result = await microsoftOneDriveItemsResolver.resolve(
      ctx({ deps: { parentItemId: "gone" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftOneDriveItemsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftOneDriveItemsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockDriveItemsList).not.toHaveBeenCalled();
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockDriveItemsList.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(microsoftOneDriveItemsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
    mockDriveItemsList.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-onedrive",
        providerAccountId: "user@example.com",
        reason: "refresh_failed",
      }),
    );
    await expect(microsoftOneDriveItemsResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or token", async () => {
    mockDriveItemsList.mockRejectedValueOnce(
      new Error('Graph failed: {"raw":"item-secret-leak"} Bearer xyz'),
    );
    let thrown: unknown;
    try {
      await microsoftOneDriveItemsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((thrown as Error).message).not.toContain("item-secret-leak");
    expect((thrown as Error).message).not.toContain("Bearer");
  });
});
