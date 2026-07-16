/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/dataflows.ts`.
 * Depends on `workspaceId`; value = dataflow objectId, label = name.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockDataflowsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowsList",
  () => ({
    dataflowsList: (...args: unknown[]) => mockDataflowsList(...args),
  }),
);

import { microsoftPowerBiDataflowsResolver } from "@/integrations/microsoft-powerbi/options/dataflows";
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
  mockDataflowsList.mockReset();
});

describe("microsoftPowerBiDataflowsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftPowerBiDataflowsResolver.source).toBe(
      "microsoft-powerbi:dataflows",
    );
    expect(microsoftPowerBiDataflowsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiDataflowsResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiDataflowsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiDataflowsResolver — wrapper invocation", () => {
  it("calls dataflowsList with the workspaceId via refreshAndRetry pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockDataflowsList.mockResolvedValueOnce([]);

    await microsoftPowerBiDataflowsResolver.resolve(ctx());

    expect(mockDataflowsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiDataflowsResolver — mapping", () => {
  it("maps objectId → value, name → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { objectId: "df-1", name: "Sales ETL", description: null },
      { objectId: "df-2", name: "Ops ETL", description: "nightly" },
    ]);
    const result = await microsoftPowerBiDataflowsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "df-1", label: "Sales ETL" },
      { value: "df-2", label: "Ops ETL" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { objectId: "df-1", name: "Sales ETL", description: null },
      { objectId: "df-2", name: "Ops ETL", description: null },
      { objectId: "df-3", name: "Notes", description: null },
    ]);
    const result = await microsoftPowerBiDataflowsResolver.resolve(
      ctx({ q: "ETL" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["df-1", "df-2"]);
  });
});

describe("microsoftPowerBiDataflowsResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowsResolver.resolve(
        ctx({ deps: { workspaceId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiDataflowsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiDataflowsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiDataflowsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiDataflowsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiDataflowsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('dataflows GET failed: {"raw":"df-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiDataflowsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("df-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
