/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/targetSemanticModels.ts`.
 * Backs `clone_report.targetSemanticModelId`. Identical mapping to
 * `semantic_models` but keyed on `targetWorkspaceId` — deps are keyed by the
 * parent FIELD name, so the dep name (not the resolver) is what has to match.
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

import { microsoftPowerBiTargetSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/targetSemanticModels";
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
    deps: { targetWorkspaceId: "ws-target" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDatasetsList.mockReset();
});

describe("microsoftPowerBiTargetSemanticModelsResolver — shape", () => {
  it("declares requiredDeps=['targetWorkspaceId'] — the clone_report field name, verbatim", () => {
    expect(microsoftPowerBiTargetSemanticModelsResolver.source).toBe(
      "microsoft-powerbi:target_semantic_models",
    );
    expect(microsoftPowerBiTargetSemanticModelsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiTargetSemanticModelsResolver.requiresIntegration,
    ).toBe(true);
    expect(microsoftPowerBiTargetSemanticModelsResolver.requiredDeps).toEqual([
      "targetWorkspaceId",
    ]);
  });
});

describe("microsoftPowerBiTargetSemanticModelsResolver — mapping", () => {
  it("maps value = dataset id, label = dataset name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "ds-1", name: "Sales", isRefreshable: true, configuredBy: null },
      { id: "ds-2", name: "Finance", isRefreshable: true, configuredBy: null },
    ]);
    const result =
      await microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx());
    expect(result).toEqual({
      items: [
        { value: "ds-1", label: "Sales" },
        { value: "ds-2", label: "Finance" },
      ],
      hasMore: false,
    });
  });

  it("lists from the TARGET workspace (dep threaded to the wrapper as groupId)", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockDatasetsList.mockResolvedValueOnce([]);

    await microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx());

    expect(mockDatasetsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-target",
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "ds-1", name: "Sales", isRefreshable: true, configuredBy: null },
      { id: "ds-2", name: "Finance", isRefreshable: true, configuredBy: null },
    ]);
    const result = await microsoftPowerBiTargetSemanticModelsResolver.resolve(
      ctx({ q: "fin" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ds-2"]);
  });
});

describe("microsoftPowerBiTargetSemanticModelsResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when targetWorkspaceId missing, no API call", async () => {
    await expect(
      microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("does NOT read a `workspaceId` dep (the source-workspace field must not drive it)", async () => {
    await expect(
      microsoftPowerBiTargetSemanticModelsResolver.resolve(
        ctx({ deps: { workspaceId: "ws-source" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when target workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiTargetSemanticModelsResolver.resolve(
      ctx({ deps: { targetWorkspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiTargetSemanticModelsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiTargetSemanticModelsResolver.resolve(
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
      microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('datasets GET failed: {"raw":"ds-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiTargetSemanticModelsResolver.resolve(ctx());
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
