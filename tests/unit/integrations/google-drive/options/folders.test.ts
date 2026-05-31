/**
 * @jest-environment node
 *
 * Tests for `integrations/google-drive/options/folders.ts` —
 * Slice 3.GDOCS-3.
 *
 * Pin:
 *   - Resolver shape (source / provider / requiresIntegration /
 *     requiredDeps).
 *   - Wrapper invocation: refreshAndRetry called with
 *     provider="google-drive", accountId=null, and a closure that
 *     calls `filesList` with the folder mimeType, pageSize=200,
 *     orderBy="name".
 *   - Mapping: Drive file → {value:id, label:name} — no description.
 *   - Empty file list returns empty items + hasMore:false.
 *   - hasMore:true when result hits the 200 page cap.
 *   - Case-insensitive client-side q filter over the label.
 *   - IntegrationActionRequiredError / leaked Unauthorized401Error →
 *     INTEGRATION_DISCONNECTED with a reconnect prompt.
 *   - Other errors → PROVIDER_ERROR with a sanitized message
 *     (no token, no raw Drive body).
 *   - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
 *   - Sort order: preserves Drive's alphabetical response order
 *     (resolver does not re-sort).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockFilesList = jest.fn();
jest.mock("@/integrations/google-drive/api/filesList", () => ({
  filesList: (...args: unknown[]) => mockFilesList(...args),
}));

import { googleDriveFoldersResolver } from "@/integrations/google-drive/options/folders";
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
  id: "int-drive-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-drive",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Google Drive)",
  accessTokenEncrypted: "enc:google-drive-token-cipher",
  refreshTokenEncrypted: "enc:google-drive-refresh-cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/userinfo.email",
  ],
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
    deps: {},
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockFilesList.mockReset();
});

describe("googleDriveFoldersResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(googleDriveFoldersResolver.source).toBe("google-drive:folders");
    expect(googleDriveFoldersResolver.provider).toBe("google-drive");
    expect(googleDriveFoldersResolver.requiresIntegration).toBe(true);
    expect(googleDriveFoldersResolver.requiredDeps).toBeUndefined();
  });
});

describe("googleDriveFoldersResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='google-drive', accountId=null, and a closure that calls filesList with the folder mimeType + orderBy=name + pageSize", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async ({
        apiCall,
      }: {
        apiCall: (token: string) => Promise<unknown>;
      }) => apiCall("test-access-token"),
    );
    mockFilesList.mockResolvedValueOnce({ files: [], nextPageToken: undefined });

    await googleDriveFoldersResolver.resolve(ctx());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0] as {
      userId: string;
      provider: string;
      accountId: string;
      providerAccountId: string | null;
      apiCall: (token: string) => Promise<unknown>;
    };
    expect(call.accountId).toBe("acct-user-1");
    expect(call.provider).toBe("google-drive");
    expect(call.providerAccountId).toBeNull();
    expect(typeof call.apiCall).toBe("function");

    expect(mockFilesList).toHaveBeenCalledTimes(1);
    const filesListInput = mockFilesList.mock.calls[0]![0] as {
      accessToken: string;
      mimeType: string;
      pageSize: number;
      orderBy: string;
      fields: string;
    };
    expect(filesListInput.accessToken).toBe("test-access-token");
    expect(filesListInput.mimeType).toBe("application/vnd.google-apps.folder");
    expect(filesListInput.pageSize).toBe(200);
    expect(filesListInput.orderBy).toBe("name");
    // Trimmed fields mask, not the wrapper default.
    expect(filesListInput.fields).toContain("files(id,name)");
  });
});

describe("googleDriveFoldersResolver — mapping", () => {
  it("maps folders to {value:id, label:name} with no description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "f1", name: "Accounting" },
        { id: "f2", name: "Engineering" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "f1", label: "Accounting" },
      { value: "f2", label: "Engineering" },
    ]);
    expect(result.hasMore).toBe(false);
    // No item should carry a description — folders deliberately omit
    // modifiedTime per the resolver's design notes.
    for (const item of result.items) {
      expect(item).not.toHaveProperty("description");
    }
  });

  it("returns empty items + hasMore:false when Drive returns zero matching folders", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("drops records lacking a string id or name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "ok", name: "Good Folder" },
        { id: 123, name: "bad-id" },
        { id: "no-name" },
        { id: "", name: "empty-id" },
        { id: "x", name: "" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "ok", label: "Good Folder" }]);
  });

  it("preserves Drive's alphabetical response order (resolver does not re-sort)", async () => {
    // Drive returns folders in the order specified by orderBy=name —
    // alphabetical. The resolver MUST pass that through unchanged.
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "Accounting" },
        { id: "b", name: "Engineering" },
        { id: "z", name: "Zebra" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result.items.map((i) => i.label)).toEqual([
      "Accounting",
      "Engineering",
      "Zebra",
    ]);
  });
});

describe("googleDriveFoldersResolver — hasMore semantics", () => {
  it("returns hasMore:true when result hits the page cap (200 items)", async () => {
    const files = Array.from({ length: 200 }, (_, i) => ({
      id: `f-${i}`,
      name: `Folder ${String(i).padStart(3, "0")}`,
    }));
    mockRefreshAndRetry.mockResolvedValueOnce({
      files,
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(200);
  });

  it("returns hasMore:false when result is below the page cap", async () => {
    const files = Array.from({ length: 199 }, (_, i) => ({
      id: `f-${i}`,
      name: `Folder ${i}`,
    }));
    mockRefreshAndRetry.mockResolvedValueOnce({
      files,
      nextPageToken: "ignored-cursor",
    });
    const result = await googleDriveFoldersResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });
});

describe("googleDriveFoldersResolver — q filtering", () => {
  it("filters case-insensitively on the rendered label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "Accounting" },
        { id: "b", name: "Marketing" },
        { id: "c", name: "Engineering" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx({ q: "ing" }));
    expect(result.items.map((i) => i.value)).toEqual(["a", "b", "c"]);
  });

  it("returns the unfiltered list when q is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "first" },
        { id: "b", name: "second" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx({ q: "" }));
    expect(result.items).toHaveLength(2);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [{ id: "a", name: "first" }],
      nextPageToken: undefined,
    });
    const result = await googleDriveFoldersResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("googleDriveFoldersResolver — error sanitization", () => {
  it("maps IntegrationActionRequiredError → OptionsResolverError(INTEGRATION_DISCONNECTED) with a reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "google-drive",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    let thrown: unknown;
    try {
      await googleDriveFoldersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("INTEGRATION_DISCONNECTED");
    expect(optErr.message).toMatch(/reconnect google drive/i);
  });

  it("maps a leaked Unauthorized401Error → INTEGRATION_DISCONNECTED (defensive)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("auth"));
    let thrown: unknown;
    try {
      await googleDriveFoldersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
  });

  it("maps a generic provider error → PROVIDER_ERROR with a sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Google Drive files.list failed: rateLimitExceeded"),
    );
    let thrown: unknown;
    try {
      await googleDriveFoldersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    expect(optErr.message).not.toMatch(/ratelimitexceeded/i);
    expect(optErr.message).not.toMatch(/files\.list/i);
    expect(optErr.message).toMatch(/couldn't load google drive folders/i);
  });

  it("throws OptionsResolverError(INTEGRATION_DISCONNECTED) when ctx.integration is null (defensive)", async () => {
    let thrown: unknown;
    try {
      await googleDriveFoldersResolver.resolve(ctx({ integration: null }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("does not leak the access token or raw Drive body in any thrown error", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Google Drive files.list failed: {"error":{"code":403,"message":"insufficient permissions for ya29.fake-token"}}',
      ),
    );
    let thrown: unknown;
    try {
      await googleDriveFoldersResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    const msg = (thrown as Error).message;
    expect(msg).not.toMatch(/ya29/i);
    expect(msg).not.toMatch(/insufficient permissions/i);
    expect(msg).not.toMatch(/403/);
  });
});
