/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/options/worksheetColumns.ts` —
 * SPREADSHEET-CONFIG-REDESIGN-1. Reads the REAL first-row headers of the
 * selected worksheet (same `worksheetUsedRange` read the add_row batch
 * handler validates against); empty result = "no columns detected"
 * (honest UI fallback), never invented columns.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftExcelWorksheetColumnsResolver } from "@/integrations/microsoft-excel/options/worksheetColumns";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

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
