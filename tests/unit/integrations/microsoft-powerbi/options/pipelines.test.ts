/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/pipelines.ts` —
 * root of the deployment-pipeline cascade (no deps).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockPipelinesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/pipelines/pipelinesList", () => ({
  pipelinesList: (...args: unknown[]) => mockPipelinesList(...args),
}));

import { microsoftPowerBiPipelinesResolver } from "@/integrations/microsoft-powerbi/options/pipelines";
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
  createdAt: "2026-07-14T00:00:00Z",
  updatedAt: "2026-07-14T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return { userId: "user-1", integration, q: "", deps: {}, ...overrides };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPipelinesList.mockReset();
});

describe("microsoftPowerBiPipelinesResolver — shape", () => {
  it("declares the source and no requiredDeps", () => {
    expect(microsoftPowerBiPipelinesResolver.source).toBe(
      "microsoft-powerbi:pipelines",
    );
    expect(microsoftPowerBiPipelinesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiPipelinesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiPipelinesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftPowerBiPipelinesResolver — mapping", () => {
  it("maps id → value, displayName → label; pins providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockPipelinesList.mockResolvedValueOnce([
      { id: "pipe-1", displayName: "Sales BI", description: null },
      { id: "pipe-2", displayName: "Ops BI", description: "d" },
    ]);

    const result = await microsoftPowerBiPipelinesResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "pipe-1", label: "Sales BI" },
      { value: "pipe-2", label: "Ops BI" },
    ]);
    expect(result.hasMore).toBe(false);
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "1", displayName: "Sales BI", description: null },
      { id: "2", displayName: "Ops BI", description: null },
    ]);
    const result = await microsoftPowerBiPipelinesResolver.resolve(
      ctx({ q: "SALES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("microsoftPowerBiPipelinesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiPipelinesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelinesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('pipelines GET failed: {"raw":"pipe-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelinesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("pipe-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
