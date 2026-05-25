/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-excel/options/workbooks.ts` —
 * Slice 4.EXCEL-META-2. Account-scoped top-level picker (no deps).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftExcelWorkbooksResolver } from "@/integrations/microsoft-excel/options/workbooks";
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
    expect(url).toMatch(/%24top=100/);
    fetchSpy.mockRestore();

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-excel");
    expect(args.accountId).toBe("alice@contoso.com");
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
        userId: "user-1",
        provider: "microsoft-excel",
        accountId: "alice@contoso.com",
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
