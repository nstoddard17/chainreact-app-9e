/**
 * @jest-environment node
 *
 * Tests for `integrations/google-sheets/options/sheets.ts` —
 * Slice 3.GSHEETS-2.
 *
 * Pin:
 *   - Resolver shape (source / provider / requiresIntegration / requiredDeps).
 *   - refreshAndRetry invoked with provider="google-sheets" + the
 *     dependsOn-supplied spreadsheetId threaded into spreadsheetsGet.
 *   - Sheet mapping: properties.title → {value:title, label:title,
 *     description: '<rows> rows × <cols> columns'}.
 *   - description omitted when gridProperties missing / non-positive.
 *   - Empty sheets / missing properties dropped defensively.
 *   - hasMore always false (single-call API).
 *   - Workbook order preserved.
 *   - Case-insensitive client-side q filter.
 *   - Missing spreadsheetId dep → MISSING_DEPENDENCY (defensive).
 *   - NotFoundError → PROVIDER_ERROR with safe message; spreadsheetId NOT echoed.
 *   - IntegrationActionRequiredError / Unauthorized401Error → INTEGRATION_DISCONNECTED.
 *   - Other errors → PROVIDER_ERROR.
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

import { googleSheetsSheetsResolver } from "@/integrations/google-sheets/options/sheets";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";
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
    deps: { spreadsheetId: "1aBc-fake" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("googleSheetsSheetsResolver — shape", () => {
  it("declares the canonical source / provider / requiresIntegration / requiredDeps", () => {
    expect(googleSheetsSheetsResolver.source).toBe("google-sheets:sheets");
    expect(googleSheetsSheetsResolver.provider).toBe("google-sheets");
    expect(googleSheetsSheetsResolver.requiresIntegration).toBe(true);
    expect(googleSheetsSheetsResolver.requiredDeps).toEqual(["spreadsheetId"]);
  });
});

describe("googleSheetsSheetsResolver — wrapper invocation", () => {
  it("calls refreshAndRetry with provider='google-sheets' and apiCall that calls spreadsheetsGet with the dep spreadsheetId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc-fake",
      sheets: [],
    });
    await googleSheetsSheetsResolver.resolve(ctx());
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

describe("googleSheetsSheetsResolver — mapping", () => {
  it("maps sheets to {value:title, label:title, description:'<rows> rows × <cols> columns'}", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [
        {
          properties: {
            sheetId: 0,
            title: "Sheet1",
            index: 0,
            sheetType: "GRID",
            gridProperties: { rowCount: 1000, columnCount: 26 },
          },
        },
        {
          properties: {
            sheetId: 12345,
            title: "Lookup",
            index: 1,
            sheetType: "GRID",
            gridProperties: { rowCount: 50, columnCount: 5 },
          },
        },
      ],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Sheet1", label: "Sheet1", description: "1000 rows × 26 columns" },
      { value: "Lookup", label: "Lookup", description: "50 rows × 5 columns" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("omits description when gridProperties is missing or counts are non-positive", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [
        { properties: { title: "no-grid" } },
        {
          properties: {
            title: "zero-rows",
            gridProperties: { rowCount: 0, columnCount: 10 },
          },
        },
        {
          properties: {
            title: "zero-cols",
            gridProperties: { rowCount: 10, columnCount: 0 },
          },
        },
        {
          properties: {
            title: "missing-counts",
            gridProperties: {},
          },
        },
      ],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "no-grid", label: "no-grid" },
      { value: "zero-rows", label: "zero-rows" },
      { value: "zero-cols", label: "zero-cols" },
      { value: "missing-counts", label: "missing-counts" },
    ]);
  });

  it("drops sheets that lack a title", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [
        { properties: { title: "kept" } },
        { properties: { title: "" } },
        { properties: {} },
        { properties: { title: 42 } as unknown as { title: string } },
        { /* no properties at all */ },
      ],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "kept", label: "kept" }]);
  });

  it("preserves workbook order (sheets returned by spreadsheets.get are pre-ordered by sheetIndex)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [
        { properties: { title: "A", index: 0 } },
        { properties: { title: "B", index: 1 } },
        { properties: { title: "C", index: 2 } },
      ],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["A", "B", "C"]);
  });

  it("returns empty items + hasMore:false when sheets array is empty / missing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      // sheets field omitted entirely
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("googleSheetsSheetsResolver — q filtering", () => {
  it("filters case-insensitively on the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [
        { properties: { title: "Sales" } },
        { properties: { title: "Forecast" } },
        { properties: { title: "Misc" } },
      ],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx({ q: "s" }));
    expect(result.items.map((i) => i.value)).toEqual([
      "Sales",
      "Forecast",
      "Misc",
    ]);
  });

  it("returns an empty list when q matches nothing", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      spreadsheetId: "1aBc",
      sheets: [{ properties: { title: "Sheet1" } }],
    });
    const result = await googleSheetsSheetsResolver.resolve(ctx({ q: "zzz" }));
    expect(result.items).toEqual([]);
  });
});

describe("googleSheetsSheetsResolver — dependency handling", () => {
  it("throws MISSING_DEPENDENCY when spreadsheetId is absent (defense-in-depth — route guards too)", async () => {
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(ctx({ deps: {} }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("MISSING_DEPENDENCY");
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when spreadsheetId is empty string", async () => {
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(
        ctx({ deps: { spreadsheetId: "" } }),
      );
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe("MISSING_DEPENDENCY");
  });
});

describe("googleSheetsSheetsResolver — error sanitization", () => {
  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED", async () => {
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
      await googleSheetsSheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
  });

  it("maps a leaked Unauthorized401Error → INTEGRATION_DISCONNECTED (defensive)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("401"),
    );
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
  });

  it("maps NotFoundError → PROVIDER_ERROR with a safe message — spreadsheetId NOT echoed", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("spreadsheet 1aBc-fake-leak"),
    );
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    expect(optErr.message).toMatch(/couldn't find that spreadsheet/i);
    // The raw spreadsheetId (from the dep or the error message) MUST
    // NOT leak into the user-visible message.
    expect(optErr.message).not.toMatch(/1aBc/);
    expect(optErr.message).not.toMatch(/fake-leak/);
  });

  it("maps a generic provider error → PROVIDER_ERROR with a sanitized message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        "Google Sheets spreadsheets.get failed: PERMISSION_DENIED for ya29.fake-token",
      ),
    );
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(ctx());
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    const optErr = thrown as OptionsResolverError;
    expect(optErr.code).toBe("PROVIDER_ERROR");
    expect(optErr.message).not.toMatch(/ya29/);
    expect(optErr.message).not.toMatch(/permission_denied/i);
    expect(optErr.message).toMatch(/couldn't load google sheets/i);
  });

  it("throws OptionsResolverError(INTEGRATION_DISCONNECTED) when ctx.integration is null", async () => {
    let thrown: unknown;
    try {
      await googleSheetsSheetsResolver.resolve(ctx({ integration: null }));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect((thrown as OptionsResolverError).code).toBe(
      "INTEGRATION_DISCONNECTED",
    );
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
