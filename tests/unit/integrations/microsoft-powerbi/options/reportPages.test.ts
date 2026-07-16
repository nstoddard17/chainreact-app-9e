/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/reportPages.ts`.
 * Multi-parent cascade (workspaceId + reportId); value = the WIRE page
 * name ("ReportSection…"), label = displayName.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

import { microsoftPowerBiReportPagesResolver } from "@/integrations/microsoft-powerbi/options/reportPages";
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
    deps: { workspaceId: "ws-1", reportId: "rep-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftPowerBiReportPagesResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','reportId'] (multi-parent) and requires an integration", () => {
    expect(microsoftPowerBiReportPagesResolver.source).toBe(
      "microsoft-powerbi:report_pages",
    );
    expect(microsoftPowerBiReportPagesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiReportPagesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiReportPagesResolver.requiredDeps).toEqual([
      "workspaceId",
      "reportId",
    ]);
  });
});

describe("microsoftPowerBiReportPagesResolver — mapping", () => {
  it("maps wire name → value, displayName → label (falls back to name)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ReportSection1", displayName: "Overview", order: 0 },
      { name: "ReportSection2", displayName: null, order: 1 },
    ]);

    const result = await microsoftPowerBiReportPagesResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "ReportSection1", label: "Overview" },
      { value: "ReportSection2", label: "ReportSection2" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ReportSection1", displayName: "Sales Overview", order: 0 },
      { name: "ReportSection2", displayName: "Detail", order: 1 },
    ]);
    const result = await microsoftPowerBiReportPagesResolver.resolve(
      ctx({ q: "sales" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ReportSection1"]);
  });
});

describe("microsoftPowerBiReportPagesResolver — dependencies + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { reportId: "rep-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when reportId is missing/empty, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", reportId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent report is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("report rep-ghost"),
    );
    const result = await microsoftPowerBiReportPagesResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", reportId: "rep-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiReportPagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiReportPagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('report pages GET failed: {"raw":"pbi-secret-leak"}'),
    );
    try {
      await microsoftPowerBiReportPagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("pbi-secret-leak");
    }
  });
});
