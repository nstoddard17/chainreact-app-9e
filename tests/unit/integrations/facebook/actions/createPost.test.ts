/**
 * @jest-environment node
 *
 * Tests for `facebook:create_post` — Slice 3.FACEBOOK-2. Field-name
 * preservation, page-token derivation, scheduled-time conversion, output.
 */
const mockRefresh = jest.fn();
const mockGetPageToken = jest.fn();
const mockPostsCreate = jest.fn();

jest.mock("@/services/oauth/refreshAndRetry", () => {
  const actual = jest.requireActual("@/services/oauth/refreshAndRetry");
  return { ...actual, refreshAndRetry: (...a: unknown[]) => mockRefresh(...a) };
});
jest.mock("@/integrations/_shared/facebook/api/getPageAccessToken", () => ({
  getPageAccessToken: (...a: unknown[]) => mockGetPageToken(...a),
}));
jest.mock("@/integrations/_shared/facebook/api/postsCreate", () => ({
  postsCreate: (...a: unknown[]) => mockPostsCreate(...a),
}));

import { createPost } from "@/integrations/facebook/actions/createPost";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";

function input(config: Record<string, unknown>): ActionHandlerInput {
  return {
    workflowId: "wf",
    userId: "user-1", accountId: "acct-user-1",
    runId: "run",
    nodeId: "node",
    config,
    triggerEvent: {
      provider: "manual",
      eventType: "manual",
      eventId: "e",
      occurredAt: "2026-05-25T00:00:00Z",
      providerAccountId: "acct",
      payload: {},
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRefresh.mockImplementation(
    async (i: { apiCall: (t: string) => Promise<unknown> }) => i.apiCall("USER_TOK"),
  );
  mockGetPageToken.mockResolvedValue("PAGE_TOK");
  mockPostsCreate.mockResolvedValue({ id: "post-1" });
});

describe("facebook create_post", () => {
  it("preserves V1 field names (pageId, message, link) + derives the page token", async () => {
    const result = await createPost(
      input({ pageId: "p-1", message: "hello", link: "https://x.test" }),
    );
    expect(mockGetPageToken).toHaveBeenCalledWith({
      accessToken: "USER_TOK",
      pageId: "p-1",
    });
    expect(mockPostsCreate.mock.calls[0]![0]).toMatchObject({
      pageAccessToken: "PAGE_TOK",
      pageId: "p-1",
      message: "hello",
      link: "https://x.test",
    });
    expect(result.output).toMatchObject({ postId: "post-1", pageId: "p-1" });
  });

  it("converts scheduledPublishTime (ISO) to unix seconds", async () => {
    await createPost(
      input({ pageId: "p", message: "m", scheduledPublishTime: "2026-06-01T00:00:00Z" }),
    );
    const expected = Math.floor(new Date("2026-06-01T00:00:00Z").getTime() / 1000);
    expect(mockPostsCreate.mock.calls[0]![0].scheduledPublishTime).toBe(expected);
  });

  it("routes through facebook provider in refreshAndRetry", async () => {
    await createPost(input({ pageId: "p", message: "m" }));
    expect(mockRefresh.mock.calls[0]![0]).toMatchObject({ provider: "facebook" });
  });
});
