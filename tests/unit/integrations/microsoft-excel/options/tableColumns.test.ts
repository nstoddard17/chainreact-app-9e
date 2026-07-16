/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/options/tableColumns.ts` —
 * RESOLVERS-1. Lists the REAL column headers of the selected Excel table
 * (same `tableColumnsList` read the find_row handler matches against);
 * empty result = "no columns detected" (honest UI fallback), never
 * invented columns.
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
