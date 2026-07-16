/**
 * @jest-environment node
 */
import type { TriggerResourceRecord } from "@/repositories/triggerResources";
import type { IntegrationRecord } from "@/repositories/integrations";

const mockGetActive = jest.fn();

const mockPollSemanticModelRefreshes = jest.fn();
const mockPollDataflowTransactions = jest.fn();
const mockPollImports = jest.fn();
const mockPollPipelineOperations = jest.fn();

const mockPollDaxConditionMet = jest.fn();
const mockPollDaxQueryResultChanged = jest.fn();
const mockPollGatewayDatasourceStatusChanged = jest.fn();
const mockPollWorkspaceItemAdded = jest.fn();
const mockPollWorkspaceItemRemoved = jest.fn();
const mockPollWorkspaceAccessChanged = jest.fn();

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) => mockGetActive(...args),
}));

jest.mock(
  "@/integrations/microsoft-powerbi/triggers/_shared/pollSemanticModelRefreshes",
  () => ({
    pollSemanticModelRefreshes: (...args: unknown[]) =>
      mockPollSemanticModelRefreshes(...args),
  }),
);

jest.mock(
  "@/integrations/microsoft-powerbi/triggers/_shared/pollDataflowTransactions",
  () => ({
    pollDataflowTransactions: (...args: unknown[]) =>
      mockPollDataflowTransactions(...args),
  }),
);

jest.mock("@/integrations/microsoft-powerbi/triggers/_shared/pollImports", () => ({
  pollImports: (...args: unknown[]) => mockPollImports(...args),
}));

jest.mock(
  "@/integrations/microsoft-powerbi/triggers/_shared/pollPipelineOperations",
  () => ({
    pollPipelineOperations: (...args: unknown[]) =>
      mockPollPipelineOperations(...args),
  }),
);

jest.mock("@/integrations/microsoft-powerbi/triggers/_shared/pollDax", () => ({
  pollDaxConditionMet: (...args: unknown[]) => mockPollDaxConditionMet(...args),
  pollDaxQueryResultChanged: (...args: unknown[]) =>
    mockPollDaxQueryResultChanged(...args),
}));

jest.mock(
  "@/integrations/microsoft-powerbi/triggers/_shared/pollGatewayDatasourceStatus",
  () => ({
    pollGatewayDatasourceStatusChanged: (...args: unknown[]) =>
      mockPollGatewayDatasourceStatusChanged(...args),
  }),
);

jest.mock("@/integrations/microsoft-powerbi/triggers/_shared/pollWorkspace", () => ({
  pollWorkspaceItemAdded: (...args: unknown[]) =>
    mockPollWorkspaceItemAdded(...args),
  pollWorkspaceItemRemoved: (...args: unknown[]) =>
    mockPollWorkspaceItemRemoved(...args),
  pollWorkspaceAccessChanged: (...args: unknown[]) =>
    mockPollWorkspaceAccessChanged(...args),
}));

import { microsoftPowerBiPollingHandler } from "@/integrations/microsoft-powerbi/triggers/_shared/pollingHandler";
import { DEFAULT_INTERVAL_MS } from "@/services/cron/pollingIntervals";

const NOW = Date.parse("2026-07-15T12:00:00Z");

/**
 * Every event type the handler owns. Deliberately 16, not 17 — the trigger
 * catalog's 17th entry is the deferred tenant/admin bucket, which ships no
 * trigger (Fabric-admin consent gap).
 */
const JOB_LIFECYCLE_EVENT_TYPES = [
  "semantic_model_refresh_completed",
  "semantic_model_refresh_failed",
  "semantic_model_refresh_canceled",
  "dataflow_refresh_completed",
  "dataflow_refresh_failed",
  "dataflow_refresh_canceled",
  "import_completed",
  "import_failed",
  "pipeline_deployment_completed",
  "pipeline_deployment_failed",
] as const;

const STATE_DIFF_EVENT_TYPES = [
  "dax_condition_met",
  "dax_query_result_changed",
  "gateway_datasource_status_changed",
  "workspace_item_added",
  "workspace_item_removed",
  "workspace_access_changed",
] as const;

