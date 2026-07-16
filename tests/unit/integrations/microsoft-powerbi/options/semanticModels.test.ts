/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/semanticModels.ts` —
 * backs `semanticModelId` on every semantic-model action/trigger, keyed
 * off the `workspaceId` cascade parent. Dep name is pinned verbatim to
 * the runtime Zod schemas (camelCase), because deps are keyed by the
 * parent FIELD name — a rename here silently empties the picker.
 *
 * Written during RESOLVERS-1's clean-checkout closure: the two root
 * resolvers (workspaces / semantic_models) shipped without direct tests
 * while all 19 of their descendants had them.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockDatasetsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/datasets/datasetsList", () => ({
  datasetsList: (...args: unknown[]) => mockDatasetsList(...args),
}));

import { microsoftPowerBiSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/semanticModels";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workspaceId: "ws-1" },
    ...overrides,
  };
}

function dataset(overrides: Record<string, unknown> = {}) {
  return {
    id: "ds-1",
    name: "Sales Model",
    isRefreshable: true,
    configuredBy: "alice@contoso.com",
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDatasetsList.mockReset();
});

describe("microsoftPowerBiSemanticModelsResolver — shape", () => {
  it("declares source/provider and requires the workspaceId dep (schema-pinned name)", () => {
    expect(microsoftPowerBiSemanticModelsResolver.source).toBe(
      "microsoft-powerbi:semantic_models",
    );
    expect(microsoftPowerBiSemanticModelsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiSemanticModelsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiSemanticModelsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiSemanticModelsResolver — wrapper invocation", () => {
  it("passes the selected workspace through to datasetsList via refreshAndRetry", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockDatasetsList.mockResolvedValueOnce([]);

    await microsoftPowerBiSemanticModelsResolver.resolve(ctx());

    expect(mockDatasetsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.accountId).toBe("acct-user-1");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiSemanticModelsResolver — dependency gating", () => {
  it("throws MISSING_DEPENDENCY (no API call) when no workspace is selected yet", async () => {
    // `workspaceId: 42` is deliberately mistyped: the route only ever sends
    // strings, so this asserts the resolver's own runtime guard (not the type
    // system) is what fails closed. Cast at the boundary to say that on purpose.
    const badDeps: ReadonlyArray<Record<string, unknown>> = [
      {},
      { workspaceId: "" },
      { workspaceId: 42 },
    ];
    for (const deps of badDeps) {
      await expect(
        microsoftPowerBiSemanticModelsResolver.resolve(
          ctx({ deps: deps as Readonly<Record<string, string>> }),
        ),
      ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    }
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

describe("microsoftPowerBiSemanticModelsResolver — mapping + filtering", () => {
  it("maps id → value and name → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      dataset(),
      dataset({ id: "ds-2", name: "Inventory Model" }),
    ]);
    const result = await microsoftPowerBiSemanticModelsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ds-1", label: "Sales Model" },
      { value: "ds-2", label: "Inventory Model" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies a case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      dataset(),
      dataset({ id: "ds-2", name: "Inventory Model" }),
    ]);
    const result = await microsoftPowerBiSemanticModelsResolver.resolve(
      ctx({ q: "INVENTORY" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ds-2"]);
  });
});

describe("microsoftPowerBiSemanticModelsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, without calling the API", async () => {
    await expect(
      microsoftPowerBiSemanticModelsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("treats a deleted parent workspace (NotFoundError) as an empty picker, not an error", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("workspace ws-1"));
    const result = await microsoftPowerBiSemanticModelsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no token / raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('datasets GET failed: {"raw":"ds-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiSemanticModelsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("ds-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});
