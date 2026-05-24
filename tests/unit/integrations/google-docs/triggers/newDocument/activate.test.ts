/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — new_document activate tests.
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

import { activate } from "@/integrations/google-docs/triggers/newDocument/activate";

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
  provider: "google-docs",
  type: "new_document",
  config: {},
  position: { x: 0, y: 0 },
};

const baseIntegration = {
  id: "int-1",
  userId: "user-1",
  provider: "google-docs",
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

function defaultMocks() {
  mockChangesGetStartPageToken.mockResolvedValueOnce({
    startPageToken: "page-100",
  });
  mockFilesWatch.mockResolvedValueOnce({
    id: "channel-from-google",
    resourceId: "res-id",
    expiration: String(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
}

describe("Google Docs new_document activate", () => {
  it("captures startPageToken then registers a Drive files.watch", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockChangesGetStartPageToken).toHaveBeenCalledTimes(1);
    expect(mockFilesWatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      fileId: "root",
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-[0-9a-f-]+$/);
    expect(typeof result.expiresAt).toBe("string");
  });

  it("uses 'root' as the watch target when folderId is unset", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
    expect(result.fileId).toBe("root");
    expect(result.folderId).toBeUndefined();
  });

  it("uses the configured folderId as the watch target when set + persists folderId in config", async () => {
    defaultMocks();
    const result = await activate({
      node: { ...baseNode, config: { folderId: "fld-A" } },
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("fld-A");
    expect(result.fileId).toBe("fld-A");
    expect(result.folderId).toBe("fld-A");
  });

  it("provider passed to refreshAndRetry is 'google-docs' (not 'google-drive')", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockRefreshAndRetry.mock.calls.every((c) => c[0].provider === "google-docs")).toBe(
      true,
    );
  });

  it("passes HMAC channelToken on the watch request", async () => {
    mockBuildChannelToken.mockReset();
    mockBuildChannelToken.mockReturnValueOnce("the-real-hmac");
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].channelToken).toBe("the-real-hmac");
  });

  it("uses NEXT_PUBLIC_APP_URL + /api/webhooks/google-docs as the webhook address", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].webhookAddress).toBe(
      "https://app.example.test/api/webhooks/google-docs",
    );
  });

  it("throws when getStartPageToken returns no token (V1 first-poll-miss guard)", async () => {
    mockChangesGetStartPageToken.mockResolvedValueOnce({ startPageToken: "" });
    await expect(
      activate({
        node: baseNode,
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow(/no startPageToken/);
  });

  it("rejects unknown config fields (strict schema)", async () => {
    defaultMocks();
    await expect(
      activate({
        node: { ...baseNode, config: { somethingBogus: "x" } },
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow();
    // Strict schema means the V1 polling chrome can't accidentally
    // re-enter via the meta field-set.
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });
});
