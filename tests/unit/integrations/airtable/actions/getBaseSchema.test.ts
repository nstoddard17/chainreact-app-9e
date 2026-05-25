/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBasesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/bases", () => ({
  basesGetSchema: (...args: unknown[]) => mockBasesGet(...args),
}));

import { getBaseSchema } from "@/integrations/airtable/actions/getBaseSchema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBasesGet.mockReset();
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

describe("get_base_schema action", () => {
  it("returns tables + tableCount + totalFieldCount", async () => {
    mockBasesGet.mockResolvedValueOnce({
      tables: [
        {
          id: "tbl1",
          name: "Tasks",
          primaryFieldId: "fld1",
          fields: [
            { id: "fld1", name: "Name", type: "singleLineText" },
            { id: "fld2", name: "Done", type: "checkbox" },
          ],
        },
        {
          id: "tbl2",
          name: "Users",
          primaryFieldId: "fld3",
          fields: [{ id: "fld3", name: "Email", type: "email" }],
        },
      ],
    });
    const result = await getBaseSchema({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { baseId: "appBASE", includeViews: false },
      triggerEvent: trigger(),
    });
    expect(result.output.baseId).toBe("appBASE");
    expect(result.output.tables).toHaveLength(2);
    expect(result.output.tableCount).toBe(2);
    expect(result.output.totalFieldCount).toBe(3);
  });

  it("threads includeViews to the wrapper", async () => {
    mockBasesGet.mockResolvedValueOnce({ tables: [] });
    await getBaseSchema({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { baseId: "appBASE", includeViews: true },
      triggerEvent: trigger(),
    });
    expect(mockBasesGet.mock.calls[0]![0]!.includeViews).toBe(true);
  });

  it("Q11: includeViews is required (rejects when omitted)", async () => {
    await expect(
      getBaseSchema({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: { baseId: "appBASE" },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
