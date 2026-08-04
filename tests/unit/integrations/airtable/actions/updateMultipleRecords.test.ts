/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockBatchUpdate = jest.fn();
const mockUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsBatchUpdate: (...args: unknown[]) => mockBatchUpdate(...args),
  recordsUpdate: (...args: unknown[]) => mockUpdate(...args),
  recordsBatchCreate: jest.fn(),
  recordsCreate: jest.fn(),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsDelete: jest.fn(),
}));

import { updateMultipleRecords } from "@/integrations/airtable/actions/updateMultipleRecords";
import { UpdateMultipleRecordsConfigSchema } from "@/integrations/airtable/actions/updateMultipleRecords.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockBatchUpdate.mockReset();
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

describe("update_multiple_records action — Airtable 2.1 Commit 4", () => {
  it("calls recordsBatchUpdate ONCE with all records (no sequential loop, no per-record recordsUpdate)", async () => {
    mockBatchUpdate.mockResolvedValueOnce(
      airtableResponse(["rec1", "rec2", "rec3"]),
    );
    await updateMultipleRecords({
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
            recordId: "rec1",
            fields: { Name: { type: "singleLineText", value: "Alice" } },
          },
          {
            recordId: "rec2",
            fields: { Name: { type: "singleLineText", value: "Bob" } },
          },
          {
            recordId: "rec3",
            fields: { Name: { type: "singleLineText", value: "Carol" } },
          },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    // recordsUpdate (single-record) NEVER called — guards against
    // accidental sequential-loop regression to V1's pattern.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(1);
  });

  it("forwards every record's id + wire-formatted fields to the wrapper", async () => {
    mockBatchUpdate.mockResolvedValueOnce(airtableResponse(["rec1", "rec2"]));
    await updateMultipleRecords({
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
            recordId: "rec1",
            fields: {
              Name: { type: "singleLineText", value: "Alice" },
              Score: { type: "number", value: 99 },
              Joined: { type: "date", value: "2026-05-15T00:00:00Z" },
            },
          },
          {
            recordId: "rec2",
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
    const callArg = mockBatchUpdate.mock.calls[0]![0]!;
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.tableIdOrName).toBe("Tasks");
    expect(callArg.typecast).toBe(false);
    expect(callArg.records).toEqual([
      {
        id: "rec1",
        fields: {
          Name: "Alice",
          Score: 99,
          Joined: "2026-05-15",
        },
      },
      {
        id: "rec2",
        fields: {
          Name: "Bob",
          Linked: ["recA", "recB"],
        },
      },
    ]);
  });

  it("formats attachment fields through the shared formatter (Airtable 2.1 Commit 1)", async () => {
    mockBatchUpdate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await updateMultipleRecords({
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
            recordId: "rec1",
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
    const callArg = mockBatchUpdate.mock.calls[0]![0]!;
    expect(callArg.records[0]!.id).toBe("rec1");
    expect(callArg.records[0]!.fields.Photo).toEqual([
      { url: "https://files.example/a.png", filename: "a.png" },
      { url: "https://files.example/b.pdf" },
    ]);
  });

  it("threads typecast: true to the wrapper", async () => {
    mockBatchUpdate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await updateMultipleRecords({
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
          {
            recordId: "rec1",
            fields: { Name: { type: "singleLineText", value: "Alice" } },
          },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(mockBatchUpdate.mock.calls[0]![0]!.typecast).toBe(true);
  });

  it("accepts 10 records (max)", async () => {
    mockBatchUpdate.mockResolvedValueOnce(
      airtableResponse(Array.from({ length: 10 }, (_, i) => `rec${i}`)),
    );
    const records = Array.from({ length: 10 }, (_, i) => ({
      recordId: `rec${i}`,
      fields: { Name: { type: "singleLineText" as const, value: `r${i}` } },
    }));
    const result = await updateMultipleRecords({
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
    expect(result.output.updatedCount).toBe(10);
    expect(mockBatchUpdate.mock.calls[0]![0]!.records).toHaveLength(10);
  });

  it("rejects 11+ records at the schema layer BEFORE the wrapper call (fail loud)", async () => {
    const records = Array.from({ length: 11 }, (_, i) => ({
      recordId: `rec${i}`,
      fields: { Name: { type: "singleLineText" as const, value: `r${i}` } },
    }));
    await expect(
      updateMultipleRecords({
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
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });

  it("rejects an empty records array BEFORE the wrapper call", async () => {
    await expect(
      updateMultipleRecords({
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
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("rejects a missing recordId BEFORE the wrapper call", async () => {
    await expect(
      updateMultipleRecords({
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
            // recordId omitted intentionally
            {
              fields: { Name: { type: "singleLineText", value: "Alice" } },
            } as unknown as never,
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockBatchUpdate).not.toHaveBeenCalled();
  });

  it("propagates Airtable 422 (all-or-nothing — NPD-A1, NOT partial success)", async () => {
    mockBatchUpdate.mockRejectedValueOnce(
      new Error(
        "Airtable PATCH /v0/appBASE/tbl failed: INVALID_VALUE_FOR_COLUMN",
      ),
    );
    await expect(
      updateMultipleRecords({
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
              recordId: "rec1",
              fields: { Name: { type: "singleLineText", value: "Alice" } },
            },
            {
              recordId: "rec2",
              fields: { Name: { type: "singleLineText", value: "Bob" } },
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/INVALID_VALUE_FOR_COLUMN/);
    // Wrapper was called exactly once; no retry, no per-record fallback.
    expect(mockBatchUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does NOT return a partial-success envelope; an error throws fully (no success:false wrapper)", async () => {
    mockBatchUpdate.mockRejectedValueOnce(new Error("boom"));
    let thrown: unknown = null;
    try {
      await updateMultipleRecords({
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
              recordId: "rec1",
              fields: { Name: { type: "singleLineText", value: "Alice" } },
            },
          ],
        },
        triggerEvent: trigger(),
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
  });

  it("threads accountId from the trigger event", async () => {
    mockBatchUpdate.mockResolvedValueOnce(airtableResponse(["rec1"]));
    await updateMultipleRecords({
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
          {
            recordId: "rec1",
            fields: { Name: { type: "singleLineText", value: "Alice" } },
          },
        ],
      },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBe("acct-u-123");
    expect(refreshArg.provider).toBe("airtable");
    expect(refreshArg.providerAccountId).toBe("usrXXX");
  });

  it("returns bounded output (baseId, tableIdOrName, updatedCount, records[]); no raw response spread", async () => {
    mockBatchUpdate.mockResolvedValueOnce({
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
    const result = await updateMultipleRecords({
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
            recordId: "rec1",
            fields: { Name: { type: "singleLineText", value: "Alice" } },
          },
        ],
      },
      triggerEvent: trigger(),
    });
    expect(Object.keys(result.output).sort()).toEqual([
      "baseId",
      "records",
      "tableIdOrName",
      "updatedCount",
    ]);
    expect(result.output.baseId).toBe("appBASE");
    expect(result.output.tableIdOrName).toBe("tbl");
    expect(result.output.updatedCount).toBe(1);
    const records = result.output.records as ReadonlyArray<
      Record<string, unknown>
    >;
    expect(records[0]).toEqual({
      id: "rec1",
      fields: { Name: "Alice", Score: 99 },
      createdTime: "2026-05-15T10:00:00Z",
    });
    expect(records[0]!).not.toHaveProperty("object");
  });

  it("createdTime defaults to null when Airtable omits it (defensive)", async () => {
    mockBatchUpdate.mockResolvedValueOnce({
      records: [{ id: "rec1", fields: {} }], // createdTime omitted
    });
    const result = await updateMultipleRecords({
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
            recordId: "rec1",
            fields: { Name: { type: "singleLineText", value: "x" } },
          },
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
      updateMultipleRecords({
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
              recordId: "rec1",
              fields: {
                R: { type: "rollup", value: 1 } as unknown as never,
              },
            },
          ],
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockBatchUpdate).not.toHaveBeenCalled();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling updateMultipleRecords.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// ---------------------------------------------------------------------------

function record(recordId: string, value: string) {
  return {
    recordId,
    fields: { Name: { type: "singleLineText", value } },
  };
}

describe("UpdateMultipleRecordsConfigSchema", () => {
  it("accepts a minimal valid config with one record", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("accepts the max of 10 records", () => {
    const records = Array.from({ length: 10 }, (_, i) =>
      record(`rec${i}`, `r${i}`),
    );
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty records array (min 1)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 records (fail loud — no Math.min cap)", () => {
    const records = Array.from({ length: 11 }, (_, i) =>
      record(`rec${i}`, `r${i}`),
    );
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records,
      typecast: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const message = result.error.issues.map((i) => i.message).join(" ");
      expect(message).toMatch(/10|cap/i);
    }
  });

  it("rejects missing baseId", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing tableIdOrName", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      records: [record("rec1", "Alice")],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string baseId / tableIdOrName", () => {
    expect(
      UpdateMultipleRecordsConfigSchema.safeParse({
        baseId: "",
        tableIdOrName: "tbl",
        records: [record("rec1", "x")],
        typecast: false,
      }).success,
    ).toBe(false);
    expect(
      UpdateMultipleRecordsConfigSchema.safeParse({
        baseId: "appBASE",
        tableIdOrName: "",
        records: [record("rec1", "x")],
        typecast: false,
      }).success,
    ).toBe(false);
  });

  it("rejects missing recordId on any record entry", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          fields: { Name: { type: "singleLineText", value: "Alice" } },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty-string recordId on any record entry", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "",
          fields: { Name: { type: "singleLineText", value: "Alice" } },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing typecast (Q11 — no silent default)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "Alice")],
      // typecast omitted intentionally
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid field-input shape inside records", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            Bad: { type: "singleLineText" /* value missing */ },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred field types inside records (defense in depth — rollup still deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            R: { type: "rollup", value: 1 },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts attachment field type inside records (promoted in Airtable 2.1 Commit 1)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: {
            Photo: {
              type: "attachment",
              value: [
                { url: "https://files.example/a.png", filename: "a.png" },
              ],
            },
          },
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields (.strict)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      somethingExtra: "boom",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys inside each record entry (.strict)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [
        {
          recordId: "rec1",
          fields: { Name: { type: "singleLineText", value: "x" } },
          createdTime: "2026-01-01T00:00:00Z",
        },
      ],
      typecast: false,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred continueOnError flag (V1 envelope NOT ported)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      continueOnError: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred preserveExisting flag (NPD-A5 — feature deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      preserveExisting: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects deferred appendToExisting flag (NPD-A6 — feature deferred)", () => {
    const result = UpdateMultipleRecordsConfigSchema.safeParse({
      baseId: "appBASE",
      tableIdOrName: "tbl",
      records: [record("rec1", "x")],
      typecast: false,
      appendToExisting: true,
    });
    expect(result.success).toBe(false);
  });
});
