/**
 * @jest-environment node
 *
 * Tests for `facebook:upload_photo` — Slice 3.FACEBOOK-2 (FileRef
 * consumer). v2_storage byte fetch + multipart upload; provider_url
 * rejection; no bytes in output.
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockPhotosUpload = jest.fn();
const mockFetchBytes = jest.fn();
const mockBuildAdapter = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/photosUpload", () => ({
  photosUpload: (...a: unknown[]) => mockPhotosUpload(...a),
}));
jest.mock("@/core/files/fetchFileBytes", () => {
  const actual = jest.requireActual("@/core/files/fetchFileBytes");
  return { ...actual, fetchFileBytes: (...a: unknown[]) => mockFetchBytes(...a) };
});
jest.mock("@/integrations/_shared/facebook/storageAdapter", () => ({
  buildWorkflowFilesStorageAdapter: (...a: unknown[]) => mockBuildAdapter(...a),
}));

import { uploadPhoto } from "@/integrations/facebook/actions/uploadPhoto";
import { FacebookUploadConfigError } from "@/integrations/_shared/facebook/errors";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", accountId: "acct-user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", providerAccountId: "a", payload: {} },
  };
}

const v2Photo = {
  kind: "v2_storage",
  name: "p.jpg",
  mimeType: "image/jpeg",
  storagePath: "u/w/r/n/p.jpg",
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockBuildAdapter.mockReturnValue({ download: jest.fn() });
  mockFetchBytes.mockResolvedValue({
    bytes: new Uint8Array([1, 2, 3]),
    name: "p.jpg",
    mimeType: "image/jpeg",
    sizeBytes: 3,
  });
  mockPhotosUpload.mockResolvedValue({ id: "photo-1", post_id: "page_photo-1" });
});

describe("facebook upload_photo (FileRef consumer)", () => {
  it("fetches v2_storage bytes via the storage adapter and uploads multipart", async () => {
    const result = await uploadPhoto(input({ pageId: "p", photo: v2Photo, caption: "hi" }));
    expect(mockBuildAdapter).toHaveBeenCalledTimes(1);
    expect(mockFetchBytes.mock.calls[0]![0]).toMatchObject({ kind: "v2_storage" });
    expect(mockPhotosUpload.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK",
      pageId: "p",
      filename: "p.jpg",
      contentType: "image/jpeg",
      caption: "hi",
      published: true,
    });
    expect((mockPhotosUpload.mock.calls[0]![0].bytes as Uint8Array).length).toBe(3);
    expect(result.output).toEqual({
      photoId: "photo-1",
      postId: "page_photo-1",
      pageId: "p",
      published: true,
    });
  });

  it("rejects a provider_url FileRef WITHOUT uploading or fetching bytes", async () => {
    const providerRef = {
      kind: "provider_url",
      name: "p.jpg",
      mimeType: "image/jpeg",
      url: "https://graph.test/p.jpg",
      provider: "slack",
    };
    await expect(
      uploadPhoto(input({ pageId: "p", photo: providerRef })),
    ).rejects.toBeInstanceOf(FacebookUploadConfigError);
    expect(mockFetchBytes).not.toHaveBeenCalled();
    expect(mockPhotosUpload).not.toHaveBeenCalled();
  });

  it("output carries no raw bytes", async () => {
    const result = await uploadPhoto(input({ pageId: "p", photo: v2Photo }));
    expect(JSON.stringify(result.output)).not.toContain("bytes");
  });
});
