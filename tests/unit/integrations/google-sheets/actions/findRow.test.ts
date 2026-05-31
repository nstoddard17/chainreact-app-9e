/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
}));

import { findRow } from "@/integrations/google-sheets/actions/findRow";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
});

function sheetsTrigger(): TriggerEvent {
  return {
    provider: "google-sheets",
    eventType: "row_changed",
    eventId: "evt-1",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "alice@example.test",
    payload: {},
  };
}

function nonSheetsTrigger(): TriggerEvent {
  return {
    provider: "slack",
    eventType: "message_received",
    eventId: "evt-2",
    occurredAt: "2026-05-08T12:00:00Z",
    providerAccountId: "T123",
    payload: {},
  };
}

const wireRefresh = (response: Record<string, unknown>) => {
  mockValuesGet.mockResolvedValue(response);
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
};

describe("findRow action", () => {
  it("calls valuesGet with sheetName as range and finds first match by header column", async () => {
    wireRefresh({
      values: [
        ["Name", "Email", "Status"],
        ["alice", "alice@e.test", "active"],
        ["bob", "bob@e.test", "inactive"],
        ["carol", "carol@e.test", "active"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        column: "Status",
        value: "active",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockValuesGet).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      range: "Sheet1",
    });
    expect(result.output).toEqual({
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      column: "Status",
      found: true,
      firstMatch: {
        rowNumber: 2, // 1-indexed including header row → first data row is 2
        rowData: { Name: "alice", Email: "alice@e.test", Status: "active" },
      },
      matches: [
        {
          rowNumber: 2,
          rowData: { Name: "alice", Email: "alice@e.test", Status: "active" },
        },
      ],
      count: 1,
    });
  });

  it("returns all matches when returnAll=true", async () => {
    wireRefresh({
      values: [
        ["Name", "Status"],
        ["alice", "active"],
        ["bob", "inactive"],
        ["carol", "active"],
        ["dave", "active"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Status",
        value: "active",
        operator: "equals",
        returnAll: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.count).toBe(3);
    expect(result.output.matches).toEqual([
      { rowNumber: 2, rowData: { Name: "alice", Status: "active" } },
      { rowNumber: 4, rowData: { Name: "carol", Status: "active" } },
      { rowNumber: 5, rowData: { Name: "dave", Status: "active" } },
    ]);
    expect(result.output.firstMatch).toEqual({
      rowNumber: 2,
      rowData: { Name: "alice", Status: "active" },
    });
  });

  it("returnAll=false (default) stops at first match", async () => {
    wireRefresh({
      values: [
        ["Name", "Status"],
        ["alice", "active"],
        ["carol", "active"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Status",
        value: "active",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.count).toBe(1);
    expect(result.output.matches).toHaveLength(1);
    expect(result.output.firstMatch).toEqual({
      rowNumber: 2,
      rowData: { Name: "alice", Status: "active" },
    });
  });

  it("returns empty match set (NOT a failure) when sheet is empty", async () => {
    wireRefresh({});

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Empty",
        column: "Status",
        value: "active",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss",
      sheetName: "Empty",
      column: "Status",
      found: false,
      firstMatch: null,
      matches: [],
      count: 0,
    });
  });

  it("returns empty match set when sheet has only headers (no data rows)", async () => {
    wireRefresh({ values: [["Name", "Email"]] });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Email",
        value: "x@e.test",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.found).toBe(false);
    expect(result.output.matches).toEqual([]);
  });

  it("returns found=false when no rows match the value", async () => {
    wireRefresh({
      values: [
        ["Name", "Status"],
        ["alice", "active"],
        ["bob", "inactive"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Status",
        value: "pending",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.found).toBe(false);
    expect(result.output.matches).toEqual([]);
    expect(result.output.firstMatch).toBeNull();
  });

  it("throws NotFoundError when column is missing from headers", async () => {
    wireRefresh({
      values: [
        ["Name", "Email"],
        ["alice", "x@e.test"],
      ],
    });

    await expect(
      findRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "S",
          column: "Phone",
          value: "555",
          operator: "equals",
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("matches numeric value stored as number against string-passed value (coerced equality)", async () => {
    wireRefresh({
      values: [
        ["ID", "Status"],
        [42, "active"],
        [99, "inactive"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "ID",
        value: 42,
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.found).toBe(true);
    expect(result.output.firstMatch).toEqual(
      expect.objectContaining({ rowNumber: 2 }),
    );
  });

  it("skips empty cells in the search column", async () => {
    wireRefresh({
      values: [
        ["Name", "Status"],
        ["alice", ""],
        ["bob", null],
        ["carol"], // missing column
        ["dave", "active"],
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Status",
        value: "active",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.firstMatch).toEqual(
      expect.objectContaining({ rowNumber: 5 }),
    );
  });

  it("backfills missing trailing cells in matched rowData with null", async () => {
    wireRefresh({
      values: [
        ["Name", "Email", "Phone"],
        ["alice", "alice@e.test"], // no phone
      ],
    });

    const result = await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Email",
        value: "alice@e.test",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.firstMatch).toEqual({
      rowNumber: 2,
      rowData: {
        Name: "alice",
        Email: "alice@e.test",
        Phone: null,
      },
    });
  });

  it("propagates wrapper errors", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockValuesGet.mockRejectedValue(new Error("read-boom"));

    await expect(
      findRow({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "S",
          column: "C",
          value: "v",
          operator: "equals",
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/read-boom/);
  });

  it("passes accountId through when trigger is from google-sheets", async () => {
    wireRefresh({ values: [["Name"], ["alice"]] });

    await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Name",
        value: "alice",
        operator: "equals",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google-sheets",
        providerAccountId: "alice@example.test",
      }),
    );
  });

  it("passes accountId=null when trigger is NOT from google-sheets", async () => {
    wireRefresh({ values: [["Name"], ["x"]] });

    await findRow({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "S",
        column: "Name",
        value: "x",
        operator: "equals",
      },
      triggerEvent: nonSheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledWith(
      expect.objectContaining({ providerAccountId: null }),
    );
  });

  describe("schema validation", () => {
    const baseConfig = {
      spreadsheetId: "ss",
      sheetName: "S",
      column: "Email",
      value: "x@e.test",
      operator: "equals" as const,
    };

    it("accepts boolean value", async () => {
      wireRefresh({ values: [["A"]] });

      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, value: true },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts numeric value", async () => {
      wireRefresh({ values: [["A"]] });

      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, value: 42 },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("rejects null value (find-blank-cells out of scope)", async () => {
      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, value: null },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects operator other than 'equals' (Batch 1: equals only)", async () => {
      for (const op of ["contains", "starts_with", "greater_than", ""]) {
        await expect(
          findRow({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, operator: op },
            triggerEvent: sheetsTrigger(),
          }),
        ).rejects.toThrow();
      }
    });

    it("rejects empty spreadsheetId / sheetName / column", async () => {
      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, spreadsheetId: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/spreadsheetId is required/);

      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, sheetName: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/sheetName is required/);

      await expect(
        findRow({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, column: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/column is required/);
    });

    it("rejects strict-mode config (V1 field names like searchColumn / searchValue / matchType)", async () => {
      for (const extra of [
        { searchColumn: "Email" },
        { searchValue: "x@e.test" },
        { matchType: "exact" },
      ]) {
        await expect(
          findRow({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, ...extra },
            triggerEvent: sheetsTrigger(),
          }),
        ).rejects.toThrow();
      }
    });
  });
});
