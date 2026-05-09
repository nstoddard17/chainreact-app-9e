/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockTablesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/tables", () => ({
  tablesGet: (...args: unknown[]) => mockTablesGet(...args),
}));

import { getTableSchema } from "@/integrations/airtable/actions/getTableSchema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockTablesGet.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "airtable",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-09T12:00:00Z",
    accountId: "usrXXX",
    payload: {},
  };
}

describe("get_table_schema action", () => {
  it("returns { baseId, table, fieldCount }", async () => {
    mockTablesGet.mockResolvedValueOnce({
      id: "tbl1",
      name: "Tasks",
      primaryFieldId: "fld1",
      fields: [
        { id: "fld1", name: "Name", type: "singleLineText" },
        { id: "fld2", name: "Done", type: "checkbox" },
      ],
    });
    const result = await getTableSchema({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        includeViews: false,
      },
      triggerEvent: trigger(),
    });
    expect(result.output.baseId).toBe("appBASE");
    expect((result.output.table as { id: string }).id).toBe("tbl1");
    expect(result.output.fieldCount).toBe(2);
  });

  it("propagates NotFoundError when the table doesn't exist (delegated to tablesGet)", async () => {
    class NotFoundError extends Error {
      constructor(public resource: string) {
        super(`not found: ${resource}`);
      }
    }
    mockTablesGet.mockRejectedValueOnce(
      new NotFoundError("table appBASE/Mystery"),
    );
    await expect(
      getTableSchema({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Mystery",
          includeViews: false,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found: table appBASE\/Mystery/);
  });

  it("Q11: includeViews is required at the schema layer", async () => {
    await expect(
      getTableSchema({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { baseId: "appBASE", tableIdOrName: "Tasks" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
