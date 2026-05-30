/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/options/tables.ts` —
 * Slice 4.EXCEL-META-2. Depends on `workbookId`; value is the table NAME.
 * Uses the new `tablesList` Graph helper.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftExcelTablesResolver } from "@/integrations/microsoft-excel/options/tables";
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
    expect(args.accountId).toBe("alice@contoso.com");
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
