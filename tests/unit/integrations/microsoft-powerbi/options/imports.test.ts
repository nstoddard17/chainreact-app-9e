/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/imports.ts`.
 * Depends on `workspaceId`; value = import id, label = name (id
 * fallback), description = importState.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockImportsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/imports/importsList", () => ({
  importsList: (...args: unknown[]) => mockImportsList(...args),
}));

import { microsoftPowerBiImportsResolver } from "@/integrations/microsoft-powerbi/options/imports";
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
    deps: { workspaceId: "ws-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockImportsList.mockReset();
});

describe("microsoftPowerBiImportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiImportsResolver.source).toBe(
      "microsoft-powerbi:imports",
    );
    expect(microsoftPowerBiImportsResolver.provider).toBe("microsoft-powerbi");
    expect(microsoftPowerBiImportsResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiImportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiImportsResolver — mapping", () => {
  it("maps id → value, name → label, importState → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-1", name: "Report.pbix", importState: "Succeeded" },
      { id: "imp-2", name: "Other.pbix", importState: "Publishing" },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "imp-1", label: "Report.pbix", description: "Succeeded" },
      { value: "imp-2", label: "Other.pbix", description: "Publishing" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the id as label (and omits description) when the provider omits them", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-3", name: null, importState: null },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "imp-3", label: "imp-3" }]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-1", name: "Sales.pbix", importState: "Succeeded" },
      { id: "imp-2", name: "Ops.pbix", importState: "Succeeded" },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(
      ctx({ q: "SALES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["imp-1"]);
  });
});

describe("microsoftPowerBiImportsResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiImportsResolver.resolve(
        ctx({ deps: { workspaceId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiImportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiImportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiImportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('imports GET failed: {"raw":"imp-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiImportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("imp-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
