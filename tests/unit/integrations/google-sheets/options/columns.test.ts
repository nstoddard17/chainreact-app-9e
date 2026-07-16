/**
 * @jest-environment node
 *
 * Tests for `integrations/google-sheets/options/columns.ts` — RESOLVERS-1.
 *
 * Reads the REAL row-1 headers of the selected tab (the same headers
 * `findRow.ts` matches `column` against with `headers.indexOf(...)`, and the
 * same row the row_changed snapshot resolves `keyColumn` against). Empty
 * result = "no columns detected" (honest UI fallback), never invented columns.
 *
 * Pin:
 *   - source / provider / requiresIntegration / requiredDeps (verbatim
 *     camelCase `spreadsheetId` + `sheetName` — the field names on BOTH
 *     consumer schemas).
 *   - Bounded single-row read via the existing valuesGet wrapper; the A1
 *     range quotes + escapes the tab title.
 *   - value = label = header text VERBATIM (what the handler matches).
 *   - Blank/non-string cells skipped; duplicate headers first-wins; column
 *     order preserved with the A1 letter as description.
 *   - q filter; hasMore always false.
 *   - MISSING_DEPENDENCY / NotFound cascade fallback / error sanitization
 *     (no tokens, no raw Sheets bodies, no cell content).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockValuesGet = jest.fn();
jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  __esModule: true,
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
}));

import {
  googleSheetsColumnsResolver,
  headerRowRange,
} from "@/integrations/google-sheets/options/columns";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";
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
  displayName: "Alice (Sheets)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.metadata.readonly",
  ],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { spreadsheetId: "sheet-1", sheetName: "Orders" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
});

describe("googleSheetsColumnsResolver — shape", () => {
  it("declares source / provider / requiresIntegration / requiredDeps (verbatim schema field names)", () => {
    expect(googleSheetsColumnsResolver.source).toBe("google-sheets:columns");
    expect(googleSheetsColumnsResolver.provider).toBe("google-sheets");
    expect(googleSheetsColumnsResolver.requiresIntegration).toBe(true);
    expect(googleSheetsColumnsResolver.requiredDeps).toEqual([
      "spreadsheetId",
      "sheetName",
    ]);
  });
});

describe("headerRowRange — A1 quoting", () => {
  it("always quotes the tab title and doubles embedded single quotes", () => {
    expect(headerRowRange("Orders")).toBe("'Orders'!1:1");
    expect(headerRowRange("Q4 Orders")).toBe("'Q4 Orders'!1:1");
    expect(headerRowRange("Bob's Orders")).toBe("'Bob''s Orders'!1:1");
  });
});

describe("googleSheetsColumnsResolver — mapping", () => {
  it("reads only row 1 of the chosen tab and maps header text → value AND label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      range: "Orders!1:1",
      majorDimension: "ROWS",
      values: [["Name", "Email", "Status"]],
    });
    const result = await googleSheetsColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Name", label: "Name", description: "Column A" },
      { value: "Email", label: "Email", description: "Column B" },
      { value: "Status", label: "Status", description: "Column C" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("reads through refreshAndRetry against the account, and asks valuesGet for ONLY the tab's first row", async () => {
    // Drive the real apiCall closure so the range the resolver requests is
    // pinned end-to-end (a whole-sheet read here would pull every cell).
    mockValuesGet.mockResolvedValue({ values: [["Name"]] });
    mockRefreshAndRetry.mockImplementation(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("ya29.test-token"),
    );

    await googleSheetsColumnsResolver.resolve(
      ctx({ deps: { spreadsheetId: "sheet-1", sheetName: "Bob's Orders" } }),
    );

    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0] as {
      accountId: string;
      provider: string;
      providerAccountId: string | null;
    };
    expect(refreshArg.accountId).toBe("acct-user-1");
    expect(refreshArg.provider).toBe("google-sheets");
    expect(refreshArg.providerAccountId).toBeNull();

    expect(mockValuesGet).toHaveBeenCalledTimes(1);
    expect(mockValuesGet).toHaveBeenCalledWith({
      accessToken: "ya29.test-token",
      spreadsheetId: "sheet-1",
      range: "'Bob''s Orders'!1:1",
      majorDimension: "ROWS",
    });
  });

  it("value/label are the header text VERBATIM (what findRow's headers.indexOf matches)", async () => {
    // Trailing/leading whitespace is trimmed only to decide blank-ness; a
    // header that IS whitespace-padded in the sheet would not match the
    // handler's indexOf, so we pin the exact string we offer.
    mockRefreshAndRetry.mockResolvedValueOnce({
      values: [["Order ID", "Customer Email"]],
    });
    const result = await googleSheetsColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "Order ID",
      "Customer Email",
    ]);
    expect(result.items.map((i) => i.label)).toEqual([
      "Order ID",
      "Customer Email",
    ]);
  });

  it("skips blank / non-string header cells, dedupes repeated headers (first wins), and keeps column order + letters honest", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      values: [["Name", "", 42, "Name", "Email"]],
    });
    const result = await googleSheetsColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Name", label: "Name", description: "Column A" },
      { value: "Email", label: "Email", description: "Column E" },
    ]);
  });

  it("returns empty items for an empty sheet / all-blank header row (honest 'no columns detected')", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({});
    expect(await googleSheetsColumnsResolver.resolve(ctx())).toEqual({
      items: [],
      hasMore: false,
    });

    mockRefreshAndRetry.mockResolvedValueOnce({ values: [["", "  ", ""]] });
    expect(await googleSheetsColumnsResolver.resolve(ctx())).toEqual({
      items: [],
      hasMore: false,
    });
  });

  it("applies a case-insensitive q filter against the header text", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      values: [["Customer Name", "Email", "Notes"]],
    });
    const result = await googleSheetsColumnsResolver.resolve(ctx({ q: "NAME" }));
    expect(result.items.map((i) => i.value)).toEqual(["Customer Name"]);
  });
});

describe("googleSheetsColumnsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when spreadsheetId or sheetName is missing, no API call", async () => {
    await expect(
      googleSheetsColumnsResolver.resolve(ctx({ deps: { sheetName: "Orders" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      googleSheetsColumnsResolver.resolve(
        ctx({ deps: { spreadsheetId: "sheet-1", sheetName: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when the spreadsheet/tab is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("range 'Ghost'!1:1 on spreadsheet sheet-1", "INVALID_ARGUMENT"),
    );
    const result = await googleSheetsColumnsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("googleSheetsColumnsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      googleSheetsColumnsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "google-sheets",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      googleSheetsColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      googleSheetsColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaking raw Sheets bodies, tokens, or cell content", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'values.get failed: {"cells":"secret-cell-data"} Bearer ya29.secret-token',
      ),
    );
    const err = await googleSheetsColumnsResolver.resolve(ctx()).catch((e) => e);
    expect(err).toBeInstanceOf(OptionsResolverError);
    expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    const msg = (err as Error).message;
    expect(msg).not.toContain("secret-cell-data");
    expect(msg).not.toContain("Bearer");
    expect(msg).not.toContain("ya29.secret-token");
    expect(msg).toMatch(/couldn't read the sheet's columns/i);
  });
});
