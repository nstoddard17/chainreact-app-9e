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
  "@/integrations/microsoft-powerbi/api/datasets/datasourcesUpdate",
  () => ({
    datasourcesUpdate: (...args: unknown[]) => mockUpdate(...args),
  }),
);

import { updateSemanticModelDatasources } from "@/integrations/microsoft-powerbi/actions/semantic_models/updateSemanticModelDatasources";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(provider = "native"): TriggerEvent {
  return {
    provider,
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-07-15T12:00:00Z",
    providerAccountId: provider === "microsoft-powerbi" ? "alice@contoso.com" : "",
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

const validConfig = {
  workspaceId: "ws-1",
  semanticModelId: "ds-1",
  updates: [
    {
      datasourceType: "Sql",
      currentServer: "old-sql",
      currentDatabase: "sales",
      newServer: "new-sql",
      newDatabase: "sales",
    },
  ],
};

describe("update_semantic_model_datasources action", () => {
  it("maps current*/new* rows onto selector + target connection details", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    const result = await updateSemanticModelDatasources(
      baseInput(validConfig),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.updates).toEqual([
      {
        datasourceType: "Sql",
        current: { server: "old-sql", database: "sales", url: undefined },
        target: { server: "new-sql", database: "sales", url: undefined },
      },
    ]);
    expect(result.output).toEqual({ updated: true, updateCount: 1 });
  });

  it("accepts URL-only rows (e.g. OData / SharePoint)", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateSemanticModelDatasources(
      baseInput({
        ...validConfig,
        updates: [
          {
            datasourceType: "OData",
            currentUrl: "https://old.example.com/feed",
            newUrl: "https://new.example.com/feed",
          },
        ],
      }),
    );

    const call = mockUpdate.mock.calls[0]![0];
    expect(call.updates[0].current.url).toBe("https://old.example.com/feed");
    expect(call.updates[0].target.url).toBe("https://new.example.com/feed");
  });

  it("rejects a row with no current* selector value", async () => {
    await expect(
      updateSemanticModelDatasources(
        baseInput({
          ...validConfig,
          updates: [{ datasourceType: "Sql", newServer: "new-sql" }],
        }),
      ),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("rejects a row with no new* target value", async () => {
    await expect(
      updateSemanticModelDatasources(
        baseInput({
          ...validConfig,
          updates: [{ datasourceType: "Sql", currentServer: "old-sql" }],
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects an unsupported datasourceType", async () => {
    await expect(
      updateSemanticModelDatasources(
        baseInput({
          ...validConfig,
          updates: [
            {
              datasourceType: "Oracle",
              currentServer: "a",
              newServer: "b",
            },
          ],
        }),
      ),
    ).rejects.toThrow();
  });

  it("rejects more than 20 rows and unknown config keys (.strict())", async () => {
    const row = {
      datasourceType: "Sql",
      currentServer: "a",
      newServer: "b",
    };
    await expect(
      updateSemanticModelDatasources(
        baseInput({ ...validConfig, updates: Array(21).fill(row) }),
      ),
    ).rejects.toThrow();
    await expect(
      updateSemanticModelDatasources(
        baseInput({ ...validConfig, updateDetails: [] }),
      ),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);

    await updateSemanticModelDatasources({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockUpdate.mockRejectedValueOnce(
      new Error("Power BI dataset UpdateDatasources POST failed: HTTP 400"),
    );
    await expect(
      updateSemanticModelDatasources(baseInput(validConfig)),
    ).rejects.toThrow(/HTTP 400/);
  });

  it("never leaks the access token into the output", async () => {
    mockUpdate.mockResolvedValueOnce(undefined);
    const result = await updateSemanticModelDatasources(
      baseInput(validConfig),
    );
    expect(JSON.stringify(result.output)).not.toContain("tok");
  });
});
