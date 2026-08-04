/**
 * @jest-environment node
 *
 * microsoft-excel options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftExcelTableColumnsResolver } from "@/integrations/microsoft-excel/options/tableColumns";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { microsoftExcelTablesResolver } from "@/integrations/microsoft-excel/options/tables";
import { microsoftExcelWorkbooksResolver } from "@/integrations/microsoft-excel/options/workbooks";
import { microsoftExcelWorksheetColumnsResolver } from "@/integrations/microsoft-excel/options/worksheetColumns";
import { microsoftExcelWorksheetsResolver } from "@/integrations/microsoft-excel/options/worksheets";

// ---------------------------------------------------------------------------
// Merged from the former tableColumns.test.ts
// Tests for `integrations/microsoft-excel/options/tableColumns.ts` —
// RESOLVERS-1. Lists the REAL column headers of the selected Excel table
// (same `tableColumnsList` read the find_row handler matches against);
// empty result = "no columns detected" (honest UI fallback), never
// invented columns.
// ---------------------------------------------------------------------------
describe("tableColumns (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-excel",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Excel)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access", "Files.ReadWrite"],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workbookId: "wb-1", tableName: "Table1" },
    ...overrides,
  };
}

function column(name: string, index: number) {
  return { id: `col-${index}`, name, index };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftExcelTableColumnsResolver — shape", () => {
  it("declares requiredDeps=['workbookId','tableName'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftExcelTableColumnsResolver.source).toBe(
      "microsoft-excel:table_columns",
    );
    expect(microsoftExcelTableColumnsResolver.provider).toBe(
      "microsoft-excel",
    );
    expect(microsoftExcelTableColumnsResolver.requiresIntegration).toBe(true);
    expect(microsoftExcelTableColumnsResolver.requiredDeps).toEqual([
      "workbookId",
      "tableName",
    ]);
  });
});

describe("microsoftExcelTableColumnsResolver — mapping", () => {
  it("maps column name → value AND label; no description, no ids, no cell data", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      column("Name", 0),
      column("Email", 1),
      column("Status", 2),
    ]);
    const result = await microsoftExcelTableColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Name", label: "Name" },
      { value: "Email", label: "Email" },
      { value: "Status", label: "Status" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("skips blank / non-string column names and dedupes repeats (first wins)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      column("Name", 0),
      column("  ", 1),
      { id: "col-2", name: 42 as unknown as string, index: 2 },
      column("Name", 3),
      column("Email", 4),
    ]);
    const result = await microsoftExcelTableColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Name", "Email"]);
  });

  it("returns empty items for a column-less table (honest 'no columns detected')", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([]);
    expect(await microsoftExcelTableColumnsResolver.resolve(ctx())).toEqual({
      items: [],
      hasMore: false,
    });
  });

  it("applies case-insensitive q filter against the column name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      column("Customer Name", 0),
      column("Email", 1),
      column("Notes", 2),
    ]);
    const result = await microsoftExcelTableColumnsResolver.resolve(
      ctx({ q: "NAME" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["Customer Name"]);
  });
});

describe("microsoftExcelTableColumnsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workbookId or tableName is missing, no API call", async () => {
    await expect(
      microsoftExcelTableColumnsResolver.resolve(
        ctx({ deps: { tableName: "Table1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftExcelTableColumnsResolver.resolve(
        ctx({ deps: { workbookId: "wb-1", tableName: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when the workbook/table is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("table 'Table1' on workbook wb-ghost", "Item not found"),
    );
    const result = await microsoftExcelTableColumnsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftExcelTableColumnsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftExcelTableColumnsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-excel",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftExcelTableColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelTableColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph bodies or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('columns GET failed: {"secret":"raw-graph-body"} Bearer xyz'),
    );
    try {
      await microsoftExcelTableColumnsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("raw-graph-body");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former tables.test.ts
// Tests for `integrations/microsoft-excel/options/tables.ts` —
// Slice 4.EXCEL-META-2. Depends on `workbookId`; value is the table NAME.
// Uses the new `tablesList` Graph helper.
// ---------------------------------------------------------------------------
describe("tables (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-excel",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Excel)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
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
    deps: { workbookId: "wb-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftExcelTablesResolver — shape", () => {
  it("declares requiredDeps=['workbookId'] and requires an integration", () => {
    expect(microsoftExcelTablesResolver.source).toBe("microsoft-excel:tables");
    expect(microsoftExcelTablesResolver.provider).toBe("microsoft-excel");
    expect(microsoftExcelTablesResolver.requiresIntegration).toBe(true);
    expect(microsoftExcelTablesResolver.requiredDeps).toEqual(["workbookId"]);
  });
});

describe("microsoftExcelTablesResolver — wrapper invocation", () => {
  it("calls tablesList with the workbookId via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await microsoftExcelTablesResolver.resolve(ctx());

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/drive/items/wb-1/workbook/tables");
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-excel");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftExcelTablesResolver — mapping", () => {
  it("maps table name → value AND label; hasMore always false", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "{t-1}", name: "Sales", showHeaders: true },
      { id: "{t-2}", name: "Budget" },
    ]);
    const result = await microsoftExcelTablesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Sales", label: "Sales" },
      { value: "Budget", label: "Budget" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("drops tables with missing/empty name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "{t-1}", name: "" },
      { id: "{t-2}" },
      { id: "{t-3}", name: "Good" },
    ]);
    const result = await microsoftExcelTablesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Good"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "1", name: "Q1 Sales" },
      { id: "2", name: "Q2 Sales" },
      { id: "3", name: "Inventory" },
    ]);
    const result = await microsoftExcelTablesResolver.resolve(ctx({ q: "sales" }));
    expect(result.items.map((i) => i.value)).toEqual(["Q1 Sales", "Q2 Sales"]);
  });
});

describe("microsoftExcelTablesResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workbookId is empty/missing, no API call", async () => {
    await expect(
      microsoftExcelTablesResolver.resolve(ctx({ deps: { workbookId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftExcelTablesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workbook gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workbook wb-ghost", "Item not found"),
    );
    const result = await microsoftExcelTablesResolver.resolve(
      ctx({ deps: { workbookId: "wb-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftExcelTablesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftExcelTablesResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps auth failures → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelTablesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-excel",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftExcelTablesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('tables GET failed: {"raw":"tbl-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftExcelTablesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("tbl-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former workbooks.test.ts
// Tests for `integrations/microsoft-excel/options/workbooks.ts` —
// Slice 4.EXCEL-META-2. Account-scoped top-level picker (no deps).
// ---------------------------------------------------------------------------
describe("workbooks (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-excel",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Excel)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
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

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftExcelWorkbooksResolver — shape", () => {
  it("is account-scoped (no requiredDeps) and requires an integration", () => {
    expect(microsoftExcelWorkbooksResolver.source).toBe(
      "microsoft-excel:workbooks",
    );
    expect(microsoftExcelWorkbooksResolver.provider).toBe("microsoft-excel");
    expect(microsoftExcelWorkbooksResolver.requiresIntegration).toBe(true);
    expect(microsoftExcelWorkbooksResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftExcelWorkbooksResolver — wrapper invocation", () => {
  it("calls workbooksList (top=100) via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await microsoftExcelWorkbooksResolver.resolve(ctx());

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/drive/root/children");
    // OneDrive forbids $filter on /drive/root/children — the wrapper scans a
    // generous root page ($top=200) and filters .xlsx client-side (no $filter).
    expect(url).not.toMatch(/%24filter/);
    expect(url).toMatch(/%24top=200/);
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-excel");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftExcelWorkbooksResolver — mapping", () => {
  it("maps id → value, name → label, lastModifiedDateTime → 'Modified YYYY-MM-DD'", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      workbooks: [
        { id: "wb-1", name: "Q1.xlsx", lastModifiedDateTime: "2026-05-08T10:00:00Z" },
        { id: "wb-2", name: "Budget.xlsx" },
      ],
      nextLink: null,
    });
    const result = await microsoftExcelWorkbooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "wb-1", label: "Q1.xlsx", description: "Modified 2026-05-08" },
      { value: "wb-2", label: "Budget.xlsx" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to id when name is missing/empty; drops items with no id", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      workbooks: [
        { id: "wb-1" },
        { id: "wb-2", name: "" },
        { name: "no id" },
        { id: "", name: "empty id" },
      ],
      nextLink: null,
    });
    const result = await microsoftExcelWorkbooksResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "wb-1", label: "wb-1" },
      { value: "wb-2", label: "wb-2" },
    ]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      workbooks: [
        { id: "1", name: "Q1 Report.xlsx" },
        { id: "2", name: "Q2 Report.xlsx" },
        { id: "3", name: "Budget.xlsx" },
      ],
      nextLink: null,
    });
    const result = await microsoftExcelWorkbooksResolver.resolve(ctx({ q: "report" }));
    expect(result.items.map((i) => i.value)).toEqual(["1", "2"]);
  });

  it("hasMore=true when nextLink is set", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      workbooks: [{ id: "1", name: "A.xlsx" }],
      nextLink: "https://graph.microsoft.com/v1.0/...&$skiptoken=x",
    });
    const result = await microsoftExcelWorkbooksResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });
});

describe("microsoftExcelWorkbooksResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when ctx.integration is null, no API call", async () => {
    await expect(
      microsoftExcelWorkbooksResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError → INTEGRATION_DISCONNECTED (reconnect)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-excel",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    try {
      await microsoftExcelWorkbooksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("INTEGRATION_DISCONNECTED");
      expect((err as Error).message).toContain("Reconnect");
    }
  });

  it("maps Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelWorkbooksResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'Microsoft Graph me/drive/root/children GET failed: {"raw":"wb-secret-leak","token":"Bearer abc"}',
      ),
    );
    try {
      await microsoftExcelWorkbooksResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("wb-secret-leak");
      expect(msg).not.toContain("Bearer");
      expect(msg).not.toContain("raw");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former worksheetColumns.test.ts
// Tests for `integrations/microsoft-excel/options/worksheetColumns.ts` —
// SPREADSHEET-CONFIG-REDESIGN-1. Reads the REAL first-row headers of the
// selected worksheet (same `worksheetUsedRange` read the add_row batch
// handler validates against); empty result = "no columns detected"
// (honest UI fallback), never invented columns.
// ---------------------------------------------------------------------------
describe("worksheetColumns (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-excel",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Excel)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
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
    deps: { workbookId: "wb-1", worksheetName: "Sheet1" },
    ...overrides,
  };
}

function usedRange(values: unknown[][], address = "Sheet1!A1:C3") {
  return { address, values, rowCount: values.length, columnCount: values[0]?.length ?? 0 };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftExcelWorksheetColumnsResolver — shape", () => {
  it("declares requiredDeps=['workbookId','worksheetName'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftExcelWorksheetColumnsResolver.source).toBe(
      "microsoft-excel:worksheet_columns",
    );
    expect(microsoftExcelWorksheetColumnsResolver.provider).toBe(
      "microsoft-excel",
    );
    expect(microsoftExcelWorksheetColumnsResolver.requiresIntegration).toBe(true);
    expect(microsoftExcelWorksheetColumnsResolver.requiredDeps).toEqual([
      "workbookId",
      "worksheetName",
    ]);
  });
});

describe("microsoftExcelWorksheetColumnsResolver — mapping", () => {
  it("maps row-1 header text → value AND label, with the absolute column letter as description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([
        ["Name", "Email", "Notes"],
        ["Ada", "ada@example.com", ""],
      ]),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Name", label: "Name", description: "Column A" },
      { value: "Email", label: "Email", description: "Column B" },
      { value: "Notes", label: "Notes", description: "Column C" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("column letters honor a used range that does not start at column A", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([["Name", "Email"]], "Sheet1!B2:C9"),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.description)).toEqual([
      "Column B",
      "Column C",
    ]);
  });

  it("skips blank / non-string header cells", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([["Name", "", 42, "Email"]]),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Name", "Email"]);
  });

  it("emits EVERY repeated heading and says which ones are duplicated", async () => {
    // SPREADSHEET-GUIDED-CONFIG-S3 changed this deliberately. Keeping only
    // the first occurrence hid one of the customer's real columns AND
    // disagreed with the handler, whose header map last-wins — so the
    // picker's column letter could point at a different column than the
    // one that got written. Emitting both lets a consumer see the
    // ambiguity and refuse to guess.
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([["Name", "Email", "Name"]]),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Name", "Email", "Name"]);
    expect(result.items.map((i) => i.description)).toEqual([
      "Column A · duplicate heading",
      "Column B",
      "Column C · duplicate heading",
    ]);
  });

  it("offers the RAW heading as the value and the trimmed text as the label", async () => {
    // The handler matches the raw cell. A picker that tidied `"Name "` into
    // `"Name"` authored a key the handler threw on at run time — the one
    // failure mode a column picker exists to remove.
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([[" Name ", "Email\t"]]),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([" Name ", "Email\t"]);
    expect(result.items.map((i) => i.label)).toEqual(["Name", "Email"]);
  });

  it("does not treat headings that merely LOOK alike as duplicates", async () => {
    // `"Name"` and `"Name "` are two distinct handler keys, so each is
    // individually targetable. Whether a human can tell them apart is a
    // presentation question, answered by the editor rather than here.
    mockRefreshAndRetry.mockResolvedValueOnce(usedRange([["Name", "Name "]]));
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result.items.map((i) => i.description)).toEqual([
      "Column A",
      "Column B",
    ]);
  });

  it("returns empty items for an empty worksheet / all-blank header row (honest 'no columns detected')", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(usedRange([]));
    expect(
      await microsoftExcelWorksheetColumnsResolver.resolve(ctx()),
    ).toEqual({ items: [], hasMore: false });

    mockRefreshAndRetry.mockResolvedValueOnce(usedRange([["", "", ""]]));
    expect(
      await microsoftExcelWorksheetColumnsResolver.resolve(ctx()),
    ).toEqual({ items: [], hasMore: false });
  });

  it("applies case-insensitive q filter against the header text", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce(
      usedRange([["Customer Name", "Email", "Notes"]]),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(
      ctx({ q: "NAME" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["Customer Name"]);
  });
});

describe("microsoftExcelWorksheetColumnsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workbookId or worksheetName is missing, no API call", async () => {
    await expect(
      microsoftExcelWorksheetColumnsResolver.resolve(
        ctx({ deps: { worksheetName: "Sheet1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftExcelWorksheetColumnsResolver.resolve(
        ctx({ deps: { workbookId: "wb-1", worksheetName: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when the workbook/worksheet is gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("worksheet 'Sheet1' on workbook wb-ghost", "Item not found"),
    );
    const result = await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftExcelWorksheetColumnsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftExcelWorksheetColumnsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-excel",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftExcelWorksheetColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelWorksheetColumnsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph bodies, tokens, or cell content", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('usedRange GET failed: {"cells":"secret-cell-data"} Bearer xyz'),
    );
    try {
      await microsoftExcelWorksheetColumnsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("secret-cell-data");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former worksheets.test.ts
// Tests for `integrations/microsoft-excel/options/worksheets.ts` —
// Slice 4.EXCEL-META-2. Depends on `workbookId`; value is the worksheet
// NAME (handlers address worksheets by name).
// ---------------------------------------------------------------------------
describe("worksheets (options)", () => {

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-excel",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Excel)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-05-23T12:00:00Z",
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
    deps: { workbookId: "wb-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftExcelWorksheetsResolver — shape", () => {
  it("declares requiredDeps=['workbookId'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftExcelWorksheetsResolver.source).toBe(
      "microsoft-excel:worksheets",
    );
    expect(microsoftExcelWorksheetsResolver.provider).toBe("microsoft-excel");
    expect(microsoftExcelWorksheetsResolver.requiresIntegration).toBe(true);
    expect(microsoftExcelWorksheetsResolver.requiredDeps).toEqual(["workbookId"]);
  });
});

describe("microsoftExcelWorksheetsResolver — wrapper invocation", () => {
  it("calls worksheetsList with the workbookId via refreshAndRetry pinned to providerAccountId", async () => {
    const fetchSpy = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ value: [] }), { status: 200 }),
      );
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );

    await microsoftExcelWorksheetsResolver.resolve(ctx());

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(url).toContain("/v1.0/me/drive/items/wb-1/workbook/worksheets");
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-excel");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftExcelWorksheetsResolver — mapping", () => {
  it("maps worksheet name → value AND label; hasMore always false (bare-array helper)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "{ws-1}", name: "Sheet1", position: 0 },
      { id: "{ws-2}", name: "Summary", position: 1 },
    ]);
    const result = await microsoftExcelWorksheetsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "Sheet1", label: "Sheet1" },
      { value: "Summary", label: "Summary" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("drops worksheets with missing/empty name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "{ws-1}", name: "" },
      { id: "{ws-2}" },
      { id: "{ws-3}", name: "Good" },
    ]);
    const result = await microsoftExcelWorksheetsResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["Good"]);
  });

  it("returns empty items when worksheet list is empty", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([]);
    const result = await microsoftExcelWorksheetsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "1", name: "Jan Sales" },
      { id: "2", name: "Feb Sales" },
      { id: "3", name: "Notes" },
    ]);
    const result = await microsoftExcelWorksheetsResolver.resolve(ctx({ q: "SALES" }));
    expect(result.items.map((i) => i.value)).toEqual(["Jan Sales", "Feb Sales"]);
  });
});

describe("microsoftExcelWorksheetsResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workbookId is empty, no API call", async () => {
    await expect(
      microsoftExcelWorksheetsResolver.resolve(ctx({ deps: { workbookId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when workbookId is missing, no API call", async () => {
    await expect(
      microsoftExcelWorksheetsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workbook gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workbook wb-ghost", "Item not found"),
    );
    const result = await microsoftExcelWorksheetsResolver.resolve(
      ctx({ deps: { workbookId: "wb-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftExcelWorksheetsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftExcelWorksheetsResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "user-1",
        provider: "microsoft-excel",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftExcelWorksheetsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftExcelWorksheetsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw Graph body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('worksheets GET failed: {"raw":"ws-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftExcelWorksheetsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("ws-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});
