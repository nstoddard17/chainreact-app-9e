/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesAppend = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesAppend", () => ({
  valuesAppend: (...args: unknown[]) => mockValuesAppend(...args),
}));

import { appendRow } from "@/integrations/google-sheets/actions/appendRow";
import { AppendRowConfigSchema } from "@/integrations/google-sheets/actions/appendRow.schema";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesAppend.mockReset();
});

function trigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

describe("appendRow action", () => {
  it("wraps the row's values in [[...]] and forwards Q11 valueInputOption verbatim", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesAppend.mockResolvedValue({
      spreadsheetId: "ss-1",
      tableRange: "Sheet1!A1:C5",
      updates: {
        spreadsheetId: "ss-1",
        updatedRange: "Sheet1!A6:C6",
        updatedRows: 1,
        updatedColumns: 3,
        updatedCells: 3,
      },
    });

    const result = await appendRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        range: "Sheet1!A:C",
        values: ["alice", "alice@e.test", 42],
        valueInputOption: "USER_ENTERED",
      },
      triggerEvent: trigger(),
    });

    expect(mockValuesAppend).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "t",
        spreadsheetId: "ss-1",
        range: "Sheet1!A:C",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        values: [["alice", "alice@e.test", 42]],
      }),
    );
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      tableRange: "Sheet1!A1:C5",
      updatedRange: "Sheet1!A6:C6",
      updatedRows: 1,
      updatedColumns: 3,
      updatedCells: 3,
    });
  });

  it("forwards RAW valueInputOption when chosen", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesAppend.mockResolvedValue({ updates: {} });

    await appendRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        range: "Sheet1!A:A",
        values: ["literal-string"],
        valueInputOption: "RAW",
      },
      triggerEvent: trigger(),
    });

    expect(mockValuesAppend).toHaveBeenCalledWith(
      expect.objectContaining({ valueInputOption: "RAW" }),
    );
  });

  it("uses insertDataOption default 'INSERT_ROWS' when not specified", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesAppend.mockResolvedValue({ updates: {} });

    await appendRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        range: "Sheet1",
        values: ["x"],
        valueInputOption: "RAW",
      },
      triggerEvent: trigger(),
    });

    expect(mockValuesAppend).toHaveBeenCalledWith(
      expect.objectContaining({ insertDataOption: "INSERT_ROWS" }),
    );
  });

  it("sends the saved range and never the builder's tab — execution is unchanged by SHEETS-GUIDED-CONFIG-1", async () => {
    // `sheetName` exists so the BUILDER can offer a tab picker and derive a
    // range. The API contract is untouched: Sheets is addressed by `range`
    // alone. If the tab ever leaked into the request, a guided-configured
    // node would take a different execution path than a legacy one.
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesAppend.mockResolvedValue({
      spreadsheetId: "s",
      updates: {
        updatedRange: "'Email log'!A5:C5",
        updatedRows: 1,
        updatedColumns: 3,
        updatedCells: 3,
      },
    });

    await appendRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "s",
        sheetName: "Email log",
        range: "'Email log'!A:C",
        values: ["a", "b", "c"],
        valueInputOption: "USER_ENTERED",
      },
      triggerEvent: trigger(),
    });

    const sent = mockValuesAppend.mock.calls[0]![0] as Record<string, unknown>;
    expect(sent.range).toBe("'Email log'!A:C");
    expect(sent).not.toHaveProperty("sheetName");
  });

  it("rejects missing valueInputOption (Q11 — no hidden default)", async () => {
    await expect(
      appendRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: { spreadsheetId: "s", range: "S", values: ["x"] }, // missing valueInputOption
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow();
  });

  it("rejects empty values array", async () => {
    await expect(
      appendRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S",
          values: [],
          valueInputOption: "RAW",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/non-empty/);
  });

  it("propagates non-401 errors from the wrapper verbatim", async () => {
    mockRefreshAndRetry.mockRejectedValue(new Error("boom"));

    await expect(
      appendRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "s",
          range: "S",
          values: ["x"],
          valueInputOption: "RAW",
        },
        triggerEvent: trigger(),
      }),
    ).rejects.toThrow(/boom/);
  });
});

