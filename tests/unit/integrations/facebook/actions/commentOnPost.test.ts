/**
 * @jest-environment node
 *
 * Tests for `facebook:comment_on_post` — Slice 3.FACEBOOK-2.
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockCommentsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/commentsCreate", () => ({
  commentsCreate: (...a: unknown[]) => mockCommentsCreate(...a),
}));

import { commentOnPost } from "@/integrations/facebook/actions/commentOnPost";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf", userId: "user-1", runId: "run", nodeId: "node", config,
    triggerEvent: { provider: "manual", eventType: "manual", eventId: "e", occurredAt: "t", accountId: "a", payload: {} },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"));
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockCommentsCreate.mockResolvedValue({ id: "comment-1" });
});

describe("facebook comment_on_post", () => {
  it("maps the V1 'comment' field to the Graph message + returns commentId", async () => {
    const result = await commentOnPost(input({ pageId: "p", postId: "post-1", comment: "nice" }));
    expect(mockCommentsCreate.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK", postId: "post-1", message: "nice",
    });
    expect(result.output).toEqual({ commentId: "comment-1", postId: "post-1", pageId: "p" });
  });

  it("forwards an optional attachmentUrl", async () => {
    await commentOnPost(input({ pageId: "p", postId: "x", comment: "c", attachmentUrl: "https://x.test/a.png" }));
    expect(mockCommentsCreate.mock.calls[0]![0].attachmentUrl).toBe("https://x.test/a.png");
  });
});
