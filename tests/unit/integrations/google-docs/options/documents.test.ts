/**
 * @jest-environment node
 *
 * Tests for `integrations/google-docs/options/documents.ts` —
 * Slice 3.GDOCS-3.
 *
 * Pin:
 *   - Resolver shape (source / provider / requiresIntegration /
 *     requiredDeps).
 *   - Wrapper invocation: refreshAndRetry called with
 *     provider="google-docs", accountId=null, and a closure that calls
 *     `filesList` with the Docs mimeType, pageSize=200, orderBy=
 *     "modifiedTime desc".
 *   - Mapping: Drive file → {value:id, label:name, description?}.
 *   - description carries "Modified YYYY-MM-DD" from modifiedTime;
 *     omitted when modifiedTime missing / malformed.
 *   - Empty file list returns empty items + hasMore:false.
 *   - hasMore:true when result hits the 200 page cap.
 *   - Case-insensitive client-side q filter over the label.
 *   - IntegrationActionRequiredError / leaked Unauthorized401Error →
 *     INTEGRATION_DISCONNECTED with a reconnect prompt.
 *   - Other errors → PROVIDER_ERROR with a sanitized message
 *     (no token, no raw Drive body).
 *   - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
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

import { googleDocsDocumentsResolver } from "@/integrations/google-docs/options/documents";
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
  id: "int-docs-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-docs",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Google Docs)",
  accessTokenEncrypted: "enc:google-docs-token-cipher",
  refreshTokenEncrypted: "enc:google-docs-refresh-cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: [
    "https://www.googleapis.com/auth/documents",
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

describe("googleDocsDocumentsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(googleDocsDocumentsResolver.source).toBe("google-docs:documents");
    expect(googleDocsDocumentsResolver.provider).toBe("google-docs");
    expect(googleDocsDocumentsResolver.requiresIntegration).toBe(true);
    expect(googleDocsDocumentsResolver.requiredDeps).toBeUndefined();
  });
});

describe("googleDocsDocumentsResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='google-docs', accountId=null, and a closure that calls filesList with the Docs mimeType + orderBy + pageSize", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async ({
        apiCall,
      }: {
        apiCall: (token: string) => Promise<unknown>;
      }) => apiCall("test-access-token"),
    );
    mockFilesList.mockResolvedValueOnce({ files: [], nextPageToken: undefined });

    await googleDocsDocumentsResolver.resolve(ctx());

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0] as {
      userId: string;
      provider: string;
      accountId: string | null;
      apiCall: (token: string) => Promise<unknown>;
    };
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("google-docs");
    expect(call.accountId).toBeNull();
    expect(typeof call.apiCall).toBe("function");

    // Verify the apiCall closure invokes filesList with the Docs mimeType
    // + orderBy + pageSize.
    expect(mockFilesList).toHaveBeenCalledTimes(1);
    const filesListInput = mockFilesList.mock.calls[0]![0] as {
      accessToken: string;
      mimeType: string;
      pageSize: number;
      orderBy: string;
      fields: string;
    };
    expect(filesListInput.accessToken).toBe("test-access-token");
    expect(filesListInput.mimeType).toBe("application/vnd.google-apps.document");
    expect(filesListInput.pageSize).toBe(200);
    expect(filesListInput.orderBy).toBe("modifiedTime desc");
    // Trimmed fields mask, not the wrapper default.
    expect(filesListInput.fields).toContain("files(id,name,modifiedTime)");
  });
});

describe("googleDocsDocumentsResolver — mapping", () => {
  it("maps documents to {value:id, label:name, description:'Modified YYYY-MM-DD'}", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        {
          id: "doc1",
          name: "Q4 Strategy",
          modifiedTime: "2026-05-20T15:42:00.000Z",
        },
        {
          id: "doc2",
          name: "Roadmap 2027",
          modifiedTime: "2026-04-10T09:00:00.000Z",
        },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "doc1",
        label: "Q4 Strategy",
        description: "Modified 2026-05-20",
      },
      {
        value: "doc2",
        label: "Roadmap 2027",
        description: "Modified 2026-04-10",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when modifiedTime is missing or non-ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "no-modified" },
        { id: "b", name: "garbage-modified", modifiedTime: "yesterday" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "a", label: "no-modified" },
      { value: "b", label: "garbage-modified" },
    ]);
  });

  it("returns empty items + hasMore:false when Drive returns zero matching files", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("drops records lacking a string id or name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "ok", name: "good" },
        { id: 123, name: "bad-id" },
        { id: "no-name" },
        { id: "", name: "empty-id" },
        { id: "x", name: "" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "ok", label: "good" }]);
  });

  it("preserves Drive's modifiedTime-desc order (resolver does not re-sort)", async () => {
    // Wrapper returns Drive's response order — Drive guarantees this via
    // orderBy=modifiedTime desc. The resolver MUST NOT re-sort.
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "newest", name: "Newest", modifiedTime: "2026-05-22T00:00:00Z" },
        { id: "middle", name: "Middle", modifiedTime: "2026-05-15T00:00:00Z" },
        { id: "oldest", name: "Oldest", modifiedTime: "2026-04-01T00:00:00Z" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "newest",
      "middle",
      "oldest",
    ]);
  });
});

describe("googleDocsDocumentsResolver — hasMore semantics", () => {
  it("returns hasMore:true when result hits the page cap (200 items)", async () => {
    const files = Array.from({ length: 200 }, (_, i) => ({
      id: `id-${i}`,
      name: `Doc ${i}`,
    }));
    mockRefreshAndRetry.mockResolvedValueOnce({
      files,
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(200);
  });

  it("returns hasMore:false when result is below the page cap", async () => {
    const files = Array.from({ length: 199 }, (_, i) => ({
      id: `id-${i}`,
      name: `Doc ${i}`,
    }));
    mockRefreshAndRetry.mockResolvedValueOnce({
      files,
      nextPageToken: "ignored-cursor",
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx());
    expect(result.hasMore).toBe(false);
  });
});

describe("googleDocsDocumentsResolver — q filtering", () => {
  it("filters case-insensitively on the rendered label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "Q4 Strategy" },
        { id: "b", name: "Marketing Plan" },
        { id: "c", name: "Internal QBR" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx({ q: "q" }));
    expect(result.items.map((i) => i.value)).toEqual(["a", "c"]);
  });

  it("returns the unfiltered list when q is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [
        { id: "a", name: "first" },
        { id: "b", name: "second" },
      ],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx({ q: "" }));
    expect(result.items).toHaveLength(2);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      files: [{ id: "a", name: "first" }],
      nextPageToken: undefined,
    });
    const result = await googleDocsDocumentsResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("googleDocsDocumentsResolver — error sanitization", () => {
  it("maps IntegrationActionRequiredError → OptionsResolverError(INTEGRATION_DISCONNECTED) with a reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "google-docs",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    let thrown: unknown;
    try {
      await googleDocsDocumentsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("INTEGRATION_DISCONNECTED");
    expect(optErr.message).toMatch(/reconnect google docs/i);
  });

  it("maps a leaked Unauthorized401Error → INTEGRATION_DISCONNECTED (defensive)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("auth"));
    let thrown: unknown;
    try {
      await googleDocsDocumentsResolver.resolve(ctx());
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
      await googleDocsDocumentsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    expect(optErr.message).not.toMatch(/ratelimitexceeded/i);
    expect(optErr.message).not.toMatch(/drive/i);
    expect(optErr.message).toMatch(/couldn't load google docs/i);
  });

  it("throws OptionsResolverError(INTEGRATION_DISCONNECTED) when ctx.integration is null (defensive)", async () => {
    let thrown: unknown;
    try {
      await googleDocsDocumentsResolver.resolve(ctx({ integration: null }));
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
      await googleDocsDocumentsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    const msg = (thrown as Error).message;
    expect(msg).not.toMatch(/ya29/i);
    expect(msg).not.toMatch(/insufficient permissions/i);
    expect(msg).not.toMatch(/403/);
  });
});
