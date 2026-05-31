/**
 * @jest-environment node
 */
import type { TriggerEvent } from "@/contracts/triggerEvent";

const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockSpreadsheetsBatchUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsBatchUpdate", () => ({
  spreadsheetsBatchUpdate: (...args: unknown[]) => mockSpreadsheetsBatchUpdate(...args),
}));

import { formatRange } from "@/integrations/google-sheets/actions/formatRange";
import { NotFoundError } from "@/integrations/google-sheets/api/errors";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockSpreadsheetsBatchUpdate.mockReset();
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

const wireRefresh = (
  metadata: Record<string, unknown>,
  batchResponse: Record<string, unknown> = {},
) => {
  mockSpreadsheetsGet.mockResolvedValue(metadata);
  mockSpreadsheetsBatchUpdate.mockResolvedValue(batchResponse);
  mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
};

const baseSheetMetadata = {
  sheets: [
    { properties: { sheetId: 0, title: "Sheet1" } },
    { properties: { sheetId: 42, title: "Other" } },
  ],
};

describe("formatRange action", () => {
  it("resolves sheetName via spreadsheets.get with the narrow fields mask", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Sheet1",
        range: "A1",
        bold: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsGet).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      fields: "sheets(properties(sheetId,title))",
    });
  });

  it("builds a repeatCell request with GridRange + sheetId + correct fields mask (bold only)", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-1",
        sheetName: "Other",
        range: "A1:B5",
        bold: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledWith({
      accessToken: "t",
      spreadsheetId: "ss-1",
      requests: [
        {
          repeatCell: {
            range: {
              sheetId: 42,
              startRowIndex: 0,
              endRowIndex: 5,
              startColumnIndex: 0,
              endColumnIndex: 2,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
              },
            },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
      ],
    });
  });

  it("converts hex backgroundColor to Google RGB (0..1) under userEnteredFormat.backgroundColor", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        backgroundColor: "#FF0000",
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat.backgroundColor).toEqual({
      red: 1,
      green: 0,
      blue: 0,
    });
    expect(request.fields).toBe("userEnteredFormat.backgroundColor");
  });

  it("accepts hex without leading # (RRGGBB)", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        backgroundColor: "00FF00",
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat.backgroundColor).toEqual({
      red: 0,
      green: 1,
      blue: 0,
    });
  });

  it("places textColor under textFormat.foregroundColor (NOT under backgroundColor)", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        textColor: "#0000FF",
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat).toEqual({
      textFormat: { foregroundColor: { red: 0, green: 0, blue: 1 } },
    });
    expect(request.fields).toBe(
      "userEnteredFormat.textFormat.foregroundColor",
    );
  });

  it("combines bold + italic + textColor under a single textFormat object", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        bold: true,
        italic: false,
        textColor: "#abcdef",
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat).toEqual({
      textFormat: {
        bold: true,
        italic: false,
        foregroundColor: expect.objectContaining({
          red: expect.any(Number),
          green: expect.any(Number),
          blue: expect.any(Number),
        }),
      },
    });
    // Fields mask includes one entry per set option.
    const fields = request.fields.split(",").sort();
    expect(fields).toEqual([
      "userEnteredFormat.textFormat.bold",
      "userEnteredFormat.textFormat.foregroundColor",
      "userEnteredFormat.textFormat.italic",
    ]);
  });

  it("forwards horizontalAlignment under userEnteredFormat", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        horizontalAlignment: "CENTER",
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat).toEqual({
      horizontalAlignment: "CENTER",
    });
    expect(request.fields).toBe("userEnteredFormat.horizontalAlignment");
  });

  it("forwards numberFormat with type only (no pattern)", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        numberFormat: { type: "CURRENCY" },
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat).toEqual({
      numberFormat: { type: "CURRENCY" },
    });
    expect(request.fields).toBe("userEnteredFormat.numberFormat");
  });

  it("forwards numberFormat with type + pattern", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        numberFormat: { type: "NUMBER", pattern: "#,##0.00" },
      },
      triggerEvent: sheetsTrigger(),
    });

    const request = mockSpreadsheetsBatchUpdate.mock.calls[0]![0]
      .requests[0].repeatCell;
    expect(request.cell.userEnteredFormat.numberFormat).toEqual({
      type: "NUMBER",
      pattern: "#,##0.00",
    });
  });

  it("emits exactly ONE repeatCell request even when multiple options are set", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1:C3",
        backgroundColor: "#FFFF00",
        textColor: "#000000",
        bold: true,
        italic: true,
        horizontalAlignment: "RIGHT",
        numberFormat: { type: "PERCENT" },
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalledTimes(1);
    expect(
      mockSpreadsheetsBatchUpdate.mock.calls[0]![0].requests,
    ).toHaveLength(1);
  });

  it("output includes spreadsheetId / sheetName / sheetId / formattedRange / appliedFormat", async () => {
    wireRefresh(baseSheetMetadata);

    const result = await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss-out",
        sheetName: "Sheet1",
        range: "A1:B5",
        bold: true,
        backgroundColor: "#FF8800",
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output).toEqual({
      spreadsheetId: "ss-out",
      sheetName: "Sheet1",
      sheetId: 0,
      formattedRange: "Sheet1!A1:B5",
      appliedFormat: {
        bold: true,
        backgroundColor: "#FF8800",
      },
    });
  });

  it("appliedFormat omits options that were not set", async () => {
    wireRefresh(baseSheetMetadata);

    const result = await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        italic: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.appliedFormat).toEqual({ italic: true });
  });

  it("throws NotFoundError when sheetName is not in the spreadsheet (no batchUpdate call)", async () => {
    wireRefresh(baseSheetMetadata);

    await expect(
      formatRange({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "Missing",
          range: "A1",
          bold: true,
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(mockSpreadsheetsBatchUpdate).not.toHaveBeenCalled();
  });

  it("treats sheetId=0 as a valid id (numeric falsy guard)", async () => {
    wireRefresh({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });

    const result = await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        bold: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(result.output.sheetId).toBe(0);
    expect(mockSpreadsheetsBatchUpdate).toHaveBeenCalled();
  });

  it("propagates wrapper errors from spreadsheets.get", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockRejectedValue(new Error("metadata-boom"));

    await expect(
      formatRange({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "Sheet1",
          range: "A1",
          bold: true,
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/metadata-boom/);
  });

  it("propagates wrapper errors from spreadsheets.batchUpdate", async () => {
    mockRefreshAndRetry.mockImplementation(async ({ apiCall }) => apiCall("t"));
    mockSpreadsheetsGet.mockResolvedValue(baseSheetMetadata);
    mockSpreadsheetsBatchUpdate.mockRejectedValue(new Error("batch-boom"));

    await expect(
      formatRange({
        workflowId: "wf",
        userId: "u",
        accountId: "acct-u",
        runId: "r",
        nodeId: "n",
        config: {
          spreadsheetId: "ss",
          sheetName: "Sheet1",
          range: "A1",
          bold: true,
        },
        triggerEvent: sheetsTrigger(),
      }),
    ).rejects.toThrow(/batch-boom/);
  });

  it("passes accountId through when trigger is from google-sheets (both calls)", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        bold: true,
      },
      triggerEvent: sheetsTrigger(),
    });

    expect(mockRefreshAndRetry).toHaveBeenCalledTimes(2);
    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(
        expect.objectContaining({
          provider: "google-sheets",
          providerAccountId: "alice@example.test",
        }),
      );
    }
  });

  it("passes accountId=null when trigger is NOT from google-sheets", async () => {
    wireRefresh(baseSheetMetadata);

    await formatRange({
      workflowId: "wf",
      userId: "u",
      accountId: "acct-u",
      runId: "r",
      nodeId: "n",
      config: {
        spreadsheetId: "ss",
        sheetName: "Sheet1",
        range: "A1",
        bold: true,
      },
      triggerEvent: nonSheetsTrigger(),
    });

    for (const call of mockRefreshAndRetry.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ providerAccountId: null }));
    }
  });

  describe("schema validation", () => {
    const baseConfig = {
      spreadsheetId: "ss",
      sheetName: "Sheet1",
      range: "A1",
      bold: true,
    };

    it("accepts valid backgroundColor (with #)", async () => {
      wireRefresh(baseSheetMetadata);
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, backgroundColor: "#abcdef" },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts valid backgroundColor (without #)", async () => {
      wireRefresh(baseSheetMetadata);
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, backgroundColor: "abcdef" },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts valid textColor", async () => {
      wireRefresh(baseSheetMetadata);
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, textColor: "#000000" },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts bold + italic booleans", async () => {
      wireRefresh(baseSheetMetadata);
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, bold: false, italic: true },
          triggerEvent: sheetsTrigger(),
        }),
      ).resolves.toBeDefined();
    });

    it("accepts valid horizontalAlignment values", async () => {
      wireRefresh(baseSheetMetadata);
      for (const alignment of ["LEFT", "CENTER", "RIGHT"] as const) {
        await expect(
          formatRange({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, horizontalAlignment: alignment },
            triggerEvent: sheetsTrigger(),
          }),
        ).resolves.toBeDefined();
      }
    });

    it("accepts valid numberFormat types", async () => {
      wireRefresh(baseSheetMetadata);
      const types = [
        "TEXT",
        "NUMBER",
        "PERCENT",
        "CURRENCY",
        "DATE",
        "TIME",
        "DATE_TIME",
        "SCIENTIFIC",
      ] as const;
      for (const type of types) {
        await expect(
          formatRange({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, numberFormat: { type } },
            triggerEvent: sheetsTrigger(),
          }),
        ).resolves.toBeDefined();
      }
    });

    it("accepts valid range — single cell + range + multi-letter columns", async () => {
      wireRefresh(baseSheetMetadata);
      for (const range of ["A1", "A1:B5", "AA10:AB12", "Z99"]) {
        await expect(
          formatRange({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, range },
            triggerEvent: sheetsTrigger(),
          }),
        ).resolves.toBeDefined();
      }
    });

    it("rejects no-options config (at least one format option required)", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            spreadsheetId: "ss",
            sheetName: "Sheet1",
            range: "A1",
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/at least one formatting option/);
    });

    it("rejects missing spreadsheetId / sheetName / range", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { sheetName: "Sheet1", range: "A1", bold: true },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
      await expect(
        formatRange({
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
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, range: "" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/range is required/);
    });

    it("rejects range with sheet prefix (Sheet1!A1)", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, range: "Sheet1!A1" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow(/bare A1 cell or range/);
    });

    it("rejects invalid hex colors", async () => {
      for (const bad of ["red", "#GGGGGG", "123", "#1234567", ""]) {
        await expect(
          formatRange({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseConfig, backgroundColor: bad },
            triggerEvent: sheetsTrigger(),
          }),
        ).rejects.toThrow();
      }
    });

    it("rejects invalid horizontalAlignment", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, horizontalAlignment: "JUSTIFY" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects invalid numberFormat type", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            numberFormat: { type: "FRACTION" },
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects stringly-typed bold (V1 'true' / 'false' rot)", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, bold: "true" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects V1 chrome fields (rangeSelection / fontSize / verticalAlignment / wrapStrategy / strikethrough / underline)", async () => {
      const baseWithFormat = { ...baseConfig };
      for (const extra of [
        { rangeSelection: "custom" },
        { fontSize: 12 },
        { verticalAlignment: "TOP" },
        { wrapStrategy: "WRAP" },
        { textWrapping: "WRAP" },
        { strikethrough: true },
        { underline: true },
      ]) {
        await expect(
          formatRange({
            workflowId: "wf",
            userId: "u",
            accountId: "acct-u",
            runId: "r",
            nodeId: "n",
            config: { ...baseWithFormat, ...extra },
            triggerEvent: sheetsTrigger(),
          }),
        ).rejects.toThrow();
      }
    });

    it("rejects deferred surface (borders / conditionalFormatting / dataValidation)", async () => {
      for (const extra of [
        { borders: { top: { style: "SOLID" } } },
        { conditionalFormatting: { rule: {} } },
        { dataValidation: { condition: {} } },
      ]) {
        await expect(
          formatRange({
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

    it("rejects raw escape-hatch fields (requests / cellFormat / userEnteredFormat)", async () => {
      for (const extra of [
        { requests: [{ repeatCell: {} }] },
        { cellFormat: { bold: true } },
        { userEnteredFormat: { bold: true } },
      ]) {
        await expect(
          formatRange({
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

    it("rejects unknown fields generally", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: { ...baseConfig, unknownThing: "x" },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });

    it("rejects unknown fields inside numberFormat", async () => {
      await expect(
        formatRange({
          workflowId: "wf",
          userId: "u",
          accountId: "acct-u",
          runId: "r",
          nodeId: "n",
          config: {
            ...baseConfig,
            numberFormat: { type: "NUMBER", scale: 100 },
          },
          triggerEvent: sheetsTrigger(),
        }),
      ).rejects.toThrow();
    });
  });
});
