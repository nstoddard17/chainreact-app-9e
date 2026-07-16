/**
 * @jest-environment node
 *
 * Tests for `integrations/microsoft-powerbi/options/pipelineStageReports.ts`
 * — same multi-parent cascade contract as the stage semantic-models
 * resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
 * this file pins the reports-specific arm + the shared error mapping.
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

import { microsoftPowerBiPipelineStageReportsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageReports";
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
    deps: { pipelineId: "pipe-1", sourceStageOrder: "1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockArtifactsList.mockReset();
});

describe("microsoftPowerBiPipelineStageReportsResolver", () => {
  it("declares the source + multi-parent requiredDeps", () => {
    expect(microsoftPowerBiPipelineStageReportsResolver.source).toBe(
      "microsoft-powerbi:pipeline_stage_reports",
    );
    expect(microsoftPowerBiPipelineStageReportsResolver.requiredDeps).toEqual([
      "pipelineId",
      "sourceStageOrder",
    ]);
  });

  it("maps only the reports arm with q filtering", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockArtifactsList.mockResolvedValueOnce({
      ...emptyArtifacts,
      reports: [
        { id: "rep-1", name: "Sales report" },
        { id: "rep-2", name: "Ops report" },
      ],
      semanticModels: [{ id: "ds-1", name: "Should not appear" }],
    });

    const result = await microsoftPowerBiPipelineStageReportsResolver.resolve(
      ctx({ q: "sales" }),
    );
    expect(result.items).toEqual([{ value: "rep-1", label: "Sales report" }]);
    expect(mockArtifactsList.mock.calls[0]![0].stageOrder).toBe(1);
  });

  it("throws MISSING_DEPENDENCY on missing/non-numeric deps, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStageReportsResolver.resolve(
        ctx({ deps: { pipelineId: "pipe-1", sourceStageOrder: "x" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStageReportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("NotFound parent → empty items; null integration → INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("pipeline"));
    expect(
      await microsoftPowerBiPipelineStageReportsResolver.resolve(ctx()),
    ).toEqual({ items: [], hasMore: false });

    await expect(
      microsoftPowerBiPipelineStageReportsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Error("raw Bearer leak"));
    try {
      await microsoftPowerBiPipelineStageReportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("Bearer");
    }
  });
});
