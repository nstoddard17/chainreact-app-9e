/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/options/worksheets.ts` —
 * Slice 4.EXCEL-META-2. Depends on `workbookId`; value is the worksheet
 * NAME (handlers address worksheets by name).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftExcelWorksheetsResolver } from "@/integrations/microsoft-excel/options/worksheets";
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
  userId: "user-1",
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
    expect(args.accountId).toBe("alice@contoso.com");
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
        userId: "user-1",
        provider: "microsoft-excel",
        accountId: "alice@contoso.com",
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
