/**
 * @jest-environment node
 *
 * microsoft-powerbi options-resolver contract suite — one provider-level suite
 * consolidating the former per-resolver files (PROVIDER-CONTRACT-CONSOLIDATION-1C).
 * Every describe below is one former file, merged verbatim; the shared
 * refreshAndRetry/wrapper mock scaffold is declared once and reset by each
 * section's own beforeEach.
 */

const mockRefreshAndRetry = jest.fn();
jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return {
    ...actual,
    refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  };
});

const mockCapacitiesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/capacities/capacitiesList", () => ({
  capacitiesList: (...args: unknown[]) => mockCapacitiesList(...args),
}));

const mockTransactionsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowTransactionsList",
  () => ({
    dataflowTransactionsList: (...args: unknown[]) =>
      mockTransactionsList(...args),
  }),
);

const mockDataflowsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/dataflows/dataflowsList",
  () => ({
    dataflowsList: (...args: unknown[]) => mockDataflowsList(...args),
  }),
);

const mockUsersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourceUsersList",
  () => ({
    gatewayDatasourceUsersList: (...args: unknown[]) =>
      mockUsersList(...args),
  }),
);

const mockDatasourcesList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewayDatasourcesList",
  () => ({
    gatewayDatasourcesList: (...args: unknown[]) =>
      mockDatasourcesList(...args),
  }),
);

const mockGatewaysList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/gateways/gatewaysList",
  () => ({
    gatewaysList: (...args: unknown[]) => mockGatewaysList(...args),
  }),
);

const mockImportsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/imports/importsList", () => ({
  importsList: (...args: unknown[]) => mockImportsList(...args),
}));

const mockOperationsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineOperationsList",
  () => ({
    pipelineOperationsList: (...args: unknown[]) => mockOperationsList(...args),
  }),
);

const mockArtifactsList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStageArtifactsList",
  () => ({
    pipelineStageArtifactsList: (...args: unknown[]) =>
      mockArtifactsList(...args),
  }),
);

const mockStagesList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineStagesList",
  () => ({
    pipelineStagesList: (...args: unknown[]) => mockStagesList(...args),
  }),
);

const mockPipelineUsersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/pipelines/pipelineUsersList",
  () => ({
    pipelineUsersList: (...args: unknown[]) => mockPipelineUsersList(...args),
  }),
);

const mockPipelinesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/pipelines/pipelinesList", () => ({
  pipelinesList: (...args: unknown[]) => mockPipelinesList(...args),
}));

const mockParametersList = jest.fn();
jest.mock(
  "@/integrations/microsoft-powerbi/api/datasets/parametersList",
  () => ({
    parametersList: (...args: unknown[]) => mockParametersList(...args),
  }),
);

const mockRefreshesList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/datasets/refreshesList", () => ({
  refreshesList: (...args: unknown[]) => mockRefreshesList(...args),
}));

const mockDatasetsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/datasets/datasetsList", () => ({
  datasetsList: (...args: unknown[]) => mockDatasetsList(...args),
}));

const mockGroupUsersList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/groups/groupUsersList", () => ({
  groupUsersList: (...args: unknown[]) => mockGroupUsersList(...args),
}));

const mockGroupsList = jest.fn();
jest.mock("@/integrations/microsoft-powerbi/api/groups/groupsList", () => ({
  groupsList: (...args: unknown[]) => mockGroupsList(...args),
}));

