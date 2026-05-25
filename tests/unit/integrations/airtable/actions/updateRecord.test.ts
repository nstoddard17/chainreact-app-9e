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

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: jest.fn(),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsUpdate: (...args: unknown[]) => mockUpdate(...args),
  recordsDelete: jest.fn(),
}));

import { updateRecord } from "@/integrations/airtable/actions/updateRecord";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockUpdate.mockReset();
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

describe("update_record action", () => {
  it("PATCH with typed fields, threads recordId + typecast", async () => {
    mockUpdate.mockResolvedValueOnce({
      id: "rec1",
      fields: { Name: "Bob" },
      createdTime: "2026-05-09T10:00:00Z",
    });
    const result = await updateRecord({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
        typecast: false,
        fields: {
          Name: { type: "singleLineText", value: "Bob" },
          Done: { type: "checkbox", value: true },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.recordId).toBe("rec1");
    expect(callArg.fields).toEqual({ Name: "Bob", Done: true });
    expect(callArg.typecast).toBe(false);
    expect(result.output.id).toBe("rec1");
  });

  it("supports null on nullable fields (clear via PATCH)", async () => {
    mockUpdate.mockResolvedValueOnce({ id: "rec1", fields: {} });
    await updateRecord({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
        typecast: false,
        fields: {
          Score: { type: "number", value: null },
          Status: { type: "singleSelect", value: null },
        },
      },
      triggerEvent: trigger(),
    });
    expect(mockUpdate.mock.calls[0]![0]!.fields).toEqual({
      Score: null,
      Status: null,
    });
  });

  it("propagates NotFoundError from the wrapper (handlers don't catch)", async () => {
    class NotFoundError extends Error {
      constructor(public resource: string) {
        super(`not found: ${resource}`);
      }
    }
    mockUpdate.mockRejectedValueOnce(new NotFoundError("record rec1"));
    await expect(
      updateRecord({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          recordId: "rec1",
          typecast: false,
          fields: {},
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/not found: record rec1/);
  });

  it("Q11: typecast is required; schema rejects when omitted", async () => {
    await expect(
      updateRecord({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          recordId: "rec1",
          // typecast omitted — Zod schema must reject.
          fields: {},
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("accepts attachment fields with typed [{url, filename?}] shape (Airtable 2.1 Commit 1)", async () => {
    mockUpdate.mockResolvedValueOnce({ id: "rec1", fields: {} });
    await updateRecord({
      workflowId: "wf",
      userId: "u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        recordId: "rec1",
        typecast: false,
        fields: {
          Photo: {
            type: "attachment",
            value: [
              { url: "https://files.example/a.png", filename: "a.png" },
              { url: "https://files.example/b.pdf" },
            ],
          },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockUpdate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo).toEqual([
      { url: "https://files.example/a.png", filename: "a.png" },
      { url: "https://files.example/b.pdf" },
    ]);
  });

  it("attachment field: invalid URL rejected at schema; no PATCH issued", async () => {
    await expect(
      updateRecord({
        workflowId: "wf",
        userId: "u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "Tasks",
          recordId: "rec1",
          typecast: false,
          fields: {
            Photo: {
              type: "attachment",
              value: [{ url: "not-a-url", filename: "x.jpg" }],
            },
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
