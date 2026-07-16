/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockExecute = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-powerbi/api/datasets/executeQueries", () => ({
  executeQueries: (...args: unknown[]) => mockExecute(...args),
}));

import { executeDaxQuery } from "@/integrations/microsoft-powerbi/actions/semantic_models/executeDaxQuery";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockExecute.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tk1"),
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
  daxQuery: "EVALUATE 'Sales'",
  maxRows: 2,
};

describe("execute_dax_query action", () => {
  it("returns rows with rowCount, no truncation when under maxRows", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ "Sales[Amount]": 10 }],
    });

    const result = await executeDaxQuery(baseInput(validConfig));

    const call = mockExecute.mock.calls[0]![0];
    expect(call.groupId).toBe("ws-1");
    expect(call.datasetId).toBe("ds-1");
    expect(call.daxQuery).toBe("EVALUATE 'Sales'");
    expect(call.includeNulls).toBeUndefined();
    expect(call.impersonatedUserName).toBeUndefined();
    expect(result.output).toEqual({
      rows: [{ "Sales[Amount]": 10 }],
      rowCount: 1,
      truncated: false,
    });
  });

  it("truncates rows client-side to maxRows and flags it", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { "Sales[Amount]": 1 },
        { "Sales[Amount]": 2 },
        { "Sales[Amount]": 3 },
      ],
    });

    const result = await executeDaxQuery(baseInput(validConfig));
    expect(result.output.rowCount).toBe(2);
    expect(result.output.truncated).toBe(true);
    expect((result.output.rows as unknown[]).length).toBe(2);
  });

  it("forwards includeNulls and impersonatedUserName only when set", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    await executeDaxQuery(
      baseInput({
        ...validConfig,
        includeNulls: true,
        impersonatedUserName: "rls-test@contoso.com",
      }),
    );

    const call = mockExecute.mock.calls[0]![0];
    expect(call.includeNulls).toBe(true);
    expect(call.impersonatedUserName).toBe("rls-test@contoso.com");
  });

  it("rejects a missing maxRows (Q11 — no hidden default)", async () => {
    await expect(
      executeDaxQuery(
        baseInput({
          workspaceId: "ws-1",
          semanticModelId: "ds-1",
          daxQuery: "EVALUATE 'Sales'",
        }),
      ),
    ).rejects.toThrow();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range maxRows (1–1000)", async () => {
    await expect(
      executeDaxQuery(baseInput({ ...validConfig, maxRows: 1001 })),
    ).rejects.toThrow();
  });

  it("rejects unknown config keys (.strict())", async () => {
    await expect(
      executeDaxQuery(baseInput({ ...validConfig, queries: [] })),
    ).rejects.toThrow();
  });

  it("pins providerAccountId when triggered by its own provider", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });

    await executeDaxQuery({
      ...baseInput(validConfig),
      triggerEvent: trigger("microsoft-powerbi"),
    });

    expect(mockRefreshAndRetry.mock.calls[0]![0].providerAccountId).toBe(
      "alice@contoso.com",
    );
  });

  it("propagates provider failures to the engine (no synthetic envelope)", async () => {
    mockExecute.mockRejectedValueOnce(
      new Error("Power BI DAX query returned an error: MoreThanOneResultTable"),
    );
    await expect(executeDaxQuery(baseInput(validConfig))).rejects.toThrow(
      /MoreThanOneResultTable/,
    );
  });

  it("never leaks the access token into the output", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ "T[C]": "v" }] });
    const result = await executeDaxQuery(baseInput(validConfig));
    expect(JSON.stringify(result.output)).not.toContain("tk1");
  });
});