const ALL_EVENT_TYPES = [...JOB_LIFECYCLE_EVENT_TYPES, ...STATE_DIFF_EVENT_TYPES];

beforeEach(() => {
  mockGetActive.mockReset();
  for (const m of [
    mockPollSemanticModelRefreshes,
    mockPollDataflowTransactions,
    mockPollImports,
    mockPollPipelineOperations,
    mockPollDaxConditionMet,
    mockPollDaxQueryResultChanged,
    mockPollGatewayDatasourceStatusChanged,
    mockPollWorkspaceItemAdded,
    mockPollWorkspaceItemRemoved,
    mockPollWorkspaceAccessChanged,
  ]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }

  const integration: IntegrationRecord = {
    id: "int-1",
    accountId: "acct-1",
    connectedByUserId: "u-1",
    provider: "microsoft-powerbi",
    providerAccountId: "pbi-tenant-1",
    displayName: "Alice",
    accessTokenEncrypted: "enc",
    refreshTokenEncrypted: "enc",
    accessTokenExpiresAt: null,
    scopes: ["Dataset.ReadWrite.All"],
    accountMetadata: {},
    disconnectedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
  mockGetActive.mockResolvedValue(integration);
});

function trigger(eventType: string, provider = "microsoft-powerbi"): TriggerResourceRecord {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    workflowAccountId: "acct-1",
    userId: "u-1",
    provider,
    eventType,
    nodeId: "n-1",
    config: { pollingEnabled: true },
    providerAccountId: null,
    registeredAt: "2026-07-15T00:00:00Z",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

function poll(t: TriggerResourceRecord) {
  return microsoftPowerBiPollingHandler.poll({
    trigger: t,
    accountId: "acct-1",
    userRole: "default",
    now: NOW,
  });
}

function allPollFns() {
  return [
    mockPollSemanticModelRefreshes,
    mockPollDataflowTransactions,
    mockPollImports,
    mockPollPipelineOperations,
    mockPollDaxConditionMet,
    mockPollDaxQueryResultChanged,
    mockPollGatewayDatasourceStatusChanged,
    mockPollWorkspaceItemAdded,
    mockPollWorkspaceItemRemoved,
    mockPollWorkspaceAccessChanged,
  ];
}

describe("microsoftPowerBiPollingHandler", () => {
  it("has a stable handler id", () => {
    expect(microsoftPowerBiPollingHandler.id).toBe("microsoft-powerbi/polling");
  });

  describe("canHandle", () => {
    it.each(ALL_EVENT_TYPES)("owns microsoft-powerbi:%s", (eventType) => {
      expect(microsoftPowerBiPollingHandler.canHandle(trigger(eventType))).toBe(
        true,
      );
    });

    it("owns exactly the 16 shipped event types — the deferred tenant/admin triggers are not claimed", () => {
      expect(ALL_EVENT_TYPES).toHaveLength(16);
      for (const eventType of [
        "tenant_activity_event",
        "unused_artifact_detected",
        "capacity_refreshable_failed",
      ]) {
        expect(
          microsoftPowerBiPollingHandler.canHandle(trigger(eventType)),
        ).toBe(false);
      }
    });

    it("rejects other providers on a shared event-type name", () => {
      expect(
        microsoftPowerBiPollingHandler.canHandle(
          trigger("import_completed", "microsoft-excel"),
        ),
      ).toBe(false);
    });

    it("rejects unknown Power BI event types", () => {
      expect(
        microsoftPowerBiPollingHandler.canHandle(trigger("new_report")),
      ).toBe(false);
    });
  });

  describe("getIntervalMs", () => {
    it("polls on the shared default cadence for every role", () => {
      expect(microsoftPowerBiPollingHandler.getIntervalMs("default")).toBe(
        DEFAULT_INTERVAL_MS,
      );
      expect(microsoftPowerBiPollingHandler.getIntervalMs("pro")).toBe(
        DEFAULT_INTERVAL_MS,
      );
    });
  });

  describe("routing", () => {
    it.each(JOB_LIFECYCLE_EVENT_TYPES.slice(0, 3))(
      "routes %s to the semantic-model refresh poller with its event type",
      async (eventType) => {
        await poll(trigger(eventType));

        expect(mockPollSemanticModelRefreshes).toHaveBeenCalledTimes(1);
        expect(mockPollSemanticModelRefreshes).toHaveBeenCalledWith(
          expect.objectContaining({
            eventType,
            providerAccountId: "pbi-tenant-1",
            now: NOW,
          }),
        );
      },
    );

    it.each(JOB_LIFECYCLE_EVENT_TYPES.slice(3, 6))(
      "routes %s to the dataflow-transaction poller with its event type",
      async (eventType) => {
        await poll(trigger(eventType));

        expect(mockPollDataflowTransactions).toHaveBeenCalledTimes(1);
        expect(mockPollDataflowTransactions).toHaveBeenCalledWith(
          expect.objectContaining({ eventType }),
        );
      },
    );

    it.each(["import_completed", "import_failed"])(
      "routes %s to the imports poller with its event type",
      async (eventType) => {
        await poll(trigger(eventType));

        expect(mockPollImports).toHaveBeenCalledTimes(1);
        expect(mockPollImports).toHaveBeenCalledWith(
          expect.objectContaining({ eventType }),
        );
      },
    );

    it.each(["pipeline_deployment_completed", "pipeline_deployment_failed"])(
      "routes %s to the pipeline-operations poller with its event type",
      async (eventType) => {
        await poll(trigger(eventType));

        expect(mockPollPipelineOperations).toHaveBeenCalledTimes(1);
        expect(mockPollPipelineOperations).toHaveBeenCalledWith(
          expect.objectContaining({ eventType }),
        );
      },
    );

    it.each([
      ["dax_condition_met", () => mockPollDaxConditionMet],
      ["dax_query_result_changed", () => mockPollDaxQueryResultChanged],
      [
        "gateway_datasource_status_changed",
        () => mockPollGatewayDatasourceStatusChanged,
      ],
      ["workspace_item_added", () => mockPollWorkspaceItemAdded],
      ["workspace_item_removed", () => mockPollWorkspaceItemRemoved],
      ["workspace_access_changed", () => mockPollWorkspaceAccessChanged],
    ] as const)("routes %s to its own poll function", async (eventType, getFn) => {
      await poll(trigger(eventType));

      expect(getFn()).toHaveBeenCalledTimes(1);
      expect(getFn()).toHaveBeenCalledWith(
        expect.objectContaining({
          providerAccountId: "pbi-tenant-1",
          now: NOW,
        }),
      );
    });

    it.each(ALL_EVENT_TYPES)("routes %s to exactly one poll function", async (eventType) => {
      await poll(trigger(eventType));

      const called = allPollFns().filter((m) => m.mock.calls.length > 0);
      expect(called).toHaveLength(1);
    });

    it("resolves the integration against the workflow's V2 account, not the user", async () => {
      await poll(trigger("import_completed"));

      expect(mockGetActive).toHaveBeenCalledWith("acct-1", "microsoft-powerbi", null);
    });
  });

  describe("no-op guards", () => {
    it("ignores a foreign provider's trigger without touching the integration lookup", async () => {
      await poll(trigger("import_completed", "microsoft-excel"));

      expect(mockGetActive).not.toHaveBeenCalled();
      for (const m of allPollFns()) expect(m).not.toHaveBeenCalled();
    });

    it("ignores an unsupported Power BI event type", async () => {
      await poll(trigger("tenant_activity_event"));

      expect(mockGetActive).not.toHaveBeenCalled();
      for (const m of allPollFns()) expect(m).not.toHaveBeenCalled();
    });

    it.each(ALL_EVENT_TYPES)(
      "warns and skips %s when the account has no active integration",
      async (eventType) => {
        mockGetActive.mockResolvedValueOnce(null);
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

        await poll(trigger(eventType));

        for (const m of allPollFns()) expect(m).not.toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
      },
    );
  });
});
