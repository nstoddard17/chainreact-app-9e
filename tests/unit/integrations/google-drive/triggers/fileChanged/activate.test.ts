/**
 * @jest-environment node
 */
const mockRefreshAndRetry = jest.fn();
const mockChangesGetStartPageToken = jest.fn();
const mockFilesWatch = jest.fn();
const mockBuildChannelToken = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => ({
  refreshAndRetry: (...args: unknown[]) => mockRefreshAndRetry(...args),
  Unauthorized401Error: class extends Error {},
  IntegrationActionRequiredError: class extends Error {},
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

import { activate } from "@/integrations/google-drive/triggers/fileChanged/activate";

beforeEach(() => {
  mockRefreshAndRetry.mockReset();
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
  provider: "google-drive",
  type: "file_changed",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "google-drive",
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

describe("Drive file_changed activate", () => {
  it("captures startPageToken then registers a files.watch", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "page-100",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "channel-from-google",
      resourceId: "res-id",
      expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      fileId: "root",
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(
      /^chainreact-node-trigger-[0-9a-f-]+$/,
    );
    expect(typeof result.expiresAt).toBe("string");
  });

  it("uses the configured fileId when set (not 'root')", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({
      node: { ...baseNode, config: { fileId: "fld-A" } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.fileId).toBe("fld-A");
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("fld-A");
  });

  it("stores the literal 'root' string when config.fileId is unset", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: String(Date.now() + 1000),
    });

    const result = await activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" });

    expect(result.fileId).toBe("root");
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
  });

  it("treats whitespace-only fileId as 'root' (no leaked surprise watch target)", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "p",
    });
    mockFilesWatch.mockResolvedValueOnce({
      id: "c",
      resourceId: "r",
      expiration: "1",
    });

    const result = await activate({
      node: { ...baseNode, config: { fileId: "   " } },
      integration: baseIntegration,
      workflowId: "wf-test",
    });

    expect(result.fileId).toBe("root");
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
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

  it("throws when getStartPageToken returns no token", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({
      startPageToken: "",
    });
    await expect(
      activate({ node: baseNode, integration: baseIntegration, workflowId: "wf-test" }),
    ).rejects.toThrow(/no startPageToken/);
  });

  it("uses NEXT_PUBLIC_APP_URL for the webhook address", async () => {
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
      "https://app.example.test/api/webhooks/google-drive",
    );
  });
});
