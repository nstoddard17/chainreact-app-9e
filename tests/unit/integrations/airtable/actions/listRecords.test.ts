/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockList = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: jest.fn(),
  recordsGet: jest.fn(),
  recordsList: (...args: unknown[]) => mockList(...args),
  recordsUpdate: jest.fn(),
  recordsDelete: jest.fn(),
}));

import { listRecords } from "@/integrations/airtable/actions/listRecords";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockList.mockReset();
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

describe("list_records action", () => {
  it("forward-passes filterByFormula / sort / view / pageSize / fields / offset / maxRecords", async () => {
    mockList.mockResolvedValueOnce({
      records: [
        { id: "rec1", fields: { Name: "Alice" }, createdTime: "t1" },
        { id: "rec2", fields: { Name: "Bob" }, createdTime: "t2" },
      ],
      offset: "PAGE2",
    });
    const result = await listRecords({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        filterByFormula: "{Active}",
        pageSize: 50,
        maxRecords: 200,
        offset: "INKEY",
        fields: ["Name", "Score"],
        view: "Grid view",
        sort: [{ field: "Name", direction: "asc" }],
      },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.filterByFormula).toBe("{Active}");
    expect(callArg.pageSize).toBe(50);
    expect(callArg.maxRecords).toBe(200);
    expect(callArg.offset).toBe("INKEY");
    expect(callArg.fields).toEqual(["Name", "Score"]);
    expect(callArg.view).toBe("Grid view");
    expect(callArg.sort).toEqual([{ field: "Name", direction: "asc" }]);
    expect(result.output.records).toHaveLength(2);
    expect(result.output.count).toBe(2);
    expect(result.output.offset).toBe("PAGE2");
  });

  it("offset null when last page", async () => {
    mockList.mockResolvedValueOnce({ records: [], offset: undefined });
    const result = await listRecords({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { baseId: "appBASE", tableIdOrName: "Tasks" },
      triggerEvent: trigger(),
    });
    expect(result.output.offset).toBeNull();
    expect(result.output.count).toBe(0);
    expect(result.output.records).toEqual([]);
  });

  it("rejects pageSize > 100 (Airtable's hard ceiling)", async () => {
    await expect(
      listRecords({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          pageSize: 200,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("works with no optional params (just baseId + tableIdOrName)", async () => {
    mockList.mockResolvedValueOnce({ records: [] });
    await listRecords({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: { baseId: "appBASE", tableIdOrName: "Tasks" },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.filterByFormula).toBeUndefined();
    expect(callArg.sort).toBeUndefined();
  });
});
