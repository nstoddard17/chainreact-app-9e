/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockValuesGet = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
}));

jest.mock("@/integrations/google-sheets/api/valuesGet", () => ({
  valuesGet: (...args: unknown[]) => mockValuesGet(...args),
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

import { activate } from "@/integrations/google-sheets/triggers/rowChanged/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
  mockValuesGet.mockReset();
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
  id: "node-trigger",
  kind: "trigger" as const,
  provider: "google-sheets",
  type: "row_changed",
  config: { spreadsheetId: "ss-1", sheetName: "Sheet1" },
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
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

describe("Sheets row_changed activate", () => {
  it("snapshots row count + Drive pageToken, then registers the file-watch", async () => {
    mockValuesGet.mockResolvedValueOnce({
      values: [
        ["a", "b", "c"],
        ["d", "e", "f"],
        ["g", "h", "i"],
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

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    // values.get called against the configured sheet's A:Z range.
    expect(mockValuesGet).toHaveBeenCalledTimes(1);
    expect(mockValuesGet.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        spreadsheetId: "ss-1",
        range: "Sheet1!A:Z",
      }),
    );
    // Drive baseline cursor captured exactly once.
    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    // files.watch called against the spreadsheet's fileId.
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("ss-1");

    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      spreadsheetId: "ss-1",
      sheetName: "Sheet1",
      headerRow: false,
      resourceId: "res-id",
      pageToken: "page-100",
      lastRowCount: 3,
    });
    expect(result.channelId).toMatch(
      /^chainreact-node-trigger-[0-9a-f-]+$/,
    );
    expect(typeof result.expiresAt).toBe("string");
  });

  it("captures lastRowCount = 0 for an empty sheet (no values returned)", async () => {
    mockValuesGet.mockResolvedValueOnce({}); // no `values` field
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(result.lastRowCount).toBe(0);
  });

  it("forwards headerRow=true into the persisted config", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [["h1", "h2"], ["a", "b"]] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: { ...baseNode, config: { ...baseNode.config, headerRow: true } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.headerRow).toBe(true);
    expect(result.lastRowCount).toBe(2);
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-sheets",
    );
  });

  it("throws when spreadsheetId is missing (Slice 5 requires it)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { sheetName: "Sheet1" } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/spreadsheetId/);
  });

  it("throws when sheetName is missing (Slice 5 Batch 1 narrowing)", async () => {
    await expect(
      activate({
        node: { ...baseNode, config: { spreadsheetId: "ss-1" } },
        integration: baseIntegration,
        workflowId: "wf-test",
      }),
    ).rejects.toThrow(/sheetName/);
  });

  it("throws when getStartPageToken returns no token", async () => {
    mockValuesGet.mockResolvedValueOnce({ values: [] });
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "",
    });
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/no startPageToken/);
  });
});
