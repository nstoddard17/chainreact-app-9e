/**
 * @jest-environment node
 *
 * Tests for `integrations/google-sheets/options/spreadsheets.ts` —
 * Slice 3.GSHEETS-2.
 *
 * Pin:
 *   - Wrapper invocation shape (refreshAndRetry with provider="google-sheets",
 *     accountId=null, apiCall that calls listSpreadsheets).
 *   - Spreadsheet mapping: Drive file → {value:id, label:name, description?}.
 *   - description carries "Modified YYYY-MM-DD" derived from modifiedTime;
 *     omitted when modifiedTime is missing / malformed.
 *   - Empty file list returns empty items + hasMore: false.
 *   - hasMore propagates from the API wrapper.
 *   - Case-insensitive client-side q filter over the label.
 *   - IntegrationActionRequiredError / Unauthorized401Error → INTEGRATION_DISCONNECTED.
 *   - Other errors → PROVIDER_ERROR with a sanitized message.
 *   - INTEGRATION_DISCONNECTED throw when ctx.integration is null.
 *   - No token / raw Drive body leaks into the error message.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { googleSheetsSpreadsheetsResolver } from "@/integrations/google-sheets/options/spreadsheets";
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
  provider: "google-sheets",
  providerAccountId: "alice@example.com",
  displayName: "Alice (Google Sheets)",
  accessTokenEncrypted: "enc:google-token-cipher",
  refreshTokenEncrypted: "enc:google-refresh-cipher",
  accessTokenExpiresAt: "2026-06-01T00:00:00Z",
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
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
});

describe("googleSheetsSpreadsheetsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration fields", () => {
    expect(googleSheetsSpreadsheetsResolver.source).toBe(
      "google-sheets:spreadsheets",
    );
    expect(googleSheetsSpreadsheetsResolver.provider).toBe("google-sheets");
    expect(googleSheetsSpreadsheetsResolver.requiresIntegration).toBe(true);
    expect(googleSheetsSpreadsheetsResolver.requiredDeps).toBeUndefined();
  });
});

describe("googleSheetsSpreadsheetsResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='google-sheets', accountId=null, and a closure that calls listSpreadsheets", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [],
      hasMore: false,
    });
    await googleSheetsSpreadsheetsResolver.resolve(ctx());
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
    const call = mockRefreshAndRetry.mock.calls[0]![0] as {
      userId: string;
      provider: string;
      accountId: string | null;
      apiCall: (token: string) => Promise<unknown>;
    };
    expect(call.userId).toBe("user-1");
    expect(call.provider).toBe("google-sheets");
    expect(call.accountId).toBeNull();
    expect(typeof call.apiCall).toBe("function");
  });
});

describe("googleSheetsSpreadsheetsResolver — mapping", () => {
  it("maps spreadsheets to {value:id, label:name, description:'Modified YYYY-MM-DD'}", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [
        {
          id: "1aBc",
          name: "Q4 Forecast",
          modifiedTime: "2026-05-20T15:42:00.000Z",
        },
        {
          id: "2dEf",
          name: "Marketing Roster",
          modifiedTime: "2026-04-10T09:00:00.000Z",
        },
      ],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(ctx());
    expect(result.items).toEqual([
      {
        value: "1aBc",
        label: "Q4 Forecast",
        description: "Modified 2026-05-20",
      },
      {
        value: "2dEf",
        label: "Marketing Roster",
        description: "Modified 2026-04-10",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when modifiedTime is missing or non-ISO-shaped", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [
        { id: "a", name: "no-modified" },
        // Non-ISO prefix — guard returns undefined.
        { id: "b", name: "garbage-modified", modifiedTime: "yesterday" },
      ],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "a", label: "no-modified" },
      { value: "b", label: "garbage-modified" },
    ]);
  });

  it("returns empty items + hasMore:false when Drive returns zero matching files", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("propagates hasMore=true from the wrapper", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [{ id: "x", name: "first" }],
      hasMore: true,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("googleSheetsSpreadsheetsResolver — q filtering", () => {
  it("filters case-insensitively on the rendered label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [
        { id: "a", name: "Q4 Forecast" },
        { id: "b", name: "Marketing Roster" },
        { id: "c", name: "Internal QBR" },
      ],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(
      ctx({ q: "q" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["a", "c"]);
  });

  it("returns the unfiltered list when q is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [
        { id: "a", name: "first" },
        { id: "b", name: "second" },
      ],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(
      ctx({ q: "" }),
    );
    expect(result.items).toHaveLength(2);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheets: [{ id: "a", name: "first" }],
      hasMore: false,
    });
    const result = await googleSheetsSpreadsheetsResolver.resolve(
      ctx({ q: "zzz" }),
    );
    expect(result.items).toEqual([]);
  });
});

describe("googleSheetsSpreadsheetsResolver — error sanitization", () => {
  it("maps IntegrationActionRequiredError → OptionsResolverError(INTEGRATION_DISCONNECTED) with a reconnect prompt", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "google-sheets",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    let thrown: unknown;
    try {
      await googleSheetsSpreadsheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("INTEGRATION_DISCONNECTED");
    expect(optErr.message).toMatch(/reconnect google sheets/i);
  });

  it("maps a leaked Unauthorized401Error → INTEGRATION_DISCONNECTED (defensive)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("auth"),
    );
    let thrown: unknown;
    try {
      await googleSheetsSpreadsheetsResolver.resolve(ctx());
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
      await googleSheetsSpreadsheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    // Raw Drive error code MUST NOT leak into the user-visible message.
    expect(optErr.message).not.toMatch(/ratelimitexceeded/i);
    expect(optErr.message).not.toMatch(/drive/i);
    expect(optErr.message).toMatch(/couldn't load google sheets/i);
  });

  it("throws OptionsResolverError(INTEGRATION_DISCONNECTED) when ctx.integration is null (defensive)", async () => {
    let thrown: unknown;
    try {
      await googleSheetsSpreadsheetsResolver.resolve(
        ctx({ integration: null }),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
    // No wrapper invocation when the integration is missing.
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("does not leak the access token or raw Drive body in any thrown error", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Google Drive files.list failed: {\"error\":{\"code\":403,\"message\":\"insufficient permissions for ya29.fake-token\"}}",
      ),
    );
    let thrown: unknown;
    try {
      await googleSheetsSpreadsheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    const msg = (thrown as Error).message;
    expect(msg).not.toMatch(/ya29/i);
    expect(msg).not.toMatch(/insufficient permissions/i);
    expect(msg).not.toMatch(/403/);
  });
});
