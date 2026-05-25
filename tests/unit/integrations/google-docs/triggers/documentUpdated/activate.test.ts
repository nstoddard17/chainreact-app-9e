/**
 * @jest-environment node
 *
 * Slice 3.GDOCS-5 — document_updated activate tests.
 *
 * Pins the documentId-takes-precedence-over-folderId watch-target
 * resolution.
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

import { activate } from "@/integrations/google-docs/triggers/documentUpdated/activate";

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
  type: "document_updated",
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

describe("Google Docs document_updated activate", () => {
  it("watches 'root' when neither documentId nor folderId is set", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("root");
    expect(result.fileId).toBe("root");
    expect(result.documentId).toBeUndefined();
    expect(result.folderId).toBeUndefined();
  });

  it("watches the folder when folderId set + documentId unset", async () => {
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

  it("watches the document when documentId set — takes precedence over folderId", async () => {
    defaultMocks();
    const result = await activate({
      node: {
        ...baseNode,
        config: { documentId: "doc-X", folderId: "fld-A" },
      },
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(mockFilesWatch.mock.calls[0]![0].fileId).toBe("doc-X");
    expect(result.fileId).toBe("doc-X");
    expect(result.documentId).toBe("doc-X");
    // folderId still persisted for normalize's defense-in-depth filter.
    expect(result.folderId).toBe("fld-A");
  });

  it("returns the subscription-watch config patch with channel + token + expiry", async () => {
    defaultMocks();
    const result = await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(result).toMatchObject({
      type: "subscription-watch",
      webhookEnabled: true,
      resourceId: "res-id",
      pageToken: "page-100",
    });
    expect(result.channelId).toMatch(/^chainreact-node-trigger-[0-9a-f-]+$/);
  });

  it("provider passed to refreshAndRetry is 'google-docs'", async () => {
    defaultMocks();
    await activate({
      node: baseNode,
      integration: baseIntegration,
      workflowId: "wf-1",
    });
    expect(
      mockRefreshAndRetry.mock.calls.every((c) => c[0].provider === "google-docs"),
    ).toBe(true);
  });

  it("throws when getStartPageToken returns no token", async () => {
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
        node: { ...baseNode, config: { unknown: "x" } },
        integration: baseIntegration,
        workflowId: "wf-1",
      }),
    ).rejects.toThrow();
    expect(mockFilesWatch).not.toHaveBeenCalled();
  });
});
