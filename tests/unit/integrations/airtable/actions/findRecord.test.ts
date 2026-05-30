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

import { findRecord } from "@/integrations/airtable/actions/findRecord";

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
    providerAccountId: "usrXXX",
    payload: {},
  };
}

describe("find_record action", () => {
  it("forward-passes filterByFormula verbatim with maxRecords=1", async () => {
    mockList.mockResolvedValueOnce({
      records: [
        {
          id: "rec1",
          fields: { Name: "Alice" },
          createdTime: "2026-05-09T10:00:00Z",
        },
      ],
    });
    const result = await findRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        filterByFormula: "{Name}='Alice'",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockList.mock.calls[0]![0]!;
    expect(callArg.filterByFormula).toBe("{Name}='Alice'");
    expect(callArg.maxRecords).toBe(1);
    expect(result.output.found).toBe(true);
    expect(result.output.record).toEqual({
      id: "rec1",
      fields: { Name: "Alice" },
      createdTime: "2026-05-09T10:00:00Z",
    });
  });

  it("returns { found: false, record: null } on no match (NO throw)", async () => {
    mockList.mockResolvedValueOnce({ records: [] });
    const result = await findRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        filterByFormula: "{Name}='Mystery'",
      },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(false);
    expect(result.output.record).toBeNull();
  });

  it("takes only the first match even when Airtable returns more than one", async () => {
    mockList.mockResolvedValueOnce({
      records: [
        { id: "rec1", fields: { Name: "Alice" } },
        { id: "rec2", fields: { Name: "Alice" } },
      ],
    });
    const result = await findRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        filterByFormula: "{Name}='Alice'",
      },
      triggerEvent: trigger(),
    });
    expect(result.output.found).toBe(true);
    expect(
      (result.output.record as { id: string }).id,
    ).toBe("rec1");
  });

  it("Q11: filterByFormula required (rejects empty string)", async () => {
    await expect(
      findRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          filterByFormula: "",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });
});
