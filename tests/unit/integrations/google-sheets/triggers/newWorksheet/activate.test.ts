/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockSpreadsheetsGet = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/spreadsheetsGet", () => ({
  spreadsheetsGet: (...args: unknown[]) => mockSpreadsheetsGet(...args),
}));

jest.mock("@/integrations/google-drive/api/changesGetStartPageToken", () => ({
  changesGetStartPageToken: (...args: unknown[]) =>
    mockChangesGetStartPageToken(...args),
}));

jest.mock("@/integrations/google-drive/api/filesWatch", () => ({
  filesWatch: (...args: unknown[]) => mockFilesWatch(...args),
}));

jest.mock("@/integrations/_shared/google/channelToken", () => ({
  buildChannelToken: (...args: unknown[]) => mockBuildChannelToken(...args),
}));

import { activate } from "@/integrations/google-sheets/triggers/newWorksheet/activate";

interface WorksheetSnapshot {
  names: string[];
  updatedAt: string;
}
function worksheetSnapshotOf(
  result: Record<string, unknown>,
): WorksheetSnapshot {
  return result.worksheetSnapshot as WorksheetSnapshot;
}

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockSpreadsheetsGet.mockReset();
  mockChangesGetStartPageToken.mockReset();
  mockFilesWatch.mockReset();
  mockBuildChannelToken.mockReset();
  mockBuildChannelToken.mockReturnValue("hmac-token");
  mockRefreshAndRetry.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("tok"),
  );
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

const baseNode = {
  id: "node-trigger-nw",
  kind: "trigger" as const,
  provider: "google-sheets",
  type: "new_worksheet",
  config: { spreadsheetId: "ss-1" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  accountId: "acct-user-1",
  connectedByUserId: "user-1",
  provider: "google-sheets",
  providerAccountId: "alice@example.com",
  displayName: "alice@example.com",
  accessTokenEncrypted: "x",
  refreshTokenEncrypted: "y",
  accessTokenExpiresAt: null,
  scopes: [],
  accountMetadata: {},
  disconnectedAt: null,
  createdAt: "",
  updatedAt: "",
};

describe("Sheets new_worksheet activate", () => {
  it("seeds the worksheet-name baseline + creates the Drive files.watch", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      spreadsheetId: "ss-1",
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1", index: 0, sheetType: "GRID" } },
        { properties: { sheetId: 12, title: "Notes", index: 1, sheetType: "GRID" } },
      ],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "page-100",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(mockSpreadsheetsGet).toHaveBeenCalledTimes(1);
    expect(mockSpreadsheetsGet.mock.calls[0]![0].spreadsheetId).toBe("ss-1");
    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      spreadsheetId: "ss-1",
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-nw-[0-9a-f-]+$/);

    // The baseline is the names array (workbook order).
    const snap = worksheetSnapshotOf(result);
    expect(snap.names).toEqual(["Sheet1", "Notes"]);
    expect(typeof snap.updatedAt).toBe("string");
  });

  it("baseline is empty when the spreadsheet returns no sheets (defensive)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({ spreadsheetId: "ss-1" });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(worksheetSnapshotOf(result).names).toEqual([]);
  });

  it("filters out sheets without a title (defensive)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [
        { properties: { sheetId: 0, title: "Sheet1" } },
        { properties: { sheetId: 1 } }, // no title — skipped
        { properties: { sheetId: 2, title: "" } }, // empty title — skipped
        { properties: { sheetId: 3, title: "Tab3" } },
      ],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(worksheetSnapshotOf(result).names).toEqual(["Sheet1", "Tab3"]);
  });

  it("does NOT emit any events at activate time (baseline-only)", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    // ActivationFn returns a config patch — it does NOT return events.
    // This test pins that contract: the patch has worksheetSnapshot
    // but does NOT carry any TriggerEvent fields.
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(result).not.toHaveProperty("events");
    expect(result.worksheetSnapshot).toBeDefined();
  });

  it("rejects missing spreadsheetId at parse time", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: {} },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/spreadsheetId/);
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });

  it("rejects unknown fields at parse time (V1 polling chrome)", async () => {
    await expect(
      activate({
        node: {
          ...baseNode,
          config: { spreadsheetId: "ss-1", hasHeaders: true },
        },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow();
    expect(mockSpreadsheetsGet).not.toHaveBeenCalled();
  });

  it("propagates spreadsheets.get errors (orchestrator wraps as TRIGGER_REGISTRATION_FAILED)", async () => {
    mockSpreadsheetsGet.mockRejectedValueOnce(new Error("API unavailable"));

    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/API unavailable/);
    // files.watch was NOT called — activation aborted before
    // creating the provider-side resource. No orphaned channels.
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });

  it("throws when getStartPageToken returns no token", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({ startPageToken: "" });
    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/no startPageToken/);
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });

  it("passes the channel HMAC token on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    mockSpreadsheetsGet.mockResolvedValueOnce({
      sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }],
    });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
    mockSpreadsheetsGet.mockResolvedValueOnce({ sheets: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-test",
    });
    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-sheets",
    );
  });
});
