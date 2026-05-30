/**
 * @jest-environment node
 *
 * Tests for `facebook:update_post` — Slice 3.FACEBOOK-2.
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockPostsUpdate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/postsUpdate", () => ({
  postsUpdate: (...a: unknown[]) => mockPostsUpdate(...a),
}));

import { updatePost } from "@/integrations/facebook/actions/updatePost";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", accountId: "acct-user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", providerAccountId: "a", payload: {} },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockPostsUpdate.mockResolvedValue({ success: true });
});

describe("facebook update_post", () => {
  it("edits the post message (pageId/postId/message preserved) + returns success", async () => {
    const result = await updatePost(input({ pageId: "p", postId: "post-9", message: "edited" }));
    expect(mockPostsUpdate.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK", postId: "post-9", message: "edited",
    });
    expect(result.output).toEqual({ postId: "post-9", pageId: "p", success: true });
  });

  it("forwards isPublished when set", async () => {
    await updatePost(input({ pageId: "p", postId: "x", message: "m", isPublished: false }));
    expect(mockPostsUpdate.mock.calls[0]![0].isPublished).toBe(false);
  });
});