import { microsoftPowerBiCapacitiesResolver } from "@/integrations/microsoft-powerbi/options/capacities";
import { IntegrationActionRequiredError, Unauthorized401Error } from "@/services/oauth/refreshAndRetry";
import { OptionsResolverError, type OptionsResolverContext } from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import { microsoftPowerBiDataflowTransactionsResolver } from "@/integrations/microsoft-powerbi/options/dataflowTransactions";
import { NotFoundError } from "@/integrations/microsoft-powerbi/api/errors";
import { microsoftPowerBiDataflowsResolver } from "@/integrations/microsoft-powerbi/options/dataflows";
import { microsoftPowerBiGatewayDatasourceUsersResolver } from "@/integrations/microsoft-powerbi/options/gatewayDatasourceUsers";
import { microsoftPowerBiGatewayDatasourcesResolver } from "@/integrations/microsoft-powerbi/options/gatewayDatasources";
import { microsoftPowerBiGatewaysResolver } from "@/integrations/microsoft-powerbi/options/gateways";
import { microsoftPowerBiImportsResolver } from "@/integrations/microsoft-powerbi/options/imports";
import { microsoftPowerBiPaginatedReportsResolver } from "@/integrations/microsoft-powerbi/options/paginatedReports";
import { microsoftPowerBiPipelineOperationsResolver } from "@/integrations/microsoft-powerbi/options/pipelineOperations";
import { microsoftPowerBiPipelineStageDashboardsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageDashboards";
import { microsoftPowerBiPipelineStageDataflowsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageDataflows";
import { microsoftPowerBiPipelineStageReportsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageReports";
import { microsoftPowerBiPipelineStageSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/pipelineStageSemanticModels";
import { microsoftPowerBiPipelineStagesResolver } from "@/integrations/microsoft-powerbi/options/pipelineStages";
import { microsoftPowerBiPipelineUsersResolver } from "@/integrations/microsoft-powerbi/options/pipelineUsers";
import { microsoftPowerBiPipelinesResolver } from "@/integrations/microsoft-powerbi/options/pipelines";
import { microsoftPowerBiReportPagesResolver } from "@/integrations/microsoft-powerbi/options/reportPages";
import { microsoftPowerBiReportsResolver } from "@/integrations/microsoft-powerbi/options/reports";
import { microsoftPowerBiSemanticModelParametersResolver } from "@/integrations/microsoft-powerbi/options/semanticModelParameters";
import { microsoftPowerBiSemanticModelRefreshesResolver } from "@/integrations/microsoft-powerbi/options/semanticModelRefreshes";
import { microsoftPowerBiSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/semanticModels";
import { microsoftPowerBiTargetSemanticModelsResolver } from "@/integrations/microsoft-powerbi/options/targetSemanticModels";
import { microsoftPowerBiWorkspaceUsersResolver } from "@/integrations/microsoft-powerbi/options/workspaceUsers";
import { microsoftPowerBiWorkspacesResolver } from "@/integrations/microsoft-powerbi/options/workspaces";

// ---------------------------------------------------------------------------
// Merged from the former capacities.test.ts
// Tests for `integrations/microsoft-powerbi/options/capacities.ts` —
// root resolver (no deps) backing `capacityId` on
// assign_workspace_to_capacity. Label `<displayName> · <sku>`; rows with
// `capacityUserAccessRight: "None"` are excluded (user can't assign).
// ---------------------------------------------------------------------------
describe("capacities (options)", () => {

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
    deps: {},
    ...overrides,
  };
}

function capacity(overrides: Record<string, unknown> = {}) {
  return {
    id: "cap-1",
    displayName: "Finance P1",
    sku: "P1",
    state: "Active",
    capacityUserAccessRight: "Assign",
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockCapacitiesList.mockReset();
});

describe("microsoftPowerBiCapacitiesResolver — shape", () => {
  it("declares source/provider and requires an integration, no deps", () => {
    expect(microsoftPowerBiCapacitiesResolver.source).toBe(
      "microsoft-powerbi:capacities",
    );
    expect(microsoftPowerBiCapacitiesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiCapacitiesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiCapacitiesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftPowerBiCapacitiesResolver — wrapper invocation", () => {
  it("calls capacitiesList via refreshAndRetry pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockCapacitiesList.mockResolvedValueOnce([]);

    await microsoftPowerBiCapacitiesResolver.resolve(ctx());

    expect(mockCapacitiesList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiCapacitiesResolver — mapping + filtering", () => {
  it("maps id → value and `displayName · sku` → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity(),
      capacity({ id: "cap-2", displayName: "Embedded A1", sku: "A1" }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "cap-1", label: "Finance P1 · P1" },
      { value: "cap-2", label: "Embedded A1 · A1" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to displayName alone when the sku is absent", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([capacity({ sku: null })]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "cap-1", label: "Finance P1" }]);
  });

  it("excludes capacities the user cannot assign to (accessRight 'None'), keeps flag-less rows", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity(),
      capacity({ id: "cap-none", capacityUserAccessRight: "None" }),
      capacity({ id: "cap-admin", capacityUserAccessRight: "Admin" }),
      capacity({ id: "cap-unflagged", capacityUserAccessRight: null }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual([
      "cap-1",
      "cap-admin",
      "cap-unflagged",
    ]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      capacity({ id: "c1", displayName: "Finance P1" }),
      capacity({ id: "c2", displayName: "Marketing P2", sku: "P2" }),
    ]);
    const result = await microsoftPowerBiCapacitiesResolver.resolve(
      ctx({ q: "MARKETING" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["c2"]);
  });
});

describe("microsoftPowerBiCapacitiesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiCapacitiesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiCapacitiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiCapacitiesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('capacities GET failed: {"raw":"cap-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiCapacitiesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("cap-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former dataflowTransactions.test.ts
// Tests for `integrations/microsoft-powerbi/options/dataflowTransactions.ts`.
// Depends on `workspaceId` + `dataflowId`; value = transaction id,
// label = `<startTime> · <status>`, sorted in-progress first then newest.
// ---------------------------------------------------------------------------
describe("dataflowTransactions (options)", () => {

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
    deps: { workspaceId: "ws-1", dataflowId: "df-1" },
    ...overrides,
  };
}

function txn(
  id: string,
  startTime: string | null,
  status: string | null,
): Record<string, unknown> {
  return { id, refreshType: "OnDemand", startTime, endTime: null, status };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTransactionsList.mockReset();
});

describe("microsoftPowerBiDataflowTransactionsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','dataflowId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiDataflowTransactionsResolver.source).toBe(
      "microsoft-powerbi:dataflow_transactions",
    );
    expect(microsoftPowerBiDataflowTransactionsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiDataflowTransactionsResolver.requiresIntegration,
    ).toBe(true);
    expect(microsoftPowerBiDataflowTransactionsResolver.requiredDeps).toEqual([
      "workspaceId",
      "dataflowId",
    ]);
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — mapping + sorting", () => {
  it("labels `<startTime> · <status>` and sorts in-progress first, then newest", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [
        txn("txn-new-done", "2026-07-15T11:00:00Z", "Success"),
        txn("txn-progress-old", "2026-07-15T01:00:00Z", "InProgress"),
        txn("txn-old-done", "2026-07-14T03:00:00Z", "Failed"),
        txn("txn-progress-new", "2026-07-15T12:00:00Z", "InProgress"),
      ],
      hasMore: false,
    });

    const result =
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "txn-progress-new",
      "txn-progress-old",
      "txn-new-done",
      "txn-old-done",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · InProgress");
    expect(result.hasMore).toBe(false);
  });

  it("labels missing startTime/status honestly and surfaces wrapper hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [txn("txn-1", null, null)],
      hasMore: true,
    });
    const result =
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "txn-1", label: "unknown start · unknown" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("requests a bounded page (top 100) from the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockTransactionsList.mockResolvedValueOnce({
      transactions: [],
      hasMore: false,
    });

    await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());

    expect(mockTransactionsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
      dataflowId: "df-1",
      top: 100,
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      transactions: [
        txn("txn-1", "2026-07-15T11:00:00Z", "Success"),
        txn("txn-2", "2026-07-15T10:00:00Z", "Failed"),
      ],
      hasMore: false,
    });
    const result = await microsoftPowerBiDataflowTransactionsResolver.resolve(
      ctx({ q: "failed" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["txn-2"]);
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when workspaceId missing, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
        ctx({ deps: { dataflowId: "df-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when dataflowId missing, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", dataflowId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent dataflow gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("dataflow df-ghost"),
    );
    const result = await microsoftPowerBiDataflowTransactionsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", dataflowId: "df-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiDataflowTransactionsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(
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
      microsoftPowerBiDataflowTransactionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiDataflowTransactionsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'dataflow transactions GET failed: {"raw":"txn-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiDataflowTransactionsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("txn-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former dataflows.test.ts
// Tests for `integrations/microsoft-powerbi/options/dataflows.ts`.
// Depends on `workspaceId`; value = dataflow objectId, label = name.
// ---------------------------------------------------------------------------
describe("dataflows (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former gatewayDatasourceUsers.test.ts
// Tests for `integrations/microsoft-powerbi/options/gatewayDatasourceUsers.ts`
// — two-parent cascade (deps `gatewayId` + `datasourceId`).
// ---------------------------------------------------------------------------
describe("gatewayDatasourceUsers (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former gatewayDatasources.test.ts
// Tests for `integrations/microsoft-powerbi/options/gatewayDatasources.ts`
// — cascading child of `microsoft-powerbi:gateways` (dep `gatewayId`).
// ---------------------------------------------------------------------------
describe("gatewayDatasources (options)", () => {

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
    deps: { gatewayId: "gw-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDatasourcesList.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

describe("microsoftPowerBiGatewayDatasourcesResolver", () => {
  it("declares requiredDeps=['gatewayId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiGatewayDatasourcesResolver.source).toBe(
      "microsoft-powerbi:gateway_datasources",
    );
    expect(microsoftPowerBiGatewayDatasourcesResolver.requiredDeps).toEqual([
      "gatewayId",
    ]);
  });

  it("labels items `<name> · <type>` and passes the gatewayId dep to the wrapper", async () => {
    mockDatasourcesList.mockResolvedValueOnce([
      { id: "ds-1", datasourceName: "Sales SQL", datasourceType: "Sql" },
      { id: "ds-2", datasourceName: "Files", datasourceType: null },
      { id: "ds-3", datasourceName: null, datasourceType: "OData" },
    ]);

    const result = await microsoftPowerBiGatewayDatasourcesResolver.resolve(
      ctx(),
    );

    expect(mockDatasourcesList.mock.calls[0]![0].gatewayId).toBe("gw-1");
    expect(result.items).toEqual([
      { value: "ds-1", label: "Sales SQL · Sql" },
      { value: "ds-2", label: "Files" },
      { value: "ds-3", label: "ds-3 · OData" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("filters client-side by q", async () => {
    mockDatasourcesList.mockResolvedValueOnce([
      { id: "ds-1", datasourceName: "Sales SQL", datasourceType: "Sql" },
      { id: "ds-2", datasourceName: "HR Oracle", datasourceType: "Oracle" },
    ]);
    const result = await microsoftPowerBiGatewayDatasourcesResolver.resolve(
      ctx({ q: "oracle" }),
    );
    expect(result.items).toEqual([
      { value: "ds-2", label: "HR Oracle · Oracle" },
    ]);
  });

  it("short-circuits MISSING_DEPENDENCY without a gatewayId", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockDatasourcesList).not.toHaveBeenCalled();
  });

  it("maps a missing integration to INTEGRATION_DISCONNECTED", async () => {
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns EMPTY items (not an error) when the parent gateway is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("gateway gw-1"),
    );
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).resolves.toEqual({ items: [], hasMore: false });
  });

  it("maps other provider failures to a static PROVIDER_ERROR", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new Error("HTTP 500 raw"));
    await expect(
      microsoftPowerBiGatewayDatasourcesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former gateways.test.ts
// Tests for `integrations/microsoft-powerbi/options/gateways.ts` —
// root of the gateway cascade (no deps).
// ---------------------------------------------------------------------------
describe("gateways (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former imports.test.ts
// Tests for `integrations/microsoft-powerbi/options/imports.ts`.
// Depends on `workspaceId`; value = import id, label = name (id
// fallback), description = importState.
// ---------------------------------------------------------------------------
describe("imports (options)", () => {

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
  mockImportsList.mockReset();
});

describe("microsoftPowerBiImportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiImportsResolver.source).toBe(
      "microsoft-powerbi:imports",
    );
    expect(microsoftPowerBiImportsResolver.provider).toBe("microsoft-powerbi");
    expect(microsoftPowerBiImportsResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiImportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiImportsResolver — mapping", () => {
  it("maps id → value, name → label, importState → description", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-1", name: "Report.pbix", importState: "Succeeded" },
      { id: "imp-2", name: "Other.pbix", importState: "Publishing" },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "imp-1", label: "Report.pbix", description: "Succeeded" },
      { value: "imp-2", label: "Other.pbix", description: "Publishing" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to the id as label (and omits description) when the provider omits them", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-3", name: null, importState: null },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "imp-3", label: "imp-3" }]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "imp-1", name: "Sales.pbix", importState: "Succeeded" },
      { id: "imp-2", name: "Ops.pbix", importState: "Succeeded" },
    ]);
    const result = await microsoftPowerBiImportsResolver.resolve(
      ctx({ q: "SALES" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["imp-1"]);
  });
});

describe("microsoftPowerBiImportsResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiImportsResolver.resolve(
        ctx({ deps: { workspaceId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiImportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiImportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiImportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiImportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('imports GET failed: {"raw":"imp-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiImportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("imp-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former paginatedReports.test.ts
// Tests for `integrations/microsoft-powerbi/options/paginatedReports.ts`.
// Same reports endpoint as `microsoft-powerbi:reports`, filtered
// client-side to reportType === "PaginatedReport".
// ---------------------------------------------------------------------------
describe("paginatedReports (options)", () => {

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
});

describe("microsoftPowerBiPaginatedReportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiPaginatedReportsResolver.source).toBe(
      "microsoft-powerbi:paginated_reports",
    );
    expect(microsoftPowerBiPaginatedReportsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiPaginatedReportsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiPaginatedReportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — mapping + filtering", () => {
  it("keeps ONLY PaginatedReport rows (Power BI reports excluded)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: "d-1" },
      { id: "r-2", name: "Invoices", reportType: "PaginatedReport", datasetId: null },
      { id: "r-3", name: "Untyped", reportType: null, datasetId: null },
    ]);

    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx(),
    );

    expect(result.items).toEqual([{ value: "r-2", label: "Invoices" }]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Invoice North", reportType: "PaginatedReport", datasetId: null },
      { id: "r-2", name: "Invoice South", reportType: "PaginatedReport", datasetId: null },
      { id: "r-3", name: "Timesheet", reportType: "PaginatedReport", datasetId: null },
    ]);
    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx({ q: "INVOICE" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r-1", "r-2"]);
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent workspace is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiPaginatedReportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPaginatedReportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(
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
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPaginatedReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('reports GET failed: {"raw":"pbi-secret-leak"}'),
    );
    try {
      await microsoftPowerBiPaginatedReportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("pbi-secret-leak");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineOperations.test.ts
// Tests for `integrations/microsoft-powerbi/options/pipelineOperations.ts`.
// Depends on `pipelineId`; value = operation id, label =
// `<executionStartTime> · <status>`, most recent first. `hasMore` is always
// false — the provider caps this endpoint at the 20 most recent operations.
// ---------------------------------------------------------------------------
describe("pipelineOperations (options)", () => {

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
    deps: { pipelineId: "pipe-1" },
    ...overrides,
  };
}

function operation(
  operationId: string,
  executionStartTime: string | null,
  status: string,
): Record<string, unknown> {
  return {
    operationId,
    status,
    executionStartTime,
    executionEndTime: null,
    sourceStageOrder: 0,
    targetStageOrder: 1,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockOperationsList.mockReset();
});

describe("microsoftPowerBiPipelineOperationsResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineOperationsResolver.source).toBe(
      "microsoft-powerbi:pipeline_operations",
    );
    expect(microsoftPowerBiPipelineOperationsResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiPipelineOperationsResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiPipelineOperationsResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — mapping + sorting", () => {
  it("labels `<executionStartTime> · <status>` and sorts most recent first", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-old", "2026-07-14T03:00:00Z", "Succeeded"),
      operation("op-new", "2026-07-15T12:00:00Z", "Failed"),
      operation("op-mid", "2026-07-15T01:00:00Z", "Succeeded"),
    ]);

    const result =
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "op-new",
      "op-mid",
      "op-old",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · Failed");
    expect(result.hasMore).toBe(false);
  });

  it("falls back gracefully when executionStartTime is null (not-yet-started sorts last)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-pending", null, "NotStarted"),
      operation("op-started", "2026-07-15T12:00:00Z", "Executing"),
    ]);
    const result =
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "op-started", label: "2026-07-15T12:00:00Z · Executing" },
      { value: "op-pending", label: "not started · NotStarted" },
    ]);
  });

  it("passes pipelineId through to the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockOperationsList.mockResolvedValueOnce([]);

    await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());

    expect(mockOperationsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      pipelineId: "pipe-1",
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      operation("op-1", "2026-07-15T11:00:00Z", "Succeeded"),
      operation("op-2", "2026-07-15T10:00:00Z", "Failed"),
    ]);
    const result = await microsoftPowerBiPipelineOperationsResolver.resolve(
      ctx({ q: "failed" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["op-2"]);
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when pipelineId missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("pipeline pipe-ghost"),
    );
    const result = await microsoftPowerBiPipelineOperationsResolver.resolve(
      ctx({ deps: { pipelineId: "pipe-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineOperationsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(
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
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineOperationsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'pipeline operations GET failed: {"raw":"op-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiPipelineOperationsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("op-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineStageDashboards.test.ts
// Tests for
// `integrations/microsoft-powerbi/options/pipelineStageDashboards.ts` —
// same multi-parent cascade contract as the stage semantic-models
// resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
// this file pins the dashboards-specific arm + the shared error mapping.
// ---------------------------------------------------------------------------
describe("pipelineStageDashboards (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineStageDataflows.test.ts
// Tests for
// `integrations/microsoft-powerbi/options/pipelineStageDataflows.ts` —
// same multi-parent cascade contract as the stage semantic-models
// resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
// this file pins the dataflows-specific arm + the shared error mapping.
// ---------------------------------------------------------------------------
describe("pipelineStageDataflows (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineStageReports.test.ts
// Tests for `integrations/microsoft-powerbi/options/pipelineStageReports.ts`
// — same multi-parent cascade contract as the stage semantic-models
// resolver (thoroughly covered in pipelineStageSemanticModels.test.ts);
// this file pins the reports-specific arm + the shared error mapping.
// ---------------------------------------------------------------------------
describe("pipelineStageReports (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineStageSemanticModels.test.ts
// Tests for
// `integrations/microsoft-powerbi/options/pipelineStageSemanticModels.ts`
// — multi-parent cascade on `pipelineId` + `sourceStageOrder` (stage
// order arrives as the stage picker's string value).
// ---------------------------------------------------------------------------
describe("pipelineStageSemanticModels (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineStages.test.ts
// Tests for `integrations/microsoft-powerbi/options/pipelineStages.ts` —
// depends on `pipelineId`; value is the stage ORDER as a string.
// ---------------------------------------------------------------------------
describe("pipelineStages (options)", () => {

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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pipelineId: "pipe-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockStagesList.mockReset();
});

describe("microsoftPowerBiPipelineStagesResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineStagesResolver.source).toBe(
      "microsoft-powerbi:pipeline_stages",
    );
    expect(microsoftPowerBiPipelineStagesResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
    expect(microsoftPowerBiPipelineStagesResolver.requiresIntegration).toBe(
      true,
    );
  });
});

describe("microsoftPowerBiPipelineStagesResolver — mapping", () => {
  it("value = String(order); label derives stage names and appends workspace name", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockStagesList.mockResolvedValueOnce([
      { order: 0, workspaceId: "ws-d", workspaceName: "Marketing [Dev]" },
      { order: 1, workspaceId: null, workspaceName: null },
      { order: 2, workspaceId: "ws-p", workspaceName: "Marketing" },
      { order: 3, workspaceId: null, workspaceName: null },
    ]);

    const result = await microsoftPowerBiPipelineStagesResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "0", label: "0 · Development (Marketing [Dev])" },
      { value: "1", label: "1 · Test" },
      { value: "2", label: "2 · Production (Marketing)" },
      { value: "3", label: "3 · Stage 3" },
    ]);
    expect(result.hasMore).toBe(false);
    expect(mockStagesList.mock.calls[0]![0].pipelineId).toBe("pipe-1");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { order: 0, workspaceId: null, workspaceName: null },
      { order: 2, workspaceId: null, workspaceName: null },
    ]);
    const result = await microsoftPowerBiPipelineStagesResolver.resolve(
      ctx({ q: "prod" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["2"]);
  });
});

describe("microsoftPowerBiPipelineStagesResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when pipelineId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(
        ctx({ deps: { pipelineId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("pipeline pipe-ghost"),
    );
    const result = await microsoftPowerBiPipelineStagesResolver.resolve(
      ctx({ deps: { pipelineId: "pipe-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineStagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(
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
      microsoftPowerBiPipelineStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineStagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('stages GET failed: {"raw":"stage-secret"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelineStagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("stage-secret");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pipelineUsers.test.ts
// Tests for `integrations/microsoft-powerbi/options/pipelineUsers.ts` —
// depends on `pipelineId`; value is the principal identifier.
// ---------------------------------------------------------------------------
describe("pipelineUsers (options)", () => {

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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { pipelineId: "pipe-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockPipelineUsersList.mockReset();
});

describe("microsoftPowerBiPipelineUsersResolver — shape", () => {
  it("declares requiredDeps=['pipelineId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiPipelineUsersResolver.source).toBe(
      "microsoft-powerbi:pipeline_users",
    );
    expect(microsoftPowerBiPipelineUsersResolver.requiredDeps).toEqual([
      "pipelineId",
    ]);
  });
});

describe("microsoftPowerBiPipelineUsersResolver — mapping", () => {
  it("value = identifier, label = `identifier · accessRight` (identifier alone when right unknown)", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockPipelineUsersList.mockResolvedValueOnce([
      { identifier: "bob@contoso.com", principalType: "User", accessRight: "Admin" },
      { identifier: "9f0c-obj-id", principalType: "App", accessRight: null },
    ]);

    const result = await microsoftPowerBiPipelineUsersResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "bob@contoso.com · Admin" },
      { value: "9f0c-obj-id", label: "9f0c-obj-id" },
    ]);
    expect(result.hasMore).toBe(false);
    expect(mockPipelineUsersList.mock.calls[0]![0].pipelineId).toBe("pipe-1");
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { identifier: "bob@contoso.com", principalType: "User", accessRight: "Admin" },
      { identifier: "eve@contoso.com", principalType: "User", accessRight: "Admin" },
    ]);
    const result = await microsoftPowerBiPipelineUsersResolver.resolve(
      ctx({ q: "BOB" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["bob@contoso.com"]);
  });
});

describe("microsoftPowerBiPipelineUsersResolver — deps + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when pipelineId is empty/missing, no API call", async () => {
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(
        ctx({ deps: { pipelineId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent pipeline gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(new NotFoundError("pipeline"));
    const result = await microsoftPowerBiPipelineUsersResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiPipelineUsersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null", async () => {
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiPipelineUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiPipelineUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('users GET failed: {"raw":"user-pii-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiPipelineUsersResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("user-pii-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former pipelines.test.ts
// Tests for `integrations/microsoft-powerbi/options/pipelines.ts` —
// root of the deployment-pipeline cascade (no deps).
// ---------------------------------------------------------------------------
describe("pipelines (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former reportPages.test.ts
// Tests for `integrations/microsoft-powerbi/options/reportPages.ts`.
// Multi-parent cascade (workspaceId + reportId); value = the WIRE page
// name ("ReportSection…"), label = displayName.
// ---------------------------------------------------------------------------
describe("reportPages (options)", () => {

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
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workspaceId: "ws-1", reportId: "rep-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
});

describe("microsoftPowerBiReportPagesResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','reportId'] (multi-parent) and requires an integration", () => {
    expect(microsoftPowerBiReportPagesResolver.source).toBe(
      "microsoft-powerbi:report_pages",
    );
    expect(microsoftPowerBiReportPagesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiReportPagesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiReportPagesResolver.requiredDeps).toEqual([
      "workspaceId",
      "reportId",
    ]);
  });
});

describe("microsoftPowerBiReportPagesResolver — mapping", () => {
  it("maps wire name → value, displayName → label (falls back to name)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ReportSection1", displayName: "Overview", order: 0 },
      { name: "ReportSection2", displayName: null, order: 1 },
    ]);

    const result = await microsoftPowerBiReportPagesResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "ReportSection1", label: "Overview" },
      { value: "ReportSection2", label: "ReportSection2" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ReportSection1", displayName: "Sales Overview", order: 0 },
      { name: "ReportSection2", displayName: "Detail", order: 1 },
    ]);
    const result = await microsoftPowerBiReportPagesResolver.resolve(
      ctx({ q: "sales" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ReportSection1"]);
  });
});

describe("microsoftPowerBiReportPagesResolver — dependencies + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { reportId: "rep-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when reportId is missing/empty, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", reportId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent report is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("report rep-ghost"),
    );
    const result = await microsoftPowerBiReportPagesResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", reportId: "rep-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiReportPagesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiReportPagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiReportPagesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('report pages GET failed: {"raw":"pbi-secret-leak"}'),
    );
    try {
      await microsoftPowerBiReportPagesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      expect((err as Error).message).not.toContain("pbi-secret-leak");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former reports.test.ts
// Tests for `integrations/microsoft-powerbi/options/reports.ts`.
// Depends on `workspaceId`; value = report GUID, label = report name,
// description = reportType.
// ---------------------------------------------------------------------------
describe("reports (options)", () => {

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
});

describe("microsoftPowerBiReportsResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] and requires an integration", () => {
    expect(microsoftPowerBiReportsResolver.source).toBe(
      "microsoft-powerbi:reports",
    );
    expect(microsoftPowerBiReportsResolver.provider).toBe("microsoft-powerbi");
    expect(microsoftPowerBiReportsResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiReportsResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiReportsResolver — mapping", () => {
  it("maps id → value, name → label, reportType → description; pins providerAccountId", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Sales", reportType: "PowerBIReport", datasetId: "d-1" },
      { id: "r-2", name: "Invoices", reportType: "PaginatedReport", datasetId: null },
    ]);

    const result = await microsoftPowerBiReportsResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "r-1", label: "Sales", description: "PowerBIReport" },
      { value: "r-2", label: "Invoices", description: "PaginatedReport" },
    ]);
    expect(result.hasMore).toBe(false);

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });

  it("omits description when reportType is null", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Untyped", reportType: null, datasetId: null },
    ]);
    const result = await microsoftPowerBiReportsResolver.resolve(ctx());
    expect(result.items).toEqual([{ value: "r-1", label: "Untyped" }]);
  });

  it("applies case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { id: "r-1", name: "Q4 Sales", reportType: "PowerBIReport", datasetId: null },
      { id: "r-2", name: "Marketing", reportType: "PowerBIReport", datasetId: null },
    ]);
    const result = await microsoftPowerBiReportsResolver.resolve(
      ctx({ q: "sales" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["r-1"]);
  });
});

describe("microsoftPowerBiReportsResolver — dependency + cascade fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is missing/empty, no API call", async () => {
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ deps: { workspaceId: "" } })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT an error) when the parent workspace is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiReportsResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiReportsResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiReportsResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR without leaking the raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('reports GET failed: {"raw":"pbi-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiReportsResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("pbi-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former semanticModelParameters.test.ts
// Tests for `integrations/microsoft-powerbi/options/semanticModelParameters.ts`.
// Cascading resolver: requiredDeps ["workspaceId", "semanticModelId"];
// value = label = parameter NAME — current parameter VALUES must never
// surface (they can carry connection strings).
// ---------------------------------------------------------------------------
describe("semanticModelParameters (options)", () => {

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
  createdAt: "2026-07-15T00:00:00Z",
  updatedAt: "2026-07-15T00:00:00Z",
};

function ctx(
  overrides: Partial<OptionsResolverContext> = {},
): OptionsResolverContext {
  return {
    userId: "user-1",
    integration,
    q: "",
    deps: { workspaceId: "ws-1", semanticModelId: "ds-1" },
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockParametersList.mockReset();
});

describe("microsoftPowerBiSemanticModelParametersResolver — shape", () => {
  it("declares source, provider, requiredDeps (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiSemanticModelParametersResolver.source).toBe(
      "microsoft-powerbi:semantic_model_parameters",
    );
    expect(microsoftPowerBiSemanticModelParametersResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiSemanticModelParametersResolver.requiresIntegration,
    ).toBe(true);
    expect(
      microsoftPowerBiSemanticModelParametersResolver.requiredDeps,
    ).toEqual(["workspaceId", "semanticModelId"]);
  });
});

describe("microsoftPowerBiSemanticModelParametersResolver — mapping", () => {
  it("maps parameter name → value AND label via the deps, pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockParametersList.mockResolvedValueOnce([
      { name: "ServerName" },
      { name: "DatabaseName" },
    ]);

    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());

    expect(result.items).toEqual([
      { value: "ServerName", label: "ServerName" },
      { value: "DatabaseName", label: "DatabaseName" },
    ]);
    expect(result.hasMore).toBe(false);

    const wrapperCall = mockParametersList.mock.calls[0]![0];
    expect(wrapperCall.groupId).toBe("ws-1");
    expect(wrapperCall.datasetId).toBe("ds-1");

    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });

  it("applies case-insensitive q filter against the name", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      { name: "ServerName" },
      { name: "DatabaseName" },
      { name: "ApiBase" },
    ]);

    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ q: "NAME" }),
      );
    expect(result.items.map((i) => i.value)).toEqual([
      "ServerName",
      "DatabaseName",
    ]);
  });
});

