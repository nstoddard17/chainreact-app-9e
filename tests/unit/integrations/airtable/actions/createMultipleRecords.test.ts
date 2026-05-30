/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBatchCreate = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsBatchCreate: (...args: unknown[]) => mockBatchCreate(...args),
  recordsCreate: (...args: unknown[]) => mockCreate(...args),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsUpdate: jest.fn(),
  recordsDelete: jest.fn(),
}));

import { createMultipleRecords } from "@/integrations/airtable/actions/createMultipleRecords";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBatchCreate.mockReset();
  mockCreate.mockReset();
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
});

function trigger(): TriggerEvent {
  return {
    provider: "airtable",
    eventType: "manual",
    eventId: "evt-1",
    occurredAt: "2026-05-15T12:00:00Z",
    providerAccountId: "usrXXX",
    payload: {},
  };
}

function airtableResponse(ids: string[]) {
  return {
    records: ids.map((id, i) => ({
      id,
      fields: { Name: `name-${i}` },
      createdTime: "2026-05-15T10:00:00Z",
    })),
  };
}

describe("create_multiple_records action — Airtable 2.1 Commit 3", () => {
  it("calls recordsBatchCreate ONCE with all records (no sequential loop, no per-record recordsCreate)", async () => {
    mockBatchCreate.mockResolvedValueOnce(
      airtableResponse(["rec1", "rec2", "rec3"]),
    );
    await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records: [
          { fields: { Name: { type: "singleLineText", value: "Alice" } } },
          { fields: { Name: { type: "singleLineText", value: "Bob" } } },
          { fields: { Name: { type: "singleLineText", value: "Carol" } } },
        ],
      },
      triggerEvent: trigger(),
    });
    // Exactly one wrapper call regardless of record count.
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
    // recordsCreate (single-record) NEVER called — guards against
    // accidental sequential-loop regression to V1's pattern.
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("forwards every record's wire-formatted fields to the wrapper", async () => {
    mockBatchCreate.mockResolvedValueOnce(airtableResponse(["rec1", "rec2"]));
    await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "Tasks",
        typecast: false,
        records: [
          {
            fields: {
              Name: { type: "singleLineText", value: "Alice" },
              Score: { type: "number", value: 99 },
              Joined: { type: "date", value: "2026-05-15T00:00:00Z" },
            },
          },
          {
            fields: {
              Name: { type: "singleLineText", value: "Bob" },
              Linked: {
                type: "multipleRecordLinks",
                value: ["recA::Display", "recB"],
              },
            },
          },
        ],
      },
      triggerEvent: trigger(),
    });
    const callArg = mockBatchCreate.mock.calls[0]![0]!;
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.tableIdOrName).toBe("Tasks");
    expect(callArg.typecast).toBe(false);
    expect(callArg.records).toEqual([
      {
        fields: {
          Name: "Alice",
          Score: 99,
          Joined: "2026-05-15", // date formatter
        },
      },
      {
        fields: {
          Name: "Bob",
          Linked: ["recA", "recB"], // multipleRecordLinks strips display suffix
        },
      },
    ]);
  });

  it("formats attachment fields through the shared formatter (Airtable 2.1 Commit 1)", async () => {
    mockBatchCreate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records: [
          {
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
        ],
      },
      triggerEvent: trigger(),
    });
    const callArg = mockBatchCreate.mock.calls[0]![0]!;
    expect(callArg.records[0]!.fields.Photo).toEqual([
      { url: "https://files.example/a.png", filename: "a.png" },
      { url: "https://files.example/b.pdf" },
    ]);
  });

  it("threads typecast: true to the wrapper", async () => {
    mockBatchCreate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: true,
        records: [
          { fields: { Name: { type: "singleLineText", value: "Alice" } } },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(mockBatchCreate.mock.calls[0]![0]!.typecast).toBe(true);
  });

  it("accepts 10 records (max)", async () => {
    mockBatchCreate.mockResolvedValueOnce(
      airtableResponse(Array.from({ length: 10 }, (_, i) => `rec${i}`)),
    );
    const records = Array.from({ length: 10 }, (_, i) => ({
      fields: { Name: { type: "singleLineText" as const, value: `r${i}` } },
    }));
    const result = await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records,
      },
      triggerEvent: trigger(),
    });
    expect(result.output.createdCount).toBe(10);
    expect(mockBatchCreate.mock.calls[0]![0]!.records).toHaveLength(10);
  });

  it("rejects 11+ records at the schema layer BEFORE the wrapper call (fail loud)", async () => {
    const records = Array.from({ length: 11 }, (_, i) => ({
      fields: { Name: { type: "singleLineText" as const, value: `r${i}` } },
    }));
    await expect(
      createMultipleRecords({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          records,
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockBatchCreate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("rejects an empty records array BEFORE the wrapper call", async () => {
    await expect(
      createMultipleRecords({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          records: [],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockBatchCreate).not.toHaveBeenCalled();
  });

  it("propagates Airtable 422 (all-or-nothing — NPD-A1, NOT partial success)", async () => {
    mockBatchCreate.mockRejectedValueOnce(
      new Error(
        "Airtable POST /v0/appBASE/tbl failed: INVALID_VALUE_FOR_COLUMN",
      ),
    );
    await expect(
      createMultipleRecords({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          records: [
            { fields: { Name: { type: "singleLineText", value: "Alice" } } },
            { fields: { Name: { type: "singleLineText", value: "Bob" } } },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/INVALID_VALUE_FOR_COLUMN/);
    // Wrapper was called exactly once; no retry, no per-record fallback.
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does NOT return a partial-success envelope; an error throws fully (no success:false wrapper)", async () => {
    mockBatchCreate.mockRejectedValueOnce(new Error("boom"));
    let thrown: unknown = null;
    try {
      await createMultipleRecords({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          records: [
            { fields: { Name: { type: "singleLineText", value: "Alice" } } },
          ],
        },
        triggerEvent: trigger(),
      });
    } catch (err) {
      thrown = err;
    }
    // Handler threw — there is no V1-style `{success: false, ...}` shape.
    expect(thrown).toBeInstanceOf(Error);
  });

  it("threads accountId from the trigger event", async () => {
    mockBatchCreate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await createMultipleRecords({
      workflowId: "wf",
      userId: "u-123",
      accountId: "acct-u-123",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records: [
          { fields: { Name: { type: "singleLineText", value: "Alice" } } },
        ],
      },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.userId).toBe("u-123");
    expect(refreshArg.provider).toBe("airtable");
    expect(refreshArg.accountId).toBe("usrXXX");
  });

  it("returns bounded output (baseId, tableIdOrName, createdCount, records[]); no raw response spread", async () => {
    mockBatchCreate.mockResolvedValueOnce({
      records: [
        {
          id: "rec1",
          fields: { Name: "Alice", Score: 99 },
          createdTime: "2026-05-15T10:00:00Z",
          // Airtable extras the wrapper might surface — handler MUST
          // NOT spread these into output.
          object: "record",
        },
      ],
    });
    const result = await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records: [
          { fields: { Name: { type: "singleLineText", value: "Alice" } } },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output).sort()).toEqual([
      "baseId",
      "createdCount",
      "records",
      "tableIdOrName",
    ]);
    expect(result.output.baseId).toBe("appBASE");
    expect(result.output.tableIdOrName).toBe("tbl");
    expect(result.output.createdCount).toBe(1);
    const records = result.output.records as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(records[0]).toEqual({
      id: "rec1",
      fields: { Name: "Alice", Score: 99 },
      createdTime: "2026-05-15T10:00:00Z",
    });
    // The "object: record" extra from Airtable's mock response did NOT
    // leak into the bounded projection.
    expect(records[0]!).not.toHaveProperty("object");
  });

  it("createdTime defaults to null when Airtable omits it (defensive)", async () => {
    mockBatchCreate.mockResolvedValueOnce({
      records: [{ id: "rec1", fields: {} }], // createdTime omitted
    });
    const result = await createMultipleRecords({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        records: [
          { fields: { Name: { type: "singleLineText", value: "x" } } },
        ],
      },
      triggerEvent: trigger(),
    });
    const records = result.output.records as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(records[0]!.createdTime).toBeNull();
  });

  it("does NOT call the API when fields contain a still-deferred type — fails BEFORE network", async () => {
    await expect(
      createMultipleRecords({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          records: [
            {
              fields: {
                R: { type: "rollup", value: 1 } as unknown as never,
              },
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockBatchCreate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});
