/**
 * @jest-environment node
 *
 * Tests for
 * `integrations/microsoft-powerbi/options/pipelineStageSemanticModels.ts`
 * — multi-parent cascade on `pipelineId` + `sourceStageOrder` (stage
 * order arrives as the stage picker's string value).
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockArtifactsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStageArtifactsList",
  () => ({
    pipelineStageArtifactsList: (...args: unknown[]) =>
      mockArtifactsList(...args),
  }),
);

import { microsoftPowerBiPipelineStageSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageSemanticModels";
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

const emptyArtifacts = {
  semanticModels: [],
  reports: [],
  dashboards: [],
  dataflows: [],
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pipelineId: "pipe-1", sourceStageOrder: "0" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockArtifactsList.mockReset();
});

describe("microsoftPowerBiPipelineStageSemanticModelsResolver — shape", () => {
  it("declares requiredDeps=['pipelineId','sourceStageOrder'] (schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineStageSemanticModelsResolver.source).toBe(
      "microsoft-powerbi:pipeline_stage_semantic_models",
    );
    expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.requiredDeps,
    ).toEqual(["pipelineId", "sourceStageOrder"]);
  });
});

describe("microsoftPowerBiPipelineStageSemanticModelsResolver — mapping", () => {
  it("maps only the semanticModels arm; stage order string → number for the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockArtifactsList.mockResolvedValueOnce({
      ...emptyArtifacts,
      semanticModels: [
        { id: "ds-1", name: "Sales model" },
        { id: "ds-2", name: "Ops model" },
      ],
      reports: [{ id: "rep-1", name: "Should not appear" }],
    });

    const result =
      await microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "ds-1", label: "Sales model" },
      { value: "ds-2", label: "Ops model" },
    ]);
    expect(result.hasMore).toBe(false);
    const call = mockArtifactsList.mock.calls[0]![0];
    expect(call.pipelineId).toBe("pipe-1");
    expect(call.stageOrder).toBe(0);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      ...emptyArtifacts,
      semanticModels: [
        { id: "1", name: "Sales model" },
        { id: "2", name: "Ops model" },
      ],
    });
    const result =
      await microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(
        ctx({ q: "SALES" }),
      );
    expect(result.items.map((i) => i.value)).toEqual(["1"]);
  });
});

describe("microsoftPowerBiPipelineStageSemanticModelsResolver — deps + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when pipelineId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(
        ctx({ deps: { sourceStageOrder: "0" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when sourceStageOrder is missing or non-numeric", async () => {
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(
        ctx({ deps: { pipelineId: "pipe-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(
        ctx({ deps: { pipelineId: "pipe-1", sourceStageOrder: "dev" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline/stage gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("pipeline pipe-1 stage 0"),
    );
    const result =
      await microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineStageSemanticModelsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth errors → INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new IntegrationActionRequiredError({
        accountId: "acct-user-1",
        provider: "microsoft-powerbi",
        providerAccountId: "alice@contoso.com",
        reason: "refresh_failed",
      }),
    );
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('artifacts GET failed: {"raw":"artifact-secret"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelineStageSemanticModelsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("artifact-secret");
      expect(msg).not.toContain("Bearer");
    }
  });
});
