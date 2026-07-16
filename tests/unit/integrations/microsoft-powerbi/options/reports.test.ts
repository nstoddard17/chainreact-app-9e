/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/reports.ts`.
 * Depends on `workspaceId`; value = report GUID, label = report name,
 * description = reportType.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftPowerBiReportsResolver } from "@/integrations/microsoft-powerbi/options/reports";
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

describe("microsoftPowerBiReportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiReportsResolver.source).toBe(
      "microsoft-powerbi:reports",
    );
    expect(microsoftPowerBiReportsResolver.provider).toBe("microsoft-powerbi");
    expect(microsoftPowerBiReportsResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiReportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiReportsResolver — mapping", () => {
  it("maps id → value, name → label, reportType → description; pins providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: "d-1" },
      { id: "r-2", name: "Invoices", reportType: "PaginatedReport", datasetId: null },
    ]);

    const result = await microsoftPowerBiReportsResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "r-1", label: "Sales", description: "PowerBIReport" },
      { value: "r-2", label: "Invoices", description: "PaginatedReport" },
    ]);
    expect(result.hasMore).toBe(false);

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });

  it("omits description when reportType is null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Untyped", reportType: null, datasetId: null },
    ]);
    const result = await microsoftPowerBiReportsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "r-1", label: "Untyped" }]);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Q4 Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Marketing", reportType: "PowerBIReport", datasetId: null },
    ]);
    const result = await microsoftPowerBiReportsResolver.resolve(
      ctx({ q: "sales" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r-1"]);
  });
});

describe("microsoftPowerBiReportsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing/empty, no API call", async () => {
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ deps: { workspaceId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent workspace is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiReportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiReportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR without leaking the raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('reports GET failed: {"raw":"pbi-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiReportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("pbi-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
