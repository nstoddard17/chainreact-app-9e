/**
 * @jest-environment node
 *
 * Tests for `integrations/google-drive/options/files.ts` — CONFIG-FIELD-UX-SWEEP-2.
 *
 * Pin:
 *   - Resolver shape (source / provider / requiresIntegration / requiredDeps).
 *   - filesList invocation: pageSize 200, orderBy "modifiedTime desc", a
 *     metadata-only fields mask (id,name,mimeType — never content), and
 *     server-side `nameContains` only when q is set.
 *   - Mapping: file → {value:id, label:name}; FOLDERS excluded.
 *   - METADATA ONLY: no webContentLink / content / bytes ever requested or returned.
 *   - hasMore at the 200 page cap.
 *   - Error sanitization mirrors google-drive:folders (no token / no raw body leak).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefreshAndRetry(...a) };
});

const mockFilesList = jest.fn();
jest.mock("@/integrations/google-drive/api/filesList", () => ({
  filesList: (...a: unknown[]) => mockFilesList(...a),
}));

import { googleDriveFilesResolver } from "@/integrations/google-drive/options/files";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const FOLDER = "application/vnd.google-apps.folder";

const integration: IntegrationRecord = {
  id: "int-drive-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-drive",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Google Drive)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: ["https://www.googleapis.com/auth/drive"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-05-22T00:00:00Z",
  updatedAt: "2026-05-22T00:00:00Z",
};

function ctx(overrides: Partial<OptionsResolverContext> = {}): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesList.mockReset();
});

describe("googleDriveFilesResolver — shape + invocation", () => {
  it("declares source/provider/requiresIntegration with no deps", () => {
    expect(googleDriveFilesResolver.source).toBe("google-drive:files");
    expect(googleDriveFilesResolver.provider).toBe("google-drive");
    expect(googleDriveFilesResolver.requiresIntegration).toBe(true);
    expect(googleDriveFilesResolver.requiredDeps).toBeUndefined();
  });

  it("calls filesList with a metadata-only fields mask, modifiedTime sort, no nameContains when q empty", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"),
    );
    mockFilesList.mockResolvedValueOnce({ files: [] });
    await googleDriveFilesResolver.resolve(ctx());
    const input = mockFilesList.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.pageSize).toBe(200);
    expect(input.orderBy).toBe("modifiedTime desc");
    expect(input.fields).toBe("files(id,name,mimeType),nextPageToken");
    // Metadata only — never asks for content/bytes.
    expect(String(input.fields)).not.toMatch(/webContentLink|content|data/i);
    expect(input).not.toHaveProperty("nameContains");
  });

  it("pushes the search query server-side as nameContains", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async ({ apiCall }: { apiCall: (t: string) => Promise<unknown> }) => apiCall("tok"),
    );
    mockFilesList.mockResolvedValueOnce({ files: [] });
    await googleDriveFilesResolver.resolve(ctx({ q: "  report  " }));
    const input = mockFilesList.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.nameContains).toBe("report");
  });
});

describe("googleDriveFilesResolver — mapping", () => {
  it("maps files to {value:id, label:name} and EXCLUDES folders", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "f1", name: "Q4 Report.pdf", mimeType: "application/pdf" },
        { id: "d1", name: "A Folder", mimeType: FOLDER },
        { id: "f2", name: "Notes", mimeType: "application/vnd.google-apps.document" },
      ],
    });
    const result = await googleDriveFilesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f1", label: "Q4 Report.pdf" },
      { value: "f2", label: "Notes" },
    ]);
  });

  it("drops records lacking a string id or name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "ok", name: "Good", mimeType: "application/pdf" },
        { id: 1, name: "bad-id" },
        { id: "no-name" },
        { id: "", name: "empty" },
      ],
    });
    const result = await googleDriveFilesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "ok", label: "Good" }]);
  });

  it("hasMore:true at the 200 page cap (excluding folders from items)", async () => {
    const files = Array.from({ length: 200 }, (_, i) => ({
      id: `f-${i}`,
      name: `File ${i}`,
      mimeType: "application/pdf",
    }));
    mockRefreshAndRetry.mockResolvedValueOnce({ files });
    const result = await googleDriveFilesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(200);
  });
});

describe("googleDriveFilesResolver — error sanitization", () => {
  it("maps auth/disconnect errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("auth"));
    await expect(googleDriveFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });

  it("maps a generic provider error → PROVIDER_ERROR with no token/body leak", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('files.list failed: {"error":{"message":"bad ya29.fake-token"}}'),
    );
    let thrown: unknown;
    try {
      await googleDriveFilesResolver.resolve(ctx());
    } catch (e) {
      thrown = e;
    }
    const err = thrown as OptionsResolverError;
    expect(err.code).toBe("PROVIDER_ERROR");
    expect(err.message).not.toMatch(/ya29|files\.list/i);
    expect(err.message).toMatch(/couldn't load google drive files/i);
  });

  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null (no wrapper call)", async () => {
    await expect(
      googleDriveFilesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("also accepts IntegrationActionRequiredError as a disconnect", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "google-drive",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(googleDriveFilesResolver.resolve(ctx())).rejects.toMatchObject({
      code: "INTEGRATION_DISCONNECTED",
    });
  });
});