// ---------------------------------------------------------------------------
// Schema contract tests — merged from the former sibling appendRow.schema.test.ts
// (PROVIDER-CONTRACT-CONSOLIDATION-1A; same production schema import, all
// assertions preserved verbatim).
// `google-sheets:append_row` config-schema compatibility
// (SHEETS-GUIDED-CONFIG-1).
// The guided builder needed a destination TAB to hang the column
// resolver on, so the schema gained `sheetName`. This suite exists for
// one reason: to prove that addition cannot break a workflow that is
// already live.
// The business rule under protection — a configuration saved before
// this slice must keep validating and running, unchanged, with no
// migration and no rewrite-on-open. If `sheetName` were required, or
// carried a default, every existing Append Row node would either fail
// validation or silently acquire a value its author never chose.
// ---------------------------------------------------------------------------

const LEGACY_CONFIG = {
  spreadsheetId: "sheet-abc",
  range: "Sheet1!A:Z",
  values: ["2026-07-31", "dana@example.test", "Invoice 4471"],
  valueInputOption: "USER_ENTERED",
} as const;

describe("AppendRowConfigSchema — legacy configurations keep working", () => {
  it("accepts a configuration saved before the tab picker existed", () => {
    const parsed = AppendRowConfigSchema.parse({ ...LEGACY_CONFIG });
    expect(parsed.spreadsheetId).toBe("sheet-abc");
    expect(parsed.range).toBe("Sheet1!A:Z");
    // The tab is genuinely absent — not defaulted to something invented.
    expect(parsed.sheetName).toBeUndefined();
    // The default that already existed is unchanged.
    expect(parsed.insertDataOption).toBe("INSERT_ROWS");
  });

  it("never invents a tab for a legacy config (no default that would change meaning)", () => {
    const parsed = AppendRowConfigSchema.parse({ ...LEGACY_CONFIG });
    expect(Object.prototype.hasOwnProperty.call(parsed, "sheetName")).toBe(
      false,
    );
  });

  it("accepts a configuration written by the guided builder", () => {
    const parsed = AppendRowConfigSchema.parse({
      ...LEGACY_CONFIG,
      sheetName: "Email log",
      range: "'Email log'!A:F",
    });
    expect(parsed.sheetName).toBe("Email log");
    expect(parsed.range).toBe("'Email log'!A:F");
  });

  it("keeps range required — it is still the only value sent to the API", () => {
    const { range: _dropped, ...withoutRange } = LEGACY_CONFIG;
    expect(() =>
      AppendRowConfigSchema.parse({ ...withoutRange, sheetName: "Email log" }),
    ).toThrow();
  });

  it("rejects a blank tab rather than storing an empty destination", () => {
    expect(() =>
      AppendRowConfigSchema.parse({ ...LEGACY_CONFIG, sheetName: "" }),
    ).toThrow();
  });

  it("still rejects unknown keys — the strict contract did not loosen", () => {
    expect(() =>
      AppendRowConfigSchema.parse({
        ...LEGACY_CONFIG,
        // A plausible-looking key the guided UI might have been tempted to
        // persist. Config is not a scratchpad for builder state.
        columnMapping: { Subject: "{{trigger.subject}}" },
      }),
    ).toThrow();
  });

  it("still requires an explicit valueInputOption (Q11 unchanged)", () => {
    const { valueInputOption: _dropped, ...withoutChoice } = LEGACY_CONFIG;
    expect(() => AppendRowConfigSchema.parse({ ...withoutChoice })).toThrow();
  });

  it("still rejects an empty values array", () => {
    expect(() =>
      AppendRowConfigSchema.parse({ ...LEGACY_CONFIG, values: [] }),
    ).toThrow(/non-empty/);
  });
});
