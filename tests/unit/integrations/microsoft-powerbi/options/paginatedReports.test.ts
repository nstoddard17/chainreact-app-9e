/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/paginatedReports.ts`.
 * Same reports endpoint as `microsoft-powerbi:reports`, filtered
 * client-side to reportType === "PaginatedReport".
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftPowerBiPaginatedReportsResolver } from "@/integrations/microsoft-powerbi/options/paginatedReports";
import {
  IntegrationActionRequiredError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import {
  OptionsResolverError,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";

const integration: IntegrationRecord = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "microsoft-powerbi",
  providerAccountId: "alice@contoso.com",
  displayName: "Alice (Power BI)",
  accessTokenEncrypted: "enc:cipher",
  refreshTokenEncrypted: "enc:refresh",
  accessTokenExpiresAt: "2026-07-15T12:00:00Z",
  scopes: ["offline_access"],
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
    deps: { workspaceId: "ws-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftPowerBiPaginatedReportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiPaginatedReportsResolver.source).toBe(
      "microsoft-powerbi:paginated_reports",
    );
    expect(microsoftPowerBiPaginatedReportsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiPaginatedReportsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiPaginatedReportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — mapping + filtering", () => {
  it("keeps ONLY PaginatedReport rows (Power BI reports excluded)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: "d-1" },
      { id: "r-2", name: "Invoices", reportType: "PaginatedReport", datasetId: null },
      { id: "r-3", name: "Untyped", reportType: null, datasetId: null },
    ]);

    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx(),
    );

    expect(result.items).toEqual([{ value: "r-2", label: "Invoices" }]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Invoice North", reportType: "PaginatedReport", datasetId: null },
      { id: "r-2", name: "Invoice South", reportType: "PaginatedReport", datasetId: null },
      { id: "r-3", name: "Timesheet", reportType: "PaginatedReport", datasetId: null },
    ]);
    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx({ q: "INVOICE" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r-1", "r-2"]);
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent workspace is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("maps IntegrationActionRequiredError + Unauthorized401Error → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('reports GET failed: {"raw":"pbi-secret-leak"}'),
    );
    try {
      await microsoftPowerBiPaginatedReportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("pbi-secret-leak");
    }
  });
});
