/**
 * @jest-environment node
 *
 * Tests for `facebook:upload_video` — Slice 3.FACEBOOK-2 (FileRef consumer).
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockVideosUpload = jest.fn();
const mockFetchBytes = jest.fn();
const mockBuildAdapter = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/videosUpload", () => ({
  videosUpload: (...a: unknown[]) => mockVideosUpload(...a),
}));
jest.mock("@/core/files/fetchFileBytes", () => {
  const actual = jest.requireActual("@/core/files/fetchFileBytes");
  return { ...actual, fetchFileBytes: (...a: unknown[]) => mockFetchBytes(...a) };
});
jest.mock("@/integrations/_shared/facebook/storageAdapter", () => ({
  buildWorkflowFilesStorageAdapter: (...a: unknown[]) => mockBuildAdapter(...a),
}));

import { uploadVideo } from "@/integrations/facebook/actions/uploadVideo";
import { FacebookUploadConfigError } from "@/integrations/_shared/facebook/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", accountId: "a", payload: {} },
  };
}

const v2Video = {
  kind: "v2_storage",
  name: "v.mp4",
  mimeType: "video/mp4",
  storagePath: "u/w/r/n/v.mp4",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockBuildAdapter.mockReturnValue({ download: jest.fn() });
  mockFetchBytes.mockResolvedValue({
    bytes: new Uint8Array([9, 9]),
    name: "v.mp4",
    mimeType: "video/mp4",
    sizeBytes: 2,
  });
  mockVideosUpload.mockResolvedValue({ id: "video-1" });
});

describe("facebook upload_video (FileRef consumer)", () => {
  it("uploads via simple multipart with title/description", async () => {
    const result = await uploadVideo(
      input({ pageId: "p", video: v2Video, title: "Demo", description: "d" }),
    );
    expect(mockVideosUpload.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK",
      pageId: "p",
      filename: "v.mp4",
      contentType: "video/mp4",
      title: "Demo",
      description: "d",
      published: true,
    });
    expect(result.output).toEqual({ videoId: "video-1", pageId: "p", published: true });
  });

  it("rejects a provider_url FileRef", async () => {
    const providerRef = {
      kind: "provider_url",
      name: "v.mp4",
      mimeType: "video/mp4",
      url: "https://graph.test/v.mp4",
      provider: "slack",
    };
    await expect(
      uploadVideo(input({ pageId: "p", video: providerRef })),
    ).rejects.toBeInstanceOf(FacebookUploadConfigError);
    expect(mockVideosUpload).not.toHaveBeenCalled();
  });
});
