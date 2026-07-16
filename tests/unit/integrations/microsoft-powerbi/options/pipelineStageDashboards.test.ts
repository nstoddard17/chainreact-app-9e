/**
 * @jest-environment node
 *
 * Tests for
 * `integrations/microsoft-powerbi/options/pipelineStageDashboards.ts` —
 * same multi-parent cascade contract as the stage semantic-models
 * resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
 * this file pins the dashboards-specific arm + the shared error mapping.
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

import { microsoftPowerBiPipelineStageDashboardsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageDashboards";
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

describe("microsoftPowerBiPipelineStageDashboardsResolver", () => {
  it("declares the source + multi-parent requiredDeps", () => {
    expect(microsoftPowerBiPipelineStageDashboardsResolver.source).toBe(
      "microsoft-powerbi:pipeline_stage_dashboards",
    );
    expect(
      microsoftPowerBiPipelineStageDashboardsResolver.requiredDeps,
    ).toEqual(["pipelineId", "sourceStageOrder"]);
  });

  it("maps only the dashboards arm with q filtering", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockArtifactsList.mockResolvedValueOnce({
      ...emptyArtifacts,
      dashboards: [
        { id: "dash-1", name: "Exec dashboard" },
        { id: "dash-2", name: "Ops dashboard" },
      ],
      dataflows: [{ id: "df-1", name: "Should not appear" }],
    });

    const result =
      await microsoftPowerBiPipelineStageDashboardsResolver.resolve(
        ctx({ q: "exec" }),
      );
    expect(result.items).toEqual([{ value: "dash-1", label: "Exec dashboard" }]);
  });

  it("throws MISSING_DEPENDENCY on missing/non-numeric deps, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStageDashboardsResolver.resolve(
        ctx({ deps: { pipelineId: "", sourceStageOrder: "0" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStageDashboardsResolver.resolve(
        ctx({ deps: { pipelineId: "pipe-1", sourceStageOrder: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("NotFound parent → empty items; null integration → INTEGRATION_DISCONNECTED; other → PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("pipeline"));
    expect(
      await microsoftPowerBiPipelineStageDashboardsResolver.resolve(ctx()),
    ).toEqual({ items: [], hasMore: false });

    await expect(
      microsoftPowerBiPipelineStageDashboardsResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Error("raw Bearer leak"));
    try {
      await microsoftPowerBiPipelineStageDashboardsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("Bearer");
    }
  });
});
