/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/gatewayDatasourceUsers.ts`
 * — two-parent cascade (deps `gatewayId` + `datasourceId`).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockUsersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUsersList",
  () => ({
    gatewayDatasourceUsersList: (...args: unknown[]) =>
      mockUsersList(...args),
  }),
);

import { microsoftPowerBiGatewayDatasourceUsersResolver } from "@/integrations/microsoft-powerbi/options/gatewayDatasourceUsers";
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
    deps: { gatewayId: "gw-1", datasourceId: "ds-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUsersList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("microsoftPowerBiGatewayDatasourceUsersResolver", () => {
  it("declares requiredDeps=['gatewayId','datasourceId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiGatewayDatasourceUsersResolver.source).toBe(
      "microsoft-powerbi:gateway_datasource_users",
    );
    expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.requiredDeps,
    ).toEqual(["gatewayId", "datasourceId"]);
  });

  it("maps users to value=email (identifier fallback) with `<name> · <right>` labels", async () => {
    mockUsersList.mockResolvedValueOnce([
      {
        emailAddress: "bob@contoso.com",
        identifier: null,
        displayName: "Bob",
        datasourceAccessRight: "Read",
        principalType: "User",
      },
      {
        emailAddress: null,
        identifier: "sp-obj-id-1",
        displayName: null,
        datasourceAccessRight: "ReadOverrideEffectiveIdentity",
        principalType: "App",
      },
      {
        // No addressable handle → skipped.
        emailAddress: null,
        identifier: null,
        displayName: "Ghost",
        datasourceAccessRight: "Read",
        principalType: "User",
      },
    ]);

    const result =
      await microsoftPowerBiGatewayDatasourceUsersResolver.resolve(ctx());

    expect(mockUsersList.mock.calls[0]![0]).toMatchObject({
      gatewayId: "gw-1",
      datasourceId: "ds-1",
    });
    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "Bob · Read" },
      {
        value: "sp-obj-id-1",
        label: "sp-obj-id-1 · ReadOverrideEffectiveIdentity",
      },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("filters client-side by q", async () => {
    mockUsersList.mockResolvedValueOnce([
      {
        emailAddress: "bob@contoso.com",
        identifier: null,
        displayName: "Bob",
        datasourceAccessRight: "Read",
        principalType: "User",
      },
      {
        emailAddress: "eve@contoso.com",
        identifier: null,
        displayName: "Eve",
        datasourceAccessRight: "Read",
        principalType: "User",
      },
    ]);
    const result =
      await microsoftPowerBiGatewayDatasourceUsersResolver.resolve(
        ctx({ q: "eve" }),
      );
    expect(result.items).toEqual([
      { value: "eve@contoso.com", label: "Eve · Read" },
    ]);
  });

  it("short-circuits MISSING_DEPENDENCY when either parent is missing", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(
        ctx({ deps: { datasourceId: "ds-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(
        ctx({ deps: { gatewayId: "gw-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockUsersList).not.toHaveBeenCalled();
  });

  it("maps a missing integration to INTEGRATION_DISCONNECTED", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns EMPTY items (not an error) when the parent datasource is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("gateway datasource ds-1"),
    );
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(ctx()),
    ).resolves.toEqual({ items: [], hasMore: false });
  });

  it("maps other provider failures to a static PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("HTTP 500 raw"));
    await expect(
      microsoftPowerBiGatewayDatasourceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});
