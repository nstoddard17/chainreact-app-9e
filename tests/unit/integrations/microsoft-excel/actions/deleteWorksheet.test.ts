/**
 * @jest-environment node
 *
 * Tests for the Excel `delete_worksheet` action handler. Covers:
 *   - calls worksheetDelete with the right shape (workbookId +
 *     worksheetName)
 *   - output mapping (workbookId / worksheetName / deleted: true)
 *   - error propagation (no silent no-op)
 *   - schema-rejection at parse for unknown / V1 / bulk fields
 *   - refreshAndRetry accountId routing
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/microsoft-excel/api/worksheetDelete", () => ({
  worksheetDelete: (...args: unknown[]) => mockDelete(...args),
}));

import { deleteWorksheet } from "@/integrations/microsoft-excel/actions/deleteWorksheet";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockDelete.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockDelete.mockResolvedValue(undefined);
});

function excelTrigger(): TriggerEvent {
  return {
    provider: "microsoft-excel",
    eventType: "new_row",
    eventId: "evt-1",
    occurredAt: "2026-05-14T12:00:00Z",
    providerAccountId: "alice@contoso.com",
    payload: {},
  };
}

function nonExcelTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.channel",
    eventId: "Ev1",
    occurredAt: "2026-05-14T12:00:00Z",
    providerAccountId: "T0001",
    payload: {},
  };
}

describe("delete_worksheet handler — happy path", () => {
  it("DELETEs the worksheet and returns mapped output", async () => {
    const result = await deleteWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        workbookId: "wb-1",
        worksheetName: "Sheet1",
      },
      triggerEvent: excelTrigger(),
    });

    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete.mock.calls[0]![0]).toMatchObject({
      accessToken: "tok",
      workbookId: "wb-1",
      worksheetName: "Sheet1",
    });

    expect(result.output).toEqual({
      workbookId: "wb-1",
      worksheetName: "Sheet1",
      deleted: true,
    });
  });
});

describe("delete_worksheet handler — error surface", () => {
  it("propagates worksheetDelete errors (no silent no-op)", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("worksheet 'Bogus' not found"),
    );
    await expect(
      deleteWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Bogus",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/not found/);
  });

  it("propagates last-visible-worksheet errors verbatim", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("Cannot delete the last visible worksheet."),
    );
    await expect(
      deleteWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "OnlySheet",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow(/last visible/);
  });

  it("rejects bulk-array form at parse time (no bulk delete)", async () => {
    await expect(
      deleteWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetNames: ["Sheet1", "Sheet2"],
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects unknown field at parse time (.strict)", async () => {
    await expect(
      deleteWorksheet({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          workbookId: "wb-1",
          worksheetName: "Sheet1",
          xCustom: "v",
        },
        triggerEvent: excelTrigger(),
      }),
    ).rejects.toThrow();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("delete_worksheet handler — refreshAndRetry routing", () => {
  it("routes to triggerEvent.accountId when the trigger is microsoft-excel", async () => {
    await deleteWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1" },
      triggerEvent: excelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      userId: "u",
      accountId: "alice@contoso.com",
    });
  });

  it("routes with accountId=null when triggerEvent is from a different provider", async () => {
    await deleteWorksheet({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: { workbookId: "wb-1", worksheetName: "Sheet1" },
      triggerEvent: nonExcelTrigger(),
    });
    expect(mockRefreshAndRetry.mock.calls[0]![0]).toMatchObject({
      provider: "microsoft-excel",
      accountId: null,
    });
  });
});
