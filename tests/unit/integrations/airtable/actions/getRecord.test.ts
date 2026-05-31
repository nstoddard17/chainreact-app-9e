/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: jest.fn(),
  recordsGet: (...args: unknown[]) => mockGet(...args),
  recordsList: jest.fn(),
  recordsUpdate: jest.fn(),
  recordsDelete: jest.fn(),
}));

import { getRecord } from "@/integrations/airtable/actions/getRecord";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockGet.mockReset();
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

describe("get_record action", () => {
  it("returns { id, fields, createdTime } from the record response", async () => {
    mockGet.mockResolvedValueOnce({
      id: "rec1",
      fields: { Name: "Alice", Active: true },
      createdTime: "2026-05-09T10:00:00Z",
    });
    const result = await getRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
      },
      triggerEvent: trigger(),
    });
    const callArg = mockGet.mock.calls[0]![0]!;
    expect(callArg.recordId).toBe("rec1");
    expect(result.output).toEqual({
      id: "rec1",
      fields: { Name: "Alice", Active: true },
      createdTime: "2026-05-09T10:00:00Z",
    });
  });

  it("createdTime null when missing from response", async () => {
    mockGet.mockResolvedValueOnce({ id: "rec1", fields: {} });
    const result = await getRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
      },
      triggerEvent: trigger(),
    });
    expect(result.output.createdTime).toBeNull();
  });

  it("threads provider='airtable' through refreshAndRetry", async () => {
    mockGet.mockResolvedValueOnce({ id: "rec1", fields: {} });
    await getRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
      },
      triggerEvent: trigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.provider).toBe("airtable");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.accountId).toBe("acct-u");
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBe("usrXXX");
  });

  it("accountId null when trigger is from a different provider", async () => {
    mockGet.mockResolvedValueOnce({ id: "rec1", fields: {} });
    await getRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
      },
      triggerEvent: { ...trigger(), provider: "slack" },
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]!.providerAccountId).toBeNull();
  });
});
