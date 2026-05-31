/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/airtable/api/records", () => ({
  recordsCreate: (...args: unknown[]) => mockCreate(...args),
  recordsGet: jest.fn(),
  recordsList: jest.fn(),
  recordsUpdate: jest.fn(),
  recordsDelete: jest.fn(),
}));

import { createRecord } from "@/integrations/airtable/actions/createRecord";
import { UnsupportedFieldTypeError } from "@/integrations/_shared/airtable/fields";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
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
    occurredAt: "2026-05-09T12:00:00Z",
    providerAccountId: "usrXXX",
    payload: {},
  };
}

describe("create_record action", () => {
  it("coerces typed fields, calls recordsCreate, returns canonical output", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "recNEW",
      fields: { Name: "Alice", Score: 99 },
      createdTime: "2026-05-09T10:00:00Z",
    });

    const result = await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tblTASKS",
        typecast: false,
        fields: {
          Name: { type: "singleLineText", value: "Alice" },
          Score: { type: "number", value: 99 },
          Joined: { type: "date", value: "2026-05-09T00:00:00Z" },
          Linked: {
            type: "multipleRecordLinks",
            value: ["recA::Display"],
          },
        },
      },
      triggerEvent: trigger(),
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.baseId).toBe("appBASE");
    expect(callArg.tableIdOrName).toBe("tblTASKS");
    expect(callArg.typecast).toBe(false);
    // Coerced wire-format values:
    expect(callArg.fields).toEqual({
      Name: "Alice",
      Score: 99,
      Joined: "2026-05-09",
      Linked: ["recA"],
    });
    expect(result.output.id).toBe("recNEW");
    expect(result.output.fields).toEqual({ Name: "Alice", Score: 99 });
    expect(result.output.createdTime).toBe("2026-05-09T10:00:00Z");
  });

  it("threads providerAccountId from the trigger event + V2 ownership accountId from input", async () => {
    mockCreate.mockResolvedValueOnce({ id: "rec", fields: {} });
    await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        fields: {},
      },
      triggerEvent: trigger(),
    });
    const refreshArg = mockRefreshAndRetry.mock.calls[0]![0]!;
    expect(refreshArg.accountId).toBe("acct-u");
    expect(refreshArg.providerAccountId).toBe("usrXXX");
  });

  it("threads typecast: true to the wrapper", async () => {
    mockCreate.mockResolvedValueOnce({ id: "rec", fields: {} });
    await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: true,
        fields: { Name: { type: "singleLineText", value: "x" } },
      },
      triggerEvent: trigger(),
    });
    expect(mockCreate.mock.calls[0]![0]!.typecast).toBe(true);
  });

  it("throws on missing required fields (Q11 — typecast required)", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          // typecast omitted intentionally — schema must reject.
          fields: {},
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects strict-mode unknown keys", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {},
          unknownKey: "boom",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("accepts attachment fields with typed [{url, filename?}] shape (Airtable 2.1 Commit 1)", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "recATT",
      fields: {
        Photo: [
          {
            id: "att1",
            url: "https://files.example/photo.jpg",
            filename: "photo.jpg",
            size: 1234,
            type: "image/jpeg",
          },
        ],
      },
    });
    await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        fields: {
          Photo: {
            type: "attachment",
            value: [
              { url: "https://files.example/photo.jpg", filename: "photo.jpg" },
            ],
          },
        },
      },
      triggerEvent: trigger(),
    });
    // Wire payload uses Airtable attachment format: [{url, filename?}].
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo).toEqual([
      { url: "https://files.example/photo.jpg", filename: "photo.jpg" },
    ]);
  });

  it("attachment field: filename optional — undefined filename is OMITTED from wire payload", async () => {
    mockCreate.mockResolvedValueOnce({ id: "rec", fields: {} });
    await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        fields: {
          Photo: {
            type: "attachment",
            value: [{ url: "https://files.example/photo.jpg" }],
          },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo).toEqual([
      { url: "https://files.example/photo.jpg" },
    ]);
    expect("filename" in callArg.fields.Photo[0]).toBe(false);
  });

  it("attachment field: empty array is forwarded (Airtable clears the field)", async () => {
    mockCreate.mockResolvedValueOnce({ id: "rec", fields: {} });
    await createRecord({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        baseId: "appBASE",
        tableIdOrName: "tbl",
        typecast: false,
        fields: {
          Photo: { type: "attachment", value: [] },
        },
      },
      triggerEvent: trigger(),
    });
    const callArg = mockCreate.mock.calls[0]![0]!;
    expect(callArg.fields.Photo).toEqual([]);
  });

  it("attachment field: invalid URL rejected at schema (Zod)", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
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
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("attachment field: empty filename rejected at schema (Zod)", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {
            Photo: {
              type: "attachment",
              value: [{ url: "https://x.example/a.png", filename: "" }],
            },
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("attachment field: unknown attachment object fields rejected at schema (Zod .strict)", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {
            Photo: {
              type: "attachment",
              value: [
                {
                  url: "https://x.example/a.png",
                  filename: "a.png",
                  someExtra: "boom",
                } as unknown as { url: string },
              ],
            },
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("attachment field: non-array value rejected at schema (Zod)", async () => {
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {
            Photo: {
              type: "attachment",
              value: { url: "https://x.example/a.png" } as unknown as never,
            },
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("rejects deferred field types at the schema layer (defense in depth #1)", async () => {
    // The Zod discriminatedUnion rejects 'rollup' (still deferred) before
    // the handler ever calls formatFields. The actual
    // UnsupportedFieldTypeError throw path is tested separately against
    // formatFieldValue directly. (Was 'attachment' pre-Airtable-2.1 Commit
    // 1; attachment is now SUPPORTED — see the attachment-accept tests
    // above.)
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {
            R: { type: "rollup", value: 1 } as unknown as never,
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("UnsupportedFieldTypeError is thrown by the formatter when the schema is bypassed (defense in depth #2)", () => {
    // Sanity check that formatFieldValue itself fails loud — the
    // schema layer is one defense; the formatter is the second.
    // Use 'rollup' (still deferred) since 'attachment' is now supported.
    const { formatFieldValue } = jest.requireActual(
      "@/integrations/_shared/airtable/fields",
    );
    expect(() => formatFieldValue("rollup", null)).toThrow(
      UnsupportedFieldTypeError,
    );
  });

  it("does not call the API when fields contain a deferred type — fails BEFORE network", async () => {
    // Same case as defense-in-depth #1 but explicitly asserts no
    // network call happened.
    await expect(
      createRecord({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          baseId: "appBASE",
          tableIdOrName: "tbl",
          typecast: false,
          fields: {
            R: { type: "rollup", value: 1 } as unknown as never,
          },
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
    expect(mockRefreshAndRetry).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
