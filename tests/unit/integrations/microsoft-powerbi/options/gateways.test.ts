/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/gateways.ts` —
 * root of the gateway cascade (no deps).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockGatewaysList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewaysList",
  () => ({
    gatewaysList: (...args: unknown[]) => mockGatewaysList(...args),
  }),
);

import { microsoftPowerBiGatewaysResolver } from "@/integrations/microsoft-powerbi/options/gateways";
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
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGatewaysList.mockReset();
});

describe("microsoftPowerBiGatewaysResolver", () => {
  it("declares the canonical source id with no deps", () => {
    expect(microsoftPowerBiGatewaysResolver.source).toBe(
      "microsoft-powerbi:gateways",
    );
    expect(microsoftPowerBiGatewaysResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiGatewaysResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiGatewaysResolver.requiredDeps).toBeUndefined();
  });

  it("maps gateways to value=id / label=name / description=type and filters by q", async () => {
    mockRefreshAndRetry.mockImplementation(
      async (i: { apiCall: (t: string) => Promise<unknown> }) =>
        i.apiCall("tok"),
    );
    mockGatewaysList.mockResolvedValueOnce([
      { id: "gw-1", name: "Warehouse gateway", type: "Resource" },
      { id: "gw-2", name: "Office gateway", type: null },
    ]);

    const all = await microsoftPowerBiGatewaysResolver.resolve(ctx());
    expect(all.items).toEqual([
      { value: "gw-1", label: "Warehouse gateway", description: "Resource" },
      { value: "gw-2", label: "Office gateway" },
    ]);
    expect(all.hasMore).toBe(false);

    mockGatewaysList.mockResolvedValueOnce([
      { id: "gw-1", name: "Warehouse gateway", type: "Resource" },
      { id: "gw-2", name: "Office gateway", type: null },
    ]);
    const filtered = await microsoftPowerBiGatewaysResolver.resolve(
      ctx({ q: "office" }),
    );
    expect(filtered.items).toEqual([
      { value: "gw-2", label: "Office gateway" },
    ]);
  });

  it("maps a missing integration to INTEGRATION_DISCONNECTED", async () => {
    await expect(
      microsoftPowerBiGatewaysResolver.resolve(ctx({ integration: null })),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("401"),
    );
    await expect(
      microsoftPowerBiGatewaysResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: null,
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiGatewaysResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other provider failures to a static PROVIDER_ERROR (no raw body)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("Power BI gateways GET failed: HTTP 500 raw-provider-detail"),
    );
    let thrown: OptionsResolverError | null = null;
    try {
      await microsoftPowerBiGatewaysResolver.resolve(ctx());
    } catch (err) {
      thrown = err as OptionsResolverError;
    }
    expect(thrown).toBeInstanceOf(OptionsResolverError);
    expect(thrown!.code).toBe("PROVIDER_ERROR");
    expect(thrown!.message).not.toContain("raw-provider-detail");
  });
});
