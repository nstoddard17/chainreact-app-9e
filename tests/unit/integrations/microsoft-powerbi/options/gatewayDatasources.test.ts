/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/gatewayDatasources.ts`
 * — cascading child of `microsoft-powerbi:gateways` (dep `gatewayId`).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockDatasourcesList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourcesList",
  () => ({
    gatewayDatasourcesList: (...args: unknown[]) =>
      mockDatasourcesList(...args),
  }),
);

import { microsoftPowerBiGatewayDatasourcesResolver } from "@/integrations/microsoft-powerbi/options/gatewayDatasources";
import { Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import type { OptionsResolverContext } from "@/services/options/types";
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
    deps: { gatewayId: "gw-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDatasourcesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("microsoftPowerBiGatewayDatasourcesResolver", () => {
  it("declares requiredDeps=['gatewayId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiGatewayDatasourcesResolver.source).toBe(
      "microsoft-powerbi:gateway_datasources",
    );
    expect(microsoftPowerBiGatewayDatasourcesResolver.requiredDeps).toEqual([
      "gatewayId",
    ]);
  });

  it("labels items `<name> · <type>` and passes the gatewayId dep to the wrapper", async () => {
    mockDatasourcesList.mockResolvedValueOnce([
      { id: "ds-1", datasourceName: "Sales SQL", datasourceType: "Sql" },
      { id: "ds-2", datasourceName: "Files", datasourceType: null },
      { id: "ds-3", datasourceName: null, datasourceType: "OData" },
    ]);

    const result = await microsoftPowerBiGatewayDatasourcesResolver.resolve(
      ctx(),
    );

    expect(mockDatasourcesList.mock.calls[0]![0].gatewayId).toBe("gw-1");
    expect(result.items).toEqual([
      { value: "ds-1", label: "Sales SQL · Sql" },
      { value: "ds-2", label: "Files" },
      { value: "ds-3", label: "ds-3 · OData" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("filters client-side by q", async () => {
    mockDatasourcesList.mockResolvedValueOnce([
      { id: "ds-1", datasourceName: "Sales SQL", datasourceType: "Sql" },
      { id: "ds-2", datasourceName: "HR Oracle", datasourceType: "Oracle" },
    ]);
    const result = await microsoftPowerBiGatewayDatasourcesResolver.resolve(
      ctx({ q: "oracle" }),
    );
    expect(result.items).toEqual([
      { value: "ds-2", label: "HR Oracle · Oracle" },
    ]);
  });

  it("short-circuits MISSING_DEPENDENCY without a gatewayId", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockDatasourcesList).not.toHaveBeenCalled();
  });

  it("maps a missing integration to INTEGRATION_DISCONNECTED", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns EMPTY items (not an error) when the parent gateway is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("gateway gw-1"),
    );
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).resolves.toEqual({ items: [], hasMore: false });
  });

  it("maps other provider failures to a static PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("HTTP 500 raw"));
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
