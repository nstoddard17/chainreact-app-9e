/**
 * @jest-environment node
 *
 * Tests for
 * `integrations/microsoft-powerbi/options/pipelineStageDataflows.ts` —
 * same multi-parent cascade contract as the stage semantic-models
 * resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
 * this file pins the dataflows-specific arm + the shared error mapping.
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

import { microsoftPowerBiPipelineStageDataflowsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageDataflows";
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

describe("microsoftPowerBiPipelineStageDataflowsResolver", () => {
  it("declares the source + multi-parent requiredDeps", () => {
    expect(microsoftPowerBiPipelineStageDataflowsResolver.source).toBe(
      "microsoft-powerbi:pipeline_stage_dataflows",
    );
    expect(
      microsoftPowerBiPipelineStageDataflowsResolver.requiredDeps,
    ).toEqual(["pipelineId", "sourceStageOrder"]);
  });

  it("maps only the dataflows arm with q filtering", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockArtifactsList.mockResolvedValueOnce({
      ...emptyArtifacts,
      dataflows: [
        { id: "df-1", name: "Ingest flow" },
        { id: "df-2", name: "Cleanup flow" },
      ],
      reports: [{ id: "rep-1", name: "Should not appear" }],
    });

    const result = await microsoftPowerBiPipelineStageDataflowsResolver.resolve(
      ctx({ q: "ingest" }),
    );
    expect(result.items).toEqual([{ value: "df-1", label: "Ingest flow" }]);
  });

  it("throws MISSING_DEPENDENCY on missing/non-numeric deps, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStageDataflowsResolver.resolve(
        ctx({ deps: { sourceStageOrder: "0" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStageDataflowsResolver.resolve(
        ctx({ deps: { pipelineId: "pipe-1", sourceStageOrder: "1.5" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("NotFound parent → empty items; null integration → INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("pipeline"));
    expect(
      await microsoftPowerBiPipelineStageDataflowsResolver.resolve(ctx()),
    ).toEqual({ items: [], hasMore: false });

    await expect(
      microsoftPowerBiPipelineStageDataflowsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Error("raw Bearer leak"));
    try {
      await microsoftPowerBiPipelineStageDataflowsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("Bearer");
    }
  });
});
