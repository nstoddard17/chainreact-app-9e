/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock(
  "@/integrations/microsoft-powerbi/api/reports/reportDatasourcesUpdate",
  () => ({
    reportDatasourcesUpdate: (...args: unknown[]) => mockUpdate(...args),
  }),
);

import { updatePaginatedReportDatasources } from "@/integrations/microsoft-powerbi/actions/reports/updatePaginatedReportDatasources";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockUpdate.mockResolvedValue(undefined);
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId:
      provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
    payload: {},
  };
}

function baseInput(config: Record<string, unknown>) {
  return {
    workflowId: "wf",
    userId: "u",
    accountId: "acct-u",
    runId: "r",
    nodeId: "n",
    config,
    triggerEvent: trigger(),
  };
}

describe("update_paginated_report_datasources action", () => {
  it("submits the update rows and returns {updated, updateCount}", async () => {
    const result = await updatePaginatedReportDatasources(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        updates: [
          { datasourceName: "SqlDatasource", newServer: "new-sql", newDatabase: "new-db" },
          { datasourceName: "OtherSource", newServer: "srv-2" },
        ],
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.reportId).toBe("prep-1");
    expect(call.updates).toEqual([
      { datasourceName: "SqlDatasource", newServer: "new-sql", newDatabase: "new-db" },
      { datasourceName: "OtherSource", newServer: "srv-2" },
    ]);

    expect(result.output).toEqual({ updated: true, updateCount: 2 });
  });

  it("rejects a row with neither newServer nor newDatabase (refinement)", async () => {
    await expect(
      updatePaginatedReportDatasources(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          updates: [{ datasourceName: "SqlDatasource" }],
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty updates list and >50 rows", async () => {
    await expect(
      updatePaginatedReportDatasources(
        baseInput({ workspaceId: "ws-1", paginatedReportId: "prep-1", updates: [] }),
      ),
    ).rejects.toThrow();

    const tooMany = Array.from({ length: 51 }, (_, i) => ({
      datasourceName: `ds-${i}`,
      newServer: "srv",
    }));
    await expect(
      updatePaginatedReportDatasources(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          updates: tooMany,
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects raw wire-format keys (.strict()) at both levels", async () => {
    await expect(
      updatePaginatedReportDatasources(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          updateDetails: [],
        }),
      ),
    ).rejects.toThrow();

    await expect(
      updatePaginatedReportDatasources(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          updates: [
            {
              datasourceName: "SqlDatasource",
              connectionDetails: { server: "raw" },
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    await updatePaginatedReportDatasources({
      ...baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        updates: [{ datasourceName: "ds", newServer: "srv" }],
      }),
      triggerEvent: trigger("microsoft-powerbi"),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures (e.g. not the datasource owner) to the engine", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI report UpdateDatasources POST failed: InvalidRequest"),
    );
    await expect(
      updatePaginatedReportDatasources(
        baseInput({
          workspaceId: "ws-1",
          paginatedReportId: "prep-1",
          updates: [{ datasourceName: "ds", newServer: "srv" }],
        }),
      ),
    ).rejects.toThrow(/InvalidRequest/);
  });

  it("never leaks the access token into the output", async () => {
    const result = await updatePaginatedReportDatasources(
      baseInput({
        workspaceId: "ws-1",
        paginatedReportId: "prep-1",
        updates: [{ datasourceName: "ds", newServer: "srv" }],
      }),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
