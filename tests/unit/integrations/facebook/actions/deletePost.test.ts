/**
 * @jest-environment node
 *
 * Tests for `facebook:delete_post` — Slice 3.FACEBOOK-2 (destructive).
 * Structural-only output; no deleted content echoed.
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockPostsDelete = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/postsDelete", () => ({
  postsDelete: (...a: unknown[]) => mockPostsDelete(...a),
}));

import { deletePost } from "@/integrations/facebook/actions/deletePost";
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
  mockPostsDelete.mockResolvedValue({ success: true });
});

describe("facebook delete_post", () => {
  it("deletes via the page token and returns a structural-only output", async () => {
    const result = await deletePost(input({ pageId: "p", postId: "post-9" }));
    expect(mockPostsDelete.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK", postId: "post-9",
    });
    expect(result.output).toEqual({
      success: true,
      deletedPostId: "post-9",
      deletedAt: expect.any(String),
    });
  });

  it("never echoes post text/media (structural keys only)", async () => {
    const result = await deletePost(input({ pageId: "p", postId: "post-9" }));
    expect(Object.keys(result.output).sort()).toEqual([
      "deletedAt",
      "deletedPostId",
      "success",
    ]);
  });
});