describe("microsoftPowerBiSemanticModelParametersResolver — deps + errors", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ deps: { workspaceId: "", semanticModelId: "ds-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when semanticModelId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", semanticModelId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws INTEGRATION_DISCONNECTED when no integration in context", async () => {
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(
        ctx({ integration: null }),
      ),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps auth failures to INTEGRATION_DISCONNECTED", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Unauthorized401Error("401"),
    );
    await expect(
      microsoftPowerBiSemanticModelParametersResolver.resolve(ctx()),
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
      microsoftPowerBiSemanticModelParametersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("returns empty items (not an error) when the parent model is gone", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("semantic model ds-1"),
    );
    const result =
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());
    expect(result).toEqual({ items: [], hasMore: false });
  });

  it("maps other failures to PROVIDER_ERROR with a static safe message", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error("HTTP 500 something internal Server=secret-host"),
    );
    let caught: unknown;
    try {
      await microsoftPowerBiSemanticModelParametersResolver.resolve(ctx());
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(OptionsResolverError);
    expect((caught as OptionsResolverError).code).toBe("PROVIDER_ERROR");
    expect((caught as OptionsResolverError).message).not.toContain(
      "secret-host",
    );
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former semanticModelRefreshes.test.ts
// Tests for `integrations/microsoft-powerbi/options/semanticModelRefreshes.ts`.
// Depends on `workspaceId` + `semanticModelId`; value = refresh requestId,
// label = `<startTime> · <status>`, sorted in-progress first then newest.
// Entries without a requestId (non-enhanced refreshes) are skipped.
// ---------------------------------------------------------------------------
describe("semanticModelRefreshes (options)", () => {

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
    deps: { workspaceId: "ws-1", semanticModelId: "model-1" },
    ...overrides,
  };
}

function refresh(
  refreshRequestId: string | null,
  startTime: string | null,
  status: string,
): Record<string, unknown> {
  return {
    refreshRequestId,
    refreshType: "ViaEnhancedApi",
    status,
    startTime,
    endTime: null,
    errorCode: null,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockRefreshesList.mockReset();
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — shape", () => {
  it("declares requiredDeps=['workspaceId','semanticModelId'] (camelCase, schema-verbatim)", () => {
    expect(microsoftPowerBiSemanticModelRefreshesResolver.source).toBe(
      "microsoft-powerbi:semantic_model_refreshes",
    );
    expect(microsoftPowerBiSemanticModelRefreshesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(
      microsoftPowerBiSemanticModelRefreshesResolver.requiresIntegration,
    ).toBe(true);
    expect(
      microsoftPowerBiSemanticModelRefreshesResolver.requiredDeps,
    ).toEqual(["workspaceId", "semanticModelId"]);
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — mapping + sorting", () => {
  it("labels `<startTime> · <status>` and sorts in-progress first, then newest", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh("req-new-done", "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-progress-old", "2026-07-15T01:00:00Z", "Unknown"),
        refresh("req-old-done", "2026-07-14T03:00:00Z", "Failed"),
        refresh("req-progress-new", "2026-07-15T12:00:00Z", "Unknown"),
      ],
      hasMore: false,
    });

    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());

    expect(result.items.map((i) => i.value)).toEqual([
      "req-progress-new",
      "req-progress-old",
      "req-new-done",
      "req-old-done",
    ]);
    expect(result.items[0]!.label).toBe("2026-07-15T12:00:00Z · Unknown");
    expect(result.hasMore).toBe(false);
  });

  it("skips refreshes with no requestId (non-enhanced refreshes can't be targeted)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh(null, "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-1", "2026-07-15T10:00:00Z", "Completed"),
      ],
      hasMore: false,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "req-1", label: "2026-07-15T10:00:00Z · Completed" },
    ]);
  });

  it("labels missing startTime honestly and surfaces wrapper hasMore", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [refresh("req-1", null, "Unknown")],
      hasMore: true,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "req-1", label: "unknown start · Unknown" },
    ]);
    expect(result.hasMore).toBe(true);
  });

  it("requests a bounded page (top 100) from the wrapper", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockRefreshesList.mockResolvedValueOnce({ refreshes: [], hasMore: false });

    await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());

    expect(mockRefreshesList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
      datasetId: "model-1",
      top: 100,
    });
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      refreshes: [
        refresh("req-1", "2026-07-15T11:00:00Z", "Completed"),
        refresh("req-2", "2026-07-15T10:00:00Z", "Failed"),
      ],
      hasMore: false,
    });
    const result =
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ q: "failed" }),
      );
    expect(result.items.map((i) => i.value)).toEqual(["req-2"]);
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — dependencies + cascade", () => {
  it("throws MISSING_DEPENDENCY when workspaceId missing, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ deps: { semanticModelId: "model-1" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when semanticModelId missing, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
        ctx({ deps: { workspaceId: "ws-1", semanticModelId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent model gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("semantic model model-ghost"),
    );
    const result = await microsoftPowerBiSemanticModelRefreshesResolver.resolve(
      ctx({ deps: { workspaceId: "ws-1", semanticModelId: "model-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiSemanticModelRefreshesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(
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
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR, never leaks raw body or tokens", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error(
        'dataset refreshes GET failed: {"raw":"refresh-secret-leak"} Bearer xyz',
      ),
    );
    try {
      await microsoftPowerBiSemanticModelRefreshesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("refresh-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former semanticModels.test.ts
// Tests for `integrations/microsoft-powerbi/options/semanticModels.ts` —
// backs `semanticModelId` on every semantic-model action/trigger, keyed
// off the `workspaceId` cascade parent. Dep name is pinned verbatim to
// the runtime Zod schemas (camelCase), because deps are keyed by the
// parent FIELD name — a rename here silently empties the picker.
// Written during RESOLVERS-1's clean-checkout closure: the two root
// resolvers (workspaces / semantic_models) shipped without direct tests
// while all 19 of their descendants had them.
// ---------------------------------------------------------------------------
describe("semanticModels (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former targetSemanticModels.test.ts
// Tests for `integrations/microsoft-powerbi/options/targetSemanticModels.ts`.
// Backs `clone_report.targetSemanticModelId`. Identical mapping to
// `semantic_models` but keyed on `targetWorkspaceId` — deps are keyed by the
// parent FIELD name, so the dep name (not the resolver) is what has to match.
// ---------------------------------------------------------------------------
describe("targetSemanticModels (options)", () => {

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

});

// ---------------------------------------------------------------------------
// Merged from the former workspaceUsers.test.ts
// Tests for `integrations/microsoft-powerbi/options/workspaceUsers.ts` —
// cascading resolver (workspaceId dep) backing `principalIdentifier` on
// remove_workspace_user. Value = `identifier ?? emailAddress` (the exact
// string the DELETE path accepts); label = `<displayName ?? email> ·
// <accessRight>`.
// ---------------------------------------------------------------------------
describe("workspaceUsers (options)", () => {

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

function user(overrides: Record<string, unknown> = {}) {
  return {
    identifier: null,
    emailAddress: "bob@contoso.com",
    displayName: "Bob",
    groupUserAccessRight: "Viewer",
    principalType: "User",
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupUsersList.mockReset();
});

describe("microsoftPowerBiWorkspaceUsersResolver — shape", () => {
  it("declares requiredDeps=['workspaceId'] (camelCase, schema-verbatim) and requires an integration", () => {
    expect(microsoftPowerBiWorkspaceUsersResolver.source).toBe(
      "microsoft-powerbi:workspace_users",
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.requiresIntegration).toBe(
      true,
    );
    expect(microsoftPowerBiWorkspaceUsersResolver.requiredDeps).toEqual([
      "workspaceId",
    ]);
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — wrapper invocation", () => {
  it("calls groupUsersList with the workspaceId via refreshAndRetry pinned to providerAccountId", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockGroupUsersList.mockResolvedValueOnce([]);

    await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());

    expect(mockGroupUsersList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
      groupId: "ws-1",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — mapping", () => {
  it("prefers identifier over email for value; label = displayName · right", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user(),
      user({
        identifier: "obj-guid-1",
        emailAddress: null,
        displayName: "Data App",
        groupUserAccessRight: "Member",
        principalType: "App",
      }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "Bob · Viewer" },
      { value: "obj-guid-1", label: "Data App · Member" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("falls back to email (then value) for the label name and 'Unknown' for a missing right", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user({ displayName: null }),
      user({
        identifier: "obj-guid-2",
        emailAddress: null,
        displayName: null,
        groupUserAccessRight: null,
      }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "bob@contoso.com", label: "bob@contoso.com · Viewer" },
      { value: "obj-guid-2", label: "obj-guid-2 · Unknown" },
    ]);
  });

  it("drops rows carrying neither identifier nor email (nothing the DELETE path accepts)", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user({ identifier: null, emailAddress: null }),
      user(),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
    expect(result.items.map((i) => i.value)).toEqual(["bob@contoso.com"]);
  });

  it("applies case-insensitive q filter against label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce([
      user(),
      user({ emailAddress: "carol@contoso.com", displayName: "Carol" }),
    ]);
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(
      ctx({ q: "CAROL" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["carol@contoso.com"]);
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — dependency + cascade-fallback", () => {
  it("throws MISSING_DEPENDENCY when workspaceId is empty, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(
        ctx({ deps: { workspaceId: "" } }),
      ),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("throws MISSING_DEPENDENCY when workspaceId is missing, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx({ deps: {} })),
    ).rejects.toMatchObject({ code: "MISSING_DEPENDENCY" });
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("returns empty items (NOT throw) when parent workspace gone (NotFoundError)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new NotFoundError("workspace ws-ghost"),
    );
    const result = await microsoftPowerBiWorkspaceUsersResolver.resolve(
      ctx({ deps: { workspaceId: "ws-ghost" } }),
    );
    expect(result).toEqual({ items: [], hasMore: false });
  });
});

describe("microsoftPowerBiWorkspaceUsersResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, no API call", async () => {
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiWorkspaceUsersResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('group users GET failed: {"raw":"user-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiWorkspaceUsersResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("user-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});

// ---------------------------------------------------------------------------
// Merged from the former workspaces.test.ts
// Tests for `integrations/microsoft-powerbi/options/workspaces.ts` — the
// root of every Power BI cascade (no deps), backing `workspaceId` on all
// workspace-scoped actions and triggers. Value = group GUID, label =
// workspace name; `hasMore` is forwarded from the wrapper's truncation
// flag so the picker can say "refine your search".
// Written during RESOLVERS-1's clean-checkout closure: the two root
// resolvers (workspaces / semantic_models) shipped without direct tests
// while all 19 of their descendants had them.
// ---------------------------------------------------------------------------
describe("workspaces (options)", () => {

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

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: "ws-1",
    name: "Finance Reporting",
    isOnDedicatedCapacity: false,
    capacityId: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGroupsList.mockReset();
});

describe("microsoftPowerBiWorkspacesResolver — shape", () => {
  it("declares source/provider, requires an integration, and is dep-less (cascade root)", () => {
    expect(microsoftPowerBiWorkspacesResolver.source).toBe(
      "microsoft-powerbi:workspaces",
    );
    expect(microsoftPowerBiWorkspacesResolver.provider).toBe(
      "microsoft-powerbi",
    );
    expect(microsoftPowerBiWorkspacesResolver.requiresIntegration).toBe(true);
    expect(microsoftPowerBiWorkspacesResolver.requiredDeps).toBeUndefined();
  });
});

describe("microsoftPowerBiWorkspacesResolver — wrapper invocation", () => {
  it("calls groupsList via refreshAndRetry pinned to the node's integration account", async () => {
    mockRefreshAndRetry.mockImplementationOnce(
      async (input: { apiCall: (t: string) => Promise<unknown> }) =>
        input.apiCall("decrypted-token"),
    );
    mockGroupsList.mockResolvedValueOnce({ groups: [], hasMore: false });

    await microsoftPowerBiWorkspacesResolver.resolve(ctx());

    expect(mockGroupsList.mock.calls[0]![0]).toEqual({
      accessToken: "decrypted-token",
    });
    const args = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(args.provider).toBe("microsoft-powerbi");
    expect(args.accountId).toBe("acct-user-1");
    expect(args.providerAccountId).toBe("alice@contoso.com");
  });
});

describe("microsoftPowerBiWorkspacesResolver — mapping + filtering", () => {
  it("maps id → value and name → label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group(), group({ id: "ws-2", name: "Marketing Analytics" })],
      hasMore: false,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.items).toEqual([
      { value: "ws-1", label: "Finance Reporting" },
      { value: "ws-2", label: "Marketing Analytics" },
    ]);
    expect(result.hasMore).toBe(false);
  });

  it("applies a case-insensitive q filter against the label", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group(), group({ id: "ws-2", name: "Marketing Analytics" })],
      hasMore: false,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(
      ctx({ q: "MARKETING" }),
    );
    expect(result.items.map((i) => i.value)).toEqual(["ws-2"]);
  });

  it("forwards the wrapper's hasMore so the picker can prompt for a narrower search", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({
      groups: [group()],
      hasMore: true,
    });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.hasMore).toBe(true);
  });

  it("returns an empty list (not an error) when the account has no workspaces", async () => {
    mockRefreshAndRetry.mockResolvedValueOnce({ groups: [], hasMore: false });
    const result = await microsoftPowerBiWorkspacesResolver.resolve(ctx());
    expect(result.items).toEqual([]);
    expect(result.hasMore).toBe(false);
  });
});

describe("microsoftPowerBiWorkspacesResolver — error sanitization", () => {
  it("throws INTEGRATION_DISCONNECTED when integration is null, without calling the API", async () => {
    await expect(
      microsoftPowerBiWorkspacesResolver.resolve(ctx({ integration: null })),
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
      microsoftPowerBiWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });

    mockRefreshAndRetry.mockRejectedValueOnce(new Unauthorized401Error("401"));
    await expect(
      microsoftPowerBiWorkspacesResolver.resolve(ctx()),
    ).rejects.toMatchObject({ code: "INTEGRATION_DISCONNECTED" });
  });

  it("maps other errors → PROVIDER_ERROR with a static message (no token / raw body leak)", async () => {
    mockRefreshAndRetry.mockRejectedValueOnce(
      new Error('groups GET failed: {"raw":"ws-secret-leak"} Bearer xyz'),
    );
    try {
      await microsoftPowerBiWorkspacesResolver.resolve(ctx());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OptionsResolverError);
      expect((err as OptionsResolverError).code).toBe("PROVIDER_ERROR");
      const msg = (err as Error).message;
      expect(msg).not.toContain("ws-secret-leak");
      expect(msg).not.toContain("Bearer");
    }
  });
});

});
