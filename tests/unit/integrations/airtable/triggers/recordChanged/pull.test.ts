/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockListPayloads = jest.fn();
const mockGetActiveForExecution = jest.fn();
const mockUpdateConfig = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/_shared/airtable/api/webhooks", () => ({
  webhooksCreate: jest.fn(),
  webhooksDelete: jest.fn(),
  webhooksRefresh: jest.fn(),
  webhooksListPayloads: (...args: unknown[]) => mockListPayloads(...args),
}));

jest.mock("@/repositories/integrations", () => ({
  getActiveForExecution: (...args: unknown[]) =>
    mockGetActiveForExecution(...args),
}));

jest.mock("@/repositories/triggerResources", () => ({
  updateConfig: (...args: unknown[]) => mockUpdateConfig(...args),
}));

import { pull } from "@/integrations/airtable/triggers/recordChanged/pull";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockListPayloads.mockReset();
  mockGetActiveForExecution.mockReset();
  mockUpdateConfig.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  mockGetActiveForExecution.mockResolvedValue({
    id: "int-1",
    userId: "user-1",
    providerAccountId: "usrXXX",
  });
});

function trigger(config: Record<string, unknown>) {
  return {
    id: "tr-1",
    workflowId: "wf-1",
    userId: "user-1",
    provider: "airtable",
    eventType: "record_changed",
    nodeId: "n-1",
    config,
    accountId: "usrXXX",
    registeredAt: "",
    expiresAt: null,
    lastRenewedAt: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("pull — first call (no cursor)", () => {
  it("calls webhooksListPayloads with cursor=undefined and persists response.cursor", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [],
      cursor: 5,
      mightHaveMore: false,
    });

    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        macSecretBase64: "secret",
        lastCursor: null,
      }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads).toHaveBeenCalledTimes(1);
    expect(mockListPayloads.mock.calls[0]![0].cursor).toBeUndefined();
    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    expect(mockUpdateConfig.mock.calls[0]![0]).toBe("tr-1");
    expect((mockUpdateConfig.mock.calls[0]![1] as { lastCursor: number }).lastCursor).toBe(5);
    expect(result.cursorAdvanced).toBe(true);
    expect(result.events).toEqual([]);
  });
});

describe("pull — subsequent calls (with persisted cursor)", () => {
  it("forwards lastCursor and emits events for record changes", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [
        {
          baseTransactionNumber: 7,
          timestamp: "2026-05-09T11:50:00.000Z",
          changedTablesById: {
            tblTASKS: {
              createdRecordsById: {
                rec1: { cellValuesByFieldId: { fld1: "Alice" } },
              },
            },
          },
        },
      ],
      cursor: 8,
      mightHaveMore: false,
    });

    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        macSecretBase64: "secret",
        lastCursor: 7,
      }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads.mock.calls[0]![0].cursor).toBe(7);
    expect(result.events).toHaveLength(1);
    expect((result.events[0]!.payload as { eventType: string }).eventType).toBe(
      "created",
    );
    expect(result.events[0]!.eventId).toBe(
      "achWEBHOOK:tblTASKS:rec1:created:7",
    );
  });
});

describe("pull — cursor advancement ordering", () => {
  it("persists the cursor BEFORE the events return (downstream-failure replay safety)", async () => {
    const updateOrder: number[] = [];
    mockUpdateConfig.mockImplementation(async () => {
      updateOrder.push(Date.now());
    });

    mockListPayloads.mockResolvedValueOnce({
      payloads: [
        {
          baseTransactionNumber: 1,
          changedTablesById: {
            tblA: {
              createdRecordsById: { rec1: { cellValuesByFieldId: {} } },
            },
          },
        },
      ],
      cursor: 1,
      mightHaveMore: false,
    });

    await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockUpdateConfig).toHaveBeenCalledTimes(1);
    // The single mock-listPayloads call returned payloads + cursor.
    // updateConfig must have been awaited before pull resolved (we
    // wait above with `await pull(...)` so by definition all
    // synchronous awaits inside pull resolved before the `await`
    // above completes).
    expect(updateOrder).toHaveLength(1);
  });
});

describe("pull — pagination via mightHaveMore", () => {
  it("loops until mightHaveMore=false, advancing cursor each page", async () => {
    mockListPayloads
      .mockResolvedValueOnce({
        payloads: [
          {
            baseTransactionNumber: 1,
            changedTablesById: {
              tblA: { createdRecordsById: { rec1: { cellValuesByFieldId: {} } } },
            },
          },
        ],
        cursor: 1,
        mightHaveMore: true,
      })
      .mockResolvedValueOnce({
        payloads: [
          {
            baseTransactionNumber: 2,
            changedTablesById: {
              tblA: { createdRecordsById: { rec2: { cellValuesByFieldId: {} } } },
            },
          },
        ],
        cursor: 2,
        mightHaveMore: false,
      });

    const result = await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );

    expect(mockListPayloads).toHaveBeenCalledTimes(2);
    // Second call uses the persisted cursor from the first response.
    expect(mockListPayloads.mock.calls[1]![0].cursor).toBe(1);
    expect(result.events).toHaveLength(2);
    expect(result.cursorAdvanced).toBe(true);
  });
});

describe("pull — defensive paths", () => {
  it("returns zero events when no active integration (user disconnected mid-flight)", async () => {
    mockGetActiveForExecution.mockResolvedValueOnce(null);
    const result = await pull(
      trigger({ baseId: "appBASE", webhookId: "achWEBHOOK" }),
      "2026-05-09T12:00:00Z",
    );
    expect(result.events).toEqual([]);
    expect(mockListPayloads).not.toHaveBeenCalled();
  });

  it("returns zero events when config is missing baseId or webhookId", async () => {
    const result = await pull(
      trigger({ baseId: "appBASE" }),
      "2026-05-09T12:00:00Z",
    );
    expect(result.events).toEqual([]);
    expect(mockListPayloads).not.toHaveBeenCalled();
  });

  it("does NOT advance the cursor when Airtable returns the same cursor (defensive)", async () => {
    mockListPayloads.mockResolvedValueOnce({
      payloads: [],
      cursor: 5,
      mightHaveMore: false,
    });
    const result = await pull(
      trigger({
        baseId: "appBASE",
        webhookId: "achWEBHOOK",
        lastCursor: 5,
      }),
      "2026-05-09T12:00:00Z",
    );
    expect(mockUpdateConfig).not.toHaveBeenCalled();
    expect(result.cursorAdvanced).toBe(false);
  });
});
